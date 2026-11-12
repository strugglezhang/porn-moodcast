import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Headphones,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Repeat2,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { api } from "./api";
import "./music.css";

interface Track {
  id: number;
  name: string;
  bytes: number;
  created_at: string;
}
const MAX_FILE = 30 * 1024 * 1024;

function timeLabel(value: number) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function storedVolume() {
  const value = localStorage.getItem("moodcast-music-volume");
  const number = value === null ? 0.35 : Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0.35;
}

export default function MusicPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selected, setSelected] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem("moodcast-music-track"));
    return saved > 0 ? saved : null;
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(storedVolume);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(
    () => localStorage.getItem("moodcast-music-loop") !== "false",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const resumeAfterSelection = useRef(false);
  const uploadController = useRef<AbortController | null>(null);
  const track = tracks.find((item) => item.id === selected);
  const busy = uploading || removing;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const rows = await api<Track[]>("/music", { signal });
      if (signal?.aborted) return;
      const previous = Number(localStorage.getItem("moodcast-music-track"));
      setTracks(rows);
      setSelected((value) =>
        rows.some((item) => item.id === value)
          ? value
          : rows.some((item) => item.id === previous)
            ? previous
            : (rows[0]?.id ?? null),
      );
    } catch (error) {
      if (!signal?.aborted) setError((error as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
      uploadController.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    const player = audio.current;
    if (player) {
      player.volume = volume;
      player.muted = muted;
    }
    localStorage.setItem("moodcast-music-volume", String(volume));
  }, [volume, muted]);
  useEffect(() => {
    localStorage.setItem("moodcast-music-loop", String(loop));
  }, [loop]);
  useEffect(() => {
    setPosition(0);
    setDuration(0);
    setPlaying(false);
    setBuffering(false);
    setConfirmDelete(false);
    if (selected !== null)
      localStorage.setItem("moodcast-music-track", String(selected));
    else localStorage.removeItem("moodcast-music-track");
    if (resumeAfterSelection.current && selected !== null) {
      resumeAfterSelection.current = false;
      void audio.current
        ?.play()
        .catch(() => setError("请点播放，继续听这首音乐。"));
    }
  }, [selected]);
  useEffect(() => {
    const player = audio.current;
    return () => {
      player?.pause();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function toggle() {
    const player = audio.current;
    if (!player || !track || starting) return;
    setError("");
    if (!player.paused) {
      player.pause();
      return;
    }
    setStarting(true);
    try {
      await player.play();
    } catch {
      setError("这首音乐暂时无法播放，请检查文件，或重新上传有效的 MP3。");
    } finally {
      setStarting(false);
    }
  }

  async function upload(file?: File) {
    if (!file || busy) return;
    setError("");
    setNotice("");
    if (!/\.mp3$/i.test(file.name) || !file.size || file.size > MAX_FILE) {
      setError("请选择 30 MB 以内的 MP3 文件。");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setUploading(true);
    const controller = new AbortController();
    uploadController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(
        `/api/music?name=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "Content-Type": "audio/mpeg" },
          body: file,
          signal: controller.signal,
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          response.status === 413
            ? "这首音乐超过 30 MB，请选一个小一点的文件。"
            : (result?.error ?? "上传没有成功，请稍后再试。"),
        );
      const uploaded = result as Track;
      audio.current?.pause();
      resumeAfterSelection.current = false;
      setTracks((rows) => [uploaded, ...rows]);
      setSelected(uploaded.id);
      setNotice("音乐已收好，点播放就能听。");
    } catch (error) {
      setError(
        error instanceof DOMException && error.name === "AbortError"
          ? "上传已中断或超时，请再试一次。"
          : (error as Error).message,
      );
    } finally {
      window.clearTimeout(timeout);
      uploadController.current = null;
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove() {
    if (!track || busy) return;
    setRemoving(true);
    setError("");
    try {
      await api(`/music/${track.id}`, { method: "DELETE" });
      audio.current?.pause();
      resumeAfterSelection.current = false;
      const remaining = tracks.filter((item) => item.id !== track.id);
      setTracks(remaining);
      setSelected(remaining[0]?.id ?? null);
      setConfirmDelete(false);
      setNotice("这首音乐已从曲库移除。");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section
      className={`music-player${playing ? " is-playing" : ""}`}
      aria-labelledby="music-title"
      aria-busy={loading || busy}
    >
      <audio
        ref={audio}
        src={track ? `/api/music/${track.id}/audio` : undefined}
        preload="metadata"
        loop={loop}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          setBuffering(false);
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) =>
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          )
        }
        onDurationChange={(event) =>
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          )
        }
        onEnded={() => setPlaying(false)}
        onError={() => {
          if (track) {
            setPlaying(false);
            setBuffering(false);
            setError("这首音乐无法读取或解码，请重新上传有效的 MP3 文件。");
          }
        }}
      />
      <div className="music-main">
        <div className="music-disc" aria-hidden="true">
          <span>
            <Music2 size={19} />
          </span>
        </div>
        <div className="music-copy">
          <h2 id="music-title">
            <Headphones size={13} /> 给天气配一段音乐
          </h2>
          {tracks.length ? (
            <label className="track-select-wrap">
              <span className="sr-only">选择背景音乐</span>
              <select
                aria-label="选择背景音乐"
                value={selected ?? ""}
                disabled={busy}
                onChange={(event) => {
                  resumeAfterSelection.current = playing;
                  setError("");
                  setSelected(Number(event.target.value));
                }}
              >
                {tracks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name.replace(/\.mp3$/i, "")}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              {loading
                ? "正在翻找你的唱片…"
                : "上传一首喜欢的 MP3，让此刻有一点声音。"}
            </p>
          )}
        </div>
        {track && (
          <div className="music-controls">
            <button
              className="music-play"
              aria-label={playing ? "暂停背景音乐" : "播放背景音乐"}
              onClick={toggle}
              disabled={busy || starting}
            >
              {starting || buffering ? (
                <LoaderCircle className="spin" size={19} />
              ) : playing ? (
                <Pause size={19} fill="currentColor" />
              ) : (
                <Play size={19} fill="currentColor" />
              )}
            </button>
            <button
              className={`icon-button music-loop${loop ? " enabled" : ""}`}
              aria-label="单曲循环"
              aria-pressed={loop}
              onClick={() => setLoop((value) => !value)}
              title={loop ? "关闭单曲循环" : "开启单曲循环"}
            >
              <Repeat2 size={18} />
            </button>
            <div className="music-volume">
              <button
                className="icon-button"
                aria-label={muted ? "取消音乐静音" : "音乐静音"}
                onClick={() => setMuted((value) => !value)}
              >
                {muted || volume === 0 ? (
                  <VolumeX size={17} />
                ) : (
                  <Volume2 size={17} />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                aria-label="音乐音量"
                onChange={(event) => {
                  setVolume(Number(event.target.value));
                  setMuted(false);
                }}
              />
            </div>
            <button
              className="icon-button music-remove"
              aria-label="移除当前音乐"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
        <button
          className="music-upload"
          onClick={() => fileInput.current?.click()}
          disabled={busy || loading}
        >
          {uploading ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Upload size={15} />
          )}
          {uploading ? "上传中…" : tracks.length ? "添加音乐" : "上传 MP3"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".mp3,audio/mpeg"
          hidden
          aria-label="上传背景音乐文件"
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </div>
      {track ? (
        <div className="music-timeline">
          <span>{timeLabel(position)}</span>
          <input
            aria-label="音乐播放进度"
            type="range"
            min="0"
            max={duration || 1}
            step="0.1"
            value={Math.min(position, duration || 1)}
            disabled={!duration || busy}
            onChange={(event) => {
              const time = Number(event.target.value);
              if (audio.current && duration) {
                audio.current.currentTime = time;
                setPosition(time);
              }
            }}
          />
          <span>{timeLabel(duration)}</span>
          <span className="music-mode">
            {playing ? "让音乐陪你待一会儿" : "手动播放 · 慢慢听"}
          </span>
        </div>
      ) : (
        <div className="music-empty-note">
          MP3 · 每首不超过 30 MB · 上传后手动播放
        </div>
      )}
      {confirmDelete && (
        <div className="music-confirm">
          <span>从曲库移除这首音乐？</span>
          <button disabled={busy} onClick={remove}>
            {removing ? "移除中…" : "确认移除"}
          </button>
          <button disabled={busy} onClick={() => setConfirmDelete(false)}>
            取消
          </button>
        </div>
      )}
      {error && (
        <div className="music-message music-error" role="alert">
          <span>{error}</span>
          <div>
            {!tracks.length && !loading && (
              <button onClick={() => void load()} disabled={busy}>
                重试
              </button>
            )}
            <button
              className="icon-button"
              aria-label="关闭音乐提示"
              onClick={() => setError("")}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      {notice && (
        <div className="music-message" role="status">
          <Check size={13} />
          {notice}
        </div>
      )}
    </section>
  );
}
