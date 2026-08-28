import { useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ */
/*  Synthetic BTC/USDT 15m feed shared by every widget on the desk.    */
/*  One tick = one "bar update"; a fresh candle rolls every 6 ticks.   */
/* ------------------------------------------------------------------ */

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface TradeMark {
  i: number;      // candle index
  side: 1 | -1;   // opened long / short
}

type Listener = () => void;

const TICKS_PER_CANDLE = 6;

export function ema(values: number[], span: number): number[] {
  const k = 2 / (span + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function computeRSI(closes: number[], period = 14): number[] {
  const out = new Array(closes.length).fill(50);
  let ag = 0;
  let al = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = Math.max(d, 0);
    const l = Math.max(-d, 0);
    if (i <= period) {
      ag += g / period;
      al += l / period;
    } else {
      ag = (ag * (period - 1) + g) / period;
      al = (al * (period - 1) + l) / period;
    }
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

class MarketSim {
  candles: Candle[] = [];
  rsi: number[] = [];
  macd: number[] = [];
  signal: number[] = [];
  hist: number[] = [];
  price = 0;
  prevPrice = 0;
  version = 0;

  agentPos: -1 | 0 | 1 = 0;
  agentEntry = 0;
  equity = 10000;
  equityHist: number[] = [10000];
  trades: TradeMark[] = [];
  sessionPnl = 0;

  private drift = 0;
  private tickCount = 0;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.seed();
  }

  private rnd(): number {
    return (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
  }

  private seed() {
    let p = 63200 + Math.random() * 2600;
    const now = Date.now();
    for (let i = 0; i < 110; i++) {
      const o = p;
      const vol = 0.0022 + 0.0016 * Math.abs(Math.sin(i / 17));
      for (let k = 0; k < 4; k++) p *= 1 + this.rnd() * vol + Math.sin(i / 23) * 0.0004;
      const c = p;
      this.candles.push({
        t: now - (110 - i) * 900_000,
        o,
        c,
        h: Math.max(o, c) * (1 + Math.random() * 0.0012),
        l: Math.min(o, c) * (1 - Math.random() * 0.0012),
      });
    }
    this.price = p;
    this.prevPrice = p;
    this.recompute();
    this.equityHist = new Array(this.candles.length).fill(10000);
  }

  private recompute() {
    const closes = this.candles.map((c) => c.c);
    this.rsi = computeRSI(closes);
    const fast = ema(closes, 12);
    const slow = ema(closes, 26);
    this.macd = fast.map((v, i) => v - slow[i]);
    this.signal = ema(this.macd, 9);
    this.hist = this.macd.map((v, i) => v - this.signal[i]);
  }

  private agentStep(i: number) {
    const r = this.rsi[i];
    const h0 = this.hist[i];
    const h1 = this.hist[i - 1] ?? 0;
    let want: -1 | 0 | 1 = this.agentPos;
    if (r < 33 && h0 > 0 && h0 > h1) want = 1;
    else if (r > 67 && h0 < 0 && h0 < h1) want = -1;
    else if (this.agentPos === 1 && (r > 62 || h0 < 0)) want = 0;
    else if (this.agentPos === -1 && (r < 38 || h0 > 0)) want = 0;

    if (want !== this.agentPos) {
      const px = this.candles[i].c;
      if (this.agentPos !== 0) {
        this.equity *= 1 + this.agentPos * ((px - this.agentEntry) / this.agentEntry) * 3 - 0.0008;
      }
      this.agentPos = want;
      this.agentEntry = want === 0 ? 0 : px * (1 + want * 0.0002);
      if (want !== 0) this.trades.push({ i, side: want });
      if (this.trades.length > 40) this.trades.shift();
    }
    const px = this.candles[i].c;
    if (this.agentPos !== 0 && this.agentEntry > 0) {
      this.sessionPnl = (this.equity * (1 + this.agentPos * ((px - this.agentEntry) / this.agentEntry) * 3) - 10000);
    }
  }

  private tick = () => {
    this.prevPrice = this.price;
    this.tickCount++;
    const i = this.candles.length - 1;
    const vol = 0.0016 + 0.0014 * Math.abs(Math.sin(this.tickCount / 29));
    this.drift = this.drift * 0.92 + this.rnd() * 0.0009;
    const ret = this.drift + this.rnd() * vol;
    this.price = this.candles[i].c * (1 + ret);

    const c = this.candles[i];
    c.c = this.price;
    c.h = Math.max(c.h, this.price);
    c.l = Math.min(c.l, this.price);
    this.recompute();

    if (this.tickCount % TICKS_PER_CANDLE === 0) {
      // roll a fresh candle and let the agent act on the closed one
      this.agentStep(i);
      this.equityHist.push(this.markEquity());
      if (this.equityHist.length > this.candles.length + 2) this.equityHist.shift();
      this.candles.push({ t: Date.now(), o: this.price, h: this.price, l: this.price, c: this.price });
      if (this.candles.length > 130) {
        this.candles.shift();
        // keep trade markers pinned to their candles as the window slides
        this.trades = this.trades.map((t) => ({ i: t.i - 1, side: t.side })).filter((t) => t.i >= 0);
      }
      this.recompute();
    }
    this.version++;
    this.listeners.forEach((fn) => fn());
  };

  markEquity(): number {
    if (this.agentPos === 0 || this.agentEntry === 0) return this.equity;
    return this.equity * (1 + this.agentPos * ((this.price - this.agentEntry) / this.agentEntry) * 3);
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    if (!this.timer) this.timer = setInterval(this.tick, 1400);
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  };

  getVersion = () => this.version;
}

export const market = new MarketSim();

/** Reactive handle on the shared feed — components re-render each tick. */
export function useMarket(): MarketSim {
  useSyncExternalStore(market.subscribe, market.getVersion);
  return market;
}

export const fmtUsd = (v: number, dp = 1) =>
  v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
