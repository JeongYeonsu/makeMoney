"""백테스트 실행.

예)
    python run_backtest.py configs/example_v1.yaml                 # 학습 구간, 가상 데이터
    python run_backtest.py configs/example_v1.yaml --source fdr    # 실제 국내 일봉
    python run_backtest.py configs/sweep_example.yaml              # 파라미터 스윕
    python run_backtest.py configs/example_v1.yaml --period test --final   # 최종 검증(한 번만!)
"""
import argparse
import sys

from closingbet.runner import run_config


def main():
    ap = argparse.ArgumentParser(description="종가베팅 백테스트")
    ap.add_argument("config", help="조건 파일 경로 (configs/*.yaml)")
    ap.add_argument("--period", default="train", help="periods 의 구간 이름 (기본 train)")
    ap.add_argument("--source", choices=["sample", "fdr"], help="데이터 소스 덮어쓰기")
    ap.add_argument("--note", default="", help="실험 기록에 남길 메모")
    ap.add_argument("--no-log", action="store_true", help="experiments.csv 에 기록하지 않음")
    ap.add_argument("--final", action="store_true", help="test 구간 실행 확인 플래그")
    a = ap.parse_args()

    if a.period == "test" and not a.final:
        sys.exit(
            "test 구간은 최종 확인용입니다. 조건 튜닝에 반복 사용하면 결과가 부풀려집니다.\n"
            "정말 최종 검증이라면 --final 을 붙여 실행하세요."
        )
    run_config(a.config, period=a.period, source=a.source, note=a.note, log=not a.no_log)


if __name__ == "__main__":
    main()
