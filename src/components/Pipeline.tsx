interface Stage {
  n: string;
  title: string;
  file: string;
  tabId: string;
  accent: string;
  accentText: string;
  body: string;
  chips: string[];
}

const STAGES: Stage[] = [
  {
    n: "01",
    title: "Ingest",
    file: "fetch_data.py",
    tabId: "fetch",
    accent: "border-amb/50",
    accentText: "text-amb",
    body: "ccxt pages backwards through Binance USDT-M klines — the exchange caps each call at 1,500 — until 2,000 fifteen-minute candles are buffered, deduplicated, and written to parquet. RSI(14), MACD(12,26,9), 1-bar returns and a volume z-score are attached in the same pass, so the trainer consumes ready features.",
    chips: ["ccxt.binance", "1,500/call paging", "Wilder RSI", "parquet store"],
  },
  {
    n: "02",
    title: "Train",
    file: "train_agent.py",
    tabId: "train",
    accent: "border-grn/50",
    accentText: "text-grn",
    body: "FuturesEnv wraps an 80/20 chronological split. Each episode drops the agent into a random 5-day slice with 24 bars of bounded features — tanh-scaled so nothing drifts non-stationary — plus its own position state. Reward is marked-to-market equity delta net of 4 bp fees, 1 bp slippage and a drawdown penalty. PPO trains with eval and checkpoint callbacks; a deterministic backtest scores the held-out slice.",
    chips: ["Gymnasium", "PPO MlpPolicy", "Discrete(3)", "Δequity reward"],
  },
  {
    n: "03",
    title: "Execute",
    file: "execute.py",
    tabId: "exec",
    accent: "border-cyn/50",
    accentText: "text-cyn",
    body: "The loop polls for newly closed 15m bars, rebuilds the exact training observation, and asks the policy for hold / long / short. Paper mode simulates fills with training-identical friction; testnet routes real orders through ccxt's sandbox; live mode demands an explicit risk flag. Exchange fills carry reduce-only closes, a STOP_MARKET guard and restart-safe position sync.",
    chips: ["closed-bar only", "paper / testnet / live", "STOP_MARKET", "SIGINT-safe"],
  },
];

export default function Pipeline({ onOpenFile }: { onOpenFile: (tabId: string) => void }) {
  return (
    <section id="pipeline" className="relative z-10 mx-auto max-w-7xl px-5 py-20 lg:px-8">
      <div className="rv flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-amb">// architecture</div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Three scripts. One policy.
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-mut">
          Each stage is a standalone file — run them in order, or click a stage to open its source below.
        </p>
      </div>

      {/* rail */}
      <div className="relative mt-14">
        <svg className="absolute left-0 right-0 top-[9px] hidden h-[2px] w-full md:block" aria-hidden="true">
          <line x1="0" y1="1" x2="100%" y2="1" stroke="#2d4038" strokeWidth="2" />
          <line x1="0" y1="1" x2="100%" y2="1" stroke="#3ecf8e" strokeWidth="2" className="dashline" opacity="0.5" />
        </svg>

        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {STAGES.map((s, idx) => (
            <div key={s.n} className="rv" style={{ transitionDelay: `${idx * 130}ms` }}>
              <div className="relative z-10 flex items-center gap-4">
                <span
                  className={
                    "flex h-5 w-5 items-center justify-center border-2 bg-bg font-mono text-[9px] " +
                    s.accent +
                    " " +
                    s.accentText
                  }
                >
                  {s.n}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-dim">{s.file}</span>
              </div>

              <button
                onClick={() => onOpenFile(s.tabId)}
                className="panel panel-hover group mt-5 block w-full p-6 text-left"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className={"font-display text-2xl font-bold tracking-tight " + s.accentText}>{s.title}</h3>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim transition-colors group-hover:text-grn">
                    open source →
                  </span>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-mut">{s.body}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {s.chips.map((c) => (
                    <span
                      key={c}
                      className="border border-line bg-bg2 px-2 py-1 font-mono text-[10.5px] text-mut transition-colors group-hover:border-line2"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
