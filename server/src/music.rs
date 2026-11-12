use super::{bad_request, ApiError};
use axum::{
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{header::CONTENT_TYPE, HeaderMap, Request, StatusCode},
    response::Response,
    routing::{delete, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::{fs, io::AsyncWriteExt};
use tower::ServiceExt;
use tower_http::services::ServeFile;

const MAX_UPLOAD: usize = 30 * 1024 * 1024;
static FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone)]
struct MusicState {
    pool: SqlitePool,
    directory: PathBuf,
}

#[derive(Serialize, FromRow)]
struct Track {
    id: i64,
    name: String,
    bytes: i64,
    created_at: String,
}

#[derive(Deserialize)]
struct UploadQuery {
    name: String,
}

pub fn router(pool: SqlitePool, directory: PathBuf) -> Router {
    Router::new()
        .route("/music", get(list).post(upload))
        .route("/music/{id}", delete(remove))
        .route("/music/{id}/audio", get(audio))
        .layer(DefaultBodyLimit::max(MAX_UPLOAD))
        .with_state(MusicState { pool, directory })
}

fn file_error(error: std::io::Error) -> ApiError {
    eprintln!("music file error: {error}");
    ApiError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "暂时无法读取或保存音乐，请稍后重试。".into(),
    )
}

fn unique_key() -> String {
    format!(
        "{}-{}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        std::process::id(),
        FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

// Recognize an MPEG audio frame after an optional ID3v2 tag. A filename alone
// is not enough: empty tags and renamed text files must not enter the library.
fn is_mp3(data: &[u8]) -> bool {
    let offset = if data.starts_with(b"ID3") {
        if data.len() < 10 || data[6..10].iter().any(|byte| byte & 0x80 != 0) {
            return false;
        }
        10 + data[6..10]
            .iter()
            .fold(0usize, |size, byte| (size << 7) | *byte as usize)
    } else {
        0
    };
    let Some(audio) = data.get(offset..) else {
        return false;
    };
    audio[..audio.len().min(8192)].windows(4).any(|header| {
        header[0] == 0xff && header[1] & 0xe0 == 0xe0
            && (header[1] >> 3) & 3 != 1 // reserved MPEG version
            && (header[1] >> 1) & 3 == 1 // Layer III
            && (1..15).contains(&(header[2] >> 4))
            && (header[2] >> 2) & 3 != 3
    })
}

async fn list(State(state): State<MusicState>) -> Result<Json<Vec<Track>>, ApiError> {
    let tracks =
        sqlx::query_as::<_, Track>("SELECT id,name,bytes,created_at FROM music ORDER BY id DESC")
            .fetch_all(&state.pool)
            .await?;
    Ok(Json(tracks))
}

async fn upload(
    State(state): State<MusicState>,
    Query(query): Query<UploadQuery>,
    headers: HeaderMap,
    data: Bytes,
) -> Result<(StatusCode, Json<Track>), ApiError> {
    if headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or("").trim())
        != Some("audio/mpeg")
    {
        return Err(ApiError(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "请使用 audio/mpeg 上传 MP3 文件。".into(),
        ));
    }
    let name = query.name.trim();
    if name.is_empty()
        || name.chars().count() > 160
        || name.contains(['/', '\\'])
        || name.chars().any(char::is_control)
    {
        return Err(bad_request("曲名最多 160 个字，不能包含路径或控制字符。"));
    }
    if !name.to_ascii_lowercase().ends_with(".mp3") || !is_mp3(&data) {
        return Err(bad_request("请选择有效的 MP3 音频文件。"));
    }
    fs::create_dir_all(&state.directory)
        .await
        .map_err(file_error)?;
    let filename = format!("{}.mp3", unique_key());
    let path = state.directory.join(&filename);
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .await
        .map_err(file_error)?;
    let result = async {
        file.write_all(&data).await.map_err(file_error)?;
        file.sync_data().await.map_err(file_error)?;
        let track = sqlx::query_as::<_, Track>("INSERT INTO music(name,filename,bytes) VALUES (?,?,?) RETURNING id,name,bytes,created_at")
            .bind(name).bind(&filename).bind(data.len() as i64).fetch_one(&state.pool).await?;
        Ok::<_, ApiError>(track)
    }.await;
    match result {
        Ok(track) => Ok((StatusCode::CREATED, Json(track))),
        Err(error) => {
            let _ = fs::remove_file(&path).await;
            Err(error)
        }
    }
}

async fn audio(
    State(state): State<MusicState>,
    Path(id): Path<i64>,
    request: Request<Body>,
) -> Result<Response, ApiError> {
    let filename = sqlx::query_scalar::<_, String>("SELECT filename FROM music WHERE id=?")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "这首音乐已经不在曲库里了。".into()))?;
    // ServeFile supplies byte ranges, MIME type, HEAD, and streaming from disk.
    let response = ServeFile::new(state.directory.join(filename))
        .oneshot(request)
        .await;
    match response {
        Ok(response) => Ok(response.map(Body::new)),
        Err(error) => match error {},
    }
}

