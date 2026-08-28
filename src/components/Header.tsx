import { useEffect, useRef } from "react";
import { fmtUsd, useMarket } from "../lib/market";
import { useUtcClock } from "../hooks";

const TAPE = [
  ["BTC/USDT", 64231.4, 1.24],
  ["ETH/USDT", 3412.9, 0.86],
  ["SOL/USDT", 172.44, -1.32],
  ["BNB/USDT", 591.2, 0.41],
  ["XRP/USDT", 0.6231, -0.54],
  ["DOGE/USDT", 0.1642, 2.18],
  ["AVAX/USDT", 38.72, -0.22],
  ["LINK/USDT", 17.85, 1.02],
  ["ARB/USDT", 1.124, -2.41],
  ["OP/USDT", 2.531, 0.77],
] as const;

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" stroke="#3ecf8e" strokeOpacity="0.6" />
      <rect x="7" y="10" width="3.4" height="10" fill="#f0564f" />
      <line x1="8.7" y1="6" x2="8.7" y2="24" stroke="#f0564f" strokeWidth="1.4" />
      <rect x="13.4" y="7" width="3.4" height="12" fill="#3ecf8e" />
      <line x1="15.1" y1="4" x2="15.1" y2="23" stroke="#3ecf8e" strokeWidth="1.4" />
      <rect x="19.8" y="12" width="3.4" height="9" fill="#3ecf8e" />
      <line x1="21.5" y1="8" x2="21.5" y2="25" stroke="#3ecf8e" strokeWidth="1.4" />
    </svg>
  );
}

export default function Header() {
  const m = useMarket();
  const clock = useUtcClock();
  const up = m.price >= m.prevPrice;
  const flashRef = useRef<HTMLSpanElement | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = flashRef.current;
    if (!el) return;
    el.classList.remove("tick-up", "tick-down");
    void el.offsetWidth;
    el.classList.add(up ? "tick-up" : "tick-down");
  }, [m.version, up]);

  const nav = [
    ["Pipeline", "#pipeline"],
    ["Source", "#code"],
    ["Train", "#train"],
    ["Execute", "#execute"],
    ["Risk", "#risk"],
  ];

  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <a href="#top" className="group flex items-center gap-3">
          <BrandMark />
          <div className="leading-none">
            <div className="font-display text-[17px] font-bold tracking-tight text-ink">
              KESTREL<span className="text-grn">·RL</span>
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-dim">
              binance usdt-m futures desk
            </div>
          </div>
        </a>

        <nav className="hidden items-center gap-6 md:flex">
          {nav.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-mut transition-colors hover:text-grn"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 border border-line bg-panel px-3 py-1.5 sm:flex">
            <span className="led inline-block h-1.5 w-1.5 rounded-full bg-grn" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mut">feed ok</span>
          </div>
          <div className="border border-line bg-panel px-3 py-1.5 text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">btc/usdt perp</div>
            <div className="flex items-baseline gap-2">
              <span ref={flashRef} className="font-mono text-sm font-medium text-ink">
                {fmtUsd(m.price)}
              </span>
              <span className={"font-mono text-[10px] " + (up ? "text-grn" : "text-red")}>
                {up ? "▲" : "▼"}
              </span>
            </div>
          </div>
          <div className="hidden border border-line bg-panel px-3 py-1.5 lg:block">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">utc</div>
            <div className="font-mono text-sm text-mut">{clock}</div>
          </div>
        </div>
      </div>

      {/* ticker tape */}
      <div className="ticker-wrap overflow-hidden border-y border-line bg-bg2/80">
        <div className="ticker-track flex w-max items-center">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex items-center" aria-hidden={dup === 1}>
              {TAPE.map(([sym, px, chg]) => (
                <div key={sym + dup} className="flex items-center gap-2 px-5 py-1.5">
                  <span className="font-mono text-[11px] text-mut">{sym}</span>
                  <span className="font-mono text-[11px] text-ink">{fmtUsd(px, px < 1 ? 4 : 2)}</span>
                  <span className={"font-mono text-[11px] " + (chg >= 0 ? "text-grn" : "text-red")}>
                    {chg >= 0 ? "+" : ""}
                    {chg.toFixed(2)}%
                  </span>
                  <span className="ml-3 text-line2">·</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
