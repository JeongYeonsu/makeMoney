import * as E from './engine.js';

// ───────────────────────────────────────── 조건 섹션과 지표 카탈로그 (화면용)
// 종가베팅 조건을 네 가지 질문으로 나눕니다.
const SECTIONS = [
  { id: 'size', title: '힘의 크기', q: '오늘 얼마나 강하게, 얼마나 많은 돈이 들어왔나',
    icon: '<path d="M4 18V12M9 18V8M14 18V10M19 18V4"/>' },
  { id: 'quality', title: '힘의 질', q: '그 힘이 끝까지 유지됐고, 추세 위에 있나',
    icon: '<path d="M3 15c3 0 4-8 7-8s3 6 6 6 3-6 5-6"/>' },
  { id: 'market', title: '시장 분위기', q: '오늘 시장 전체가 버텨주는 날인가',
    icon: '<circle cx="12" cy="12" r="8"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>' },
  { id: 'risk', title: '위험 요소', q: '밤사이 무너질 이유가 쌓여 있지 않나',
    icon: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 9v4M12 16v.5"/>' },
];

// kind: range(하한~상한) | min(이상) | max(이하) | bool(충족)
const FEATURES = {
  // 힘의 크기
  change_pct: { sec: 'size', label: '당일 등락률', hint: '상한을 두면 상한가 근처 종목을 뺄 수 있어요', unit: '%', kind: 'range', min: 2, max: 30, step: 0.5, def: [5, 15], heatStep: 1 },
  trade_value: { sec: 'size', label: '거래대금', hint: '체결 가능성과 관심도의 최소 기준', unit: '억', kind: 'min', min: 50, max: 3000, step: 50, def: 300, heatStep: 100 },
  trade_value_ratio_20: { sec: 'size', label: '평소 대비 거래대금', hint: '직전 20일 평균보다 몇 배 몰렸나', unit: '배', kind: 'min', min: 1, max: 20, step: 0.5, def: 3, heatStep: 1 },
  trade_value_rank: { sec: 'size', label: '거래대금 순위', hint: '오늘 시장 전체에서 몇 위 안에 들었나', unit: '위', kind: 'max', min: 1, max: 300, step: 5, def: 30, heatStep: 10 },
  body_pct: { sec: 'size', label: '장중 상승폭 (몸통)', hint: '시가에서 종가까지 얼마나 밀어올렸나', unit: '%', kind: 'min', min: -5, max: 20, step: 0.5, def: 2, heatStep: 1 },
  // 힘의 질
  close_to_high: { sec: 'quality', label: '고가 근처 마감', hint: '종가가 그날 고가의 몇 %에서 끝났나', unit: '%', kind: 'min', min: 85, max: 100, step: 0.5, def: 97, heatStep: 1 },
  new_high_60: { sec: 'quality', label: '60일 신고가 돌파', hint: '직전 60일 최고 종가를 넘어섰나', kind: 'bool' },
  above_ma20: { sec: 'quality', label: '20일선 위 마감', hint: '단기 추세선 위에서 끝났나', kind: 'bool' },
  ma_aligned: { sec: 'quality', label: '이평선 정배열', hint: '5일 > 20일 > 60일선 순서로 놓였나', kind: 'bool' },
  range_squeeze: { sec: 'quality', label: '돌파 전 변동성 수축', hint: '직전 5일 진폭 ÷ 20일 진폭. 1보다 작을수록 조용하다 터진 것', unit: '배', kind: 'max', min: 0.3, max: 2, step: 0.05, def: 0.8, heatStep: 0.1 },
  gap_pct: { sec: 'quality', label: '시가 갭 상한', hint: '갭으로만 뜬 종목을 빼고 장중 상승을 고를 때', unit: '%', kind: 'max', min: -5, max: 15, step: 0.5, def: 3, heatStep: 1 },
  // 시장 분위기
  market_change: { sec: 'market', label: '지수 당일 등락', hint: '소속 시장(코스피·코스닥) 지수가 이만큼은 버텼나', unit: '%', kind: 'min', min: -5, max: 3, step: 0.1, def: -0.5, heatStep: 0.5 },
  market_above_ma20: { sec: 'market', label: '지수 20일선 위', hint: '시장이 단기 상승 추세일 때만 매매', kind: 'bool' },
  // 위험 요소
  upper_tail_ratio: { sec: 'risk', label: '윗꼬리 비율', hint: '고가에서 밀린 정도. 길수록 매물 부담', unit: '%', kind: 'max', min: 0, max: 100, step: 5, def: 30, heatStep: 10 },
  disparity_20: { sec: 'risk', label: '이격도 (과열)', hint: '종가 ÷ 20일선. 너무 높으면 이미 달린 종목', unit: '%', kind: 'max', min: 100, max: 200, step: 1, def: 130, heatStep: 5 },
  up_streak: { sec: 'risk', label: '연속 상승일수', hint: '며칠째 올랐나. 길수록 차익 매물이 나오기 쉬움', unit: '일', kind: 'max', min: 0, max: 10, step: 1, def: 3, heatStep: 1 },
  days_listed: { sec: 'risk', label: '상장 후 경과일', hint: '막 상장한 종목의 불안정한 움직임 제외', unit: '일', kind: 'min', min: 0, max: 500, step: 20, def: 60, heatStep: 20 },
};
const RANKS = { trade_value: '거래대금 큰 순', change_pct: '등락률 큰 순', trade_value_ratio_20: '거래대금 배수 큰 순' };
const EXITS = [['next_open', '익일 시가'], ['next_close', '익일 종가'], ['next_day_tp_sl', '익절·손절']];
const COLORS = ['#C8282B', '#E08A2E', '#1F55C4', '#5A5F6B'];

const DEFAULT_STRATEGY = {
  name: '신고가_거래대금_v1',
  conds: [
    { f: 'change_pct', v: [5, 15] },
    { f: 'trade_value', v: 300 },
    { f: 'trade_value_ratio_20', v: 3 },
    { f: 'close_to_high', v: 97 },
    { f: 'market_above_ma20', v: 1 },
    { f: 'up_streak', v: 3 },
  ],
  maxPos: 3,
  rankBy: 'trade_value',
  exit: { model: 'next_open', take_profit_pct: 4, stop_loss_pct: 3 },
  costs: { commission: 0.015, sell_tax: 0.2, slippage: 0.15 }, // % 단위
};

// ───────────────────────────────────────── 저장소 (이 기기 브라우저에만 저장)
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('cb.' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('cb.' + key, JSON.stringify(value)); } catch { /* 저장 불가 환경 */ }
  },
};