async fn remove(
    State(state): State<MusicState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let filename =
        sqlx::query_scalar::<_, String>("DELETE FROM music WHERE id=? RETURNING filename")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "这首音乐已经移除了。".into()))?;
    if let Err(error) = fs::remove_file(state.directory.join(filename)).await {
        // The committed library deletion remains successful; log disk cleanup
        // failures rather than leaving a visible track with a missing file.
        if error.kind() != std::io::ErrorKind::NotFound {
            eprintln!("music cleanup error: {error}");
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup() -> (Router, PathBuf) {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let directory = std::env::temp_dir().join(format!("moodcast-music-test-{}", unique_key()));
        (router(pool, directory.clone()), directory)
    }
    fn request(method: &str, uri: &str, data: Vec<u8>) -> Request<Body> {
        Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "audio/mpeg")
            .body(Body::from(data))
            .unwrap()
    }

    #[tokio::test]
    async fn upload_list_range_and_delete() {
        let (app, directory) = setup().await;
        // A small MPEG Layer III fixture is enough to verify byte-for-byte
        // transport. Browser QA exercises decoding with an actual encoded MP3.
        let mut bytes = vec![0xff, 0xfb, 0x90, 0x00];
        bytes.extend(vec![0; 1000]);
        let response = app
            .clone()
            .oneshot(request("POST", "/music?name=rain.mp3", bytes.clone()))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
        let track: serde_json::Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        let id = track["id"].as_i64().unwrap();
        let response = app
            .clone()
            .oneshot(request("GET", "/music", vec![]))
            .await
            .unwrap();
        let tracks: serde_json::Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(tracks[0]["name"], "rain.mp3");
        let mut range = request("GET", &format!("/music/{id}/audio"), vec![]);
        range
            .headers_mut()
            .insert("range", "bytes=0-9".parse().unwrap());
        let response = app.clone().oneshot(range).await.unwrap();
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.headers()["content-type"], "audio/mpeg");
        assert_eq!(response.headers()["content-range"], "bytes 0-9/1004");
        assert_eq!(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .as_ref(),
            &bytes[..10]
        );
        let response = app
            .clone()
            .oneshot(request("DELETE", &format!("/music/{id}"), vec![]))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            fs::read_dir(&directory)
                .await
                .unwrap()
                .next_entry()
                .await
                .unwrap()
                .is_none(),
            true
        );
        assert_eq!(
            app.oneshot(request("GET", &format!("/music/{id}/audio"), vec![]))
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
        fs::remove_dir(directory).await.unwrap();
    }

    #[tokio::test]
    async fn invalid_or_oversized_upload_does_not_create_tracks() {
        let (app, directory) = setup().await;
        for (name, body) in [
            ("fake.mp3", b"not an mp3".to_vec()),
            ("empty.mp3", vec![]),
            ("tag.mp3", b"ID3\x04\x00\x00\x00\x00\x00\x00".to_vec()),
            ("..%2Fevil.mp3", vec![0xff, 0xfb, 0x90, 0]),
        ] {
            assert_eq!(
                app.clone()
                    .oneshot(request("POST", &format!("/music?name={name}"), body))
                    .await
                    .unwrap()
                    .status(),
                StatusCode::BAD_REQUEST
            );
        }
        assert_eq!(
            app.clone()
                .oneshot(request(
                    "POST",
                    "/music?name=large.mp3",
                    vec![0; MAX_UPLOAD + 1]
                ))
                .await
                .unwrap()
                .status(),
            StatusCode::PAYLOAD_TOO_LARGE
        );
        let response = app.oneshot(request("GET", "/music", vec![])).await.unwrap();
        assert_eq!(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .as_ref(),
            b"[]"
        );
        assert!(!directory.exists());
    }

    #[tokio::test]
    async fn simple_form_content_type_is_not_an_audio_upload() {
        let (app, _) = setup().await;
        let mut upload = request("POST", "/music?name=test.mp3", vec![0xff, 0xfb, 0x90, 0]);
        upload
            .headers_mut()
            .insert(CONTENT_TYPE, "text/plain".parse().unwrap());
        assert_eq!(
            app.oneshot(upload).await.unwrap().status(),
            StatusCode::UNSUPPORTED_MEDIA_TYPE
        );
    }
}
