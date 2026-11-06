import {prepareModel, assess, parseCSV, csvCell} from './engine.js';

const icons={
 scan:'<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M7 12h10m-5-5v10"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
 chart:'<path d="M4 3v17h17M8 15v-4m5 4V7m5 8v-6"/>',
 code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 20"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
 file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8m-8 4h5"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 cpu:'<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 1v5m6-5v5M9 18v5m6-5v5M1 9h5m-5 6h5m12-6h5m-5 6h5"/><rect x="10" y="10" width="4" height="4" rx="1"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 warning:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.1"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>'
};
const svg=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.info}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=svg(el.dataset.icon));
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pct=value=>(100*value).toFixed(1)+'%';
let model=null,report=null,currentResult=null,batch=[];

const examples={
 payment:`Remote Office Assistant\n\nWe are recruiting reliable assistants to organise schedules and support our growing team from home. No previous office experience is needed and full training is provided. You can choose flexible working hours and receive weekly pay.\n\nTo secure your equipment, pay a registration fee of £150 before starting. Send your passport copy through WhatsApp for quick verification. Pay today to reserve one of our limited slots. You will be added to the team after confirmation of payment.`,
 ordinary:`Junior Software Engineer\n\nWe are looking for a junior developer to help maintain our internal Python services. You will work with a small engineering team, fix bugs, write automated tests and review code with a mentor.\n\nThe role involves SQL, Git and REST APIs. Applicants should be able to explain a small project they have built. The recruitment process consists of an introductory call and a practical technical interview.\n\nApply through the company careers website. We never ask applicants to pay a recruitment fee. Salary and working arrangements will be discussed during the interview.`,
 subtle:`Operations Coordinator\n\nOur regional services team is seeking an organised coordinator to support customer enquiries, maintain internal records and arrange weekly meetings. The role includes a structured induction and regular support from a line manager. Strong written communication and careful attention to detail are required.\n\nShortlisted applicants will receive a video interview invitation. The successful candidate will be asked to pay a refundable training fee of £240 before joining. Contact our recruitment coordinator to arrange payment and complete your onboarding. This charge will be returned after the first month of employment.`
};

const pageNames={analyse:'Analyse an offer',batch:'Batch review',report:'Model report',project:'Inside the project'};
function navigate(){
  const page=location.hash.slice(1) in pageNames?location.hash.slice(1):'analyse';
  Object.keys(pageNames).forEach(name=>{$('page-'+name).hidden=name!==page;});
  document.querySelectorAll('.nav-link').forEach(link=>{const selected=link.dataset.page===page;link.classList.toggle('active',selected);if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  $('current-page').textContent=pageNames[page];
}
addEventListener('hashchange',navigate);navigate();

function download(filename,text,mime='application/json'){
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function error(message){$('input-error').textContent=message;$('input-error').hidden=!message;}
function updateCount(){$('char-count').textContent=$('offer-text').value.length.toLocaleString('en-GB')+' / 30,000';error('');}
function resetResult(){
  currentResult=null;
  $('result-panel').innerHTML=`<div class="result-empty"><div class="empty-icon">${svg('search')}</div><h2>Ready for a fresh look.</h2><p>Review the text, then select Analyse text.</p><div class="empty-footnote">No score can prove an offer is genuine.</div></div>`;
}
$('offer-text').addEventListener('input',()=>{updateCount();if(currentResult)resetResult();});
document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{
  $('offer-text').value=examples[button.dataset.example];updateCount();resetResult();$('offer-text').focus();
}));
$('text-upload').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  if(file.size>150000){error('Use a plain text file smaller than 150 KB.');event.target.value='';return;}
  try{const text=await file.text();if(text.length>30000)throw new Error('The file has more than 30,000 characters. Paste a shorter extract.');$('offer-text').value=text;updateCount();resetResult();}
  catch(e){error(e.message);}finally{event.target.value='';}
});

