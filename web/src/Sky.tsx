import { useEffect, useRef, type CSSProperties } from "react";
import type { Weather } from "./weather";

export default function Sky({
  weather,
  still,
}: {
  weather: Weather;
  still: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    const settings:
      | {
          kind: string;
          count: number;
          speed: number;
          slant: number;
          length: number;
        }
      | undefined = (
      {
        rain: { kind: "rain", count: 190, speed: 0.8, slant: 5, length: 23 },
        storm: { kind: "rain", count: 300, speed: 0.8, slant: 12, length: 36 },
        snow: { kind: "snow", count: 110, speed: 0.13, slant: 0, length: 0 },
        downpour: {
          kind: "rain",
          count: 480,
          speed: 1.5,
          slant: 9,
          length: 46,
        },
        typhoon: {
          kind: "rain",
          count: 360,
          speed: 1.15,
          slant: 86,
          length: 32,
        },
        hail: { kind: "hail", count: 130, speed: 0.95, slant: 10, length: 0 },
        wind: { kind: "wind", count: 45, speed: 0.55, slant: 0, length: 90 },
        tornado: { kind: "dust", count: 120, speed: 0.3, slant: 0, length: 0 },
      } as Record<
        string,
        {
          kind: string;
          count: number;
          speed: number;
          slant: number;
          length: number;
        }
      >
    )[weather];
    if (!node || !settings) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    let width = 0,
      height = 0,
      frame = 0,
      last = 0;
    const particles = Array.from({ length: settings.count }, () => ({
      x: Math.random(),
      y: Math.random(),
      speed: 0.2 + Math.random() * 0.45,
      radius: 1 + Math.random() * (settings.kind === "hail" ? 4 : 2),
      phase: Math.random() * Math.PI * 2,
    }));
    const draw = (time: number) => {
      const dt = Math.max(0, Math.min((time - last) / 1000, 0.04));
      last = time;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(215,235,255,.48)";
      ctx.fillStyle =
        settings.kind === "dust"
          ? "rgba(204,193,179,.6)"
          : "rgba(241,249,255,.85)";
      ctx.lineWidth = settings.kind === "wind" ? 1.2 : 1;
      for (const p of particles) {
        ctx.beginPath();
        if (settings.kind === "dust") {
          const angle = time * 0.002 * (1 + p.speed) + p.phase;
          const radius = (1 - p.y) * Math.min(width * 0.15, 175) + 10;
          const x =
            width * 0.76 +
            Math.cos(angle) * radius +
            Math.sin(p.y * 5 + time * 0.0005) * 20;
          const y =
            height * 0.17 +
            p.y * Math.min(height * 0.53, 460) +
            Math.sin(angle) * 12;
          ctx.ellipse(
            x,
            y,
            p.radius * 2,
            p.radius * 0.55,
            angle,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          continue;
        }
        if (settings.kind === "wind") {
          p.x += dt * settings.speed * (p.speed + 0.6);
          if (p.x > 1.2) {
            p.x = -0.2;
            p.y = Math.random();
          }
          const x = p.x * width,
            y = p.y * height;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 40, y - 9, x + settings.length, y - 3);
          ctx.stroke();
          continue;
        }
        p.y += p.speed * dt * settings.speed;
        if (settings.kind === "rain") p.x -= dt * settings.slant * 0.0015;
        if (p.x < -0.1) p.x = 1.1;
        if (p.y > (settings.kind === "hail" ? 1.2 : 1.04)) {
          p.y = -0.04;
          p.x = Math.random();
        }
        const x =
          p.x * width +
          (settings.kind === "snow" ? Math.sin(time / 1600 + p.phase) * 18 : 0);
        let y = p.y * height;
        if (settings.kind === "hail" && p.y > 0.9)
          y =
            height * 0.9 -
            Math.abs(Math.sin((p.y - 0.9) * 16)) * height * 0.065;
        if (settings.kind === "snow" || settings.kind === "hail") {
          ctx.arc(x, y, p.radius, 0, Math.PI * 2);
          ctx.fill();
          if (settings.kind === "hail") {
            ctx.strokeStyle = "rgba(163,192,224,.7)";
            ctx.stroke();
          }
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x - settings.slant, y + settings.length);
          ctx.stroke();
        }
      }
      if (!still) frame = requestAnimationFrame(draw);
    };
    const setSize = (nextWidth: number, nextHeight: number) => {
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      node.width = width * dpr;
      node.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (still) draw(0);
    };
    const resize = new ResizeObserver(([entry]) =>
      setSize(entry.contentRect.width, entry.contentRect.height),
    );
    const bounds = node.getBoundingClientRect();
    setSize(bounds.width, bounds.height);
    resize.observe(node);
    if (!still) frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
    };
  }, [weather, still]);

  return (
    <div
      className={`sky sky-${weather}${still ? " still" : ""}`}
      aria-hidden="true"
    >
      <div className="sky-glow" />
      <div className="sun-rays" />
      <div className="sun-orb">
        <div />
      </div>
      <div className="cloud cloud-one">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="cloud cloud-two">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="cloud cloud-three">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="landscape landscape-back" />
      <div className="landscape landscape-mid" />
      <div className="landscape landscape-front" />
      <div className="sky-haze" />
      {weather === "fog" && (
        <>
          <div className="fog-bank fog-bank-one" />
          <div className="fog-bank fog-bank-two" />
        </>
      )}
      {weather === "storm" && (
        <>
          <div className="lightning" />
          <svg className="lightning-bolt" viewBox="0 0 100 280">
            <path
              d="M66 0 28 100 58 102 16 186 40 174 22 280 86 133 57 144 87 68 60 74Z"
              fill="currentColor"
            />
          </svg>
        </>
      )}
      {weather === "rainbow" && <div className="rainbow-arc" />}
      {weather === "tornado" && (
        <div className="tornado-funnel">
          <div className="funnel-core" />
          {Array.from({ length: 19 }, (_, index) => (
            <i key={index} style={{ "--ring": index } as CSSProperties} />
          ))}
          <div className="funnel-dust" />
        </div>
      )}
      {weather === "typhoon" && (
        <div className="typhoon-vortex">
          <svg viewBox="0 0 400 400">
            <g>
              {Array.from({ length: 6 }, (_, index) => (
                <path
                  key={index}
                  transform={`rotate(${index * 60} 200 200)`}
                  d="M200 170C260 90 375 140 348 260C323 350 198 382 110 342"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="23"
                  strokeLinecap="round"
                />
              ))}
            </g>
            <circle cx="200" cy="200" r="29" fill="rgba(9,30,37,.8)" />
          </svg>
        </div>
      )}
      <canvas ref={canvas} />
      <div className="sky-grain" />
    </div>
  );
}
