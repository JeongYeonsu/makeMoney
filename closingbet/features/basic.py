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
