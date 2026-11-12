import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pause,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { api, type Backup, type MoodRecord } from "./api";
import {
  localDate,
  monthOf,
  parseDate,
  shiftMonth,
  weatherInfo,
  weatherTypes,
  calendarColors,
  type Weather,
} from "./weather";
import Sky from "./Sky";
import WeatherIcon from "./WeatherIcon";

type Notice = { message: string; error?: boolean } | null;

export default function App() {
  const [today, setToday] = useState(() => localDate(new Date()));
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [selectedDate, setSelectedDate] = useState(today);
  const [weather, setWeather] = useState<Weather>("sunny");
  const [note, setNote] = useState("");
  const [records, setRecords] = useState<MoodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingImport, setPendingImport] = useState<Backup | null>(null);
  const [paused, setPaused] = useState(
    () => localStorage.getItem("moodcast-paused") === "true",
  );
  const prefersReducedMotion = useReducedMotion();
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const selectionVersion = useRef(0);
  const active = records.find((r) => r.date === selectedDate);
  const info = weatherInfo[weather];
  const still = paused || !!prefersReducedMotion;

  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(localDate(new Date())),
      30000,
    );
    return () => clearInterval(timer);
  }, []);

  const loadMonth = useCallback(
    async (requestedMonth: string, signal?: AbortSignal) => {
      return api<MoodRecord[]>(`/records?month=${requestedMonth}`, { signal });
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setRecords([]);
    const version = selectionVersion.current;
    loadMonth(month, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setRecords(rows);
        if (version === selectionVersion.current) {
          const record = rows.find((r) => r.date === selectedDate);
          setWeather(record?.weather ?? "sunny");
          setNote(record?.note ?? "");
          setDirty(false);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // Selection inside the same month reads the already-loaded records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, loadMonth]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(
      () => setNotice(null),
      notice.error ? 7000 : 4200,
    );
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function canLeave() {
    return (
      !dirty ||
      window.confirm("这句心情还没有保存，要先放下它，查看其他日子吗？")
    );
  }
  function selectDate(date: string) {
    if (busy || date > today || date === selectedDate || !canLeave()) return;
    selectionVersion.current++;
    setConfirmDelete(false);
    setSelectedDate(date);
    setDirty(false);
    const row = recordsRef.current.find((r) => r.date === date);
    setWeather(row?.weather ?? "sunny");
    setNote(row?.note ?? "");
    if (month !== date.slice(0, 7)) setMonth(date.slice(0, 7));
  }
  function changeMonth(offset: number) {
    const next = shiftMonth(month, offset);
    if (busy || next > today.slice(0, 7) || next < "1900-01" || !canLeave())
      return;
    selectionVersion.current++;
    setMonth(next);
    setSelectedDate(next === today.slice(0, 7) ? today : `${next}-01`);
    setWeather("sunny");
    setNote("");
    setDirty(false);
    setConfirmDelete(false);
  }
  function chooseWeather(value: Weather) {
    if (loading || busy || loadError) return;
    setWeather(value);
    setDirty(true);
  }
  async function save() {
    if (busy || loading || loadError) return;
    setBusy(true);
    try {
      const saved = await api<MoodRecord>(`/records/${selectedDate}`, {
        method: "PUT",
        body: JSON.stringify({ weather, note }),
      });
      setRecords((rows) => [
        ...rows.filter((r) => r.date !== saved.date),
        saved,
      ]);
      setNote(saved.note);
      setDirty(false);
      setNotice({ message: info.reply });
    } catch (error) {
      setNotice({ message: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/records/${selectedDate}`, { method: "DELETE" });
      setRecords((rows) => rows.filter((r) => r.date !== selectedDate));
      setNote("");
      setWeather("sunny");
      setDirty(false);
      setConfirmDelete(false);
      setNotice({ message: "这一天的记录已删除，留一片空白也可以。" });
    } catch (error) {
      setNotice({ message: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }
  async function exportBackup() {
    if (busy) return;
    setBusy(true);
    try {
      const backup = await api<Backup>("/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `moodcast-${today}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ message: `已导出 ${backup.records.length} 天的心情。` });
    } catch (error) {
      setNotice({ message: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }
  async function readBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("请选择 5 MB 以内的备份文件。");
      const backup: Backup = JSON.parse(await file.text());
      if (
        backup.version !== 1 ||
        !Array.isArray(backup.records) ||
        backup.records.length > 10000
      )
        throw new Error("这不是有效的 Moodcast 备份文件。");
      setPendingImport(backup);
    } catch (error) {
      setNotice({
        message:
          error instanceof SyntaxError
            ? "文件无法读取，请选择导出的 JSON 备份。"
            : (error as Error).message,
        error: true,
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function importBackup() {
    if (!pendingImport || busy) return;
    setBusy(true);
    try {
      const result = await api<{ imported: number }>("/import", {
        method: "POST",
        body: JSON.stringify(pendingImport),
      });
      setPendingImport(null);
      setDirty(false);
      // Import has committed; a subsequent read failure must not suggest it failed.
      try {
        const rows = await loadMonth(month);
        setRecords(rows);
        setLoadError("");
        const row = rows.find((r) => r.date === selectedDate);
        setWeather(row?.weather ?? "sunny");
        setNote(row?.note ?? "");
        setNotice({ message: `已收好 ${result.imported} 条心情记录。` });
      } catch {
        setLoadError("导入已经完成，但刷新失败，请点击重试读取记录。");
        setNotice({ message: "导入已经完成，请重新读取月历。", error: true });
      }
    } catch (error) {
      setNotice({ message: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  const selectedDay = parseDate(selectedDate);
  const monthDate = parseDate(`${month}-01`);
  const firstWeekday = (monthDate.getDay() + 6) % 7;
  const days = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0,
  ).getDate();
  const count = Array.from(note).length;
  const isToday = selectedDate === today;
  const recordedTypes = weatherTypes.filter((type) =>
    records.some((r) => r.weather === type),
  );

  return (
    <MotionConfig reducedMotion={still ? "always" : "user"}>
      <div className={`app theme-${weather}${still ? " paused" : ""}`}>
        <div className="weather-environment" aria-hidden="true">
          <AnimatePresence initial={false}>
            <motion.div
              className="sky-layer"
              key={weather}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: still ? 0 : 1.4 }}
            >
              <Sky weather={weather} still={still} />
            </motion.div>
          </AnimatePresence>
          <div className="environment-shade" />
        </div>
        <header className="header shell">
          <a
            className="brand"
            href="#"
            aria-label="Moodcast 心情天气首页"
            onClick={(event) => {
              event.preventDefault();
              selectDate(today);
              window.scrollTo({
                top: 0,
                behavior: still ? "instant" : "smooth",
              });
            }}
          >
            <span className="brand-icon">
              <img src="/logo.svg" width="46" height="46" alt="" />
            </span>
            <span className="brand-wordmark">
              moodcast<span className="brand-dot">.</span>
            </span>
            <span className="brand-sub">心情天气</span>
          </a>
          <nav className="header-actions" aria-label="记录管理">
            <span className="private-label">
              <span /> 私人心情气象台
            </span>
            <button
              className="icon-button"
              aria-label={paused ? "开启动效" : "暂停动效"}
              title={paused ? "开启动效" : "暂停动效"}
              aria-pressed={paused}
              onClick={() =>
                setPaused((value) => {
                  localStorage.setItem("moodcast-paused", String(!value));
                  return !value;
                })
              }
            >
              {paused ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <span className="header-divider" />
            <button
              className="text-button"
              onClick={exportBackup}
              disabled={busy}
            >
              <ArrowDownToLine size={16} />
              <span>导出</span>
            </button>
            <button
              className="text-button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <ArrowUpFromLine size={16} />
              <span>导入</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => void readBackup(event.target.files?.[0])}
            />
          </nav>
        </header>

        <main className="shell">
          <section className="hero" aria-label="心情天空">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="small-line" /> YOUR OWN LITTLE ATMOSPHERE
              </div>
              <h1>
                今天，心里
                <br />
                是什么<span className="serif-accent">天气</span>？
              </h1>
              <p className="hero-description">
                晴天很好，下雨也没关系。
                <br />
                在这里，每一种心情都有它的天空。
              </p>
              <a className="hero-link" href="#weather-picker">
                给今天留一片天空 <ArrowDown size={15} />
              </a>
              <div className="hero-date">
                <span className="date-dot" />
                {new Intl.DateTimeFormat("zh-CN", {
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                }).format(parseDate(today))}
                <span className="date-rule" />
                此刻，就是好时候
              </div>
            </div>
            <div className="sky-card">
              <div className="sky-topline">
                <span>
                  <i /> INNER WEATHER
                </span>
                <span>随心而变 · 不必预测</span>
              </div>
              <div className="sky-caption">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={weather}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.25 }}
                  >
                    <span className="sky-weather">
                      <WeatherIcon weather={weather} size={22} />
                      {info.name}
                    </span>
                    <h2>{info.title}</h2>
                    <p>{info.text}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
              <span className="sky-coordinate">YOUR SKY, YOUR PACE.</span>
            </div>
          </section>

          <section
            className="weather-section"
            id="weather-picker"
            aria-labelledby="picker-title"
          >
            <div className="section-heading">
              <h2 id="picker-title">
                <span className="section-number">01</span>
                选一个天气，安放此刻的心情
              </h2>
              <span>没有好坏，只有此刻的你。</span>
            </div>
            <div
              className="weather-options"
              role="group"
              aria-label="选择心情天气"
            >
              {weatherTypes.map((type, index) => (
                <button
                  key={type}
                  className={`weather-option ${weather === type ? "selected" : ""}`}
                  aria-pressed={weather === type}
                  disabled={busy || loading || !!loadError}
                  onClick={() => chooseWeather(type)}
                >
                  <span className="weather-index">0{index + 1}</span>
                  <span className={`weather-symbol symbol-${type}`}>
                    <WeatherIcon weather={type} size={31} />
                  </span>
                  <span className="weather-option-name">
                    {weatherInfo[type].name}
                  </span>
                  <span className="weather-feeling">
                    {weatherInfo[type].feeling}
                  </span>
                  {weather === type && (
                    <span className="weather-check">
                      <Check size={11} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {loadError && (
            <div className="connection-error" role="alert">
              <span>{loadError}</span>
              <button
                disabled={busy || loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const rows = await loadMonth(month);
                    setRecords(rows);
                    setLoadError("");
                    const row = rows.find((r) => r.date === selectedDate);
                    setWeather(row?.weather ?? "sunny");
                    setNote(row?.note ?? "");
                    setDirty(false);
                  } catch (error) {
                    setLoadError((error as Error).message);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                重新读取
              </button>
            </div>
          )}

          <div className="journal-grid">
            <section
              className="journal-card"
              aria-labelledby="journal-title"
              aria-busy={busy || loading}
            >
              <div className="section-heading">
                <h2 id="journal-title">
                  <span className="section-number">02</span>留一句，给
                  {isToday ? "今天" : "那天"}的自己
                </h2>
                <span className="optional">可以不写</span>
              </div>
              <div className="journal-date">
                <span>
                  {isToday ? "TODAY" : "THAT DAY"} /{" "}
                  {selectedDate.replaceAll("-", ".")}
                </span>
                <span className="journal-weather">
                  <WeatherIcon weather={weather} size={17} />
                  {info.name}
                </span>
              </div>
              <label className="sr-only" htmlFor="mood-note">
                这一天的心情，最多 500 个字
              </label>
              <textarea
                ref={editorRef}
                id="mood-note"
                value={note}
                disabled={busy || loading || !!loadError}
                placeholder={
                  isToday
                    ? "今天发生了什么？\n也许是一杯好喝的咖啡，也许只是有一点累……"
                    : "那天，心里有什么想留下的？"
                }
                onChange={(event) => {
                  if (Array.from(event.target.value).length <= 500) {
                    setNote(event.target.value);
                    setDirty(true);
                  }
                }}
              />
              <div className="note-bottom">
                <span>只言片语，也值得被收藏。</span>
                <span>{count} / 500</span>
              </div>
              <div className="journal-bottom">
                <span className="saved-indicator">
                  {loading ? (
                    <>
                      <LoaderCircle size={13} className="spin" />
                      正在翻看天气…
                    </>
                  ) : active && !dirty ? (
                    <>
                      <Check size={14} />
                      这天的心情，已经收好
                    </>
                  ) : (
                    <>
                      <span className="tiny-dot" />
                      {dirty ? "有一份心情，等待收好" : "每一天，都值得留一笔"}
                    </>
                  )}
                </span>
                <button
                  className="save-button"
                  disabled={
                    busy || loading || !!loadError || (!!active && !dirty)
                  }
                  onClick={save}
                >
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <>
                      {active
                        ? "更新这一天"
                        : isToday
                          ? "收下今天"
                          : "收下这一天"}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </div>
              {active && (
                <div className="delete-area">
                  {confirmDelete ? (
                    <>
                      <span>要删除这一天的记录吗？</span>
                      <button disabled={busy} onClick={remove}>
                        确定删除
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => setConfirmDelete(false)}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      className="delete-link"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 size={12} />
                      删除这天的记录
                    </button>
                  )}
                </div>
              )}
            </section>

            <section
              className="calendar-card"
              aria-labelledby="calendar-title"
              aria-busy={loading}
            >
              <div className="section-heading">
                <h2 id="calendar-title">
                  <span className="section-number">03</span>往日天气
                </h2>
                <span>把日子，慢慢收藏。</span>
              </div>
              <div className="calendar-toolbar">
                <div>
                  <strong>
                    {monthDate.getFullYear()}
                    <span>年</span>
                    {monthDate.getMonth() + 1}
                    <span>月</span>
                  </strong>
                  <span className="month-count">
                    已记录 {records.length} 天
                  </span>
                </div>
                <div>
                  <button
                    className="icon-button"
                    aria-label="上个月"
                    onClick={() => changeMonth(-1)}
                    disabled={busy || loading || month <= "1900-01"}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="下个月"
                    onClick={() => changeMonth(1)}
                    disabled={busy || loading || month >= today.slice(0, 7)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className="weekdays" aria-hidden="true">
                {"一二三四五六日".split("").map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div
                className="calendar-days"
                role="group"
                aria-label={`${month} 心情月历`}
              >
                {Array.from({ length: firstWeekday }, (_, index) => (
                  <span key={`blank-${index}`} />
                ))}
                {Array.from({ length: days }, (_, index) => {
                  const day = index + 1;
                  const date = `${month}-${String(day).padStart(2, "0")}`;
                  const record = records.find((r) => r.date === date);
                  return (
                    <button
                      key={date}
                      className={`calendar-day ${date === selectedDate ? "active" : ""} ${date === today ? "is-today" : ""} ${record ? "has-record" : ""}`}
                      disabled={date > today || busy || loading}
                      aria-label={`${date}${date === today ? "，今天" : ""}，${record ? weatherInfo[record.weather].name : "未记录"}`}
                      aria-pressed={date === selectedDate}
                      title={
                        record
                          ? record.note || weatherInfo[record.weather].name
                          : undefined
                      }
                      onClick={() => selectDate(date)}
                      style={
                        record
                          ? ({
                              "--day-color":
                                calendarColors[record.weather].light,
                              "--day-color-dark":
                                calendarColors[record.weather].dark,
                            } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <span className="calendar-date">{day}</span>
                      {record ? (
                        <>
                          <span className="calendar-weather" aria-hidden="true">
                            <WeatherIcon weather={record.weather} size={32} />
                          </span>
                          <span
                            className="calendar-weather-name"
                            aria-hidden="true"
                          >
                            {weatherInfo[record.weather].name}
                          </span>
                        </>
                      ) : (
                        <span className="calendar-empty" aria-hidden="true">
                          —
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="calendar-bottom">
                <span>
                  {recordedTypes.length
                    ? recordedTypes.map((type) => (
                        <span
                          key={type}
                          className="legend-item"
                          style={
                            {
                              "--day-color": calendarColors[type].light,
                              "--day-color-dark": calendarColors[type].dark,
                            } as React.CSSProperties
                          }
                        >
                          <WeatherIcon weather={type} size={14} />
                          {weatherInfo[type].name}
                        </span>
                      ))
                    : "还没有天气记录，今天开始也很好。"}
                </span>
                {!isToday || month !== today.slice(0, 7) ? (
                  <button
                    disabled={busy || loading}
                    onClick={() => selectDate(today)}
                  >
                    回到今天 <ArrowRight size={12} />
                  </button>
                ) : (
                  <span>点一天，重看那片天空</span>
                )}
              </div>
            </section>
          </div>
          <div className="closing-note">
            <span />“ 不必每天晴空万里，你的每一种天气，都值得被看见。 ”<span />
          </div>
        </main>

        <footer className="footer shell">
          <span className="footer-brand">
            <img src="/logo.svg" width="24" height="24" alt="" />
            moodcast<span className="brand-dot">.</span>
            <span className="footer-tagline">为心情，留一片天空。</span>
          </span>
          <span>
            记录留在你的气象台里 <span className="footer-dot">·</span>{" "}
            记得偶尔导出备份
          </span>
          <span className="footer-end">MADE FOR YOUR EVERYDAY</span>
        </footer>

        <AnimatePresence>
          {notice && (
            <motion.div
              className={`toast ${notice.error ? "toast-error" : ""}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              role={notice.error ? "alert" : "status"}
            >
              <span>{notice.error ? "☁" : <Check size={17} />}</span>
              {notice.message}
              <button
                className="icon-button"
                aria-label="关闭提示"
                onClick={() => setNotice(null)}
              >
                <X size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {pendingImport && (
          <ImportDialog
            count={pendingImport.records.length}
            busy={busy}
            onCancel={() => {
              if (!busy) setPendingImport(null);
            }}
            onConfirm={importBackup}
          />
        )}
        <span className="sr-only" aria-live="polite">
          {selectedDay.getMonth() + 1}月{selectedDay.getDate()}日，当前选择
          {info.name}
        </span>
      </div>
    </MotionConfig>
  );
}

function ImportDialog({
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="import-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <span className="eyebrow">BRING YOUR SKY BACK</span>
      <h2>把往日的天气带回来</h2>
      <p>
        将导入 {count}{" "}
        条记录。同一天的已有记录会被备份中的内容替换，未保存的文字也会被清除。
      </p>
      <div>
        <button className="text-button" disabled={busy} onClick={onCancel}>
          先不导入
        </button>
        <button className="save-button" disabled={busy} onClick={onConfirm}>
          {busy ? <LoaderCircle size={17} className="spin" /> : "确认导入"}
        </button>
      </div>
    </dialog>
  );
}
