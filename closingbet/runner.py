"""조건 파일(YAML) 하나를 받아 백테스트를 실행하는 진입점."""
from __future__ import annotations

import itertools
from pathlib import Path

import pandas as pd
import yaml

from . import engine, features, report
from .conditions import apply_rules, parse_rules, required_columns
from .data import CsvAdapter, FdrDailyAdapter, SampleDailyAdapter, build_panel

WARMUP_DAYS = 400  # 이동평균 등 지표 계산용 앞쪽 여유 기간(달력일)


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def make_adapters(data_cfg: dict, source_override: str | None = None):
    source = source_override or data_cfg.get("source", "sample")
    if source == "sample":
        daily = SampleDailyAdapter(**(data_cfg.get("sample") or {}))
    elif source == "fdr":
        daily = FdrDailyAdapter(**(data_cfg.get("fdr") or {}))
    else:
        raise ValueError(f"알 수 없는 데이터 소스: {source} (sample | fdr)")
    adapters = [daily]
    for ex in data_cfg.get("extra") or []:
        if ex.get("type", "csv") == "csv":
            adapters.append(CsvAdapter(ex["name"], ex["path"], ex.get("availability", "intraday")))
        else:
            raise ValueError(f"알 수 없는 추가 데이터 타입: {ex.get('type')}")
    return source, adapters


def expand_sweep(cfg: dict) -> list[tuple[dict, dict]]:
    """sweep: {chg_min: [3,5,7]} → filters 안의 {chg_min} 을 바꿔가며 여러 설정 생성."""
    sweep = cfg.get("sweep") or {}
    if not sweep:
        return [({}, cfg)]
    keys = list(sweep)
    out = []
    for combo in itertools.product(*(sweep[k] for k in keys)):
        params = dict(zip(keys, combo))
        c = {k: v for k, v in cfg.items() if k != "sweep"}
        c["filters"] = [str(f).format(**params) for f in cfg.get("filters", [])]
        if isinstance(c.get("exit"), dict):
            c["exit"] = {k: (v.format(**params) if isinstance(v, str) and "{" in v else v) for k, v in c["exit"].items()}
            for k, v in c["exit"].items():
                if isinstance(v, str):
                    try:
                        c["exit"][k] = float(v)
                    except ValueError:
                        pass
        c["name"] = f"{cfg.get('name', '')}[{','.join(f'{k}={v}' for k, v in params.items())}]"
        out.append((params, c))
    return out


def run_config(config_path: str, period: str = "train", source: str | None = None,
               note: str = "", log: bool = True, verbose: bool = True) -> pd.DataFrame:
    cfg = load_config(config_path)
    periods = cfg.get("periods") or {}
    if period not in periods:
        raise KeyError(f"periods 에 '{period}' 구간이 없습니다: {list(periods)}")
    start, end = map(str, periods[period])

    src, adapters = make_adapters(cfg.get("data") or {}, source)
    load_start = (pd.Timestamp(start) - pd.Timedelta(days=WARMUP_DAYS)).strftime("%Y-%m-%d")
    # 마지막 날 청산가를 위해 끝 이후 며칠 더 로드
    load_end = (pd.Timestamp(end) + pd.Timedelta(days=10)).strftime("%Y-%m-%d")
    panel = build_panel(adapters, load_start, load_end)

    variants = expand_sweep(cfg)
    all_rules = {c["name"]: parse_rules(c.get("filters", [])) for _, c in variants}
    needed = set()
    for rules in all_rules.values():
        needed.update(required_columns(rules))
    needed.add(cfg.get("rank_by", "trade_value"))
    feat_names = [n for n in needed if n not in panel.columns]
    panel = features.compute(panel, feat_names)

    in_period = panel["date"].between(pd.Timestamp(start), pd.Timestamp(end))
    rows = []
    for params, c in variants:
        mask = apply_rules(panel, all_rules[c["name"]]) & in_period
        trades, daily = engine.run(panel, mask, c)
        daily = daily[daily["date"].between(pd.Timestamp(start), pd.Timestamp(end))]
        m = report.metrics(trades, daily)
        row = report.log_experiment(c, period, start, end, src, m, note) if log else {**m, "전략": c["name"]}
        rows.append({**params, **{k: row[k] for k in ["전략", *m.keys()]}})

        if verbose and len(variants) == 1:
            out_dir = Path("results") / f"{cfg.get('name', 'run')}_{period}"
            out_dir.mkdir(parents=True, exist_ok=True)
            trades.to_csv(out_dir / "trades.csv", index=False, encoding="utf-8-sig")
            daily.to_csv(out_dir / "daily.csv", index=False, encoding="utf-8-sig")
            print(f"\n=== {c['name']} | {period} {start}~{end} | 데이터: {src} ===")
            for k, v in m.items():
                print(f"{k:>8}: {v}")
            print("\n연도별 수익률")
            print(report.yearly(daily).round(4).to_string())
            print(f"\n상세: {out_dir}/trades.csv, daily.csv")

    result = pd.DataFrame(rows)
    if verbose and len(variants) > 1:
        print(f"\n=== 파라미터 스윕 {len(variants)}개 | {period} {start}~{end} ===")
        print(result.to_string(index=False))
        print("\n팁: 최고값 하나보다 주변 값에서도 결과가 비슷한지(안정성)를 보세요.")
    return result
