/* Full, runnable source of the three bot scripts + setup files. */

export interface PyFile {
  id: string;
  name: string;
  kind: string;
  summary: string;
  code: string;
}

const fetchData = `"""
01 · INGEST — fetch_data.py
------------------------------------------------------------------
Pull the last 2,000 BTC/USDT perpetual 15m candles from Binance
USDT-M Futures through ccxt (paginated — Binance caps klines at
1,500 per request), then attach the RSI(14) and MACD(12,26,9)
features the RL environment will train on.

Outputs:
    data/btcusdt_15m_raw.parquet
    data/btcusdt_15m_features.parquet

Run:    python fetch_data.py
"""

from __future__ import annotations

import os
from pathlib import Path

import ccxt
import numpy as np
import pandas as pd

# ---------------------------------------------------------------- config
SYMBOL    = "BTC/USDT:USDT"           # ccxt unified perpetual symbol
TIMEFRAME = "15m"
LIMIT     = 2_000                     # candles requested
OUT_DIR   = Path("data")
RAW_PATH  = OUT_DIR / "btcusdt_15m_raw.parquet"
FEAT_PATH = OUT_DIR / "btcusdt_15m_features.parquet"

EXCHANGE = ccxt.binance(
    {
        "apiKey": os.getenv("BINANCE_API_KEY", ""),     # public data — keys optional
        "secret": os.getenv("BINANCE_API_SECRET", ""),
        "enableRateLimit": True,
        "options": {"defaultType": "swap"},             # USDT-M perpetual futures
    }
)


# ------------------------------------------------------------- download
def fetch_candles(exchange: ccxt.binance, symbol: str,
                  timeframe: str, total: int) -> pd.DataFrame:
    """Fetch \`total\` candles, paging backwards 1,500 at a time."""
    tf_ms    = exchange.parse_timeframe(timeframe) * 1_000
    all_rows = exchange.fetch_ohlcv(symbol, timeframe, since=None, limit=1_500)

    while len(all_rows) < total:
        # next page must end just before the oldest candle we already have
        since    = all_rows[0][0] - 1_500 * tf_ms
        batch    = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=1_500)
        all_rows = batch + all_rows
        print(f"  ...{len(all_rows):>5}/{total} candles buffered")

    df = pd.DataFrame(all_rows[-total:],
                      columns=["ts", "open", "high", "low", "close", "volume"])
    df["ts"] = pd.to_datetime(df["ts"], unit="ms", utc=True)
    return df.drop_duplicates("ts").sort_values("ts").reset_index(drop=True)


# ------------------------------------------------------------ indicators
def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """RSI(14) Wilder, MACD(12,26,9), 1-bar return, volume z-score."""
    out   = df.copy()
    close = out["close"]

    delta    = close.diff()
    avg_gain = delta.clip(lower=0.0).ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    avg_loss = (-delta.clip(upper=0.0)).ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    rs       = avg_gain / avg_loss.replace(0.0, np.nan)
    out["rsi_14"] = (100.0 - 100.0 / (1.0 + rs)).fillna(50.0)

    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    out["macd"]        = ema12 - ema26
    out["macd_signal"] = out["macd"].ewm(span=9, adjust=False).mean()
    out["macd_hist"]   = out["macd"] - out["macd_signal"]

    out["ret_1"] = close.pct_change().fillna(0.0)
    out["vol_z"] = ((out["volume"] - out["volume"].rolling(50).mean())
                    / out["volume"].rolling(50).std()).fillna(0.0).clip(-3.0, 3.0)
    return out


# ------------------------------------------------------------------ main
def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    EXCHANGE.load_markets()

    print(f"Downloading {LIMIT} x {TIMEFRAME} candles for {SYMBOL} ...")
    raw = fetch_candles(EXCHANGE, SYMBOL, TIMEFRAME, LIMIT)
    raw.to_parquet(RAW_PATH, index=False)
    print(f"raw candles  -> {RAW_PATH}  ({raw.ts.iloc[0]} to {raw.ts.iloc[-1]})")

    feat = add_indicators(raw)
    feat.to_parquet(FEAT_PATH, index=False)
    print(f"features     -> {FEAT_PATH}")
    print(feat[["ts", "close", "rsi_14", "macd_hist"]].tail(5).to_string(index=False))


if __name__ == "__main__":
    main()
`;

