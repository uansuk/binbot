import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../hooks";

const LRS: Record<string, number> = { "1e-4": 0.68, "3e-4": 1.0, "1e-3": 0.52 };

function genCurve(lrKey: string, steps: number, n = 220): number[] {
  const lrQ = LRS[lrKey];
  const tq = 0.55 + 0.6 * (steps / 1_000_000);
  const level = 8.6 * lrQ * tq;
  const out: number[] = [];
  let wobble = 0;
  for (let i = 0; i < n; i++) {
    wobble = wobble * 0.86 + (Math.random() - 0.5) * 1.9;
    const base = level * (1 - Math.exp(-i / 52)) - 5.2 + 1.4 * Math.sin(i / 21);
    const noise = (Math.random() - 0.5) * (4.4 - (i / n) * 2.6);
    out.push(base + noise + wobble * 0.4);
  }
  return out;
}

function rollingMean(a: number[], w = 14): number[] {
  return a.map((_, i) => {
    const s = Math.max(0, i - w + 1);
    const sl = a.slice(s, i + 1);
    return sl.reduce((x, y) => x + y, 0) / sl.length;
  });
}

export default function TrainingLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [steps, setSteps] = useState(500_000);
  const [lrKey, setLrKey] = useState("3e-4");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const dataRef = useRef<number[]>([]);
  const shownRef = useRef(0);
  const rafRef = useRef(0);

  const draw = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (cv.width !== w * dpr) {
      cv.width = w * dpr;
      cv.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const data = dataRef.current.slice(0, shownRef.current);
    const padL = 40;
    const padB = 22;
    const padT = 14;
    const iw = w - padL - 14;
    const ih = h - padT - padB;
    const ymin = -9;
    const ymax = 13;
    const X = (i: number) => padL + (i / 219) * iw;
    const Y = (v: number) => padT + ((ymax - v) / (ymax - ymin)) * ih;

    // grid + labels
    ctx.strokeStyle = "rgba(147,167,156,0.09)";
    ctx.fillStyle = "#5d7168";
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.textAlign = "right";
    [-8, -4, 0, 4, 8, 12].forEach((v) => {
      ctx.beginPath();
      ctx.moveTo(padL, Y(v));
      ctx.lineTo(w - 14, Y(v));
      ctx.stroke();
      ctx.fillText(String(v), padL - 7, Y(v) + 3);
    });
    ctx.textAlign = "left";
    ctx.fillText("episodes →", padL, h - 7);

    // zero line
    ctx.strokeStyle = "rgba(242,180,65,0.35)";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, Y(0));
    ctx.lineTo(w - 14, Y(0));
    ctx.stroke();
    ctx.setLineDash([]);

    if (data.length < 2) return;

    // raw episodes
    ctx.strokeStyle = "rgba(86,200,216,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    data.forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))));
    ctx.stroke();

    // rolling mean + area
    const mean = rollingMean(data);
    ctx.beginPath();
    mean.forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))));
    ctx.strokeStyle = "#3ecf8e";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(X(data.length - 1), Y(ymin));
    ctx.lineTo(X(0), Y(ymin));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, padT, 0, h - padB);
    g.addColorStop(0, "rgba(62,207,142,0.16)");
    g.addColorStop(1, "rgba(62,207,142,0)");
    ctx.fillStyle = g;
    ctx.fill();

    // head dot
    const lastV = mean[mean.length - 1];
    ctx.fillStyle = "#3ecf8e";
    ctx.beginPath();
    ctx.arc(X(data.length - 1), Y(lastV), 3.5, 0, Math.PI * 2);
    ctx.fill();
  };

  const run = () => {
    if (running) return;
    const curve = genCurve(lrKey, steps);
    dataRef.current = curve;
    shownRef.current = 0;
    setRunning(true);
    setDone(false);
    if (reduced) {
      shownRef.current = curve.length;
      draw();
      setRunning(false);
      setDone(true);
      return;
    }
    const t0 = performance.now();
    const dur = 5200;
    const loop = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      shownRef.current = Math.max(2, Math.floor(p * curve.length));
      draw();
      if (p < 1) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        setRunning(false);
        setDone(true);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = dataRef.current.slice(0, shownRef.current);
  const mean100 = data.length ? rollingMean(data).slice(-1)[0] : 0;
  const best = data.length ? Math.max(...rollingMean(data)) : 0;
  const wins = data.filter((v) => v > 0).length;
  const sharpe =
    data.length > 20
      ? (() => {
          const d = data.map((v, i) => v - (data[i - 1] ?? v));
          const mu = d.reduce((a, b) => a + b, 0) / d.length;
          const sd = Math.sqrt(d.reduce((a, b) => a + (b - mu) ** 2, 0) / d.length) || 1;
          return (mu / sd) * Math.sqrt(100);
        })()
      : 0;

  return (
    <section id="train" className="relative z-10 mx-auto max-w-7xl scroll-mt-20 px-5 py-20 lg:px-8">
      <div className="rv">
        <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-amb">// training lab</div>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Watch the policy find its edge
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-mut">
          A live sketch of what <span className="font-mono text-[13px] text-ink">model.learn()</span> produces:
          episode reward per 5-day slice, smoothed over 14 episodes. Tune the knobs and run a synthetic pass.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
        {/* simulator */}
        <div className="rv panel panel-hover p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap gap-6">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">total timesteps</span>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={100_000}
                    max={1_000_000}
                    step={50_000}
                    value={steps}
                    disabled={running}
                    onChange={(e) => setSteps(Number(e.target.value))}
                    className="w-40"
                  />
                  <span className="font-mono text-[13px] text-ink">{(steps / 1000).toFixed(0)}k</span>
                </div>
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">learning rate</span>
                <div className="mt-2 flex gap-1.5">
                  {Object.keys(LRS).map((k) => (
                    <button
                      key={k}
                      disabled={running}
                      onClick={() => setLrKey(k)}
                      className={
                        "border px-3 py-1 font-mono text-[12px] transition-colors " +
                        (lrKey === k
                          ? "border-grn/60 bg-grn/10 text-grn"
                          : "border-line2 text-mut hover:border-grn/50 hover:text-ink")
                      }
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <button className={"btn " + (running ? "" : "btn-grn")} onClick={run} disabled={running}>
              {running ? "learning…" : done ? "re-run pass" : "▶ run model.learn()"}
            </button>
          </div>

          <div className="mt-5 h-64 border border-line bg-bg2/60 sm:h-72">
            <canvas ref={canvasRef} className="block h-full w-full" aria-label="Episode reward curve" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["mean reward ·100", data.length ? mean100.toFixed(2) : "—", mean100 >= 0 ? "text-grn" : "text-red"],
              ["best mean", data.length ? best.toFixed(2) : "—", "text-ink"],
              ["win rate", data.length ? ((wins / data.length) * 100).toFixed(0) + "%" : "—", "text-cyn"],
              ["sharpe ·100ep", data.length ? sharpe.toFixed(2) : "—", "text-amb"],
            ].map(([l, v, tone]) => (
              <div key={l as string} className="border border-line bg-bg2/60 px-3 py-2.5">
                <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-dim">{l}</div>
                <div className={"mt-1 font-mono text-lg " + tone}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* env spec sheet */}
        <div className="rv space-y-5" style={{ transitionDelay: "120ms" }}>
          <div className="panel p-6">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-grn">observation · Box(124,)</h3>
            <div className="mt-4 space-y-2 font-mono text-[12px]">
              {[
                ["rsi_n", "RSI(14)/50 − 1", "[-1, 1]"],
                ["macd_n", "tanh(MACD/px·100)", "[-1, 1]"],
                ["hist_n", "tanh(hist/px·100)", "[-1, 1]"],
                ["ret_n", "tanh(ret·50)", "[-1, 1]"],
                ["volz_n", "vol z-score / 3", "[-1, 1]"],
              ].map(([k, d, r]) => (
                <div key={k} className="flex items-baseline gap-3 border-b border-line/60 pb-2">
                  <span className="w-16 shrink-0 text-cyn">{k}</span>
                  <span className="text-mut">{d} × 24 bars</span>
                  <span className="ml-auto text-dim">{r}</span>
                </div>
              ))}
              <div className="flex items-baseline gap-3 pt-1">
                <span className="w-16 shrink-0 text-amb">state</span>
                <span className="text-mut">side · entry drift · uPnL · equity</span>
                <span className="ml-auto text-dim">4 dims</span>
              </div>
            </div>
          </div>

          <div className="panel p-6">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-grn">action · Discrete(3)</h3>
            <div className="mt-4 flex gap-2">
              {[
                ["0", "HOLD", "text-mut"],
                ["1", "LONG", "text-grn"],
                ["2", "SHORT", "text-red"],
              ].map(([n, l, tone]) => (
                <div key={n} className="flex-1 border border-line bg-bg2/60 px-3 py-2 text-center">
                  <div className="font-mono text-[10px] text-dim">{n}</div>
                  <div className={"font-mono text-[13px] font-medium " + tone}>{l}</div>
                </div>
              ))}
            </div>
            <h3 className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-grn">reward</h3>
            <pre className="mt-3 overflow-x-auto border border-line bg-bg2/60 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-mut">
{`r = Δequity / 10,000 × 100
r −= 0.5   if drawdown > 20%
episode ends if equity < 5,000`}
            </pre>
            <h3 className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-grn">friction model</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11.5px]">
              {[
                ["taker fee", "4 bp / side"],
                ["slippage", "1 bp adverse"],
                ["leverage", "3× isolated"],
                ["episode", "480 bars · 5 days"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border border-line bg-bg2/60 px-3 py-2">
                  <span className="text-dim">{k}</span>
                  <span className="text-ink">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
