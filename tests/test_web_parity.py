"""웹 엔진(web/engine.js)과 파이썬 엔진(closingbet)의 결과가 같은지 검증.

같은 가상 데이터·같은 조건으로 양쪽을 실행해 성과 지표를 비교합니다.
웹 데이터는 float32 로 저장되므로 아주 작은 오차는 허용합니다.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_web_data import FEATURES, build  # noqa: E402

from closingbet import engine, features, report  # noqa: E402
from closingbet.conditions import apply_rules, parse_rules  # noqa: E402
from closingbet.data import SampleDailyAdapter, SampleIndexAdapter, build_panel  # noqa: E402

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node 필요")

START, END = "2016-06-01", "2024-06-28"
PERIOD = ["2018-01-01", "2023-12-31"]

# (파이썬 조건, 웹 조건) — 웹은 거래대금 '억', 종가/고가 '%' 단위
CASES = {
    "기본": (
        {"filters": ["change_pct between [5, 15]", "trade_value >= 10000000000",
                     "trade_value_ratio_20 >= 2", "close_to_high >= 0.95"],
         "max_positions": 3, "exit": "next_open"},
        {"filters": [{"f": "change_pct", "op": "between", "v": [5, 15]},
                     {"f": "trade_value", "op": ">=", "v": 100},
                     {"f": "trade_value_ratio_20", "op": ">=", "v": 2},
                     {"f": "close_to_high", "op": ">=", "v": 95}],
         "maxPos": 3, "exit": {"model": "next_open"}},
    ),
    "익절손절": (
        {"filters": ["change_pct >= 4", "new_high_60 == 1", "days_listed >= 60"],
         "max_positions": 2, "exit": {"model": "next_day_tp_sl", "take_profit_pct": 4, "stop_loss_pct": 2}},
        {"filters": [{"f": "change_pct", "op": ">=", "v": 4},
                     {"f": "new_high_60", "op": "==", "v": 1},
                     {"f": "days_listed", "op": ">=", "v": 60}],
         "maxPos": 2, "exit": {"model": "next_day_tp_sl", "take_profit_pct": 4, "stop_loss_pct": 2}},
    ),
    "새지표": (
        {"filters": ["change_pct >= 3", "trade_value_rank <= 30", "disparity_20 <= 120", "up_streak <= 3",
                     "market_above_ma20 == 1", "market_change >= -1", "body_pct >= 1", "range_squeeze <= 1.5"],
         "max_positions": 3, "exit": "next_close", "rank_by": "change_pct"},
        {"filters": [{"f": "change_pct", "op": ">=", "v": 3},
                     {"f": "trade_value_rank", "op": "<=", "v": 30},
                     {"f": "disparity_20", "op": "<=", "v": 120},
                     {"f": "up_streak", "op": "<=", "v": 3},
                     {"f": "market_above_ma20", "op": "==", "v": 1},
                     {"f": "market_change", "op": ">=", "v": -1},
                     {"f": "body_pct", "op": ">=", "v": 1},
                     {"f": "range_squeeze", "op": "<=", "v": 1.5}],
         "maxPos": 3, "exit": {"model": "next_close"}, "rankBy": "change_pct"},
    ),
}


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("webdata")
    build("sample", d, START, 0, end=END)
    return d


@pytest.fixture(scope="module")
def panel():
    p = build_panel([SampleDailyAdapter(n_codes=120), SampleIndexAdapter()], START, END)
    return features.compute(p, FEATURES)


@pytest.mark.parametrize("case", list(CASES))
def test_parity(case, data_dir, panel):
    py_cfg, web_cfg = CASES[case]
    in_period = panel["date"].between(pd.Timestamp(PERIOD[0]), pd.Timestamp(PERIOD[1]))
    mask = apply_rules(panel, parse_rules(py_cfg["filters"])) & in_period
    trades, daily = engine.run(panel, mask, py_cfg)
    daily = daily[daily["date"].between(pd.Timestamp(PERIOD[0]), pd.Timestamp(PERIOD[1]))]
    py = report.metrics(trades, daily)

    web_cfg = {**web_cfg, "period": PERIOD}
    out = subprocess.run(["node", str(ROOT / "scripts/web_backtest.mjs"), str(data_dir), json.dumps(web_cfg)],
                         capture_output=True, text=True, check=True, cwd=ROOT)
    web = json.loads(out.stdout)["metrics"]

    assert py["거래수"] > 30, "검증용 조건이 너무 빡빡함"
    assert web["trades"] == py["거래수"]
    assert web["winRate"] == pytest.approx(py["승률"], abs=2e-3)
    assert web["total"] == pytest.approx(py["누적수익률"], abs=2e-3)
    assert web["mdd"] == pytest.approx(py["MDD"], abs=2e-3)
