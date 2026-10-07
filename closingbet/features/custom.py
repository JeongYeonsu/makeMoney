"""나만의 지표/조건을 추가하는 곳 (템플릿).

1) 새 데이터가 필요하면 configs/*.yaml 의 data.extra 에 CSV 를 등록
   - 컬럼은 '어댑터이름__컬럼' 으로 Panel 에 붙습니다 (예: flow__foreign_net)
   - 장 마감 후 확정되는 데이터면 availability: after_close  ← 미래 참조 방지의 핵심
2) 아래처럼 @feature 로 지표를 등록하면 filters 에서 이름으로 바로 사용 가능
3) 수식으로 안 되는 조건은 @condition 으로 등록 후 filters 에 "custom:이름"

이 파일의 예시는 주석 처리돼 있습니다. 필요할 때 풀어서 쓰세요.
"""
from __future__ import annotations

from ..conditions import condition  # noqa: F401
from .registry import feature  # noqa: F401

# 예) 외국인 5일 누적 순매수 (data.extra 에 name: flow, 컬럼 foreign_net 이 있다고 가정)
# @feature("foreign_net_5d", needs=["flow__foreign_net"])
# def foreign_net_5d(p):
#     """외국인 5일 누적 순매수"""
#     return p.groupby("code")["flow__foreign_net"].transform(lambda s: s.rolling(5).sum())

# 예) 같은 테마 종목들의 당일 평균 등락률 (data.extra 에 name: theme, 컬럼 name)
# @feature("theme_strength", needs=["change_pct", "theme__name"])
# def theme_strength(p):
#     """테마 평균 등락률(%)"""
#     return p.groupby(["date", "theme__name"])["change_pct"].transform("mean")

# 예) 함수형 조건: 고가 마감 + 윗꼬리 짧음
# @condition("strong_close", needs=["close_to_high", "upper_tail_ratio"])
# def strong_close(p):
#     return (p["close_to_high"] >= 0.98) & (p["upper_tail_ratio"] <= 0.2)
