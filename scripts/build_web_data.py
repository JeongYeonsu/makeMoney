"""웹 백테스터용 데이터 생성.

closingbet 의 어댑터·지표 레지스트리로 계산한 값을 브라우저가 바로 읽을 수 있는
컬럼형 바이너리(web/data/rows.bin) + 메타(web/data/meta.json)로 저장합니다.
지표 계산은 파이썬 한 곳에서만 하므로, 웹과 파이썬의 지표 정의가 어긋나지 않습니다.

용량을 줄이기 위해 '후보가 될 수 있는 행'만 남깁니다 (PREFILTER).
웹의 조건 슬라이더 하한도 이 값에 맞춰집니다.

    python scripts/build_web_data.py --source sample    # 가상 데이터 (인터넷 불필요)
    python scripts/build_web_data.py --source fdr       # 실제 국내 일봉 (GitHub Actions 에서 실행)
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from closingbet import features  # noqa: E402
from closingbet.data import FdrDailyAdapter, SampleDailyAdapter, build_panel  # noqa: E402

KST = timezone(timedelta(hours=9))

PREFILTER = {"change_pct_min": 2.0, "trade_value_eok_min": 50.0}

FEATURES = ["change_pct", "trade_value", "trade_value_ratio_20", "close_to_high",
            "upper_tail_ratio", "above_ma20", "new_high_60", "days_listed"]

# (웹 컬럼 이름, dtype, 변환 함수) — float32 를 앞에 두어 4바이트 정렬 유지
COLUMNS = [
    ("change_pct", "f4", lambda p: p["change_pct"]),
    ("trade_value", "f4", lambda p: p["trade_value"] / 1e8),  # 억 원
    ("trade_value_ratio_20", "f4", lambda p: p["trade_value_ratio_20"]),
    ("close_to_high", "f4", lambda p: p["close_to_high"] * 100),  # %
    ("upper_tail_ratio", "f4", lambda p: p["upper_tail_ratio"] * 100),  # %
    ("r_open", "f4", lambda p: p["n_open"] / p["close"]),  # 익일 가격 / 당일 종가
    ("r_high", "f4", lambda p: p["n_high"] / p["close"]),
    ("r_low", "f4", lambda p: p["n_low"] / p["close"]),
    ("r_close", "f4", lambda p: p["n_close"] / p["close"]),
    ("day", "u2", lambda p: p["day"]),
    ("code", "u2", lambda p: p["code_idx"]),
    ("days_listed", "u2", lambda p: p["days_listed"].clip(upper=65535)),
    ("above_ma20", "u1", lambda p: p["above_ma20"]),
    ("new_high_60", "u1", lambda p: p["new_high_60"]),
]


def load_benchmark(source: str, days: pd.DatetimeIndex, panel: pd.DataFrame) -> list:
    if source == "fdr":
        try:
            import FinanceDataReader as fdr

            ks = fdr.DataReader("KS11", days[0].strftime("%Y-%m-%d"))["Close"]
            ks.index = pd.to_datetime(ks.index)
            s = ks.reindex(days).ffill()
            return [None if pd.isna(v) else round(float(v), 2) for v in s]
        except Exception as e:
            print(f"[warn] 코스피 지수 수집 실패: {e}")
            return []
    # 가상 데이터: 전 종목 평균 등락으로 만든 지수
    ret = panel.groupby("code", sort=False)["close"].pct_change()
    r = ret.groupby(panel["date"]).median().reindex(days).fillna(0)
    return [round(float(v), 2) for v in (1000 * (1 + r).cumprod())]


def build(source: str, out_dir: Path, start: str, min_marcap: float, end: str | None = None) -> dict:
    end = end or datetime.now(KST).strftime("%Y-%m-%d")
    daily = SampleDailyAdapter(n_codes=120) if source == "sample" else FdrDailyAdapter(min_marcap=min_marcap)
    panel = build_panel([daily], start, end)
    panel = features.compute(panel, FEATURES)

    g = panel.groupby("code", sort=False)
    for c in ("open", "high", "low", "close"):
        panel[f"n_{c}"] = g[c].shift(-1)

    days = pd.DatetimeIndex(sorted(panel["date"].unique()))
    day_idx = pd.Series(np.arange(len(days)), index=days)
    codes = sorted(panel["code"].unique())
    code_idx = {c: i for i, c in enumerate(codes)}
    panel["day"] = panel["date"].map(day_idx)
    panel["code_idx"] = panel["code"].map(code_idx)

    keep = (
        (panel["change_pct"] >= PREFILTER["change_pct_min"])
        & (panel["trade_value"] / 1e8 >= PREFILTER["trade_value_eok_min"])
        & panel["n_open"].notna()
    )
    rows = panel[keep].sort_values(["day", "code_idx"]).reset_index(drop=True)

    out_dir.mkdir(parents=True, exist_ok=True)
    cols_meta, offset = [], 0
    with open(out_dir / "rows.bin", "wb") as f:
        for name, dt, fn in COLUMNS:
            arr = np.asarray(fn(rows), dtype="float64")
            if dt != "f4":
                arr = np.nan_to_num(arr, nan=0)
            data = arr.astype("<" + dt).tobytes()
            f.write(data)
            cols_meta.append({"name": name, "dtype": dt, "offset": offset, "length": len(rows)})
            offset += len(data)

    names = getattr(daily, "names", {}) or {}
    meta = {
        "version": 1,
        "source": source,
        "built_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M KST"),
        "first_day": days[0].strftime("%Y-%m-%d"),
        "last_day": days[-1].strftime("%Y-%m-%d"),
        "n_rows": int(len(rows)),
        "n_codes": len(codes),
        "prefilter": PREFILTER,
        "periods": {"train": ["2018-01-01", "2023-12-31"], "test": ["2024-01-01", days[-1].strftime("%Y-%m-%d")]},
        "columns": cols_meta,
        "days": [d.strftime("%Y-%m-%d") for d in days],
        "codes": codes,
        "names": [names.get(c, c) for c in codes],
        "benchmark": load_benchmark(source, days, panel),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[ok] {source}: {len(days)}거래일, {len(codes)}종목, 후보행 {len(rows):,}개, rows.bin {offset / 1e6:.1f}MB")
    return meta


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["sample", "fdr"], default="sample")
    ap.add_argument("--out", default="web/data")
    ap.add_argument("--start", default="2016-06-01", help="지표 준비기간 포함 시작일")
    ap.add_argument("--min-marcap", type=float, default=1e11, help="현재 시가총액 하한(원)")
    a = ap.parse_args()
    build(a.source, Path(a.out), a.start, a.min_marcap)
