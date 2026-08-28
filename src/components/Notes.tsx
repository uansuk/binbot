export default function Notes() {
  return (
    <section id="risk" className="relative z-10 mx-auto max-w-7xl scroll-mt-20 px-5 py-20 lg:px-8">
      <div className="rv">
        <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-amb">// signal & risk</div>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Why these features, and where the guardrails sit
        </h2>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {/* signal rationale */}
        <div className="rv panel panel-hover p-7">
          <h3 className="font-display text-xl font-bold text-cyn">Bounded inputs beat raw prices</h3>
          <p className="mt-3 text-[13.5px] leading-relaxed text-mut">
            Feeding USD prices to a policy is a non-stationarity trap — a 64,000 mean means nothing to an MLP.
            Kestrel normalizes everything the agent sees:
          </p>
          <ul className="mt-5 space-y-4">
            {[
              [
                "RSI(14) · Wilder smoothing",
                "A bounded momentum oscillator, rescaled to [-1, 1]. Extremes flag exhaustion regardless of the price regime — the least lagging piece of the pair, reacting bar-to-bar.",
                "text-cyn",
              ],
              [
                "MACD(12,26,9) · tanh-scaled vs price",
                "The line, signal and histogram measure the velocity gap between EMAs, divided by price so a 50-point histogram means the same at 20k and 90k. Histogram slope is the agent's acceleration cue.",
                "text-grn",
              ],
              [
                "1-bar return + volume z-score",
                "Raw short-horizon change and a 50-bar volume surprise term. Together they let the policy time entries on expansion rather than chasing the oscillator cross.",
                "text-amb",
              ],
            ].map(([t, d, tone]) => (
              <li key={t} className="flex gap-4">
                <span className={"mt-[7px] h-2 w-2 shrink-0 " + tone.replace("text-", "bg-")} />
                <div>
                  <div className={"font-mono text-[13px] font-medium " + tone}>{t}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-mut">{d}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-line pt-5 font-mono text-[11.5px] leading-relaxed text-dim">
            The policy is free to ignore any of it — PPO discovers its own confluence. The feature set only
            guarantees every input stays inside [-1, 1] forever.
          </div>
        </div>

        {/* risk stack */}
        <div className="rv space-y-5" style={{ transitionDelay: "120ms" }}>
          <div className="panel panel-hover p-7">
            <h3 className="font-display text-xl font-bold text-red">The risk stack</h3>
            <div className="mt-5 font-mono text-[12.5px]">
              {[
                ["closed-bar execution", "orders fire only on finalized candles — no repainting, no lookahead"],
                ["3× isolated leverage", "sized against current equity, never the wallet balance"],
                ["STOP_MARKET guard", "1.50% against entry, posted with every opening order, reduce-only"],
                ["training-identical friction", "4 bp fee + 1 bp slippage priced into both reward and paper fills"],
                ["−20% drawdown penalty", "shaped into the reward, so aversion is learned, not bolted on"],
                ["−50% episode kill", "a blown account terminates the episode — the policy learns to survive"],
                ["restart-safe sync", "boot adopts existing exchange positions instead of double-entering"],
              ].map(([k, d], i) => (
                <div key={k} className="flex gap-4 border-b border-line/60 py-3 first:pt-0 last:border-b-0">
                  <span className="w-6 shrink-0 text-dim">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="text-ink">{k}</div>
                    <div className="mt-0.5 text-[11.5px] text-dim">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* disclaimer band */}
      <div className="rv mt-12 border border-red/35 bg-red/[0.05] p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none" className="shrink-0" aria-hidden="true">
            <path d="M17 3L32 30H2L17 3Z" stroke="#f0564f" strokeWidth="1.6" />
            <line x1="17" y1="13" x2="17" y2="21" stroke="#f0564f" strokeWidth="2" />
            <circle cx="17" cy="25" r="1.4" fill="#f0564f" />
          </svg>
          <div>
            <h3 className="font-display text-lg font-bold text-red">Read before you run it hot</h3>
            <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-mut">
              Leveraged futures can liquidate your entire margin in minutes. Nothing here is financial advice —
              it is an engineering exercise. RL agents overfit aggressively: a rising reward curve on 2,000
              candles is <span className="text-ink">not</span> evidence of future edge. Validate on a proper
              walk-forward split, size positions so a full liquidation is survivable, and keep the bot on{" "}
              <span className="font-mono text-[12.5px] text-ink">--paper</span> or{" "}
              <span className="font-mono text-[12.5px] text-ink">--testnet</span> until you can explain every
              line of <span className="font-mono text-[12.5px] text-ink">execute.py</span>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
