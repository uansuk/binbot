import { useEffect, useRef, useState } from "react";
import { fmtUsd, useMarket } from "../lib/market";

type Mode = "paper" | "testnet" | "live";
type Level = "info" | "fill" | "warn" | "stop";

interface LogLine {
  t: string;
  level: Level;
  text: string;
}

const LEVEL_CLS: Record<Level, string> = {
  info: "text-mut",
  fill: "text-grn",
  warn: "text-amb",
  stop: "text-red",
};

const MODE_LABEL: Record<Mode, string> = { paper: "PAPER", testnet: "TESTNET", live: "LIVE" };

export default function ExecConsole() {
  const m = useMarket();
  const [mode, setMode] = useState<Mode>("paper");
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([
    { t: "--:--:--", level: "info", text: "executor idle — pick a mode and start the loop" },
  ]);
  const [pos, setPos] = useState<{ side: 0 | 1 | -1; entry: number; equity: number }>({
    side: 0,
    entry: 0,
    equity: 10000,
  });
  const [equityCurve, setEquityCurve] = useState<number[]>([10000]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ side: 0 as 0 | 1 | -1, entry: 0, equity: 10000, bar: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (!running) return;
    const stamp = () => new Date().toISOString().slice(11, 19);
    const push = (level: Level, text: string) =>
      setLogs((ls) => [...ls.slice(-70), { t: stamp(), level, text }]);

    push("info", `executor online · BTC/USDT:USDT · ${MODE_LABEL[mode]} · model models/best_model`);
    if (mode === "testnet") push("warn", "sandbox engaged -> https://testnet.binancefuture.com");
    if (mode === "live") push("stop", "REAL CAPITAL ARMED — 3x isolated · stop 1.50%");

    const id = setInterval(() => {
      const s = stateRef.current;
      s.bar++;
      const px = m.price;
      const hh = new Date().getUTCHours().toString().padStart(2, "0");
      const mm = new Date().getUTCMinutes().toString().padStart(2, "0");
      push("info", `bar ${hh}:${mm} closed · px ${fmtUsd(px)} · building obs(124,)`);

      // decide from the same confluence the chart agent uses
      const r = m.rsi[m.rsi.length - 1];
      const h = m.hist[m.hist.length - 1];
      let want: 0 | 1 | -1 = s.side;
      if (r < 34 && h > 0) want = 1;
      else if (r > 66 && h < 0) want = -1;
      else if (s.side === 1 && (r > 60 || h < 0)) want = 0;
      else if (s.side === -1 && (r < 40 || h > 0)) want = 0;

      const action = want + 1;
      push("info", `policy -> action ${action} (${["HOLD", "LONG", "SHORT"][action]})  [rsi ${r.toFixed(1)} · hist ${h >= 0 ? "+" : ""}${h.toFixed(1)}]`);

      // protective stop check
      if (s.side === 1 && s.entry > 0 && px <= s.entry * 0.985) {
        const pnl = (px - s.entry) / s.entry;
        s.equity *= 1 + pnl * 3 - 0.0008;
        push("stop", `STOP_MARKET filled @ ${fmtUsd(px)} · leg pnl ${(pnl * 300).toFixed(2)}%`);
        s.side = 0;
        s.entry = 0;
      } else if (s.side === -1 && s.entry > 0 && px >= s.entry * 1.015) {
        const pnl = (s.entry - px) / s.entry;
        s.equity *= 1 + pnl * 3 - 0.0008;
        push("stop", `STOP_MARKET filled @ ${fmtUsd(px)} · leg pnl ${(pnl * 300).toFixed(2)}%`);
        s.side = 0;
        s.entry = 0;
      } else if (want !== s.side) {
        if (s.side !== 0 && s.entry > 0) {
          const pnl = s.side === 1 ? (px - s.entry) / s.entry : (s.entry - px) / s.entry;
          s.equity *= 1 + pnl * 3 - 0.0008;
          push("fill", `close ${s.side === 1 ? "LONG" : "SHORT"} @ ${fmtUsd(px)} · leg pnl ${(pnl * 300).toFixed(2)}%`);
        }
        if (want !== 0) {
          const fill = px * (1 + want * 0.0001);
          push("fill", `${MODE_LABEL[mode]} fill ${want === 1 ? "LONG" : "SHORT"} @ ${fmtUsd(fill)} · notional ${fmtUsd(s.equity * 3, 0)} USDT · stop ${fmtUsd(fill * (want === 1 ? 0.985 : 1.015))}`);
          s.entry = fill;
        } else {
          s.entry = 0;
        }
        s.side = want;
      }

      const mk = s.entry > 0 && s.side !== 0
        ? s.equity * (1 + (s.side === 1 ? (px - s.entry) / s.entry : (s.entry - px) / s.entry) * 3)
        : s.equity;
      push("info", `equity ${fmtUsd(mk, 2)} USDT`);

      setPos({ side: s.side, entry: s.entry, equity: mk });
      setEquityCurve((c) => [...c.slice(-90), mk]);
    }, 2600);

    return () => {
      clearInterval(id);
      const s = stateRef.current;
      if (s.side !== 0) {
        const px = market_price_now();
        const pnl = s.side === 1 ? (px - s.entry) / s.entry : (s.entry - px) / s.entry;
        s.equity *= 1 + pnl * 3 - 0.0008;
        push("warn", `shutdown — flattened ${s.side === 1 ? "LONG" : "SHORT"} @ ${fmtUsd(px)}`);
        s.side = 0;
        s.entry = 0;
        setPos({ side: 0, entry: 0, equity: s.equity });
      } else {
        push("warn", "shutdown — no open position");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const market_price_now = () => m.price;

  const canStart = mode !== "live" || armed;
  const uPnl =
    pos.side !== 0 && pos.entry > 0
      ? (pos.side === 1 ? (m.price - pos.entry) / pos.entry : (pos.entry - m.price) / pos.entry) * 3 * 100
      : 0;

  const sparkPts = (() => {
    const w = 240;
    const hgt = 44;
    const min = Math.min(...equityCurve);
    const max = Math.max(...equityCurve);
    const span = max - min || 1;
    return equityCurve
      .map((v, i) => `${(i / (equityCurve.length - 1 || 1)) * w},${hgt - 4 - ((v - min) / span) * (hgt - 8)}`)
      .join(" ");
  })();

  return (
    <section id="execute" className="relative z-10 mx-auto max-w-7xl scroll-mt-20 px-5 py-20 lg:px-8">
      <div className="rv">
        <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-amb">// execution desk</div>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Dry-run the loop before it touches an exchange
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-mut">
          The same state machine as <span className="font-mono text-[13px] text-ink">execute.py</span>: closed-bar
          decisions, fee-and-slippage fills, protective stops. Point it at the synthetic feed and watch the log.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
        {/* log */}
        <div className="rv panel flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg2 px-4 py-3">
            <div className="flex items-center gap-1">
              {(["paper", "testnet", "live"] as Mode[]).map((mo) => (
                <button
                  key={mo}
                  onClick={() => !running && setMode(mo)}
                  disabled={running}
                  className={
                    "px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors " +
                    (mode === mo
                      ? mo === "live"
                        ? "bg-red/15 text-red"
                        : "bg-grn/12 text-grn"
                      : "text-mut hover:text-ink")
                  }
                >
                  {mo}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {mode === "live" && (
                <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-red">
                  <input
                    type="checkbox"
                    checked={armed}
                    disabled={running}
                    onChange={(e) => setArmed(e.target.checked)}
                    className="accent-[#f0564f]"
                  />
                  i understand the risk
                </label>
              )}
              {!running ? (
                <button className="btn btn-grn" disabled={!canStart} onClick={() => setRunning(true)}>
                  ▶ start loop
                </button>
              ) : (
                <button className="btn btn-red" onClick={() => setRunning(false)}>
                  ■ stop
                </button>
              )}
            </div>
          </div>

          <div ref={boxRef} className="scroll-slim h-[380px] overflow-y-auto bg-[#0c1210] px-4 py-3 font-mono text-[12px] leading-[1.75]">
            {logs.map((l, i) => (
              <div key={i} className="flex gap-3">
                <span className="shrink-0 text-dim">{l.t}</span>
                <span className={"shrink-0 w-14 uppercase text-[10.5px] leading-[1.95] " + (l.level === "info" ? "text-dim" : LEVEL_CLS[l.level])}>
                  {l.level === "info" ? "INFO" : l.level}
                </span>
                <span className={LEVEL_CLS[l.level]}>{l.text}</span>
              </div>
            ))}
            {running && (
              <div className="text-grn">
                <span className="caret">▌</span>
              </div>
            )}
          </div>
        </div>

        {/* position + equity */}
        <div className="rv space-y-5" style={{ transitionDelay: "120ms" }}>
          <div className="panel p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-grn">open position</h3>
              <span
                className={
                  "border px-2.5 py-0.5 font-mono text-[11px] " +
                  (pos.side === 1
                    ? "border-grn/50 bg-grn/10 text-grn"
                    : pos.side === -1
                      ? "border-red/50 bg-red/10 text-red"
                      : "border-line2 text-mut")
                }
              >
                {pos.side === 1 ? "LONG · 3×" : pos.side === -1 ? "SHORT · 3×" : "FLAT"}
              </span>
            </div>
            <div className="mt-5 space-y-3 font-mono text-[12.5px]">
              {[
                ["entry", pos.entry ? fmtUsd(pos.entry) : "—"],
                ["mark", fmtUsd(m.price)],
                ["stop", pos.entry ? fmtUsd(pos.entry * (pos.side === 1 ? 0.985 : 1.015)) : "—"],
                ["notional", pos.side !== 0 && pos.entry ? fmtUsd(pos.equity * 3, 0) + " USDT" : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line/60 pb-2">
                  <span className="text-dim">{k}</span>
                  <span className="text-ink">{v}</span>
                </div>
              ))}
              <div className="flex justify-between pb-1">
                <span className="text-dim">uPnL (3×)</span>
                <span className={"text-[15px] font-medium " + (uPnl >= 0 ? "text-grn" : "text-red")}>
                  {uPnl >= 0 ? "+" : ""}
                  {uPnl.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          <div className="panel p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-grn">session equity</h3>
              <span className="font-mono text-[13px] text-ink">{fmtUsd(pos.equity, 2)} USDT</span>
            </div>
            <svg viewBox="0 0 240 44" className="mt-4 h-16 w-full" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={sparkPts} fill="none" stroke={pos.equity >= 10000 ? "#3ecf8e" : "#f0564f"} strokeWidth="1.6" />
              <line x1="0" y1="22" x2="240" y2="22" stroke="#21302a" strokeDasharray="3 4" strokeWidth="0.8" />
            </svg>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-dim">
              <span>start 10,000.00</span>
              <span className={pos.equity >= 10000 ? "text-grn" : "text-red"}>
                {pos.equity >= 10000 ? "+" : ""}
                {(((pos.equity - 10000) / 10000) * 100).toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="border border-amb/30 bg-amb/[0.05] p-4 font-mono text-[11px] leading-relaxed text-amb/90">
            <span className="font-bold">SAFETY ·</span> the real loop trades closed bars only, syncs existing
            positions on boot, and refuses <span className="text-red">--live</span> without the risk flag.
          </div>
        </div>
      </div>
    </section>
  );
}
