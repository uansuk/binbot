import ChartCanvas from "./ChartCanvas";
import { QUICKSTART } from "../lib/python";
import { fmtUsd, useMarket } from "../lib/market";
import { useCopy } from "../hooks";

function Readout({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-l border-line pl-3 first:border-l-0 first:pl-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">{label}</span>
      <span className={"font-mono text-[13px] " + (tone ?? "text-ink")}>{value}</span>
    </div>
  );
}

export default function Terminal() {
  const m = useMarket();
  const [copied, copy] = useCopy();

  const rsi = m.rsi[m.rsi.length - 1] ?? 50;
  const hist = m.hist[m.hist.length - 1] ?? 0;
  const chg = ((m.price - m.candles[0].o) / m.candles[0].o) * 100;
  const posLabel = m.agentPos === 1 ? "LONG 3×" : m.agentPos === -1 ? "SHORT 3×" : "FLAT";
  const posTone = m.agentPos === 1 ? "text-grn" : m.agentPos === -1 ? "text-red" : "text-amb";
  const pnl = m.markEquity() - 10000;

  return (
    <section id="top" className="relative z-10 mx-auto max-w-7xl px-5 pb-20 pt-12 lg:px-8 lg:pt-16">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
        {/* -------- left : pitch + quickstart -------- */}
        <div className="rv">
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-amb">
            <span className="inline-block h-px w-8 bg-amb/60" />
            build documentation · three scripts
          </div>

          <h1 className="mt-5 font-display text-[clamp(2.35rem,4.6vw,4.1rem)] font-bold leading-[1.02] tracking-tight text-ink">
            A PPO agent on
            <br />
            BTC perpetuals —<span className="text-grn"> candles in,</span>
            <br />
            routed orders out.
          </h1>

          <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-mut">
            Kestrel is a three-file Binance USDT-M futures bot. <span className="text-ink">ccxt</span> pulls
            2,000 fifteen-minute candles, a <span className="text-ink">Gymnasium</span> environment teaches a{" "}
            <span className="text-ink">Stable-Baselines3</span> PPO policy on bounded RSI·MACD features, and an
            execution loop trades the closed-bar signal in paper, testnet, or live mode.
          </p>

          {/* spec strip */}
          <div className="mt-8 grid grid-cols-2 gap-y-4 border-y border-line py-5 sm:grid-cols-4">
            <Readout label="symbol" value="BTC/USDT:USDT" />
            <Readout label="timeframe" value="15m × 2,000" />
            <Readout label="obs dim" value="124" />
            <Readout label="actions" value="0·1·2" />
          </div>

          {/* quickstart console */}
          <div className="panel mt-8 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-redd" />
                <span className="h-2.5 w-2.5 rounded-full bg-amb/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-grnd" />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">quickstart — zsh</span>
              <button
                onClick={() => copy(QUICKSTART.map((q) => q.cmd).join("\n"))}
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-mut transition-colors hover:text-grn"
              >
                {copied ? "copied ✓" : "copy all"}
              </button>
            </div>
            <div className="space-y-2.5 px-4 py-4 font-mono text-[12.5px]">
              {QUICKSTART.map((q, i) => (
                <button
                  key={q.cmd}
                  onClick={() => copy(q.cmd)}
                  className="group flex w-full items-baseline gap-2 text-left"
                  title="click to copy"
                >
                  <span className="select-none text-dim">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-grn">$</span>
                  <span className="text-ink transition-colors group-hover:text-grn">{q.cmd}</span>
                  <span className="ml-auto hidden text-[11px] text-dim sm:inline"># {q.note}</span>
                </button>
              ))}
              <div className="pt-1 text-mut">
                <span className="text-grn">$</span> <span className="caret">▌</span>
              </div>
            </div>
          </div>
        </div>

        {/* -------- right : live chart terminal -------- */}
        <div className="rv" style={{ transitionDelay: "120ms" }}>
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[12px] font-medium text-ink">BTCUSDT.P</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-dim">15m · synthetic feed</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-red">live</span>
              </div>
            </div>

            <div className="h-[380px] sm:h-[430px]">
              <ChartCanvas />
            </div>

            <div className="grid grid-cols-2 gap-y-3 border-t border-line px-4 py-3.5 sm:grid-cols-5">
              <Readout label="last" value={fmtUsd(m.price)} tone={m.price >= m.prevPrice ? "text-grn" : "text-red"} />
              <Readout label="sess Δ" value={(chg >= 0 ? "+" : "") + chg.toFixed(2) + "%"} tone={chg >= 0 ? "text-grn" : "text-red"} />
              <Readout label="rsi 14" value={rsi.toFixed(1)} tone={rsi > 67 ? "text-red" : rsi < 33 ? "text-grn" : "text-ink"} />
              <Readout label="macd hist" value={(hist >= 0 ? "+" : "") + hist.toFixed(2)} tone={hist >= 0 ? "text-grn" : "text-red"} />
              <Readout label="agent" value={posLabel} tone={posTone} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[11px] text-dim">
            <span>
              simulated confluence agent · uPnL{" "}
              <span className={pnl >= 0 ? "text-grn" : "text-red"}>
                {pnl >= 0 ? "+" : ""}
                {fmtUsd(pnl, 2)} USDT
              </span>
            </span>
            <span>triangles = position flips · dashed = last price</span>
          </div>
        </div>
      </div>
    </section>
  );
}
