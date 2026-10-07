# makeMoney — 종가베팅 백테스트 & 자동매매

종가 무렵 매수 → 다음 날 매도하는 종가베팅 전략을 **조건 파일만 바꿔가며** 검증하고,
검증된 전략을 키움 REST API로 자동매매하기 위한 프로젝트입니다.

> ⚠️ 학습·연구용 코드입니다. 백테스트 결과는 미래 수익을 보장하지 않습니다.

## 구조

```
데이터 어댑터 → 시점 정렬(Panel) → 지표 레지스트리 → 조건 → 실행(청산) 모델 → 리포트/실험기록
```

| 위치 | 역할 | 확장 방법 |
|---|---|---|
| `closingbet/data/` | 데이터 수집. 모든 데이터는 `date, code, 값...` 표로 통일 | 어댑터 추가 또는 `data.extra` 에 CSV 등록 |
| `closingbet/features/` | 지표 계산 | `custom.py` 에 `@feature` 함수 추가 |
| `closingbet/conditions.py` | 조건 문법 해석 | 복잡한 조건은 `@condition` → `custom:이름` |
| `closingbet/engine.py` | 매수·청산 시뮬레이션, 비용 반영 | `@exit_model` 로 청산 방식 추가 |
| `closingbet/report.py` | 성과 지표, `results/experiments.csv` 자동 기록 | — |
| `configs/*.yaml` | **전략 = 조건 파일 하나** | 파일 복사 후 수정 |

### 미래 데이터 참조 방지
데이터마다 `availability` 를 선언합니다.
- `intraday`: 판정 시각(15:19 무렵) 전에 알 수 있음 → 당일 사용
- `after_close`: 장 마감 후 확정(수급 확정치, 장후 공시 등) → **자동으로 다음 거래일부터 사용**

## 실행

```bash
pip install -r requirements.txt
python run_backtest.py configs/example_v1.yaml                # 가상 데이터로 동작 확인
python run_backtest.py configs/example_v1.yaml --source fdr   # 실제 국내 일봉
python run_backtest.py configs/sweep_example.yaml             # 파라미터 스윕
python run_backtest.py configs/example_v1.yaml --period test --final  # 최종 검증 (한 번만)
python -m pytest -q                                           # 테스트
```

폰에서는 `notebooks/colab_backtest.ipynb` 를 Google Colab 으로 열어 실행하세요.

## 조건 문법

```yaml
filters:
  - change_pct between [5, 15]
  - trade_value >= 30000000000
  - close_to_high >= 0.97
  - custom:strong_close
```

사용 가능한 기본 지표: `change_pct, trade_value, trade_value_ratio_20, close_to_high,
upper_tail_ratio, ma20, above_ma20, new_high_60, days_listed, prev_close`

청산 모델: `next_open`(익일 시가), `next_close`(익일 종가), `next_day_tp_sl`(익일 익절/손절)

## 검증 원칙
1. `train` 구간에서만 조건을 튜닝하고, `test` 구간은 마지막에 한 번만 본다.
2. 수익률 하나가 아니라 승률·손익비·MDD·거래수·연도별 수익을 함께 본다.
3. 최적값 하나보다 **주변 값에서도 결과가 안정적인지** 확인한다 (스윕 활용).
4. 비용(수수료·거래세·슬리피지)을 보수적으로 잡고, 늘려도 수익이 남는지 본다.

## 알려진 한계
- 일봉 종가를 15:19 판정가의 근사치로 사용 → 슬리피지로 보정
- FinanceDataReader 는 현재 상장 종목만 수집 → 상장폐지 종목 누락(생존 편향)
- 거래세 등 비용 기본값은 반드시 최신 기준으로 확인

## 보안
API 키·계좌번호·토큰은 `.env` 에만 저장합니다 (`.env.example` 참고). `.env` 는 커밋되지 않습니다.

## 로드맵
- [x] 백테스트 엔진 v1 (어댑터, 지표 레지스트리, 조건 파일, 청산 모델, 실험 기록)
- [ ] 실제 데이터로 기본 전략 검증
- [ ] 키움 REST API 연동: 토큰, 조건검색(ka10171/ka10172), 텔레그램 알림
- [ ] 모의투자 자동 운영
- [ ] 소액 실전
