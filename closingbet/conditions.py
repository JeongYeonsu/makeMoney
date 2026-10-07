"""조건 파싱.

조건 파일의 filters 항목 한 줄 = 조건 하나. 지원 문법:
    "change_pct between [5, 15]"     (양끝 포함)
    "trade_value >= 50000000000"
    "close_to_high > 0.97"
    "above_ma20 == 1"
    "custom:my_condition"            (수식으로 표현 어려운 조건은 함수로 등록)

함수형 조건 등록:
    @condition("my_condition", needs=["change_pct", "flow__foreign_net"])
    def my_condition(p):
        return (p["change_pct"] > 5) & (p["flow__foreign_net"] > 0)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable

import pandas as pd

_OPS = {
    ">=": lambda s, v: s >= v,
    "<=": lambda s, v: s <= v,
    "==": lambda s, v: s == v,
    "!=": lambda s, v: s != v,
    ">": lambda s, v: s > v,
    "<": lambda s, v: s < v,
}
_CMP = re.compile(r"^\s*([\w.]+)\s*(>=|<=|==|!=|>|<)\s*(-?[\d.eE+_]+)\s*$")
_BETWEEN = re.compile(r"^\s*([\w.]+)\s+between\s+\[\s*(-?[\d.eE+_]+)\s*,\s*(-?[\d.eE+_]+)\s*\]\s*$")


@dataclass
class ConditionSpec:
    name: str
    func: Callable[[pd.DataFrame], pd.Series]
    needs: list[str] = field(default_factory=list)


CONDITIONS: dict[str, ConditionSpec] = {}


def condition(name: str, needs: list[str] | None = None):
    def deco(func):
        CONDITIONS[name] = ConditionSpec(name, func, needs or [])
        return func

    return deco


@dataclass
class Rule:
    text: str
    needs: list[str]
    evaluate: Callable[[pd.DataFrame], pd.Series]


def parse_rule(text: str) -> Rule:
    text = str(text).strip()
    if text.startswith("custom:"):
        name = text.split(":", 1)[1].strip()
        if name not in CONDITIONS:
            raise KeyError(f"등록되지 않은 함수형 조건: {name}")
        spec = CONDITIONS[name]
        return Rule(text, spec.needs, lambda p: spec.func(p).fillna(False).astype(bool))

    m = _BETWEEN.match(text)
    if m:
        col, lo, hi = m.group(1), float(m.group(2)), float(m.group(3))
        return Rule(text, [col], lambda p: p[col].between(lo, hi).fillna(False))

    m = _CMP.match(text)
    if m:
        col, op, v = m.group(1), m.group(2), float(m.group(3))
        return Rule(text, [col], lambda p: _OPS[op](p[col], v).fillna(False))

    raise ValueError(f"조건 문법을 해석할 수 없습니다: '{text}'")


def parse_rules(texts: list[str]) -> list[Rule]:
    return [parse_rule(t) for t in texts]


def required_columns(rules: list[Rule], extra: list[str] | None = None) -> list[str]:
    cols: list[str] = []
    for r in rules:
        cols.extend(r.needs)
    cols.extend(extra or [])
    return list(dict.fromkeys(cols))


def apply_rules(panel: pd.DataFrame, rules: list[Rule]) -> pd.Series:
    mask = pd.Series(True, index=panel.index)
    for r in rules:
        mask &= r.evaluate(panel)
    return mask
