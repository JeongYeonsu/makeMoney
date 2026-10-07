"""여러 어댑터를 시점에 맞게 하나의 표(Panel)로 합칩니다."""
from __future__ import annotations

import pandas as pd

from .base import DataAdapter


def _shift_after_close(df: pd.DataFrame, trading_days: pd.DatetimeIndex) -> pd.DataFrame:
    """장 마감 후 확정 데이터를 '다음 거래일'에 처음 보이도록 이동."""
    nxt = pd.Series(trading_days[1:], index=trading_days[:-1])
    df = df.copy()
    df["date"] = df["date"].map(nxt)
    return df.dropna(subset=["date"])


def build_panel(adapters: list[DataAdapter], start: str, end: str) -> pd.DataFrame:
    """첫 번째 어댑터는 반드시 일봉(name='daily'). 나머지는 left-join 됩니다.

    다른 어댑터의 컬럼은 `어댑터이름__컬럼` 형태로 붙어 이름 충돌을 막습니다.
    code 가 없고 market 이 있는 어댑터(예: 시장 지수)는 (date, market) 으로,
    둘 다 없는 어댑터는 date 로만 붙습니다.
    """
    if not adapters or adapters[0].name != "daily":
        raise ValueError("첫 번째 어댑터는 name='daily' 인 일봉 어댑터여야 합니다")
    panel = adapters[0].load(start, end)
    trading_days = pd.DatetimeIndex(sorted(panel["date"].unique()))

    for ad in adapters[1:]:
        df = ad.load(start, end)
        if ad.availability == "after_close":
            df = _shift_after_close(df, trading_days)
        if "code" in df.columns:
            keys = ["date", "code"]
        elif "market" in df.columns and "market" in panel.columns:
            keys = ["date", "market"]
        else:
            keys = ["date"]
        df = df.rename(columns={c: f"{ad.name}__{c}" for c in df.columns if c not in keys})
        panel = panel.merge(df, on=keys, how="left")

    return panel.sort_values(["code", "date"]).reset_index(drop=True)