const state = {
  ds: null,
  strategy: store.get('strategy', null) || structuredClone(DEFAULT_STRATEGY),
  experiments: store.get('experiments', []),
  locks: store.get('locks', {}),
  last: null,
  openTrade: null,
  tradeLimit: 10,
  showYaml: false,
  selected: null,
  curveCache: new Map(),
  heat: null,
  heatAxes: null,
  heatPick: null,
  confirmTest: false,
};

const $screen = document.getElementById('screen');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, d = 1, sign = false) => (x == null || !isFinite(x) ? '–' : `${sign && x > 0 ? '+' : ''}${(x * 100).toFixed(d)}%`).replace('-', '−');
const num = (x, d = 2) => (x == null || !isFinite(x) ? '–' : x.toFixed(d));
const tone = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
const fmtVal = (f, v) => {
  const F = FEATURES[f];
  if (F.kind === 'bool') return '충족';
  if (F.kind === 'range') return `${v[0]}${F.unit} ~ ${v[1]}${F.unit}`;
  if (f === 'trade_value_rank') return `${v}위 이내`;
  return `${F.kind === 'max' ? '≤' : '≥'} ${Number(v).toLocaleString('ko-KR')}${F.unit}`;
};

const fmtTime = (iso) => new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const benchName = () => (state.ds.meta.source === 'sample' ? '가상 지수' : '코스피');

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}

function saveStrategy() { store.set('strategy', state.strategy); }

