export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-line bg-bg2/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div>
          <div className="font-display text-[15px] font-bold tracking-tight text-ink">
            KESTREL<span className="text-grn">·RL</span>
            <span className="ml-3 font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-dim">
              futures desk v0.9.1
            </span>
          </div>
          <p className="mt-2 max-w-md text-[12px] leading-relaxed text-dim">
            Research build for education. Not affiliated with Binance. Past simulated performance guarantees
            exactly nothing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em]">
          {["ccxt ≥ 4.2", "gymnasium", "stable-baselines3", "pytorch", "python 3.11"].map((t) => (
            <span key={t} className="border border-line px-2.5 py-1.5 text-mut transition-colors hover:border-grn/50 hover:text-grn">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="border-t border-line/60 py-4 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-dim">
        candles in · policy trained · orders out — kestrel rl desk
      </div>
    </footer>
  );
}