function renderResult(result){
  const n=result.evidence.length;
  const desc=result.level==='high'?`${n} explicit warning ${n===1?'signal':'signals'} found. Verify the request before sending money, documents or a reply.`:
    result.level==='review'?result.modelFlagged&&!n?'The historical text model raised a concern. No explicit policy warning was matched; inspect the context and verify the recruiter.':`${n} ${n===1?'signal deserves':'signals deserve'} an independent check. A matched phrase alone does not establish fraud.`:
    result.level==='insufficient'?'The model is withholding a recommendation. Any explicit warning signs are still checked.':'No strong policy warning matched this text. This result does not establish that the opportunity is genuine.';
  const scoreSection=result.abstained?`<div class="score-line"><span>Text model</span><strong>Withheld</strong></div><p class="score-explainer">${result.abstentionReasons.map(esc).join(' ')} The evidence checks below still apply.</p>`:
    `<div class="score-line"><span>Historical text-model score</span><span class="score-value">${Math.round(result.model.score*100)}<small>/ 100</small></span></div><div class="score-bar"><span style="width:${result.model.score*100}%"></span><i style="left:${model.threshold*100}%" title="Historical review threshold"></i></div><p class="score-explainer">A score from the old training population, not the probability this offer is a scam. Review threshold: ${Math.round(model.threshold*100)}/100. The model’s recommendation ${result.modelFlagged?'crossed':'did not cross'} that threshold.</p>`;
  const signals=n?result.evidence.map(e=>`<article class="evidence-item ${e.severity}"><h3>${esc(e.title)}</h3><blockquote>“${esc(e.quote)}”</blockquote><p>${esc(e.advice)}</p><a href="${esc(e.source)}" target="_blank" rel="noopener noreferrer">Related official guidance ↗</a></article>`).join(''):
    `<p class="no-evidence">No explicit policy match was found. The checks cover a limited set of patterns and can miss subtle or reworded requests.</p>`;
  const influenceSection=result.abstained?'':`<details class="influence-details"><summary>What influenced the learned model <span>+</span></summary><p>These words increased the model’s score in this text. They reflect historical correlations, not verified facts or proof of fraud. Scores also include other terms and the model’s baseline.</p><div class="influence-terms">${result.model.influences.length?result.model.influences.map(t=>`<span title="Contribution to pre-calibration log-odds: ${t.value.toFixed(4)}">${esc(t.term)}</span>`).join(''):'No positive term contributions.'}</div></details>`;
  $('result-panel').innerHTML=`<div class="result-content"><div class="result-top"><span class="section-label">YOUR TEXT REVIEW</span><button class="text-button" id="clear-review">Clear</button></div><div class="verdict ${result.level}"><span class="verdict-icon">${svg(result.level==='low'?'search':result.level==='insufficient'?'info':'warning')}</span><h2>${esc(result.label)}</h2><p>${esc(desc)}</p></div>${scoreSection}<div class="evidence-heading"><h3>Evidence checks <span>· ${n}</span></h3><small>Separate from ML</small></div>${signals}${influenceSection}<div class="next-step"><strong>YOUR NEXT STEP</strong><p>Find the employer’s official website independently. Use its published contact details to confirm the role and recruiter. An existing company can still be impersonated.</p></div><div class="result-actions"><button id="export-review" class="text-button">Export review ↓</button><small>Text review · ${esc(result.version)}</small></div></div>`;
  $('clear-review').onclick=()=>{$('offer-text').value='';updateCount();resetResult();$('offer-text').focus();};
  $('export-review').onclick=()=>download('offerguard-review.json',JSON.stringify({
    ...result,model:result.abstained?{withheld:true,wordCount:result.model.wordCount}:result.model,
    privacy:'Original input omitted. Matched evidence excerpts are included. No company or identity verification performed.'
  },null,2));
}
$('analyse-button').addEventListener('click',()=>{
  if(!model)return;error('');
  try{currentResult=assess($('offer-text').value,model);renderResult(currentResult);if(innerWidth<951)$('result-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  catch(e){error(e.message);}
});

function renderReport(r){
  const c=r.test.confusion,split=r.split;
  $('model-report').innerHTML=`<div class="metric-grid"><div class="card metric-card"><small>HELD-OUT SCAMS CAUGHT · RECALL</small><div class="metric-value">${pct(r.test.recall)}</div><p>${c.true_positive} of ${c.true_positive+c.false_negative} labelled scams were flagged.<br>${c.false_negative} were missed.</p></div><div class="card metric-card"><small>FLAGGED ADS LABELLED SCAM · PRECISION</small><div class="metric-value">${pct(r.test.precision)}</div><p>${c.true_positive} of ${c.true_positive+c.false_positive} flagged adverts were scams.<br>${c.false_positive} were false alarms.</p></div><div class="card metric-card"><small>LEGITIMATE ADVERTS FALSELY FLAGGED</small><div class="metric-value">${pct(r.test.false_positive_rate)}</div><p>${c.false_positive} of ${c.true_negative+c.false_positive} legitimate adverts.<br>At the locked ${Math.round(r.threshold*100)}/100 review threshold.</p></div></div>
  <div class="report-grid"><div class="card report-card"><h2>What happened on the test set?</h2><p>3,576 held-out adverts. These are results for the statistical text model alone, before evidence rules and input abstention.</p><div class="matrix"><div class="matrix-cell"><strong>${c.true_positive}</strong><span>Scams correctly flagged</span></div><div class="matrix-cell warn"><strong>${c.false_negative}</strong><span>Scams missed</span></div><div class="matrix-cell warn"><strong>${c.false_positive}</strong><span>Legitimate adverts flagged</span></div><div class="matrix-cell"><strong>${c.true_negative.toLocaleString('en-GB')}</strong><span>Legitimate adverts not flagged</span></div></div><p class="small-muted">Average precision: ${r.test.average_precision.toFixed(3)}. Positive prevalence baseline: ${r.majority_baseline.average_precision.toFixed(3)}. Brier score: ${r.test.brier.toFixed(3)}.</p></div>
  <div class="card report-card"><h2>A split that asks a harder question.</h2><p>Could this model generalise beyond recurring company profiles and identical advert descriptions?</p>${Object.entries(split).map(([key,value])=>`<div class="split-row"><span class="split-label">${key==='calibration'?'Calibration':key==='train'?'Training':'Test'}</span><div class="split-bar"><span style="width:${value.rows/r.dataset.total*100}%"></span></div><small>${value.rows.toLocaleString('en-GB')}</small></div>`).join('')}<p style="margin-top:22px">Matching normalised company profiles and exact descriptions are grouped together, with no group shared across folds. Unknown companies and near-duplicates may still overlap.</p><p>TF-IDF is fitted on training text only. A held-out development fold calibrates scores and chooses an F2 threshold. The test fold is scored afterward.</p></div></div>
  <div class="report-note"><strong>Why “95% accurate” would be misleading here.</strong> Always predicting “legitimate” gets ${pct(r.majority_baseline.accuracy)} accuracy on this test set while catching zero scams. Recall, precision and missed cases show the practical trade-off.</div>
  <div class="card report-card report-full"><h2>Where the model is weakest</h2><p>The test set has just ${r.slices.uk?.scams||0} UK scams, and the model flagged ${r.slices.uk?.confusion.true_positive||0} of them. That sample is far too small to establish UK effectiveness. Remote-role recall was ${pct(r.slices.remote.recall)} across only ${r.slices.remote.scams} scams. These are gaps, not validated specialities.</p><ul>${r.limits.map(limit=>`<li>${esc(limit)}</li>`).join('')}</ul><p>No production safety claim is supported by this benchmark. The next research milestone is a consented, recent, independently labelled evaluation.</p></div>
  <div class="report-download"><a href="assets/evaluation.json" download>Download full evaluation JSON ↓</a><a href="https://doi.org/10.3390/fi9010006" target="_blank" rel="noopener noreferrer">Original dataset paper ↗</a><span>${r.features.toLocaleString('en-GB')} features · ${esc(r.model_version)}</span></div>`;
}

$('csv-upload').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  $('batch-message').textContent='';$('batch-results').innerHTML='';batch=[];
  try{
    if(!model)throw new Error('Wait for the model to load, then import the CSV again.');
    if(file.size>2*1024*1024)throw new Error('Choose a CSV smaller than 2 MB.');
    const rows=parseCSV((await file.text()).replace(/^\uFEFF/,''));
    if(rows.length<2)throw new Error('The CSV needs a header and at least one advert.');
    const header=rows.shift().map(v=>v.trim().toLowerCase()),textIndex=header.indexOf('text'),idIndex=header.indexOf('id');
    if(textIndex<0)throw new Error('Add a column named text with the full advert in each row.');
    if(rows.length>100)throw new Error('Import no more than 100 adverts at a time.');
    $('batch-message').textContent='Analysing '+rows.length+' adverts on this device…';
    await new Promise(resolve=>setTimeout(resolve,0));
    for(let i=0;i<rows.length;i++){
      const row=rows[i],id=idIndex>=0?row[idIndex]||String(i+1):String(i+1);
      try{batch.push({id,result:assess(row[textIndex]||'',model)});}catch(e){batch.push({id,error:e.message});}
      if(i%10===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    $('batch-message').textContent=`${rows.length} rows reviewed. Results stay in this page until you leave or refresh. The combined screening policy has not been benchmarked.`;
    $('batch-results').innerHTML=`<div class="batch-toolbar"><h2>Your review queue</h2><button id="export-batch" class="secondary-button">Export CSV ↓</button></div><div class="card table-wrap"><table><thead><tr><th>Advert ID</th><th>Review outcome</th><th>Historical ML score</th><th>Evidence checks</th></tr></thead><tbody>${batch.map(({id,result,error})=>`<tr><td>${esc(id)}</td><td>${result?`<span class="level-badge ${result.level}">${esc(result.label)}</span>`:esc(error)}</td><td>${result?result.abstained?'Withheld':Math.round(result.model.score*100)+'/100':'—'}</td><td>${result?result.evidence.length:'—'}</td></tr>`).join('')}</tbody></table></div>`;
    $('export-batch').onclick=()=>{
      const lines=[['id','outcome','historical_model_score','evidence_checks','warnings','model_version','limitations'],...batch.map(({id,result,error})=>result?[id,result.label,result.abstained?'withheld':result.model.score.toFixed(5),result.evidence.length,result.evidence.map(e=>e.title).join('; '),result.version,result.caution]:[id,error,'','','','','Invalid input'])];
      download('offerguard-batch.csv',lines.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
    };
  }catch(e){$('batch-message').textContent=e.message;}
  finally{event.target.value='';}
});

async function boot(){
  try{
    const responses=await Promise.all([fetch('assets/model.json'),fetch('assets/evaluation.json')]);
    if(responses.some(r=>!r.ok))throw new Error('Model assets could not be downloaded.');
    const [raw,r]=await Promise.all(responses.map(r=>r.json()));model=prepareModel(raw);report=r;
    $('analyse-button').disabled=false;$('button-label').textContent='Analyse text';renderReport(report);
  }catch(e){error(e.message+' Refresh the page to retry.');$('button-label').textContent='Model unavailable';$('model-report').textContent='The evaluation could not be loaded. Refresh the page to retry.';}
}
boot();
