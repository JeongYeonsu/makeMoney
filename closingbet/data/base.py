"""데이터 어댑터 공통 규약.

모든 어댑터는 같은 모양의 '긴 표(long table)'를 돌려줍니다.
    date(datetime64) | code(str) | 값 컬럼들...

그리고 각 어댑터는 `availability` 로 "그 데이터를 언제 알 수 있는가"를 선언합니다.
    - "intraday"    : 당일 판정 시각(예: 15:19) 이전에 알 수 있음 → 당일 그대로 사용
    - "after_close" : 장 마감 이후에 확정됨(예: 외국인/기관 확정 순매수, 장후 공시)
                      → 다음 거래일부터 사용하도록 자동으로 1거래일 밀어서 붙임
새 데이터를 붙일 때 이 값만 정직하게 적으면, 미래 데이터 참조가 구조적으로 막힙니다.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd

VALID_AVAILABILITY = ("intraday", "after_close")


class DataAdapter(ABC):
    #: 어댑터 이름 — 지표의 needs=[...] 에서 이 이름으로 참조
    name: str = ""
    #: "intraday" 또는 "after_close"
    availability: str = "intraday"

    @abstractmethod
    def load(self, start: str, end: str) -> pd.DataFrame:
        """date, code 컬럼을 포함한 긴 표를 반환."""

    def validate(self, df: pd.DataFrame) -> pd.DataFrame:
        if self.availability not in VALID_AVAILABILITY:
            raise ValueError(f"{self.name}: availability 는 {VALID_AVAILABILITY} 중 하나여야 합니다")
        missing = {"date", "code"} - set(df.columns)
        if missing:
            raise ValueError(f"{self.name}: 필수 컬럼 누락 {missing}")
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"])
        df["code"] = df["code"].astype(str)
        if df.duplicated(["date", "code"]).any():
            raise ValueError(f"{self.name}: (date, code) 중복 행이 있습니다")
        return df.sort_values(["code", "date"]).reset_index(drop=True)
