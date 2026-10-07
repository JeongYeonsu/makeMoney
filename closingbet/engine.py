"""백테스트 엔진.

가정 (종가베팅 기본형)
- t일 판정 시각에 조건을 만족한 종목 중 rank_by 상위 max_positions 개를 t일 종가 근처에 매수
- 청산은 exit 설정의 '실행 모델'로 결정 (t+1일 시가, t+1일 종가, 익일 익절/손절 등)
- 자금은 max_positions 칸으로 균등 분할. 빈 칸은 현금(수익 0)
- 비용: 매수·매도 수수료, 매도 거래세, 양방향 슬리피지

미래 값(t+1일 가격)은 이 파일의 청산 계산에서만 사용합니다.
"""
from __future__ import annotations

from typing import Callable

import numpy as np
import pandas as pd

# ---------------------------------------------------------------- 실행(청산) 모델
EXIT_MODELS: dict[str, Callable[[pd.DataFrame, dict], pd.Series]] = {}


def exit_model(name: str):
    def deco(func):
        EXIT_MODELS[name] = func
        return func

    return deco


@exit_model("next_open")
def _next_open(t: pd.DataFrame, params: dict) -> pd.Series:
    """익일 시가(장전 동시호가) 매도"""
    return t["n_open"]


@exit_model("next_close")
def _next_close(t: pd.DataFrame, params: dict) -> pd.Series:
    """익일 종가 매도"""
    return t["n_close"]


@exit_model("next_day_tp_sl")
def _next_day_tp_sl(t: pd.DataFrame, params: dict) -> pd.Series:
    """익일 장중 익절/손절, 둘 다 미도달 시 익일 종가.

    params: take_profit_pct, stop_loss_pct
    - 시가가 이미 손절선 아래로 갭하락 → 시가에 손절
    - 시가가 이미 익절선 위로 갭상승 → 시가에 익절
    - 하루 안에 익절·손절선을 모두 건드리면 '손절 먼저'로 가정 (일봉으로는 순서를 모르므로 보수적으로)
    """
    tp = params.get("take_profit_pct", 3.0) / 100
    sl = params.get("stop_loss_pct", 3.0) / 100
    entry = t["close"]
    tp_px, sl_px = entry * (1 + tp), entry * (1 - sl)
    out = t["n_close"].copy()
    hit_tp = t["n_high"] >= tp_px
    hit_sl = t["n_low"] <= sl_px
    out = np.where(hit_tp, tp_px, out)
    out = np.where(hit_sl, sl_px, out)  # 둘 다면 손절 우선
    out = np.where(t["n_open"] <= sl_px, t["n_open"], out)
    out = np.where(t["n_open"] >= tp_px, t["n_open"], out)
    return pd.Series(out, index=t.index)


# ---------------------------------------------------------------- 엔진
DEFAULT_COSTS = {
    "commission": 0.00015,  # 편도 수수료 (증권사·이벤트마다 다름)
    "sell_tax": 0.0020,  # 매도 거래세(+농특세). 시장·연도별로 다르니 최신 세율 확인 필요
    "slippage": 0.0010,  # 편도 슬리피지 (판정가와 실제 체결가 차이)
}


def run(panel: pd.DataFrame, mask: pd.Series, cfg: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    """반환: (trades, daily)"""
    costs = {**DEFAULT_COSTS, **(cfg.get("costs") or {})}
    exit_cfg = cfg.get("exit", "next_open")
    if isinstance(exit_cfg, str):
        exit_name, exit_params = exit_cfg, {}
    else:
        exit_name, exit_params = exit_cfg["model"], exit_cfg
    if exit_name not in EXIT_MODELS:
        raise KeyError(f"알 수 없는 청산 모델 {exit_name}. 사용 가능: {sorted(EXIT_MODELS)}")

    max_pos = int(cfg.get("max_positions", 3))
    rank_by = cfg.get("rank_by", "trade_value")
    ascending = bool(cfg.get("rank_ascending", False))

    p = panel.sort_values(["code", "date"]).reset_index(drop=True)
    g = p.groupby("code", sort=False)
    for c in ("open", "high", "low", "close", "date"):
        p[f"n_{c}"] = g[c].shift(-1)

    cand = p[mask.reindex(p.index, fill_value=False).values & p["n_open"].notna()]
    if rank_by not in cand:
        raise KeyError(f"rank_by '{rank_by}' 컬럼이 없습니다 (지표로 계산되었는지 확인)")
    cand = cand.sort_values(["date", rank_by], ascending=[True, ascending])
    trades = cand.groupby("date", sort=True).head(max_pos).copy()

    if trades.empty:
        days = pd.DatetimeIndex(sorted(p["date"].unique()))
        daily = pd.DataFrame({"date": days, "ret": 0.0, "n_trades": 0})
        return trades, daily

    exit_px = EXIT_MODELS[exit_name](trades, exit_params)
    buy = trades["close"] * (1 + costs["slippage"]) * (1 + costs["commission"])
    sell = exit_px * (1 - costs["slippage"]) * (1 - costs["commission"] - costs["sell_tax"])
    trades["entry_px"] = trades["close"]
    trades["exit_px"] = exit_px
    trades["ret"] = sell / buy - 1
    trades["gross_ret"] = exit_px / trades["close"] - 1

    days = pd.DatetimeIndex(sorted(p["date"].unique()))
    by_day = trades.groupby("date").agg(sum_ret=("ret", "sum"), n_trades=("ret", "size"))
    daily = pd.DataFrame(index=days).join(by_day).fillna({"sum_ret": 0.0, "n_trades": 0})
    daily["ret"] = daily["sum_ret"] / max_pos
    daily = daily.drop(columns="sum_ret").rename_axis("date").reset_index()

    keep = ["date", "code", "n_date", rank_by, "entry_px", "exit_px", "gross_ret", "ret"]
    keep += [c for c in ("market",) if c in trades]
    return trades[list(dict.fromkeys(keep))].reset_index(drop=True), daily
