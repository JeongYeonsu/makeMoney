"""성과 지표 계산과 실험 기록."""
from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

EXPERIMENT_LOG = Path("results/experiments.csv")


def metrics(trades: pd.DataFrame, daily: pd.DataFrame) -> dict:
    n = len(trades)
    eq = (1 + daily["ret"]).cumprod()
    total = eq.iloc[-1] - 1 if len(eq) else 0.0
    years = max(len(daily) / 252, 1e-9)
    cagr = (1 + total) ** (1 / years) - 1 if total > -1 else -1.0
    mdd = (eq / eq.cummax() - 1).min() if len(eq) else 0.0
    vol = daily["ret"].std() * np.sqrt(252)
    sharpe = (daily["ret"].mean() * 252) / vol if vol and vol > 0 else np.nan

    if n:
        wins, losses = trades.loc[trades["ret"] > 0, "ret"], trades.loc[trades["ret"] <= 0, "ret"]
        win_rate = len(wins) / n
        payoff = wins.mean() / abs(losses.mean()) if len(wins) and len(losses) else np.nan
        avg = trades["ret"].mean()
    else:
        win_rate = payoff = avg = np.nan

    return {
        "거래수": n,
        "연평균거래수": round(n / years, 1),
        "승률": round(win_rate, 4) if n else None,
        "평균수익률": round(avg, 5) if n else None,
        "손익비": round(payoff, 3) if payoff == payoff else None,
        "누적수익률": round(total, 4),
        "CAGR": round(cagr, 4),
        "MDD": round(mdd, 4),
        "샤프": round(sharpe, 3) if sharpe == sharpe else None,
    }


def yearly(daily: pd.DataFrame) -> pd.Series:
    d = daily.set_index("date")["ret"]
    return (1 + d).groupby(d.index.year).prod() - 1


def _git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return ""


def config_hash(cfg: dict) -> str:
    return hashlib.sha1(json.dumps(cfg, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()[:8]


def log_experiment(cfg: dict, period: str, start: str, end: str, data_source: str, m: dict, note: str = "") -> dict:
    """실험 한 번 = 결과표 한 줄. 몇십 번을 돌려도 무엇을 했는지 추적 가능."""
    EXPERIMENT_LOG.parent.mkdir(exist_ok=True)
    row = {
        "실행시각": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "전략": cfg.get("name", ""),
        "구간": period,
        "시작": start,
        "끝": end,
        "데이터": data_source,
        **m,
        "config_hash": config_hash(cfg),
        "git": _git_commit(),
        "조건": " & ".join(map(str, cfg.get("filters", []))),
        "청산": json.dumps(cfg.get("exit", "next_open"), ensure_ascii=False),
        "메모": note,
    }
    df = pd.DataFrame([row])
    header = not EXPERIMENT_LOG.exists()
    df.to_csv(EXPERIMENT_LOG, mode="a", header=header, index=False, encoding="utf-8-sig")
    return row