const trainAgent = `"""
02 · TRAIN — train_agent.py
------------------------------------------------------------------
Gymnasium environment for BTC/USDT perpetuals plus a PPO trainer
(Stable-Baselines3).

Observation : last 24 bars of [RSI, MACD, histogram, return, vol-z]
              plus position state (side, entry drift, uPnL, equity)
Action      : Discrete(3)  ->  0 hold · 1 long · 2 short
Reward      : change in marked-to-market equity / initial cash (x100)
              minus 0.5 whenever drawdown exceeds 20 percent
Costs       : 4 bp taker fee per side, 1 bp slippage, 3x leverage

Run:    python train_agent.py --timesteps 500000
        python train_agent.py --backtest
"""

from __future__ import annotations

import argparse
from pathlib import Path

import gymnasium as gym
import numpy as np
import pandas as pd
from gymnasium import spaces
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback, EvalCallback

FEAT_PATH = Path("data/btcusdt_15m_features.parquet")
MODEL_DIR = Path("models")

WINDOW   = 24        # bars of history the agent sees        (6 h at 15m)
EPISODE  = 480       # bars per episode                     (5 days)
LEVERAGE = 3.0
FEE      = 0.0004    # taker, per side
SLIPPAGE = 0.0001
CASH0    = 10_000.0
FEATS    = ["rsi_n", "macd_n", "hist_n", "ret_n", "volz_n"]


# ------------------------------------------------------------------ env
class FuturesEnv(gym.Env):
    """Flat / long / short on pre-normalized RSI x MACD features."""

    metadata = {"render_modes": []}

    def __init__(self, df: pd.DataFrame, episode_len: int = EPISODE):
        super().__init__()
        self.close  = df["close"].to_numpy(dtype=np.float64)
        self.feat   = self._normalize(df)
        self.ep_len = episode_len
        self.lo     = WINDOW + 1
        self.hi     = len(df) - episode_len - 1

        self.action_space = spaces.Discrete(3)
        self.observation_space = spaces.Box(
            -np.inf, np.inf, shape=(len(FEATS) * WINDOW + 4,), dtype=np.float32
        )
        self.reset()

    # -- features to bounded floats, identical to the live inference path
    @staticmethod
    def _normalize(df: pd.DataFrame) -> np.ndarray:
        px = df["close"]
        f = pd.DataFrame(index=df.index)
        f["rsi_n"]  = df["rsi_14"] / 50.0 - 1.0                  # [-1, 1]
        f["macd_n"] = np.tanh(df["macd"] / px * 100.0)
        f["hist_n"] = np.tanh(df["macd_hist"] / px * 100.0)
        f["ret_n"]  = np.tanh(df["ret_1"] * 50.0)
        f["volz_n"] = (df["vol_z"] / 3.0).clip(-1.0, 1.0)
        return f[FEATS].to_numpy(dtype=np.float32)

    # -- episode handling
    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        self.t0 = int(self.np_random.integers(self.lo, max(self.hi, self.lo + 1)))
        self.t  = self.t0
        self.cash, self.units, self.entry, self.position = CASH0, 0.0, 0.0, 0
        self.peak, self.trades = CASH0, 0
        return self._obs(), {}

    def _equity(self, price: float) -> float:
        return self.cash + self.units * (price - self.entry)

    def _obs(self) -> np.ndarray:
        px    = self.close[self.t]
        upnl  = self.units * (px - self.entry)
        drift = (np.sign(self.position) * (px - self.entry) / self.entry
                 if self.position else 0.0)
        state = np.array(
            [self.position, drift * 100.0, upnl / CASH0 * 10.0,
             self._equity(px) / CASH0 - 1.0], dtype=np.float32)
        hist = self.feat[self.t - WINDOW + 1 : self.t + 1].reshape(-1)
        return np.concatenate([hist, state])

    # -- one bar forward
    def step(self, action: int):
        target = int(action) - 1                  # -1 short · 0 flat · +1 long
        px     = self.close[self.t]

        equity_before = self._equity(px)
        if target != self.position:               # rebalance: fill at px +/- slippage
            fill   = px * (1.0 + SLIPPAGE * np.sign(target - self.position))
            notion = abs(target - self.position) * LEVERAGE * equity_before
            self.cash    -= notion * FEE
            self.units    = target * notion / fill
            self.entry    = fill if target else 0.0
            self.position = target
            self.trades  += 1

        self.t   += 1
        px_now    = self.close[self.t]
        equity    = self._equity(px_now)
        self.peak = max(self.peak, equity)
        dd        = 1.0 - equity / self.peak

        reward = (equity - equity_before) / CASH0 * 100.0
        if dd > 0.20:
            reward -= 0.5                         # discourage deep drawdowns

        terminated = equity < CASH0 * 0.5         # blown account ends the episode
        truncated  = self.t >= self.t0 + self.ep_len
        return self._obs(), float(reward), terminated, truncated, {}


# ------------------------------------------------------------- pipeline
def load_split(path: Path = FEAT_PATH) -> tuple[pd.DataFrame, pd.DataFrame]:
    df  = pd.read_parquet(path)
    cut = int(len(df) * 0.8)                      # chronological 80 / 20 split
    return df.iloc[:cut].reset_index(drop=True), df.iloc[cut:].reset_index(drop=True)


def train(timesteps: int, lr: float) -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    train_df, val_df = load_split()

    env      = FuturesEnv(train_df)
    eval_env = FuturesEnv(val_df)

    model = PPO(
        "MlpPolicy", env,
        learning_rate=lr, n_steps=2048, batch_size=256,
        gamma=0.99, gae_lambda=0.95, clip_range=0.2,
        ent_coef=0.01, vf_coef=0.5, max_grad_norm=0.5,
        policy_kwargs=dict(net_arch=dict(pi=[256, 256], vf=[256, 256])),
        tensorboard_log="runs/", verbose=1, seed=7,
    )

    callbacks = [
        EvalCallback(eval_env, eval_freq=10_000, n_eval_episodes=5,
                     deterministic=True, best_model_save_path=str(MODEL_DIR),
                     log_path="logs/", verbose=1),
        CheckpointCallback(save_freq=25_000, save_path=str(MODEL_DIR),
                           name_prefix="ppo_futures"),
    ]

    model.learn(total_timesteps=timesteps, callback=callbacks, progress_bar=True)
    model.save(MODEL_DIR / "ppo_futures_final")
    print(f"model saved -> {MODEL_DIR / 'ppo_futures_final.zip'}")


# ---------------------------------------------------------- quick backtest
def backtest(model_path: str = "models/best_model") -> None:
    """Deterministic-policy walk across the held-out 20 percent slice."""
    _, val_df = load_split()
    env   = FuturesEnv(val_df, episode_len=len(val_df) - WINDOW - 3)
    model = PPO.load(model_path)

    obs, _ = env.reset(seed=0)
    while True:
        action, _ = model.predict(obs, deterministic=True)
        obs, _, term, trunc, _ = env.step(int(action))
        if term or trunc:
            break

    eq = env._equity(env.close[env.t])
    print(f"final equity {eq:,.2f} USDT")
    print(f"return       {(eq / CASH0 - 1) * 100:+.2f} percent")
    print(f"max dd       {(1 - eq / env.peak) * 100:.2f} percent   trades {env.trades}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--timesteps", type=int, default=500_000)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--backtest", action="store_true")
    a = p.parse_args()
    if a.backtest:
        backtest()
    else:
        train(a.timesteps, a.lr)
`;

