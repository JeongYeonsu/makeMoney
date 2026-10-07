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

## 웹 백테스터 (GitHub Pages)

폰 브라우저에서 조건을 슬라이더로 조절하고 바로 백테스트하는 화면입니다.

- **전략 만들기**: 조건 카드 추가·삭제, 예상 매매 빈도 즉시 표시, 청산 방식·종목 수·비용 설정
- **결과 보기**: 핵심 지표, 코스피 대비 수익 곡선, 낙폭, 연도별 수익, 매매별 선정 이유, 경고 배너, 조건 파일(YAML) 내보내기
- **실험 비교**: 실험 기록 겹쳐 보기, 두 조건을 바꿔가며 보는 안정성 히트맵, 검증 구간 1회 잠금

구조
- `scripts/build_web_data.py` 가 파이썬 지표 레지스트리로 값을 계산해 `web/data/` 에 저장 (지표 정의는 파이썬 한 곳)
- `web/engine.js` 가 브라우저에서 매수·청산·성과를 계산 — `tests/test_web_parity.py` 가 파이썬 엔진과 결과가 같은지 검증
- `.github/workflows/pages.yml` 이 평일 16:40(KST)마다 데이터를 갱신하고 배포
- 실험 기록과 검증 잠금은 **이 기기 브라우저에만** 저장됩니다

처음 한 번: 저장소 **Settings → Pages → Source 를 "GitHub Actions"** 로 설정하세요.

로컬에서 보기
```bash
python scripts/build_web_data.py --source sample   # 또는 --source fdr
cd web && python -m http.server 8000                # http://localhost:8000
```

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
- 웹 데이터의 종목은 '현재' 시가총액 1,000억 이상 기준으로 골라서, 과거 시점엔 작았던 종목이 섞이는 편향이 있음

## 보안
API 키·계좌번호·토큰은 `.env` 에만 저장합니다 (`.env.example` 참고). `.env` 는 커밋되지 않습니다.

## 로드맵
- [x] 백테스트 엔진 v1 (어댑터, 지표 레지스트리, 조건 파일, 청산 모델, 실험 기록)
- [x] 웹 백테스터 (GitHub Pages, 자동 데이터 갱신)
- [ ] 실제 데이터로 기본 전략 검증
- [ ] 키움 REST API 연동: 토큰, 조건검색(ka10171/ka10172), 텔레그램 알림
- [ ] 모의투자 자동 운영
- [ ] 소액 실전
