// 브라우저용 종가베팅 백테스트 엔진.
// closingbet/engine.py · report.py 와 같은 규칙으로 계산합니다 (tests/test_web_parity.py 가 검증).
// 지표 값은 scripts/build_web_data.py 가 파이썬에서 미리 계산해 둔 것을 씁니다.

export const DEFAULT_COSTS = { commission: 0.00015, sell_tax: 0.002, slippage: 0.001 };

const DTYPES = { f4: Float32Array, u2: Uint16Array, u1: Uint8Array };

/** meta.json + rows.bin(ArrayBuffer) → 데이터셋 */
export function loadDataset(meta, buffer) {
  const cols = {};
  for (const c of meta.columns) {
    cols[c.name] = new DTYPES[c.dtype](buffer, c.offset, c.length);
  }
  const nDays = meta.days.length;
  // 날짜별 행 시작 위치 (행은 날짜→종목 순으로 정렬돼 있음)
  const dayStart = new Int32Array(nDays + 1);
  const day = cols.day;
  let r = 0;
  for (let d = 0; d < nDays; d++) {
    dayStart[d] = r;
    while (r < day.length && day[r] === d) r++;
  }
  dayStart[nDays] = day.length;
  return { meta, cols, n: day.length, days: meta.days, dayStart };
}

function dayRange(ds, period) {
  const [start, end] = period;
  let a = 0;
  while (a < ds.days.length && ds.days[a] < start) a++;
  let b = ds.days.length - 1;
  while (b >= 0 && ds.days[b] > end) b--;
  return [a, b];
}

/** 조건 목록 → 행 번호를 받아 통과 여부를 돌려주는 함수 */
export function compileFilters(ds, filters) {
  const tests = filters.map((f) => {
    const col = ds.cols[f.f];
    if (!col) throw new Error(`알 수 없는 지표: ${f.f}`);
    const v = f.v;
    switch (f.op) {
      case 'between': return (i) => col[i] >= v[0] && col[i] <= v[1];
      case '>=': return (i) => col[i] >= v;
      case '<=': return (i) => col[i] <= v;
      case '>': return (i) => col[i] > v;
      case '<': return (i) => col[i] < v;
      case '==': return (i) => col[i] === v;
      default: throw new Error(`알 수 없는 비교: ${f.op}`);
    }
  });
  // NaN 은 모든 비교에서 false → 파이썬의 fillna(False) 와 동일
  return (i) => {
    for (let k = 0; k < tests.length; k++) if (!tests[k](i)) return false;
    return true;
  };
}

function exitRatio(cols, i, exit) {
  const model = exit.model || 'next_open';
  if (model === 'next_open') return cols.r_open[i];
  if (model === 'next_close') return cols.r_close[i];
  if (model === 'next_day_tp_sl') {
    const tp = 1 + (exit.take_profit_pct ?? 3) / 100;
    const sl = 1 - (exit.stop_loss_pct ?? 3) / 100;
    const o = cols.r_open[i], h = cols.r_high[i], l = cols.r_low[i];
    let out = cols.r_close[i];
    if (h >= tp) out = tp;
    if (l <= sl) out = sl; // 둘 다 닿으면 손절 우선 (보수적)
    if (o <= sl) out = o; // 갭하락 → 시가 손절
    if (o >= tp) out = o; // 갭상승 → 시가 익절
    return out;
  }
  throw new Error(`알 수 없는 청산 모델: ${model}`);
}

/** 매매 횟수만 빠르게 세기 (슬라이더 미리보기용) */
export function countTrades(ds, cfg) {
  const pass = compileFilters(ds, cfg.filters);
  const [a, b] = dayRange(ds, cfg.period);
  const maxPos = cfg.maxPos ?? 3;
  let n = 0;
  for (let d = a; d <= b; d++) {
    let c = 0;
    for (let i = ds.dayStart[d]; i < ds.dayStart[d + 1] && c < maxPos; i++) if (pass(i)) c++;
    n += c;
  }
  const years = Math.max((b - a + 1) / 252, 1e-9);
  return { trades: n, perYear: n / years };
}

