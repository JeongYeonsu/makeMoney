"""기본 지표 모음. 일봉(open/high/low/close/volume)만으로 계산됩니다.

참고: 일봉 백테스트에서는 '당일 종가'를 판정 시점(15:19 무렵) 가격의 근사치로 씁니다.
      실제 15:19 가격과 차이가 있으므로, 엔진의 슬리피지 설정으로 보수적으로 보정하세요.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .registry import feature


def _g(p: pd.DataFrame):
    return p.groupby("code", sort=False)


@feature("prev_close")
def prev_close(p):
    """전일 종가"""
    return _g(p)["close"].shift(1)


@feature("change_pct", needs=["prev_close"])
def change_pct(p):
    """당일 등락률(%)"""
    # 부동소수점 오차로 경계값(예: 정확히 10%)이 조건에서 빠지지 않도록 반올림
    return ((p["close"] / p["prev_close"] - 1) * 100).round(4)


@feature("trade_value")
def trade_value(p):
    """거래대금 근사치(원) = 종가 × 거래량"""
    return p["close"] * p["volume"]


@feature("trade_value_ratio_20", needs=["trade_value"])
def trade_value_ratio_20(p):
    """거래대금 / 직전 20일 평균 거래대금 (당일 제외)"""
    avg = _g(p)["trade_value"].transform(lambda s: s.shift(1).rolling(20, min_periods=20).mean())
    return p["trade_value"] / avg


@feature("close_to_high")
def close_to_high(p):
    """종가 / 고가 — 1에 가까울수록 고가 마감"""
    return p["close"] / p["high"]


@feature("upper_tail_ratio")
def upper_tail_ratio(p):
    """윗꼬리 길이 / 전체 캔들 길이 (0~1)"""
    rng = (p["high"] - p["low"]).replace(0, np.nan)
    return (p["high"] - p[["open", "close"]].max(axis=1)) / rng


@feature("ma20")
def ma20(p):
    """20일 이동평균(당일 포함)"""
    return _g(p)["close"].transform(lambda s: s.rolling(20, min_periods=20).mean())


@feature("above_ma20", needs=["ma20"])
def above_ma20(p):
    """종가가 20일선 위면 1"""
    return (p["close"] > p["ma20"]).astype(float)


@feature("new_high_60")
def new_high_60(p):
    """종가가 직전 60일 최고 종가를 돌파하면 1"""
    prev_max = _g(p)["close"].transform(lambda s: s.shift(1).rolling(60, min_periods=60).max())
    return (p["close"] > prev_max).astype(float)


@feature("days_listed")
def days_listed(p):
    """데이터상 상장 경과 거래일 수 (신규상장 제외용)"""
    return _g(p).cumcount() + 1


# ─────────────────────────────── 힘의 크기
@feature("trade_value_rank", needs=["trade_value"])
def trade_value_rank(p):
    """당일 시장 전체 거래대금 순위 (1 = 최대)"""
    return p.groupby("date")["trade_value"].rank(ascending=False, method="min")


@feature("body_pct")
def body_pct(p):
    """몸통: 시가 대비 종가 상승률(%) — 장중에 얼마나 밀어올렸나"""
    return ((p["close"] / p["open"] - 1) * 100).round(4)


# ─────────────────────────────── 힘의 질
@feature("gap_pct", needs=["prev_close"])
def gap_pct(p):
    """시가 갭(%) = 시가 / 전일 종가 − 1"""
    return ((p["open"] / p["prev_close"] - 1) * 100).round(4)


@feature("ma5")
def ma5(p):
    """5일 이동평균"""
    return _g(p)["close"].transform(lambda s: s.rolling(5, min_periods=5).mean())


@feature("ma60")
def ma60(p):
    """60일 이동평균"""
    return _g(p)["close"].transform(lambda s: s.rolling(60, min_periods=60).mean())


@feature("ma_aligned", needs=["ma5", "ma20", "ma60"])
def ma_aligned(p):
    """이평선 정배열(5 > 20 > 60일)이면 1"""
    return ((p["ma5"] > p["ma20"]) & (p["ma20"] > p["ma60"])).astype(float)


@feature("range_squeeze", needs=["prev_close"])
def range_squeeze(p):
    """변동성 수축: 직전 5일 평균 진폭 / 직전 20일 평균 진폭 (오늘 제외, 1 미만 = 수축)"""
    rng = (p["high"] - p["low"]) / p["prev_close"]
    p = p.assign(_rng=rng)
    g = p.groupby("code", sort=False)["_rng"]
    r5 = g.transform(lambda s: s.shift(1).rolling(5, min_periods=5).mean())
    r20 = g.transform(lambda s: s.shift(1).rolling(20, min_periods=20).mean())
    return (r5 / r20).round(4)


# ─────────────────────────────── 위험 요소
@feature("disparity_20", needs=["ma20"])
def disparity_20(p):
    """이격도(%) = 종가 / 20일 이동평균 × 100 — 과열 판단"""
    return (p["close"] / p["ma20"] * 100).round(4)


@feature("up_streak", needs=["prev_close"])
def up_streak(p):
    """오늘까지 연속 상승일수 (오늘 하락이면 0)"""
    up = (p["close"] > p["prev_close"]).astype(int)
    grp = (up == 0).groupby(p["code"], sort=False).cumsum()
    return up.groupby([p["code"], grp], sort=False).cumsum().astype(float)


# ─────────────────────────────── 시장 분위기 (index 어댑터 필요)
def _index_series(p):
    idx = p[["date", "market", "index__close"]].drop_duplicates(["date", "market"]).sort_values(["market", "date"])
    return idx


@feature("market_change", needs=["index__close"])
def market_change(p):
    """소속 시장 지수의 당일 등락률(%)"""
    idx = _index_series(p)
    idx["v"] = (idx.groupby("market")["index__close"].pct_change() * 100).round(4)
    key = pd.MultiIndex.from_frame(idx[["date", "market"]])
    m = pd.Series(idx["v"].values, index=key)
    return pd.Series(m.reindex(pd.MultiIndex.from_frame(p[["date", "market"]])).values, index=p.index)


@feature("market_above_ma20", needs=["index__close"])
def market_above_ma20(p):
    """소속 시장 지수가 20일 이동평균 위면 1"""
    idx = _index_series(p)
    ma = idx.groupby("market")["index__close"].transform(lambda s: s.rolling(20, min_periods=20).mean())
    idx["v"] = (idx["index__close"] > ma).astype(float)
    key = pd.MultiIndex.from_frame(idx[["date", "market"]])
    m = pd.Series(idx["v"].values, index=key)
    return pd.Series(m.reindex(pd.MultiIndex.from_frame(p[["date", "market"]])).values, index=p.index)
