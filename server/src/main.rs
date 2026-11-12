use axum::{
    extract::{DefaultBodyLimit, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post, put},
    Json, Router,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    FromRow, SqlitePool,
};
use std::{path::PathBuf, str::FromStr, time::Duration};
use tower_http::services::{ServeDir, ServeFile};

const WEATHER_TYPES: &[&str] = &[
    "sunny", "cloudy", "fog", "rain", "storm", "snow", "wind", "downpour", "hail", "rainbow",
    "typhoon", "tornado",
];

#[derive(Debug, Serialize, Deserialize, FromRow)]
struct Record {
    date: String,
    weather: String,
    note: String,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
struct RecordInput {
    weather: String,
    #[serde(default)]
    note: String,
}

#[derive(Deserialize)]
struct MonthQuery {
    month: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct Backup {
    version: u8,
    records: Vec<Record>,
}

struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({ "error": self.1 }))).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        eprintln!("database error: {error}");
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "暂时无法读写记录，请稍后重试。".into(),
        )
    }
}

fn bad_request(message: &str) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, message.into())
}

fn validate_date(date: &str) -> Result<(), ApiError> {
    let parsed = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| bad_request("日期格式应为 YYYY-MM-DD。"))?;
    if parsed.format("%Y-%m-%d").to_string() != date
        || !("1900-01-01"..="2100-12-31").contains(&date)
    {
        return Err(bad_request("请选择 1900 至 2100 年之间的有效日期。"));
    }
    Ok(())
}

fn validate_input(input: &RecordInput) -> Result<(), ApiError> {
    if !WEATHER_TYPES.contains(&input.weather.as_str()) {
        return Err(bad_request("请选择一种有效天气。"));
    }
    if input.note.chars().count() > 500 {
        return Err(bad_request("一句心情最多 500 个字。"));
    }
    Ok(())
}

async fn list_records(
    State(pool): State<SqlitePool>,
    Query(query): Query<MonthQuery>,
) -> Result<Json<Vec<Record>>, ApiError> {
    if let Some(month) = query.month {
        let date = format!("{month}-01");
        validate_date(&date)?;
        let records = sqlx::query_as::<_, Record>(
            "SELECT * FROM records WHERE date >= ? AND date <= ? ORDER BY date DESC",
        )
        .bind(date)
        .bind(format!("{month}-31"))
        .fetch_all(&pool)
        .await?;
        Ok(Json(records))
    } else {
        Err(bad_request("请提供 month=YYYY-MM。"))
    }
}

async fn save_record(
    State(pool): State<SqlitePool>,
    Path(date): Path<String>,
    Json(input): Json<RecordInput>,
) -> Result<Json<Record>, ApiError> {
    validate_date(&date)?;
    validate_input(&input)?;
    let record = sqlx::query_as::<_, Record>(
        "INSERT INTO records(date, weather, note) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET weather=excluded.weather, note=excluded.note, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING *"
    ).bind(date).bind(input.weather).bind(input.note.trim()).fetch_one(&pool).await?;
    Ok(Json(record))
}