/** 백테스트 실행 */
export function run(ds, cfg) {
  const costs = { ...DEFAULT_COSTS, ...(cfg.costs || {}) };
  const exit = typeof cfg.exit === 'string' ? { model: cfg.exit } : (cfg.exit || { model: 'next_open' });
  const maxPos = cfg.maxPos ?? 3;
  const rankBy = cfg.rankBy || 'trade_value';
  const rankCol = ds.cols[rankBy];
  const pass = compileFilters(ds, cfg.filters);
  const [a, b] = dayRange(ds, cfg.period);
  const { cols } = ds;
  const buy = (1 + costs.slippage) * (1 + costs.commission);
  const sellMul = (1 - costs.slippage) * (1 - costs.commission - costs.sell_tax);

  const trades = [];
  const daily = new Float64Array(Math.max(b - a + 1, 0));
  for (let d = a; d <= b; d++) {
    const cand = [];
    for (let i = ds.dayStart[d]; i < ds.dayStart[d + 1]; i++) if (pass(i)) cand.push(i);
    // 큰 값 우선, 같으면 종목코드 순 (pandas 안정 정렬과 동일)
    cand.sort((x, y) => (rankCol[y] - rankCol[x]) || (cols.code[x] - cols.code[y]));
    let sum = 0;
    for (let k = 0; k < Math.min(maxPos, cand.length); k++) {
      const i = cand[k];
      const ex = exitRatio(cols, i, exit);
      const ret = (ex * sellMul) / buy - 1;
      trades.push({ row: i, day: d, ret, gross: ex - 1 });
      sum += ret;
    }
    daily[d - a] = sum / maxPos;
  }
  const dates = ds.days.slice(a, b + 1);
  return { trades, daily, dates, firstDay: a, metrics: metrics(trades, daily), yearly: yearly(daily, dates) };
}

export function metrics(trades, daily) {
  const n = trades.length;
  let eq = 1, peak = 1, mdd = 0, sum = 0;
  for (let k = 0; k < daily.length; k++) {
    eq *= 1 + daily[k];
    if (eq > peak) peak = eq;
    const dd = eq / peak - 1;
    if (dd < mdd) mdd = dd;
    sum += daily[k];
  }
  const total = eq - 1;
  const years = Math.max(daily.length / 252, 1e-9);
  const cagr = total > -1 ? Math.pow(1 + total, 1 / years) - 1 : -1;
  const mean = daily.length ? sum / daily.length : 0;
  let v = 0;
  for (let k = 0; k < daily.length; k++) v += (daily[k] - mean) ** 2;
  const sd = daily.length > 1 ? Math.sqrt(v / (daily.length - 1)) : 0;
  const vol = sd * Math.sqrt(252);
  const sharpe = vol > 0 ? (mean * 252) / vol : null;

  let wins = 0, wSum = 0, lSum = 0, losses = 0, rSum = 0;
  for (const t of trades) {
    rSum += t.ret;
    if (t.ret > 0) { wins++; wSum += t.ret; } else { losses++; lSum += t.ret; }
  }
  const payoff = wins && losses ? (wSum / wins) / Math.abs(lSum / losses) : null;
  return {
    trades: n,
    tradesPerYear: n / years,
    winRate: n ? wins / n : null,
    avgRet: n ? rSum / n : null,
    payoff,
    total, cagr, mdd, sharpe,
  };
}

export function yearly(daily, dates) {
  const out = new Map();
  for (let k = 0; k < daily.length; k++) {
    const y = dates[k].slice(0, 4);
    out.set(y, (out.get(y) ?? 1) * (1 + daily[k]));
  }
  return [...out].map(([year, g]) => ({ year, ret: g - 1 }));
}

/** 누적 자산 곡선 */
export function equity(daily) {
  const out = new Float64Array(daily.length);
  let eq = 1;
  for (let k = 0; k < daily.length; k++) { eq *= 1 + daily[k]; out[k] = eq; }
  return out;
}
