// Node 에서 웹 엔진을 실행합니다 (파이썬과 결과 비교용).
// 사용: node scripts/web_backtest.mjs <data_dir> '<config json>'
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDataset, run } from '../web/engine.js';

const [dir, cfgJson] = process.argv.slice(2);
const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
const buf = readFileSync(join(dir, 'rows.bin'));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const ds = loadDataset(meta, ab);
const res = run(ds, JSON.parse(cfgJson));
console.log(JSON.stringify({ metrics: res.metrics, yearly: res.yearly, nDays: res.daily.length }));