async fn delete_record(
    State(pool): State<SqlitePool>,
    Path(date): Path<String>,
) -> Result<StatusCode, ApiError> {
    validate_date(&date)?;
    let result = sqlx::query("DELETE FROM records WHERE date = ?")
        .bind(date)
        .execute(&pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError(StatusCode::NOT_FOUND, "这一天还没有记录。".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn export_records(State(pool): State<SqlitePool>) -> Result<Json<Backup>, ApiError> {
    let records = sqlx::query_as::<_, Record>("SELECT * FROM records ORDER BY date")
        .fetch_all(&pool)
        .await?;
    Ok(Json(Backup {
        version: 1,
        records,
    }))
}

async fn import_records(
    State(pool): State<SqlitePool>,
    Json(backup): Json<Backup>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if backup.version != 1 {
        return Err(bad_request("不支持这个备份版本。"));
    }
    if backup.records.len() > 10000 {
        return Err(bad_request("一次最多导入 10000 条记录。"));
    }
    // Validate the complete backup before starting any mutation.
    for record in &backup.records {
        validate_date(&record.date)?;
        validate_input(&RecordInput {
            weather: record.weather.clone(),
            note: record.note.clone(),
        })?;
        for timestamp in [&record.created_at, &record.updated_at] {
            chrono::DateTime::parse_from_rfc3339(timestamp)
                .map_err(|_| bad_request("备份中的记录时间无效。"))?;
        }
    }
    let mut transaction = pool.begin().await?;
    for record in &backup.records {
        sqlx::query("INSERT INTO records(date,weather,note,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET weather=excluded.weather,note=excluded.note,updated_at=excluded.updated_at")
            .bind(&record.date).bind(&record.weather).bind(record.note.trim()).bind(&record.created_at).bind(&record.updated_at)
            .execute(&mut *transaction).await?;
    }
    transaction.commit().await?;
    Ok(Json(
        serde_json::json!({ "imported": backup.records.len() }),
    ))
}

fn app(pool: SqlitePool, web_dir: PathBuf) -> Router {
    let api = Router::new()
        .route(
            "/health",
            get(|| async { Json(serde_json::json!({"status":"ok"})) }),
        )
        .route("/records", get(list_records))
        .route("/records/{date}", put(save_record).delete(delete_record))
        .route("/export", get(export_records))
        .route("/import", post(import_records))
        .fallback(|| async {
            (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error":"接口不存在。"})),
            )
        })
        .layer(DefaultBodyLimit::max(5 * 1024 * 1024))
        .with_state(pool);
    Router::new().nest("/api", api).fallback_service(
        ServeDir::new(&web_dir).not_found_service(ServeFile::new(web_dir.join("index.html"))),
    )
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    let database = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| format!("sqlite://{}", root.join("data/moodcast.db").display()));
    if std::env::var("DATABASE_URL").is_err() {
        std::fs::create_dir_all(root.join("data"))?;
    }
    let options = SqliteConnectOptions::from_str(&database)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5))
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    let address = std::env::var("MOODCAST_BIND").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let web_dir = std::env::var("WEB_DIST")
        .map(PathBuf::from)
        .unwrap_or_else(|_| root.join("web/dist"));
    let listener = tokio::net::TcpListener::bind(&address).await?;
    println!("Moodcast · http://{address}");
    axum::serve(listener, app(pool.clone(), web_dir))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    pool.close().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    async fn test_app() -> Router {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        app(pool, PathBuf::from("nonexistent"))
    }

    async fn request(
        app: &Router,
        method: &str,
        uri: &str,
        body: serde_json::Value,
    ) -> (StatusCode, serde_json::Value) {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null),
        )
    }

    #[tokio::test]
    async fn records_round_trip_and_month_isolation() {
        let app = test_app().await;
        let input = serde_json::json!({"weather":"rain","note":"  今天也慢慢来。  "});
        assert_eq!(
            request(&app, "PUT", "/api/records/2026-11-12", input)
                .await
                .0,
            StatusCode::OK
        );
        let (_, rows) = request(
            &app,
            "GET",
            "/api/records?month=2026-11",
            serde_json::Value::Null,
        )
        .await;
        assert_eq!(rows[0]["note"], "今天也慢慢来。");
        assert_eq!(
            request(
                &app,
                "GET",
                "/api/records?month=2026-10",
                serde_json::Value::Null
            )
            .await
            .1,
            serde_json::json!([])
        );
        let (_, updated) = request(
            &app,
            "PUT",
            "/api/records/2026-11-12",
            serde_json::json!({"weather":"sunny","note":"放晴了"}),
        )
        .await;
        assert_eq!(updated["weather"], "sunny");
        assert_eq!(
            request(
                &app,
                "GET",
                "/api/records?month=2026-11",
                serde_json::Value::Null
            )
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
            1
        );
        let (_, backup) = request(&app, "GET", "/api/export", serde_json::Value::Null).await;
        assert_eq!(backup["records"][0]["weather"], "sunny");
        assert_eq!(
            request(
                &app,
                "DELETE",
                "/api/records/2026-11-12",
                serde_json::Value::Null
            )
            .await
            .0,
            StatusCode::NO_CONTENT
        );
        assert_eq!(
            request(&app, "POST", "/api/import", backup).await.0,
            StatusCode::OK
        );
        assert_eq!(
            request(
                &app,
                "GET",
                "/api/records?month=2026-11",
                serde_json::Value::Null
            )
            .await
            .1[0]["weather"],
            "sunny"
        );
    }

    #[tokio::test]
    async fn invalid_input_and_backup_do_not_write() {
        let app = test_app().await;
        for (date, weather, note) in [
            ("2026-02-30", "sunny", "".into()),
            ("2026-11-12", "invalid", "".into()),
            ("2026-11-12", "sunny", "字".repeat(501)),
        ] {
            assert_eq!(
                request(
                    &app,
                    "PUT",
                    &format!("/api/records/{date}"),
                    serde_json::json!({"weather":weather,"note":note})
                )
                .await
                .0,
                StatusCode::BAD_REQUEST
            );
        }
        let (_, valid) = request(
            &app,
            "PUT",
            "/api/records/2026-11-12",
            serde_json::json!({"weather":"snow"}),
        )
        .await;
        let mut invalid = valid.clone();
        invalid["date"] = serde_json::json!("bad-date");
        request(
            &app,
            "DELETE",
            "/api/records/2026-11-12",
            serde_json::Value::Null,
        )
        .await;
        assert_eq!(
            request(
                &app,
                "POST",
                "/api/import",
                serde_json::json!({"version":1,"records":[valid, invalid]})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            request(&app, "GET", "/api/export", serde_json::Value::Null)
                .await
                .1["records"],
            serde_json::json!([])
        );
    }

    #[tokio::test]
    async fn every_weather_can_be_saved_exported_and_imported() {
        let app = test_app().await;
        for (index, weather) in WEATHER_TYPES.iter().enumerate() {
            let date = format!("2026-11-{:02}", index + 1);
            let (status, record) = request(
                &app,
                "PUT",
                &format!("/api/records/{date}"),
                serde_json::json!({"weather":weather,"note":format!("记录 {weather}")}),
            )
            .await;
            assert_eq!(status, StatusCode::OK, "failed to save {weather}");
            assert_eq!(record["weather"], *weather);
        }
        let (_, backup) = request(&app, "GET", "/api/export", serde_json::Value::Null).await;
        assert_eq!(
            backup["records"].as_array().unwrap().len(),
            WEATHER_TYPES.len()
        );
        let restored = test_app().await;
        assert_eq!(
            request(&restored, "POST", "/api/import", backup).await.0,
            StatusCode::OK
        );
        let (_, rows) = request(
            &restored,
            "GET",
            "/api/records?month=2026-11",
            serde_json::Value::Null,
        )
        .await;
        assert_eq!(rows.as_array().unwrap().len(), WEATHER_TYPES.len());
        for weather in WEATHER_TYPES {
            assert!(rows
                .as_array()
                .unwrap()
                .iter()
                .any(|row| row["weather"] == *weather));
        }
    }

    #[tokio::test]
    async fn weather_migration_preserves_existing_records_and_constraints() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0001_records.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO records(date,weather,note,created_at,updated_at) VALUES ('2026-11-12','fog','原来的心情','2026-11-12T08:00:00Z','2026-11-12T09:00:00Z')").execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/0002_expand_weather.sql"))
            .execute(&pool)
            .await
            .unwrap();
        let record = sqlx::query_as::<_, Record>("SELECT * FROM records WHERE date='2026-11-12'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(record.weather, "fog");
        assert_eq!(record.note, "原来的心情");
        assert_eq!(record.created_at, "2026-11-12T08:00:00Z");
        assert_eq!(record.updated_at, "2026-11-12T09:00:00Z");
        for weather in ["typhoon", "tornado"] {
            sqlx::query("UPDATE records SET weather=? WHERE date='2026-11-12'")
                .bind(weather)
                .execute(&pool)
                .await
                .unwrap();
        }
        assert!(sqlx::query("UPDATE records SET weather='unknown'")
            .execute(&pool)
            .await
            .is_err());
    }
}
