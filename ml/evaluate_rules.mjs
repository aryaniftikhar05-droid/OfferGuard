// Measure how often each evidence rule fires on labelled adverts.
//
// The evidence rules are hand-written, so they are never fitted on this data;
// this script only reports how often they fire on legitimate and fraudulent
// adverts. A rule that fires on many legitimate adverts is a false-alarm risk.
//
// Usage (after python3 ml/download_data.py):
//   node ml/evaluate_rules.mjs data/raw/emscad_v1.csv               # print rates, write ml/rule-evaluation.json
//   node ml/evaluate_rules.mjs data/raw/emscad_v1.csv --examples payment   # also print matched sentences
import {readFileSync, writeFileSync} from 'node:fs';
import {findEvidence, parseCSV} from '../dist/assets/engine.js';

// Same fields the text model is trained on (ml/train.py FIELDS).
const FIELDS = ['title', 'description', 'requirements', 'benefits'];
function loadAdverts(file) {
  const [header, ...records] = parseCSV(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const col = name => header.indexOf(name);
  if (col('fraudulent') < 0) throw new Error('Expected a "fraudulent" column (t/f or 1/0).');
  return records.map(r => ({
    text: FIELDS.map(f => r[col(f)] ?? '').join('\n'),
    y: ['t', '1'].includes(String(r[col('fraudulent')]).trim()) ? 1 : 0,
  }));
}

const [path, flag, exampleRule] = process.argv.slice(2);
if (!path) {
  console.error('Usage: node ml/evaluate_rules.mjs <emscad.csv> [--examples rule-id]');
  process.exit(1);
}
const rows = loadAdverts(path);
const totals = {legitimate: 0, fraudulent: 0};
const counts = {};
const anyHigh = {legitimate: 0, fraudulent: 0};
const anyRule = {legitimate: 0, fraudulent: 0};
const examples = [];
for (const {text, y} of rows) {
  const label = y ? 'fraudulent' : 'legitimate';
  totals[label]++;
  const evidence = findEvidence(text);
  if (evidence.length) anyRule[label]++;
  if (evidence.some(e => e.severity === 'high')) anyHigh[label]++;
  for (const e of evidence) {
    counts[e.id] ??= {severity: e.severity, legitimate: 0, fraudulent: 0};
    counts[e.id][label]++;
    if (flag === '--examples' && e.id === exampleRule && examples.length < 25) examples.push(`[${label}] ${e.quote}`);
  }
}
const rate = (n, label) => n / Math.max(1, totals[label]);
const report = {
  rows: rows.length, ...totals,
  rules: Object.fromEntries(Object.entries(counts).sort().map(([id, c]) => [id, {
    severity: c.severity,
    legitimate_fire_rate: rate(c.legitimate, 'legitimate'),
    fraudulent_fire_rate: rate(c.fraudulent, 'fraudulent'),
    legitimate: c.legitimate, fraudulent: c.fraudulent,
  }])),
  any_high: {legitimate_fire_rate: rate(anyHigh.legitimate, 'legitimate'), fraudulent_fire_rate: rate(anyHigh.fraudulent, 'fraudulent')},
  any_rule: {legitimate_fire_rate: rate(anyRule.legitimate, 'legitimate'), fraudulent_fire_rate: rate(anyRule.fraudulent, 'fraudulent')},
};
const pct = v => (100 * v).toFixed(2).padStart(6) + '%';
console.log(`${rows.length} adverts (${totals.legitimate} legitimate, ${totals.fraudulent} fraudulent)\n`);
console.log('rule          severity  legit fires  scam fires');
for (const [id, r] of Object.entries(report.rules))
  console.log(`${id.padEnd(13)} ${r.severity.padEnd(8)} ${pct(r.legitimate_fire_rate)}     ${pct(r.fraudulent_fire_rate)}`);
console.log(`${'ANY HIGH'.padEnd(22)} ${pct(report.any_high.legitimate_fire_rate)}     ${pct(report.any_high.fraudulent_fire_rate)}`);
console.log(`${'ANY RULE'.padEnd(22)} ${pct(report.any_rule.legitimate_fire_rate)}     ${pct(report.any_rule.fraudulent_fire_rate)}`);
if (examples.length) console.log('\n' + examples.join('\n'));
// Only counts are saved: no advert text is written, so the raw data stays out of the repository.
writeFileSync(new URL('rule-evaluation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