const execute = `"""
03 · EXECUTE — execute.py
------------------------------------------------------------------
Take the trained PPO policy to market. On every closed 15m candle:

    1. fetch the freshest bars from Binance USDT-M futures
    2. rebuild the RSI x MACD observation exactly as in training
    3. ask the model for an action      (0 hold · 1 long · 2 short)
    4. route the order — or simulate the fill in paper mode

Modes:
    --paper     live market data, local fill simulator   (default)
    --testnet   real order routing on Binance futures testnet
    --live      real money — requires --i-understand-the-risk

Keys come from .env:  BINANCE_API_KEY / BINANCE_API_SECRET
Run:  python execute.py --paper
      python execute.py --testnet
"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import ccxt
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from stable_baselines3 import PPO

load_dotenv()

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s  %(levelname)-7s %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger("executor")


# ------------------------------------------------------------------ config
@dataclass
class Config:
    symbol: str     = "BTC/USDT:USDT"
    timeframe: str  = "15m"
    window: int     = 24        # must match training
    warmup: int     = 120       # extra bars so RSI / MACD settle
    leverage: int   = 3
    stop_pct: float = 0.015     # hard stop 1.5 percent against entry
    model_path: str = "models/best_model"
    mode: str       = "paper"


@dataclass
class Position:
    cash0: float    = 10_000.0
    cash: float     = 10_000.0
    units: float    = 0.0
    entry: float    = 0.0
    position: int   = 0         # -1 · 0 · +1

    def equity(self, px: float) -> float:
        return self.cash + self.units * (px - self.entry)


# ---------------------------------------------------------------- exchange
def make_exchange(cfg: Config) -> ccxt.binance:
    ex = ccxt.binance(
        {
            "apiKey": os.getenv("BINANCE_API_KEY", ""),
            "secret": os.getenv("BINANCE_API_SECRET", ""),
            "enableRateLimit": True,
            "options": {"defaultType": "swap"},
        }
    )
    if cfg.mode == "testnet":
        ex.set_sandbox_mode(True)          # -> https://testnet.binancefuture.com
    ex.load_markets()
    return ex


# ------------------------------------------ identical feature pipeline
def build_obs(df: pd.DataFrame, cfg: Config, pos: Position) -> np.ndarray:
    """Reproduce FuturesEnv._normalize + _obs for the newest closed bar."""
    close = df["close"]

    d   = close.diff()
    ag  = d.clip(lower=0.0).ewm(alpha=1 / 14, adjust=False).mean()
    al  = (-d.clip(upper=0.0)).ewm(alpha=1 / 14, adjust=False).mean()
    rsi = (100.0 - 100.0 / (1.0 + ag / al.replace(0.0, np.nan))).fillna(50.0)

    macd = close.ewm(span=12, adjust=False).mean() - close.ewm(span=26, adjust=False).mean()
    hist = macd - macd.ewm(span=9, adjust=False).mean()
    ret  = close.pct_change().fillna(0.0)
    volz = ((df["volume"] - df["volume"].rolling(50).mean())
            / df["volume"].rolling(50).std()).fillna(0.0).clip(-3, 3)

    f = np.stack(
        [
            (rsi / 50.0 - 1.0).to_numpy(),
            np.tanh(macd / close * 100.0),
            np.tanh(hist / close * 100.0),
            np.tanh(ret * 50.0),
            (volz / 3.0).clip(-1, 1).to_numpy(),
        ],
        axis=1,
    ).astype(np.float32)

    px    = float(close.iloc[-1])
    upnl  = pos.units * (px - pos.entry)
    drift = (np.sign(pos.position) * (px - pos.entry) / pos.entry
             if pos.position else 0.0)
    state = np.array(
        [pos.position, drift * 100.0, upnl / pos.cash0 * 10.0,
         pos.equity(px) / pos.cash0 - 1.0], dtype=np.float32)
    return np.concatenate([f[-cfg.window:].reshape(-1), state])


# ---------------------------------------------------------------- brokers
class PaperBroker:
    """Local fills: 4 bp fee + 1 bp slippage — same friction as training."""
    FEE, SLIP = 0.0004, 0.0001

    def set_target(self, pos: Position, target: int, px: float, leverage: float) -> None:
        if target == pos.position:
            return
        fill   = px * (1.0 + self.SLIP * np.sign(target - pos.position))
        notion = abs(target - pos.position) * leverage * pos.equity(px)
        pos.cash    -= notion * self.FEE
        pos.units    = target * notion / fill
        pos.entry    = fill if target else 0.0
        pos.position = target
        log.info("PAPER fill  %-5s @ %,.2f   notional %,.0f USDT",
                 {1: "LONG", -1: "SHORT", 0: "FLAT"}[target], fill, notion)


class ExchangeBroker:
    """Routes real orders (testnet or live) with a protective stop."""

    def __init__(self, ex: ccxt.binance, cfg: Config):
        self.ex, self.cfg = ex, cfg
        m = ex.market(cfg.symbol)
        ex.set_leverage(cfg.leverage, cfg.symbol)
        try:
            ex.set_margin_mode("ISOLATED", cfg.symbol)
        except ccxt.ExchangeError as e:
            log.warning("margin mode unchanged: %s", e)
        self.qty  = lambda q: ex.amount_to_precision(cfg.symbol, q)
        self._min = m["limits"]["amount"]["min"]

    def sync(self, pos: Position) -> None:
        """Adopt whatever the exchange already holds (restart-safe)."""
        for p in self.ex.fetch_positions([self.cfg.symbol]):
            amt = float(p["contracts"] or 0.0) * (1 if p["side"] == "long" else -1)
            if amt:
                pos.units, pos.entry = amt, float(p["entryPrice"])
                pos.position = 1 if amt > 0 else -1
                log.info("adopted existing %s position of %s", p["side"], amt)

    def set_target(self, pos: Position, target: int, px: float, leverage: float) -> None:
        sym = self.cfg.symbol
        if target == pos.position:
            return
        # 1 · close what we hold
        if pos.position != 0:
            self.ex.create_order(sym, "market",
                                 "sell" if pos.position > 0 else "buy",
                                 self.qty(abs(pos.units)), None, {"reduceOnly": True})
            self._cancel_stops()
        # 2 · open the new leg plus a STOP_MARKET guard
        if target != 0:
            qty = float(self.qty(leverage * pos.equity(px) / px))
            if qty >= self._min:
                self.ex.create_order(sym, "market",
                                     "buy" if target > 0 else "sell", self.qty(qty))
                stop_px = px * (1 - self.cfg.stop_pct) if target > 0 \\
                             else px * (1 + self.cfg.stop_pct)
                self.ex.create_order(
                    sym, "STOP_MARKET", "sell" if target > 0 else "buy",
                    self.qty(qty), None,
                    {"stopPrice": self.ex.price_to_precision(sym, stop_px),
                     "reduceOnly": True})
                log.info("LIVE order  %-5s qty %s  stop @ %,.2f",
                         "LONG" if target > 0 else "SHORT", qty, stop_px)
        pos.position, pos.units, pos.entry = target, 0.0, 0.0

    def _cancel_stops(self) -> None:
        for o in self.ex.fetch_open_orders(self.cfg.symbol):
            self.ex.cancel_order(o["id"], self.cfg.symbol)


# ------------------------------------------------------------------- loop
def stopped_out(pos: Position, px: float, cfg: Config) -> bool:
    if pos.position > 0:
        return px <= pos.entry * (1 - cfg.stop_pct)
    if pos.position < 0:
        return px >= pos.entry * (1 + cfg.stop_pct)
    return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["paper", "testnet", "live"], default="paper")
    ap.add_argument("--i-understand-the-risk", action="store_true")
    ap.add_argument("--model", default="models/best_model")
    a = ap.parse_args()

    if a.mode == "live" and not a.i_understand_the_risk:
        sys.exit("refusing to start: --live requires --i-understand-the-risk")

    cfg   = Config(mode=a.mode, model_path=a.model)
    ex    = make_exchange(cfg)
    model = PPO.load(cfg.model_path)
    pos   = Position()

    broker = PaperBroker() if cfg.mode == "paper" else ExchangeBroker(ex, cfg)
    if isinstance(broker, ExchangeBroker):
        broker.sync(pos)

    log.info("executor online · %s · %s · model %s",
             cfg.symbol, cfg.mode.upper(), cfg.model_path)

    stop = {"run": True}
    signal.signal(signal.SIGINT, lambda *_: stop.__setitem__("run", False))

    last_ts = 0
    while stop["run"]:
        bars = ex.fetch_ohlcv(cfg.symbol, cfg.timeframe,
                              limit=cfg.window + cfg.warmup)
        df = pd.DataFrame(bars, columns=["ts", "open", "high", "low",
                                         "close", "volume"])
        newest_closed = df.iloc[-2]                 # trade CLOSED candles only

        if newest_closed.ts != last_ts:
            last_ts = newest_closed.ts
            dfc    = df.iloc[:-1].reset_index(drop=True)
            obs    = build_obs(dfc, cfg, pos)
            action = int(model.predict(obs, deterministic=True)[0])
            target = action - 1
            px     = float(dfc.close.iloc[-1])

            stamp = datetime.fromtimestamp(last_ts / 1000, tz=timezone.utc)
            log.info("bar %s closed · px %,.1f · action %d (%s)",
                     stamp.strftime("%H:%M"), px, action,
                     ["HOLD", "LONG", "SHORT"][action])

            if isinstance(broker, PaperBroker) and stopped_out(pos, px, cfg):
                log.warning("stop hit @ %,.2f — flattening", px)
                broker.set_target(pos, 0, px, cfg.leverage)
            elif target != pos.position:
                broker.set_target(pos, target, px, cfg.leverage)

            log.info("equity %,.2f USDT", pos.equity(px))

        time.sleep(5)                               # poll; acts only on new bars

    log.info("shutdown — flat check: position %d", pos.position)


if __name__ == "__main__":
    main()
`;

