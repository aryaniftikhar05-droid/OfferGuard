import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareModel,predict,assess,findEvidence,parseCSV,csvCell} from '../dist/assets/engine.js';
const model=prepareModel(JSON.parse(readFileSync(new URL('../dist/assets/model.json',import.meta.url))));
const fixtures=JSON.parse(readFileSync(new URL('parity-fixtures.json',import.meta.url)));
test('Exported model matches scikit-learn predictions',()=>{
  for(const f of fixtures)assert.ok(Math.abs(predict(f.text,model).score-f.score)<1e-10,`Parity mismatch: ${f.text}`);
});
test('Payment request is flagged even when the model abstains',()=>{
  const r=assess('Pay a registration fee of £150 before starting.',model);
  assert.equal(r.level,'high');assert.equal(r.abstained,true);assert.equal(r.evidence[0].id,'payment');
});
test('Explicit no-fee policy is not treated as a payment request',()=>{
  for(const s of ['We never ask candidates to pay a recruitment fee.','Do not pay a registration fee.','We do not require applicants to pay a training fee.','No registration fee is required.'])
    assert.equal(findEvidence(s).some(e=>e.id==='payment'),false,s);
});
test('A negated clause does not suppress a separate positive request',()=>{
  const s='We never ask for deposits. Pay a training fee of £100 before starting.';
  assert.equal(findEvidence(s).some(e=>e.id==='payment'),true);
});
test('Personal-account transfers are a high severity signal',()=>{
  assert.equal(assess('Receive customer payments through your personal bank account.',model).level,'high');
});
test('Very short text is withheld, not cleared',()=>{
  const r=assess('Hello, interested?',model);assert.equal(r.abstained,true);assert.equal(r.level,'insufficient');
});
test('Unsupported language does not receive a model recommendation',()=>{
  const r=assess('هذه رسالة توظيف باللغة العربية وليست باللغة الإنجليزية. '.repeat(12),model);
  assert.equal(r.abstained,true);
});
test('Invalid and oversized input rejected',()=>{
  assert.throws(()=>assess('',model));assert.throws(()=>assess('x'.repeat(30001),model));
});
test('CSV handles quoted commas, newlines, escaped quotes and CRLF',()=>{
  assert.deepEqual(parseCSV('id,text\r\n1,"hello, world\nnew ""line"""\r\n'),[['id','text'],['1','hello, world\nnew "line"']]);
  assert.throws(()=>parseCSV('id,text\n1,"broken'));
});
test('CSV export blocks spreadsheet formula injection',()=>{
  assert.equal(csvCell('=HYPERLINK("evil")'),'"\'=HYPERLINK(""evil"")"');
  assert.ok(csvCell('  +SUM(A1)').startsWith('"\''));
});
test('Input is treated as text and never executed by the engine',()=>{
  const r=assess('<img src=x onerror="alert(1)"> Pay a registration fee.',model);
  assert.equal(r.level,'high');assert.equal(r.evidence[0].quote.includes('<img'),false);
});
test('Historical evaluation counts are internally consistent',()=>{
  const r=JSON.parse(readFileSync(new URL('../dist/assets/evaluation.json',import.meta.url)));
  const c=r.test.confusion;assert.equal(Object.values(c).reduce((a,b)=>a+b),r.split.test.rows);
  assert.equal(c.true_positive+c.false_negative,r.split.test.scams);
  const split=JSON.parse(readFileSync(new URL('../ml/split.json',import.meta.url)));
  const all=Object.values(split).flat();assert.equal(all.length,new Set(all).size);assert.equal(all.length,r.dataset.total);
});
test('Highlights evidence sentences and keeps the full text',async()=>{
  const {highlightSegments}=await import('../dist/assets/engine.js');
  const text='Thanks for applying. Pay a registration fee of £150 before starting. Welcome!';
  const r=assess(text,model), segs=highlightSegments(text,r);
  assert.equal(segs.map(s=>s.text).join(''),text);
  const marked=segs.filter(s=>s.kind==='evidence-high').map(s=>s.text).join('');
  assert.match(marked,/registration fee of £150/);
  assert.equal(segs.find(s=>s.text.includes('Thanks')).kind,null);
});
test('Highlights model terms only when the model did not abstain',async()=>{
  const {highlightSegments}=await import('../dist/assets/engine.js');
  const text='Work from home data entry. Earn weekly cash. No experience needed. '.repeat(6);
  const r=assess(text,model), segs=highlightSegments(text,r);
  assert.equal(segs.map(s=>s.text).join(''),text);
  if(!r.abstained&&r.model.influences.length)assert.ok(segs.some(s=>s.kind==='model'));
  const short=assess('Pay a registration fee of £150 before starting.',model);
  assert.ok(highlightSegments('Pay a registration fee of £150 before starting.',short).every(s=>s.kind!=='model'));
});
