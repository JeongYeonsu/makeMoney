"""기본 제공 어댑터들.

- SampleDailyAdapter : 인터넷 없이 구조를 시험해보는 가상 일봉
- CsvAdapter         : 아무 CSV(수급, 테마, 뉴스점수 등)를 붙이는 범용 어댑터
- FdrDailyAdapter    : FinanceDataReader 로 실제 국내 일봉 수집(+로컬 캐시)

일봉(daily) 어댑터는 반드시 open, high, low, close, volume 컬럼을 제공해야 합니다.
"""
from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pandas as pd

from .base import DataAdapter

CACHE_DIR = Path("data_cache")


class SampleDailyAdapter(DataAdapter):
    """가상 일봉 생성기. 수익률 결과는 의미 없음 — 파이프라인 동작 확인용."""

    name = "daily"
    availability = "intraday"

    def __init__(self, n_codes: int = 60, seed: int = 42):
        self.n_codes = n_codes
        self.seed = seed

    def load(self, start: str, end: str) -> pd.DataFrame:
        rng = np.random.default_rng(self.seed)
        dates = pd.bdate_range(start, end)
        rows = []
        for i in range(self.n_codes):
            code = f"{100000 + i:06d}"
            price = rng.uniform(2_000, 80_000)
            base_vol = rng.uniform(1e5, 3e6)
            for d in dates:
                ret = rng.normal(0.0005, 0.03)
                if rng.random() < 0.02:  # 가끔 급등일
                    ret += rng.uniform(0.08, 0.25)
                gap = rng.normal(0, 0.012)
                open_ = price * (1 + gap)
                close = max(open_ * (1 + ret), 1)
                high = max(open_, close) * (1 + abs(rng.normal(0, 0.01)))
                low = min(open_, close) * (1 - abs(rng.normal(0, 0.01)))
                vol = base_vol * (1 + 8 * max(ret, 0)) * rng.lognormal(0, 0.3)
                rows.append((d, code, open_, high, low, close, vol))
                price = close
        df = pd.DataFrame(rows, columns=["date", "code", "open", "high", "low", "close", "volume"])
        return self.validate(df)


class CsvAdapter(DataAdapter):
    """date, code 컬럼이 있는 CSV 를 그대로 붙입니다.

    예) 외국인 순매수 확정치 → CsvAdapter("flow", "data_cache/flow.csv", availability="after_close")
    """

    def __init__(self, name: str, path: str, availability: str = "intraday", dtype_code: bool = True):
        self.name = name
        self.path = path
        self.availability = availability
        self.dtype_code = dtype_code

    def load(self, start: str, end: str) -> pd.DataFrame:
        df = pd.read_csv(self.path, dtype={"code": str} if self.dtype_code else None)
        df["date"] = pd.to_datetime(df["date"])
        df = df[(df["date"] >= start) & (df["date"] <= end)]
        if "code" in df:
            df["code"] = df["code"].str.zfill(6)
        return self.validate(df)


class FdrDailyAdapter(DataAdapter):
    """FinanceDataReader 로 KRX 일봉 수집. 종목별로 data_cache/ 에 캐시합니다.

    주의: 현재 상장 종목만 받으므로 상장폐지 종목이 빠지는 '생존 편향'이 있습니다.
          결과 해석 시 수익률이 다소 낙관적으로 나올 수 있음을 감안하세요.
    """

    name = "daily"
    availability = "intraday"

    def __init__(self, markets=("KOSPI", "KOSDAQ"), codes: list[str] | None = None,
                 min_marcap: float = 0, sleep: float = 0.05):
        self.markets = markets
        self.codes = codes
        self.min_marcap = min_marcap
        self.sleep = sleep

    def _universe(self) -> pd.DataFrame:
        import FinanceDataReader as fdr

        frames = []
        for m in self.markets:
            lst = fdr.StockListing(m)
            lst["market"] = m
            frames.append(lst)
        lst = pd.concat(frames, ignore_index=True)
        code_col = "Code" if "Code" in lst else "Symbol"
        lst = lst.rename(columns={code_col: "code"})
        if self.min_marcap and "Marcap" in lst:
            lst = lst[lst["Marcap"] >= self.min_marcap]
        return lst

    def load(self, start: str, end: str) -> pd.DataFrame:
        import FinanceDataReader as fdr

        CACHE_DIR.mkdir(exist_ok=True)
        if self.codes:
            meta = pd.DataFrame({"code": self.codes, "market": "?"})
        else:
            meta = self._universe()
        frames = []
        for code, market in zip(meta["code"], meta["market"]):
            cache = CACHE_DIR / f"daily_{code}.csv"
            if cache.exists():
                df = pd.read_csv(cache, parse_dates=["date"])
            else:
                try:
                    raw = fdr.DataReader(code, "2010-01-01")
                except Exception as e:  # 네트워크/종목 오류는 건너뜀
                    print(f"[skip] {code}: {e}")
                    continue
                if raw.empty:
                    continue
                df = raw.rename(columns=str.lower).reset_index().rename(columns={"Date": "date"})
                df = df[["date", "open", "high", "low", "close", "volume"]]
                df.to_csv(cache, index=False)
                time.sleep(self.sleep)
            df["code"] = str(code)
            df["market"] = market
            frames.append(df)
        df = pd.concat(frames, ignore_index=True)
        df = df[(df["date"] >= start) & (df["date"] <= end)]
        df = df[df["volume"] > 0]  # 거래정지일 제거
        return self.validate(df)