const setup = `# requirements.txt
# ------------------------------------------------------------------
ccxt>=4.2.20          # exchange connectivity (includes testnet sandbox)
pandas>=2.0
numpy>=1.24
pyarrow>=14.0         # parquet engine for the candle store
gymnasium>=0.29
stable-baselines3>=2.3
torch>=2.1
tensorboard
tqdm
python-dotenv


# ------------------------------------------------------------------
# .env.example  — copy to .env and fill in
# Never commit .env. For --testnet, create keys at testnet.binancefuture.com
# ------------------------------------------------------------------
BINANCE_API_KEY=
BINANCE_API_SECRET=


# ------------------------------------------------------------------
# quickstart
# ------------------------------------------------------------------
# pip install -r requirements.txt
#
# python fetch_data.py                          # 2,000 x 15m candles -> data/
# python train_agent.py --timesteps 500000      # PPO -> models/
# python train_agent.py --backtest              # score on held-out slice
# python execute.py --paper                     # dry run on live prices
# python execute.py --testnet                   # real orders, fake money
# python execute.py --live --i-understand-the-risk
`;

export const PY_FILES: PyFile[] = [
  {
    id: "fetch",
    name: "fetch_data.py",
    kind: "01 · INGEST",
    summary: "ccxt → 2,000 × 15m candles → parquet + indicators",
    code: fetchData,
  },
  {
    id: "train",
    name: "train_agent.py",
    kind: "02 · TRAIN",
    summary: "FuturesEnv (Gymnasium) + PPO trainer + backtest",
    code: trainAgent,
  },
  {
    id: "exec",
    name: "execute.py",
    kind: "03 · EXECUTE",
    summary: "paper / testnet / live loop with stops and sync",
    code: execute,
  },
  {
    id: "setup",
    name: "requirements + .env",
    kind: "00 · SETUP",
    summary: "dependencies, keys, and the full command sequence",
    code: setup,
  },
];

export const QUICKSTART = [
  { cmd: "python fetch_data.py", note: "2,000 x 15m candles -> data/" },
  { cmd: "python train_agent.py --timesteps 500000", note: "PPO -> models/" },
  { cmd: "python execute.py --paper", note: "dry run on live prices" },
  { cmd: "python execute.py --testnet", note: "real orders, fake money" },
];
