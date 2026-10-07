"""지표 레지스트리.

새 개념은 함수 하나만 등록하면 조건 파일에서 이름으로 바로 쓸 수 있습니다.

    @feature("theme_strength", needs=["change_pct", "theme__name"])
    def theme_strength(p):
        return p.groupby(["date", "theme__name"])["change_pct"].transform("mean")

- 함수는 Panel 전체(DataFrame, code·date 순 정렬)를 받아 같은 인덱스의 Series 를 반환
- needs 에는 다른 지표 이름이나 Panel 컬럼 이름을 적습니다 → 계산 순서는 자동 결정
- 종목별 시계열 계산은 반드시 p.groupby("code") 를 쓰세요 (종목 간 데이터 섞임 방지)
- shift(-1) 처럼 미래 값을 당겨오는 연산은 금지 (엔진의 청산 가격 계산 외에는 쓰지 않음)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import pandas as pd


@dataclass
class FeatureSpec:
    name: str
    func: Callable[[pd.DataFrame], pd.Series]
    needs: list[str] = field(default_factory=list)
    doc: str = ""


REGISTRY: dict[str, FeatureSpec] = {}


def feature(name: str, needs: list[str] | None = None):
    def deco(func):
        if name in REGISTRY:
            raise ValueError(f"지표 이름 중복: {name}")
        REGISTRY[name] = FeatureSpec(name, func, needs or [], (func.__doc__ or "").strip())
        return func

    return deco


def list_features() -> pd.DataFrame:
    return pd.DataFrame(
        [(s.name, ", ".join(s.needs), s.doc.splitlines()[0] if s.doc else "") for s in REGISTRY.values()],
        columns=["name", "needs", "설명"],
    )


def compute(panel: pd.DataFrame, names: list[str]) -> pd.DataFrame:
    """요청된 지표(와 그 의존 지표)를 계산해 Panel 에 컬럼으로 추가."""
    panel = panel.sort_values(["code", "date"]).reset_index(drop=True)
    done: set[str] = set(panel.columns)
    visiting: set[str] = set()

    def visit(n: str):
        nonlocal panel
        if n in done:
            return
        if n not in REGISTRY:
            raise KeyError(f"'{n}' 은 Panel 컬럼도, 등록된 지표도 아닙니다. 사용 가능: {sorted(REGISTRY)}")
        if n in visiting:
            raise ValueError(f"지표 순환 의존: {n}")
        visiting.add(n)
        for dep in REGISTRY[n].needs:
            visit(dep)
        out = REGISTRY[n].func(panel)
        if not isinstance(out, pd.Series) or len(out) != len(panel):
            raise TypeError(f"지표 {n} 은 Panel 과 같은 길이의 Series 를 반환해야 합니다")
        panel[n] = out.values
        visiting.discard(n)
        done.add(n)

    for n in names:
        visit(n)
    return panel