function hashStrategy(s) {
  const key = JSON.stringify([s.conds, s.maxPos, s.rankBy, s.exit.model,
    s.exit.model === 'next_day_tp_sl' ? [s.exit.take_profit_pct, s.exit.stop_loss_pct] : 0, s.costs]);
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function toCfg(s, periodKey) {
  const filters = s.conds.map(({ f, v }) => {
    const k = FEATURES[f].kind;
    if (k === 'range') return { f, op: 'between', v: [Math.min(v[0], v[1]), Math.max(v[0], v[1])] };
    if (k === 'min') return { f, op: '>=', v };
    if (k === 'max') return { f, op: '<=', v };
    return { f, op: '==', v: 1 };
  });
  return {
    filters,
    maxPos: s.maxPos,
    rankBy: s.rankBy,
    exit: { ...s.exit },
    costs: { commission: s.costs.commission / 100, sell_tax: s.costs.sell_tax / 100, slippage: s.costs.slippage / 100 },
    period: state.ds.meta.periods[periodKey],
  };
}

// ───────────────────────────────────────── 차트 (SVG 문자열)
function lineChart(series, { w = 342, h = 160, pad = 6, zeroLine = false } = {}) {
  let lo = Infinity, hi = -Infinity, n = 0;
  for (const s of series) for (const v of s.values) { if (v == null) continue; lo = Math.min(lo, v); hi = Math.max(hi, v); n = Math.max(n, s.values.length); }
  if (!isFinite(lo)) return '';
  if (hi - lo < 1e-9) { hi += 0.01; lo -= 0.01; }
  const X = (i) => (i / Math.max(n - 1, 1)) * w;
  const Y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2);
  const stride = Math.max(1, Math.floor(n / 240));
  const grid = [0.25, 0.5, 0.75].map((t) => `<path d="M0 ${(pad + t * (h - 2 * pad)).toFixed(1)}H${w}" stroke="#EEECE5"/>`).join('');
  const zero = zeroLine && lo < 1 && hi > 1 ? `<path d="M0 ${Y(1).toFixed(1)}H${w}" stroke="#C9C6BB" stroke-dasharray="3 3"/>` : '';
  const lines = series.map((s) => {
    const pts = [];
    for (let i = 0; i < s.values.length; i += stride) if (s.values[i] != null) pts.push(`${X(i).toFixed(1)},${Y(s.values[i]).toFixed(1)}`);
    const last = s.values.length - 1;
    if (s.values[last] != null) pts.push(`${X(last).toFixed(1)},${Y(s.values[last]).toFixed(1)}`);
    return `<polyline style="fill:none;stroke:${s.color};stroke-width:${s.width || 2};stroke-linejoin:round${s.dash ? `;stroke-dasharray:${s.dash}` : ''}" points="${pts.join(' ')}"/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(series.map((s) => s.label).join(', '))} 누적 수익 곡선">${grid}${zero}${lines}</svg>`;
}

function drawdownChart(eq, { w = 342, h = 44 } = {}) {
  let peak = 1, min = 0;
  const dd = Array.from(eq, (v) => { peak = Math.max(peak, v); const d = v / peak - 1; min = Math.min(min, d); return d; });
  if (min === 0) min = -0.01;
  const stride = Math.max(1, Math.floor(dd.length / 240));
  const pts = [];
  for (let i = 0; i < dd.length; i += stride) pts.push(`${((i / Math.max(dd.length - 1, 1)) * w).toFixed(1)},${((dd[i] / min) * h).toFixed(1)}`);
  pts.push(`${w},${((dd[dd.length - 1] / min) * h).toFixed(1)}`);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="낙폭 그래프, 최대 ${pct(min)}">
    <polygon style="fill:var(--down-soft)" points="0,0 ${pts.join(' ')} ${w},0"/>
    <polyline style="fill:none;stroke:var(--down);stroke-width:1.4" points="${pts.join(' ')}"/></svg>`;
}

function yearAxis(dates) {
  if (!dates.length) return '';
  const y0 = dates[0].slice(0, 4), y1 = dates[dates.length - 1].slice(0, 4);
  const mid = dates[Math.floor(dates.length / 2)].slice(0, 4);
  return `<div class="axis"><span>${y0}</span><span>${mid}</span><span>${y1}</span></div>`;
}

function benchmarkSeries(firstDay, len) {
  const b = state.ds.meta.benchmark || [];
  if (!b.length) return null;
  let base = null, prev = null;
  const out = [];
  for (let i = 0; i < len; i++) {
    let v = b[firstDay + i];
    if (v == null) v = prev;
    if (v != null && base == null) base = v;
    out.push(v == null ? null : v / base);
    prev = v;
  }
  return out;
}

// ───────────────────────────────────────── 화면 1: 전략 만들기
function renderStrategy() {
  const s = state.strategy;
  const m = state.ds.meta;
  const used = new Set(s.conds.map((c) => c.f));
  const locked = state.locks[hashStrategy(s)];

  const condCard = (c, i) => {
    const F = FEATURES[c.f];
    const rm = `<button class="icon-btn" type="button" data-act="rm" data-i="${i}" aria-label="${esc(F.label)} 조건 삭제">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>`;
    let body = '';
    if (F.kind === 'range') {
      body = `<div class="range2"><span>하한</span><input type="range" min="${F.min}" max="${F.max}" step="${F.step}" value="${c.v[0]}" data-ci="${i}" data-part="0" aria-label="${esc(F.label)} 하한"></div>
              <div class="range2"><span>상한</span><input type="range" min="${F.min}" max="${F.max}" step="${F.step}" value="${c.v[1]}" data-ci="${i}" data-part="1" aria-label="${esc(F.label)} 상한"></div>`;
    } else if (F.kind !== 'bool') {
      body = `<input type="range" min="${F.min}" max="${F.max}" step="${F.step}" value="${c.v}" data-ci="${i}" aria-label="${esc(F.label)}">`;
    }
    return `<div class="cond">
      <div class="cond-head"><span class="cond-name">${esc(F.label)}</span><span class="cond-right"><span class="cond-val" id="cv-${i}">${fmtVal(c.f, c.v)}</span>${rm}</span></div>
      <p class="cond-hint">${esc(F.hint)}</p>
      ${body}</div>`;
  };

  const sections = SECTIONS.map((sec) => {
    const items = s.conds.map((c, i) => [c, i]).filter(([c]) => FEATURES[c.f].sec === sec.id);
    const free = Object.keys(FEATURES).filter((f) => FEATURES[f].sec === sec.id && !used.has(f));
    const add = free.length ? `<div class="sec-add">
        <select data-add="${sec.id}" aria-label="${sec.title}에 추가할 조건">${free.map((f) => `<option value="${f}">${esc(FEATURES[f].label)}</option>`).join('')}</select>
        <button type="button" data-act="add" data-sec="${sec.id}">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>추가</button></div>` : '';
    return `<section class="sec sec-${sec.id}" aria-labelledby="sec-${sec.id}">
      <header class="sec-head">
        <svg class="sec-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${sec.icon}</svg>
        <div><h2 id="sec-${sec.id}">${sec.title}</h2><p>${sec.q}</p></div>
        <span class="sec-count">${items.length ? `${items.length}개` : '없음'}</span>
      </header>
      ${items.map(([c, i]) => condCard(c, i)).join('')}
      ${add}
    </section>`;
  }).join('');

  const exitSeg = EXITS.map(([k, l]) => `<button type="button" data-act="exit" data-v="${k}" aria-pressed="${s.exit.model === k}">${l}</button>`).join('');
  const tpsl = s.exit.model === 'next_day_tp_sl' ? `
    <div class="sel2">
      <label class="field">익절 (%)<input type="number" inputmode="decimal" step="0.5" min="0.5" value="${s.exit.take_profit_pct}" data-num="exit.take_profit_pct"></label>
      <label class="field">손절 (%)<input type="number" inputmode="decimal" step="0.5" min="0.5" value="${s.exit.stop_loss_pct}" data-num="exit.stop_loss_pct"></label>
    </div>
    <p class="muted" style="margin:0">익일 장중에 익절·손절선을 모두 건드리면 손절이 먼저라고 가정해요 (일봉으로는 순서를 알 수 없어서).</p>` : '';

  $screen.innerHTML = `
    <div class="eyebrow"><span class="label">학습 구간 ${m.periods.train[0].slice(0, 4)}–${m.periods.train[1].slice(0, 4)}</span>
      ${m.source === 'sample' ? '<span class="badge warn">가상 데이터</span>' : `<span class="badge">기준일 ${m.last_day}</span>`}</div>
    <h1>전략 만들기</h1>
    <label class="field">전략 이름<input type="text" value="${esc(s.name)}" data-name maxlength="40" autocomplete="off"></label>

    <p class="lede">네 가지를 모두 통과한 종목만 장 마감 직전에 삽니다.</p>
    ${sections}

    <div class="card dark">
      <div class="row"><span class="muted">이 조건이면 예상 매매 빈도</span><span class="muted">학습 구간 기준</span></div>
      <div><span class="big" id="pv-n">–</span> <span>건 / 년</span></div>
      <div class="meter"><i id="pv-bar" style="width:0"></i></div>
      <span id="pv-hint" style="font-size:13px"></span>
    </div>

    <h2 style="margin-top:6px">청산 방식</h2>
    <div class="seg" role="group" aria-label="청산 방식">${exitSeg}</div>
    ${tpsl}
    <div class="card stepper"><span style="font-size:14px;font-weight:500">하루 최대 종목 수</span>
      <span class="ctrl"><button type="button" data-act="pos" data-d="-1" aria-label="줄이기">−</button><output>${s.maxPos}</output><button type="button" data-act="pos" data-d="1" aria-label="늘리기">+</button></span></div>

    <details class="adv">
      <summary><span>고급 · 수수료 ${s.costs.commission}% · 세금 ${s.costs.sell_tax}% · 슬리피지 ${s.costs.slippage}%</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg></summary>
      <div class="inner">
        <label class="field">수수료 편도 (%)<input type="number" inputmode="decimal" step="0.005" min="0" value="${s.costs.commission}" data-num="costs.commission"></label>
        <label class="field">매도 거래세 (%)<input type="number" inputmode="decimal" step="0.01" min="0" value="${s.costs.sell_tax}" data-num="costs.sell_tax"></label>
        <label class="field">슬리피지 편도 (%)<input type="number" inputmode="decimal" step="0.05" min="0" value="${s.costs.slippage}" data-num="costs.slippage"></label>
        <label class="field">후보가 많을 때<select data-rank>${Object.entries(RANKS).map(([k, l]) => `<option value="${k}" ${s.rankBy === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <p class="muted full" style="margin:0">거래세는 시장·연도마다 달라요. 최신 세율로 맞춰 주세요. 일봉 종가를 15:20 무렵 가격 대신 쓰므로 슬리피지는 넉넉히 잡는 게 안전해요.</p>
      </div>
    </details>

    ${locked ? '<p class="muted" style="margin:0">이 조건은 검증 구간 확인을 마쳤어요. 조건을 바꾸면 새 전략으로 기록돼요.</p>' : ''}
    <button class="btn primary" type="button" data-act="run">학습 구간 백테스트 실행</button>
    <p class="muted" style="margin:4px 0 0">데이터: ${m.source === 'sample' ? '구조 확인용 가상 데이터 (수익률에 의미 없음)' : `FinanceDataReader 일봉 · ${m.n_codes.toLocaleString('ko-KR')}종목`} · 등락률 ${m.prefilter.change_pct_min}% 이상, 거래대금 ${m.prefilter.trade_value_eok_min}억 이상인 날만 담겨 있어요.</p>`;
  updatePreview();
}

let previewRaf = 0;
function updatePreview() {
  cancelAnimationFrame(previewRaf);
  previewRaf = requestAnimationFrame(() => {
    const el = document.getElementById('pv-n');
    if (!el) return;
    const { perYear } = E.countTrades(state.ds, toCfg(state.strategy, 'train'));
    const n = Math.round(perYear);
    let hint = '검증하기 적당한 빈도예요.', color = '#6FBF8A';
    if (n < 20) { hint = '너무 적어요. 결과가 운에 좌우될 수 있어요 — 조건을 조금 풀어보세요.'; color = '#E0A23B'; }
    else if (n > Math.min(300, 200 * state.strategy.maxPos)) { hint = '너무 많아요. 조건이 느슨해 아무 종목이나 사게 될 수 있어요.'; color = '#E0A23B'; }
    el.textContent = n.toLocaleString('ko-KR');
    const bar = document.getElementById('pv-bar');
    bar.style.width = `${Math.max(3, Math.min(100, n / 3))}%`;
    bar.style.background = color;
    document.getElementById('pv-hint').textContent = hint;
  });
}

// ───────────────────────────────────────── 실행
function runBacktest(periodKey) {
  const s = state.strategy;
  const res = E.run(state.ds, toCfg(s, periodKey));
  const exp = {
    id: Date.now().toString(36),
    at: new Date().toISOString(),
    name: s.name.trim() || '이름 없음',
    hash: hashStrategy(s),
    period: periodKey,
    strategy: structuredClone(s),
    metrics: res.metrics,
    yearly: res.yearly,
  };
  state.experiments.push(exp);
  if (state.experiments.length > 300) state.experiments.shift();
  store.set('experiments', state.experiments);
  state.last = { exp, res };
  state.openTrade = null;
  state.showYaml = false;
  state.tradeLimit = 10;
  return exp;
}

// ───────────────────────────────────────── 화면 2: 결과
function renderResults() {
  if (!state.last) {
    const lastExp = state.experiments[state.experiments.length - 1];
    if (lastExp) {
      state.last = { exp: lastExp, res: E.run(state.ds, toCfg(lastExp.strategy, lastExp.period)) };
    } else {
      $screen.innerHTML = `<h1>결과 보기</h1><div class="empty"><p class="muted">아직 실행한 백테스트가 없어요.</p><a class="btn" href="#strategy">전략 만들러 가기</a></div>`;
      return;
    }
  }
  const { exp, res } = state.last;
  const m = res.metrics;
  const meta = state.ds.meta;
  const s = exp.strategy;
  const exitLabel = EXITS.find(([k]) => k === s.exit.model)[1];
  const period = meta.periods[exp.period];

  const eq = E.equity(res.daily);
  const bench = benchmarkSeries(res.firstDay, res.daily.length);
  const benchTotal = bench ? bench[bench.length - 1] - 1 : null;

  const warns = [];
  if (exp.period === 'test') warns.push('검증 구간 결과예요. 이 결과를 보고 조건을 다시 고치면 검증의 의미가 사라져요.');
  if (m.trades < 50) warns.push(`거래가 ${m.trades}건뿐이에요. 표본이 적어 결과가 운에 좌우될 수 있어요.`);
  const pos = res.yearly.filter((y) => y.ret > 0);
  const posSum = pos.reduce((a, y) => a + y.ret, 0);
  if (res.yearly.length >= 3 && posSum > 0 && m.total > 0) {
    const top = pos.reduce((a, y) => (y.ret > a.ret ? y : a), pos[0]);
    const share = top.ret / posSum;
    if (share > 0.5) warns.push(`${top.year}년 한 해가 전체 수익의 ${Math.round(share * 100)}%를 차지해요. 특정 장세에만 통한 전략인지 확인해 보세요.`);
  }
  if (m.mdd < -0.3) warns.push(`최대 낙폭이 ${pct(m.mdd)}예요. 실전에서 버티기 어려운 수준일 수 있어요.`);
  const warnIcon = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#8A5A00" stroke-width="1.6" aria-hidden="true"><path d="M9 2l7.5 13h-15z"/><path d="M9 7.5v3.5M9 13v.5"/></svg>';

  const maxAbs = Math.max(0.0001, ...res.yearly.map((y) => Math.abs(y.ret)));
  const cols = `grid-template-columns: repeat(${res.yearly.length}, minmax(0, 1fr))`;
  const bars = res.yearly.map((y) => `<div><span class="${tone(y.ret)}">${(y.ret * 100).toFixed(1).replace('-', '−')}</span><b style="height:${Math.max(2, (Math.abs(y.ret) / maxAbs) * 104)}px;background:${y.ret >= 0 ? 'var(--up)' : 'var(--down)'}"></b></div>`).join('');
  const years = res.yearly.map((y) => `<span>${y.year.slice(2)}</span>`).join('');

  const recent = res.trades.slice(-state.tradeLimit).reverse();
  const C = state.ds.cols;
  const tradeRows = recent.map((t) => {
    const i = t.row;
    const open = state.openTrade === i;
    const name = meta.names[C.code[i]] || meta.codes[C.code[i]];
    return `<div class="trade"><button type="button" data-act="trade" data-i="${i}" aria-expanded="${open}">
      <span style="display:flex;flex-direction:column;gap:2px"><span class="nm">${esc(name)}</span>
      <span class="sub">${meta.days[t.day].slice(2).replace(/-/g, '.')} · ${pct(C.change_pct[i] / 100, 1, true)} · ${Math.round(C.trade_value[i]).toLocaleString('ko-KR')}억</span></span>
      <span class="mono ${tone(t.ret)}" style="font-size:15px">${pct(t.ret, 2, true)}</span></button>
      ${open ? `<div class="why">
        <span>등락률 <b>${num(C.change_pct[i], 2)}%</b></span><span>거래대금 <b>${Math.round(C.trade_value[i]).toLocaleString('ko-KR')}억</b></span>
        <span>평균 대비 <b>${num(C.trade_value_ratio_20[i], 1)}배</b></span><span>종가/고가 <b>${num(C.close_to_high[i], 1)}%</b></span>
        <span>윗꼬리 <b>${num(C.upper_tail_ratio[i], 0)}%</b></span><span>상장 경과 <b>${C.days_listed[i]}일</b></span>
        <span>거래대금 순위 <b>${C.trade_value_rank[i]}위</b></span><span>이격도 <b>${num(C.disparity_20[i], 0)}%</b></span>
        <span>연속 상승 <b>${C.up_streak[i]}일</b></span><span>지수 등락 <b>${pct(C.market_change[i] / 100, 2, true)}</b></span>
        <span>익일 시가 <b>${pct(C.r_open[i] - 1, 2, true)}</b></span><span>익일 종가 <b>${pct(C.r_close[i] - 1, 2, true)}</b></span>
        <span>비용 전 <b>${pct(t.gross, 2, true)}</b></span><span>비용 후 <b>${pct(t.ret, 2, true)}</b></span></div>` : ''}</div>`;
  }).join('');

  $screen.innerHTML = `
    <div class="eyebrow"><a href="#strategy" class="btn" style="height:44px;border:none;background:transparent;padding:0;gap:4px">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>조건 수정</a>
      <span class="badge ${meta.source === 'sample' ? 'warn' : ''}">${exp.period === 'test' ? '검증 구간' : '학습 구간'}${meta.source === 'sample' ? ' · 가상 데이터' : ''}</span></div>
    <h1 class="mono">${esc(exp.name)}</h1>
    <p class="muted" style="margin:0">${period[0].replace(/-/g, '.')} – ${period[1].replace(/-/g, '.')} · ${exitLabel}${s.exit.model === 'next_day_tp_sl' ? ` (+${s.exit.take_profit_pct}/−${s.exit.stop_loss_pct}%)` : ''} · 최대 ${s.maxPos}종목</p>

    <div class="kpis">
      <div class="kpi hero"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;color:var(--sub)">누적수익률 (비용 반영)</span>
        <span class="v mono ${tone(m.total)}">${pct(m.total, 1, true)}</span></div>
        ${benchTotal != null ? `<span class="muted" style="text-align:right">${benchName()}<br>${pct(benchTotal, 1, true)}</span>` : ''}</div>
      <div class="kpi"><span>CAGR</span><span class="${tone(m.cagr)}">${pct(m.cagr)}</span></div>
      <div class="kpi"><span>MDD</span><span class="down">${pct(m.mdd)}</span></div>
      <div class="kpi"><span>거래수</span><span>${m.trades.toLocaleString('ko-KR')}</span></div>
      <div class="kpi"><span>승률</span><span>${pct(m.winRate, 0)}</span></div>
      <div class="kpi"><span>손익비</span><span>${num(m.payoff)}</span></div>
      <div class="kpi"><span>샤프</span><span>${num(m.sharpe)}</span></div>
    </div>

    ${warns.map((w) => `<div class="warn">${warnIcon}<span>${esc(w)}</span></div>`).join('')}

    <div class="card">
      <div class="row"><h2 style="font-size:15px">누적 수익 곡선</h2>
        <div class="legend"><span><i style="background:var(--up)"></i>전략</span>${bench ? `<span><i style="background:var(--bench);height:2px"></i>${benchName()}</span>` : ''}</div></div>
      ${lineChart([...(bench ? [{ label: benchName(), values: bench, color: 'var(--bench)', width: 1.6 }] : []), { label: '전략', values: Array.from(eq), color: 'var(--up)', width: 2.4 }], { zeroLine: true })}
      ${yearAxis(res.dates)}
      <span class="muted" style="font-size:12px">낙폭</span>
      ${drawdownChart(eq)}
    </div>

    <div class="card">
      <h2 style="font-size:15px">연도별 수익률 (%)</h2>
      <div class="bars" style="${cols}">${bars}</div>
      <div class="bar-years" style="${cols}">${years}</div>
    </div>

    <div class="card flush">
      <div class="row" style="padding:8px 16px"><h2 style="font-size:15px">최근 매매</h2><span class="muted" style="font-size:12px">누르면 선정 이유</span></div>
      ${tradeRows || '<p class="muted" style="padding:0 16px 12px;margin:0">조건을 만족한 매매가 없어요.</p>'}
      ${res.trades.length > state.tradeLimit ? `<button class="btn" type="button" data-act="more" style="margin:8px 16px;border-style:dashed">더 보기 (전체 ${res.trades.length.toLocaleString('ko-KR')}건)</button>` : ''}
    </div>

    <div class="btn-row">
      <a class="btn" href="#compare">실험 비교</a>
      <button class="btn" type="button" data-act="yaml">${state.showYaml ? 'YAML 닫기' : '조건 파일(YAML)'}</button>
    </div>
    ${state.showYaml ? `<div class="card"><p class="muted" style="margin:0">저장소의 configs/ 폴더에 넣으면 파이썬으로도 같은 전략을 돌릴 수 있어요.</p>
      <textarea class="export" readonly aria-label="조건 파일">${esc(toYaml(exp.strategy))}</textarea>
      <button class="btn" type="button" data-act="copyyaml">복사하기</button></div>` : ''}`;
}

function toYaml(s) {
  const lines = s.conds.map(({ f, v }) => {
    const k = FEATURES[f].kind;
    const conv = (x) => (f === 'trade_value' ? x * 1e8 : (f === 'close_to_high' || f === 'upper_tail_ratio') ? +(x / 100).toFixed(4) : x);
    if (k === 'range') return `  - ${f} between [${Math.min(...v)}, ${Math.max(...v)}]`;
    if (k === 'min') return `  - ${f} >= ${conv(v)}`;
    if (k === 'max') return `  - ${f} <= ${conv(v)}`;
    return `  - ${f} == 1`;
  });
  const exit = s.exit.model === 'next_day_tp_sl'
    ? `{model: next_day_tp_sl, take_profit_pct: ${s.exit.take_profit_pct}, stop_loss_pct: ${s.exit.stop_loss_pct}}`
    : s.exit.model;
  const p = state.ds.meta.periods;
  return [
    `name: ${s.name.replace(/[:#]/g, ' ')}`,
    'data:',
    '  source: fdr',
    'periods:',
    `  train: [${p.train[0]}, ${p.train[1]}]`,
    `  test:  [${p.test[0]}, ${p.test[1]}]`,
    'filters:',
    ...lines,
    `rank_by: ${s.rankBy}`,
    `max_positions: ${s.maxPos}`,
    `exit: ${exit}`,
    'costs:',
    `  commission: ${+(s.costs.commission / 100).toFixed(6)}`,
    `  sell_tax: ${+(s.costs.sell_tax / 100).toFixed(6)}`,
    `  slippage: ${+(s.costs.slippage / 100).toFixed(6)}`,
    '',
  ].join('\n');
}

// ───────────────────────────────────────── 화면 3: 비교
function curveFor(exp) {
  if (!state.curveCache.has(exp.id)) {
    const r = E.run(state.ds, toCfg(exp.strategy, exp.period));
    state.curveCache.set(exp.id, Array.from(E.equity(r.daily)));
  }
  return state.curveCache.get(exp.id);
}

function heatAxesFor(s) {
  const numeric = s.conds.filter((c) => FEATURES[c.f].kind !== 'bool');
  const saved = state.heatAxes;
  if (saved && numeric.some((c) => c.f === saved[0]) && numeric.some((c) => c.f === saved[1]) && saved[0] !== saved[1]) return saved;
  return numeric.length >= 2 ? [numeric[0].f, numeric[1].f] : null;
}

function axisValues(f, center) {
  const F = FEATURES[f];
  const st = F.heatStep;
  let start = center - 2 * st;
  if (start < F.min) start = F.min + ((center - F.min) % st); // 현재 값과 같은 간격 유지
  if (start + 4 * st > F.max) start = Math.max(F.min, F.max - 4 * st);
  const out = [];
  for (let k = 0; k < 5; k++) {
    const v = +(start + k * st).toFixed(2);
    if (v >= F.min && v <= F.max && !out.includes(v)) out.push(v);
  }
  if (!out.includes(center)) { out.push(center); out.sort((x, y) => x - y); }
  return out;
}

const baseVal = (c) => (FEATURES[c.f].kind === 'range' ? Math.min(...c.v) : c.v);

function computeHeat() {
  const s = state.strategy;
  const axes = heatAxesFor(s);
  if (!axes) return;
  const [fx, fy] = axes;
  const cx = s.conds.find((c) => c.f === fx), cy = s.conds.find((c) => c.f === fy);
  const xs = axisValues(fx, baseVal(cx)), ys = axisValues(fy, baseVal(cy));
  const setVal = (c, v) => (FEATURES[c.f].kind === 'range' ? { ...c, v: [v, Math.max(...c.v)] } : { ...c, v });
  const cells = ys.map((vy) => xs.map((vx) => {
    const t = { ...s, conds: s.conds.map((c) => (c.f === fx ? setVal(c, vx) : c.f === fy ? setVal(c, vy) : c)) };
    const r = E.run(state.ds, toCfg(t, 'train'));
    return { vx, vy, cagr: r.metrics.cagr, mdd: r.metrics.mdd, trades: r.metrics.trades };
  }));
  state.heat = { hash: hashStrategy(s), fx, fy, xs, ys, cells, cur: [baseVal(cx), baseVal(cy)] };
  state.heatPick = null;
}

function heatColor(v, maxPos, minNeg) {
  if (v == null || !isFinite(v)) return ['#EEECE5', '#15171C'];
  if (v >= 0) {
    const t = maxPos > 0 ? v / maxPos : 0;
    return t > 0.75 ? ['#9E1C1F', '#FFFFFF'] : t > 0.5 ? ['#D9534F', '#FFFFFF'] : t > 0.25 ? ['#EFA9A3', '#15171C'] : ['#F7DCD8', '#15171C'];
  }
  const t = minNeg < 0 ? v / minNeg : 0;
  return t > 0.5 ? ['#1F55C4', '#FFFFFF'] : ['#C9D7F2', '#15171C'];
}

function renderCompare() {
  const exps = state.experiments;
  const trainCount = exps.filter((e) => e.period === 'train').length;
  if (!state.selected) state.selected = exps.slice(-2).map((e) => e.id);
  const sel = state.selected.filter((id) => exps.some((e) => e.id === id)).slice(0, 4);
  state.selected = sel;
  const colorOf = (id) => COLORS[sel.indexOf(id)] || 'transparent';

  const rows = exps.slice().reverse().slice(0, 30).map((e) => `
    <label class="exp">
      <input type="checkbox" data-sel="${e.id}" ${sel.includes(e.id) ? 'checked' : ''} aria-label="${esc(e.name)} 비교에 표시">
      <span class="body">
        <span class="nm"><span class="sw" style="background:${colorOf(e.id)}"></span>${e.period === 'test' ? '<span class="tag">검증</span>' : ''}<span class="t">${esc(e.name)}</span></span>
        <span class="nums"><span>CAGR <b class="${tone(e.metrics.cagr)}">${pct(e.metrics.cagr)}</b></span><span>MDD <b class="down">${pct(e.metrics.mdd)}</b></span><span>거래 <b>${e.metrics.trades}</b></span><span>${fmtTime(e.at)}</span></span>
      </span>
      <button class="icon-btn" type="button" data-act="load" data-id="${e.id}" aria-label="${esc(e.name)} 조건 불러오기">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 13h10M8 3v7M5 7l3 3 3-3"/></svg></button>
    </label>`).join('');

  let overlay = '';
  if (sel.length) {
    const series = sel.map((id) => {
      const e = exps.find((x) => x.id === id);
      return { label: e.name, values: curveFor(e), color: colorOf(id), width: 2, dash: e.period === 'test' ? '4 3' : '' };
    });
    overlay = lineChart(series, { h: 130, zeroLine: true });
  }

  // 히트맵
  const s = state.strategy;
  const axes = heatAxesFor(s);
  let heatHtml;
  if (!axes) {
    heatHtml = '<p class="muted" style="margin:0">숫자 조건이 2개 이상 있어야 히트맵을 만들 수 있어요.</p>';
  } else {
    const opts = (cur) => s.conds.filter((c) => FEATURES[c.f].kind !== 'bool')
      .map((c) => `<option value="${c.f}" ${c.f === cur ? 'selected' : ''}>${esc(FEATURES[c.f].label)}</option>`).join('');
    const fresh = state.heat && state.heat.hash === hashStrategy(s) && state.heat.fx === axes[0] && state.heat.fy === axes[1];
    let grid = '';
    if (fresh) {
      const h = state.heat;
      const all = h.cells.flat();
      const maxPos = Math.max(0, ...all.map((c) => c.cagr));
      const minNeg = Math.min(0, ...all.map((c) => c.cagr));
      const tpl = `grid-template-columns: 52px repeat(${h.xs.length}, minmax(0, 1fr))`;
      const Fx = FEATURES[h.fx], Fy = FEATURES[h.fy];
      grid = `<div class="heat" style="${tpl}"><span class="lab">${esc(Fy.unit)}＼${esc(Fx.unit)}</span>${h.xs.map((x) => `<span class="lab">${x}</span>`).join('')}</div>`;
      grid += h.cells.map((row, j) => `<div class="heat" style="${tpl}"><span class="lab">${h.ys[j]}</span>${row.map((c, i) => {
        const [bg, fg] = heatColor(c.cagr, maxPos, minNeg);
        const picked = state.heatPick && state.heatPick[0] === i && state.heatPick[1] === j;
        const isCur = c.vx === h.cur[0] && c.vy === h.cur[1];
        return `<button type="button" data-act="cell" data-i="${i}" data-j="${j}" aria-pressed="${picked}" class="${c.trades < 50 ? 'thin' : ''}"
          style="background-color:${bg};color:${fg}${isCur && !picked ? ';border-color:#5A5F6B;border-style:dashed' : ''}"
          aria-label="${esc(Fx.label)} ${c.vx}, ${esc(Fy.label)} ${c.vy}: CAGR ${pct(c.cagr)}">${(c.cagr * 100).toFixed(1).replace('-', '−')}</button>`;
      }).join('')}</div>`).join('');
      let note = '점선 칸이 지금 전략이에요. 칸을 누르면 자세히 볼 수 있어요.';
      if (state.heatPick) {
        const c = h.cells[state.heatPick[1]][state.heatPick[0]];
        note = `${esc(Fx.label)} ${c.vx}${esc(Fx.unit)} · ${esc(Fy.label)} ${c.vy}${esc(Fy.unit)} → CAGR ${pct(c.cagr)}, MDD ${pct(c.mdd)}, 거래 ${c.trades}건${c.trades < 50 ? ' · 거래가 적어 신뢰도 낮음' : ''}`;
        note += `<br><button class="btn" type="button" data-act="applyheat" style="margin-top:8px;height:40px">이 값으로 전략 바꾸기</button>`;
      }
      grid += `<div class="note">${note}</div>`;
    }
    heatHtml = `
      <div class="sel2">
        <label class="field">가로<select data-hx>${opts(axes[0])}</select></label>
        <label class="field">세로<select data-hy>${opts(axes[1])}</select></label></div>
      ${grid || ''}
      <button class="btn" type="button" data-act="heat">${fresh ? '다시 계산' : '히트맵 계산 (학습 구간 25회 실행)'}</button>
      <p class="muted" style="margin:0;font-size:12px">진한 칸이 한 점이 아니라 넓게 모여 있어야 믿을 만해요. 이웃 칸과 차이가 크면 과최적화 신호예요. 빗금 칸은 거래 50건 미만이에요.</p>`;
  }

  // 검증 구간
  const hash = hashStrategy(s);
  const lock = state.locks[hash];
  const tp = state.ds.meta.periods.test;
  let testHtml;
  if (lock) {
    testHtml = `<p class="muted" style="margin:0">${esc(lock.name)} — ${fmtTime(lock.at)}에 확인함. CAGR ${pct(lock.cagr)}, MDD ${pct(lock.mdd)}, 거래 ${lock.trades}건. 조건을 바꾸면 새 전략으로 다시 검증할 수 있어요.</p>
      <button class="btn ghost-dark" type="button" data-act="showtest">검증 결과 다시 보기</button>`;
  } else if (state.confirmTest) {
    testHtml = `<p class="muted" style="margin:0">${esc(s.name)} 을(를) 검증 구간에서 실행합니다. 이 조건 조합은 한 번만 확인할 수 있고, 이후 수정하면 새 전략으로 기록돼요.</p>
      <div class="btn-row"><button class="btn ghost-dark" type="button" data-act="canceltest">취소</button>
      <button class="btn primary" type="button" data-act="runtest" style="height:48px;font-size:15px">확정하고 실행</button></div>`;
  } else {
    testHtml = `<p class="muted" style="margin:0">조건을 확정한 전략만 한 번 확인하세요. 여기서 본 결과로 다시 조건을 고치면 검증의 의미가 사라져요.</p>
      <button class="btn ghost-dark" type="button" data-act="asktest">지금 전략 최종 검증…</button>`;
  }

  $screen.innerHTML = `
    <div class="eyebrow"><span class="label">학습 구간 기록</span>${state.ds.meta.source === 'sample' ? '<span class="badge warn">가상 데이터</span>' : ''}</div>
    <h1>실험 비교</h1>
    <p class="muted" style="margin:0">학습 구간 실험 <b class="mono" style="color:var(--ink)">${trainCount}</b>회 · 많이 돌릴수록 최고 결과는 부풀려져요</p>

    <div class="card flush">
      ${exps.length ? `${rows}
        <div style="padding:8px 8px 4px">${overlay || '<p class="muted" style="margin:0 8px">비교할 실험을 체크하세요 (최대 4개).</p>'}</div>`
        : '<div class="empty"><p class="muted">아직 실험 기록이 없어요.</p><a class="btn" href="#strategy">전략 만들러 가기</a></div>'}
    </div>
    ${exps.length ? '<button class="btn" type="button" data-act="clear" style="height:40px;font-size:13px;color:var(--sub)">실험 기록 모두 지우기</button>' : ''}

    <div class="card">
      <div class="row"><h2 style="font-size:15px">안정성 히트맵 · CAGR (%)</h2></div>
      <p class="muted" style="margin:0">지금 전략(${esc(s.name)})의 두 조건을 바꿔가며 학습 구간 결과를 봐요.</p>
      ${heatHtml}
    </div>

    <div class="card dark">
      <div style="display:flex;align-items:center;gap:8px">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="8" width="11" height="8" rx="1.5"/><path d="M6 8V5.5a3 3 0 016 0V8"/></svg>
        <h2 style="font-size:15px">검증 구간 ${tp[0].slice(0, 4)}–${tp[1].slice(0, 4)}</h2>
        <span class="mono" style="margin-left:auto;font-size:12px;color:#CFCCC2">${lock ? 1 : 0}/1회</span></div>
      ${testHtml}
    </div>`;
}

// ───────────────────────────────────────── 라우팅 · 이벤트
function render() {
  const tab = (location.hash || '#strategy').slice(1);
  document.querySelectorAll('.tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
  if (!state.ds) return;
  if (tab === 'results') renderResults();
  else if (tab === 'compare') renderCompare();
  else renderStrategy();
}

function go(tab) {
  if (location.hash === '#' + tab) render();
  else location.hash = tab;
  window.scrollTo(0, 0);
}

$screen.addEventListener('input', (ev) => {
  const t = ev.target;
  const s = state.strategy;
  if (t.dataset.ci != null) {
    const i = +t.dataset.ci;
    const c = s.conds[i];
    if (t.dataset.part != null) { c.v = [...c.v]; c.v[+t.dataset.part] = +t.value; } else c.v = +t.value;
    document.getElementById(`cv-${i}`).textContent = fmtVal(c.f, c.v);
    updatePreview();
  } else if (t.dataset.name != null) {
    s.name = t.value;
  }
});

$screen.addEventListener('change', (ev) => {
  const t = ev.target;
  const s = state.strategy;
  if (t.dataset.num) {
    const [a, b] = t.dataset.num.split('.');
    const v = parseFloat(t.value);
    if (isFinite(v) && v >= 0) s[a][b] = v;
    saveStrategy();
    if (a === 'costs') renderStrategy();
  } else if (t.dataset.rank != null) {
    s.rankBy = t.value; saveStrategy();
  } else if (t.dataset.sel) {
    const id = t.dataset.sel;
    state.selected = t.checked ? [...state.selected, id].slice(-4) : state.selected.filter((x) => x !== id);
    renderCompare();
  } else if (t.dataset.hx != null || t.dataset.hy != null) {
    const axes = heatAxesFor(s).slice();
    axes[t.dataset.hx != null ? 0 : 1] = t.value;
    if (axes[0] === axes[1]) { toast('가로와 세로는 서로 다른 조건이어야 해요'); renderCompare(); return; }
    state.heatAxes = axes;
    renderCompare();
  } else {
    saveStrategy();
  }
});

$screen.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const s = state.strategy;
  const act = b.dataset.act;
  if (act === 'rm') { s.conds.splice(+b.dataset.i, 1); saveStrategy(); renderStrategy(); }
  else if (act === 'add') {
    const f = $screen.querySelector(`[data-add="${b.dataset.sec}"]`).value;
    const F = FEATURES[f];
    s.conds.push({ f, v: F.kind === 'range' ? [...F.def] : F.kind === 'bool' ? 1 : F.def });
    saveStrategy(); renderStrategy();
  } else if (act === 'exit') { s.exit.model = b.dataset.v; saveStrategy(); renderStrategy(); }
  else if (act === 'pos') { s.maxPos = Math.min(10, Math.max(1, s.maxPos + +b.dataset.d)); saveStrategy(); renderStrategy(); }
  else if (act === 'run') {
    if (!s.conds.length) { toast('조건을 하나 이상 추가하세요'); return; }
    saveStrategy(); runBacktest('train'); go('results');
  } else if (act === 'trade') {
    const i = +b.dataset.i;
    state.openTrade = state.openTrade === i ? null : i;
    renderResults();
  } else if (act === 'more') { state.tradeLimit += 20; renderResults(); }
  else if (act === 'yaml') { state.showYaml = !state.showYaml; renderResults(); }
  else if (act === 'copyyaml') {
    const text = $screen.querySelector('textarea.export').value;
    (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast('복사했어요'), () => {
      $screen.querySelector('textarea.export').select(); toast('길게 눌러 복사하세요');
    });
  } else if (act === 'load') {
    const e = state.experiments.find((x) => x.id === b.dataset.id);
    if (e) { state.strategy = structuredClone(e.strategy); state.strategy.name = e.name; saveStrategy(); toast(`'${e.name}' 조건을 불러왔어요`); go('strategy'); }
    ev.preventDefault();
  } else if (act === 'clear') {
    if (confirm('실험 기록을 모두 지울까요? 검증 구간 잠금은 유지돼요.')) {
      state.experiments = []; state.selected = []; state.curveCache.clear(); state.last = null;
      store.set('experiments', []); renderCompare();
    }
  } else if (act === 'heat') {
    b.disabled = true; b.textContent = '계산 중…';
    setTimeout(() => { computeHeat(); renderCompare(); }, 30);
  } else if (act === 'cell') { state.heatPick = [+b.dataset.i, +b.dataset.j]; renderCompare(); }
  else if (act === 'applyheat') {
    const h = state.heat;
    const c = h.cells[state.heatPick[1]][state.heatPick[0]];
    s.conds = s.conds.map((k) => {
      const v = k.f === h.fx ? c.vx : k.f === h.fy ? c.vy : null;
      if (v == null) return k;
      return FEATURES[k.f].kind === 'range' ? { ...k, v: [v, Math.max(...k.v)] } : { ...k, v };
    });
    saveStrategy(); toast('전략 조건을 바꿨어요'); go('strategy');
  } else if (act === 'asktest') { state.confirmTest = true; renderCompare(); }
  else if (act === 'canceltest') { state.confirmTest = false; renderCompare(); }
  else if (act === 'runtest') {
    const exp = runBacktest('test');
    state.locks[exp.hash] = { name: exp.name, at: exp.at, id: exp.id, cagr: exp.metrics.cagr, mdd: exp.metrics.mdd, trades: exp.metrics.trades };
    store.set('locks', state.locks);
    state.confirmTest = false;
    go('results');
  } else if (act === 'showtest') {
    const lock = state.locks[hashStrategy(s)];
    const e = state.experiments.find((x) => x.id === lock.id);
    const strat = e ? e.strategy : s;
    state.last = { exp: e || { name: lock.name, period: 'test', strategy: strat }, res: E.run(state.ds, toCfg(strat, 'test')) };
    go('results');
  }
});

window.addEventListener('hashchange', render);

// ───────────────────────────────────────── 시작
async function boot() {
  render();
  try {
    const [meta, buf] = await Promise.all([
      fetch('data/meta.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('meta.json ' + r.status); return r.json(); }),
      fetch('data/rows.bin', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('rows.bin ' + r.status); return r.arrayBuffer(); }),
    ]);
    state.ds = E.loadDataset(meta, buf);
    FEATURES.change_pct.min = meta.prefilter.change_pct_min;
    FEATURES.trade_value.min = meta.prefilter.trade_value_eok_min;
    // 저장된 전략에 없어진 지표가 있으면 제거
    state.strategy.conds = state.strategy.conds.filter((c) => FEATURES[c.f]);
    render();
  } catch (e) {
    $screen.innerHTML = `<h1>데이터를 불러오지 못했어요</h1><p class="muted">${esc(e.message)}</p>
      <p class="muted">GitHub Actions 의 데이터 생성 작업이 끝났는지 확인해 주세요.</p>
      <button class="btn" type="button" onclick="location.reload()">다시 시도</button>`;
  }
}
boot();
