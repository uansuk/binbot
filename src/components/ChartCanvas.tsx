import { useEffect, useRef } from "react";
import { useMarket } from "../lib/market";

const C = {
  grn: "#3ecf8e",
  red: "#f0564f",
  amb: "#f2b441",
  cyn: "#56c8d8",
  grid: "rgba(147,167,156,0.08)",
  mut: "#5d7168",
  ink: "#e8f0ea",
};

export default function ChartCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const m = useMarket();

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const candles = m.candles.slice(-64);
      const offset = m.candles.length - candles.length;
      const n = candles.length;
      if (n < 5) return;

      const padL = 6;
      const padR = 56;
      const gap = 8;
      const priceH = (h - gap * 2) * 0.6;
      const subH = (h - gap * 2) * 0.2;
      const topP = 8;
      const topR = topP + priceH + gap;
      const topM = topR + subH + gap;
      const innerW = w - padL - padR;
      const cw = innerW / n;

      const closes = candles.map((c) => c.c);
      const hi = Math.max(...candles.map((c) => c.h));
      const lo = Math.min(...candles.map((c) => c.l));
      const yP = (v: number) => topP + ((hi - v) / (hi - lo || 1)) * (priceH - 16) + 8;

      // grid
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const y = topP + (priceH / 4) * g;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
      }

      // price labels
      ctx.fillStyle = C.mut;
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.textAlign = "left";
      for (let g = 0; g <= 4; g++) {
        const v = hi - ((hi - lo) / 4) * g;
        ctx.fillText((v / 1000).toFixed(2) + "k", w - padR + 6, topP + (priceH / 4) * g + 3);
      }

      // candles
      candles.forEach((c, i) => {
        const x = padL + i * cw + cw / 2;
        const up = c.c >= c.o;
        const col = up ? C.grn : C.red;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yP(c.h));
        ctx.lineTo(x, yP(c.l));
        ctx.stroke();
        const yo = yP(c.o);
        const yc = yP(c.c);
        ctx.fillStyle = up ? "rgba(62,207,142,0.85)" : "rgba(240,86,79,0.85)";
        ctx.fillRect(x - cw * 0.32, Math.min(yo, yc), Math.max(cw * 0.64, 2), Math.max(Math.abs(yc - yo), 1.5));
      });

      // agent trade markers
      m.trades.forEach((t) => {
        const i = t.i - offset;
        if (i < 0 || i >= n) return;
        const x = padL + i * cw + cw / 2;
        const c = candles[i];
        ctx.fillStyle = t.side === 1 ? C.grn : C.red;
        ctx.beginPath();
        if (t.side === 1) {
          const y = yP(c.l) + 12;
          ctx.moveTo(x, y - 7);
          ctx.lineTo(x - 5, y + 2);
          ctx.lineTo(x + 5, y + 2);
        } else {
          const y = yP(c.h) - 12;
          ctx.moveTo(x, y + 7);
          ctx.lineTo(x - 5, y - 2);
          ctx.lineTo(x + 5, y - 2);
        }
        ctx.closePath();
        ctx.fill();
      });

      // last price line
      const last = m.price;
      const yl = yP(last);
      ctx.strokeStyle = last >= m.prevPrice ? C.grn : C.red;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, yl);
      ctx.lineTo(w - padR, yl);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = last >= m.prevPrice ? C.grn : C.red;
      ctx.fillRect(w - padR + 2, yl - 8, padR - 4, 16);
      ctx.fillStyle = "#0b0f0e";
      ctx.fillText((last / 1000).toFixed(2) + "k", w - padR + 6, yl + 3);

      // ---- RSI pane
      const rsiSlice = m.rsi.slice(-n);
      const yR = (v: number) => topR + ((100 - v) / 100) * subH;
      ctx.strokeStyle = C.grid;
      [30, 70].forEach((lvl) => {
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, yR(lvl));
        ctx.lineTo(w - padR, yR(lvl));
        ctx.stroke();
        ctx.setLineDash([]);
      });
      ctx.fillStyle = C.mut;
      ctx.fillText("70", w - padR + 6, yR(70) + 3);
      ctx.fillText("30", w - padR + 6, yR(30) + 3);
      ctx.strokeStyle = C.cyn;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      rsiSlice.forEach((v, i) => {
        const x = padL + i * cw + cw / 2;
        if (i === 0) ctx.moveTo(x, yR(v));
        else ctx.lineTo(x, yR(v));
      });
      ctx.stroke();
      ctx.fillStyle = C.mut;
      ctx.fillText("RSI 14", padL + 2, topR + 11);
      const rsiNow = rsiSlice[n - 1];
      ctx.fillStyle = rsiNow > 67 ? C.red : rsiNow < 33 ? C.grn : C.ink;
      ctx.fillText(rsiNow.toFixed(1), padL + 52, topR + 11);

      // ---- MACD pane
      const histSlice = m.hist.slice(-n);
      const macdSlice = m.macd.slice(-n);
      const sigSlice = m.signal.slice(-n);
      const mmax = Math.max(...histSlice.map(Math.abs), ...macdSlice.map(Math.abs), 1e-9);
      const midM = topM + subH / 2;
      const yM = (v: number) => midM - (v / mmax) * (subH / 2 - 4);
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.moveTo(padL, midM);
      ctx.lineTo(w - padR, midM);
      ctx.stroke();
      histSlice.forEach((v, i) => {
        const x = padL + i * cw + cw / 2;
        ctx.fillStyle = v >= 0 ? "rgba(62,207,142,0.55)" : "rgba(240,86,79,0.55)";
        const y0 = Math.min(midM, yM(v));
        ctx.fillRect(x - cw * 0.28, y0, Math.max(cw * 0.56, 1.5), Math.abs(yM(v) - midM) || 1);
      });
      const drawLine = (arr: number[], col: string) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        arr.forEach((v, i) => {
          const x = padL + i * cw + cw / 2;
          if (i === 0) ctx.moveTo(x, yM(v));
          else ctx.lineTo(x, yM(v));
        });
        ctx.stroke();
      };
      drawLine(macdSlice, C.cyn);
      drawLine(sigSlice, C.amb);
      ctx.fillStyle = C.mut;
      ctx.fillText("MACD 12 26 9", padL + 2, topM + 11);
      const hNow = histSlice[n - 1];
      ctx.fillStyle = hNow >= 0 ? C.grn : C.red;
      ctx.fillText((hNow >= 0 ? "+" : "") + hNow.toFixed(1), padL + 96, topM + 11);
    };

    draw();
  }, [m, m.version]);

  return <canvas ref={canvasRef} className="block h-full w-full" aria-label="BTC/USDT 15m chart with RSI and MACD" />;
}
