import pandas as pd
import pytest

from closingbet import engine, features
from closingbet.conditions import apply_rules, parse_rules
from closingbet.data.base import DataAdapter
from closingbet.data.panel import build_panel


class _Daily(DataAdapter):
    name, availability = "daily", "intraday"

    def load(self, start, end):
        d = pd.bdate_range("2024-01-01", periods=4)
        return self.validate(pd.DataFrame({
            "date": d, "code": "000001",
            "open": [100, 100, 110, 120], "high": [101, 111, 121, 125],
            "low": [99, 99, 109, 119], "close": [100, 110, 120, 121],
            "volume": [1000] * 4,
        }))


class _Flow(DataAdapter):
    name, availability = "flow", "after_close"

    def load(self, start, end):
        d = pd.bdate_range("2024-01-01", periods=4)
        return self.validate(pd.DataFrame({"date": d, "code": "000001", "net": [1, 2, 3, 4]}))


def test_after_close_data_is_shifted_one_day():
    p = build_panel([_Daily(), _Flow()], "2024-01-01", "2024-01-10")
    # 1/1 장후 확정치(1)는 1/2 에 처음 보여야 함
    assert pd.isna(p.loc[0, "flow__net"])
    assert p.loc[1, "flow__net"] == 1


def test_condition_parsing_and_features():
    p = features.compute(build_panel([_Daily()], "2024-01-01", "2024-01-10"), ["change_pct"])
    mask = apply_rules(p, parse_rules(["change_pct between [5, 10]"]))
    assert mask.tolist() == [False, True, True, False]  # +10%, +9.09% 포함, +0.83% 제외
    with pytest.raises(ValueError):
        parse_rules(["change_pct ~ 3"])


def test_engine_costs_next_open():
    p = features.compute(build_panel([_Daily()], "2024-01-01", "2024-01-10"), ["trade_value"])
    mask = pd.Series([False, True, False, False])
    cfg = {"max_positions": 1, "exit": "next_open",
           "costs": {"commission": 0, "sell_tax": 0, "slippage": 0}}
    trades, daily = engine.run(p, mask, cfg)
    assert len(trades) == 1
    # 2일차 종가 110 매수 → 3일차 시가 110 매도 = 0%
    assert trades["ret"].iloc[0] == pytest.approx(0.0)


def test_unknown_feature_raises():
    p = build_panel([_Daily()], "2024-01-01", "2024-01-10")
    with pytest.raises(KeyError):
        features.compute(p, ["does_not_exist"])
