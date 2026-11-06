// The deployed model is a real TF-IDF + logistic model exported from scikit-learn.
// This module has no DOM or network dependency, so inference can be parity-tested.
const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
export function normalize(text) {
  return String(text).normalize('NFKC').toLowerCase().replace(/<[^>]*>/g,' ')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_,key)=>entities[key])
    .replace(/\\[rn]/g,' ').replace(/\s+/g,' ').trim();
}
export function tokenize(text) { return normalize(text).match(/\b[a-z][a-z0-9]{1,}\b/g)||[]; }
export function prepareModel(raw) {
  return {...raw, index:new Map(raw.features.map((term,i)=>[term,i]))};
}
const sigmoid=x=> x>=0 ? 1/(1+Math.exp(-x)) : Math.exp(x)/(1+Math.exp(x));
export function predict(text,model) {
  const words=tokenize(text), counts=new Map(); let known=0;
  const add=term=>{const i=model.index.get(term);if(i!==undefined)counts.set(i,(counts.get(i)||0)+1);};
  words.forEach((word,i)=>{if(model.index.has(word))known++;add(word);if(i)add(words[i-1]+' '+word);});
  const values=[...counts].map(([i,count])=>[i,(1+Math.log(count))*model.idf[i]]);
  const norm=Math.sqrt(values.reduce((sum,[,v])=>sum+v*v,0))||1;
  const contributions=values.map(([i,value])=>({term:model.features[i],value:value/norm*model.weights[i]}));
  const logit=model.bias+contributions.reduce((sum,c)=>sum+c.value,0);
  const p=sigmoid(model.calibration.slope*logit+model.calibration.intercept);
  return {score:p,logit,wordCount:words.length,coverage:words.length?known/words.length:0,
    influences:contributions.filter(c=>c.value>0).sort((a,b)=>b.value-a.value).slice(0,6)};
}

const SOURCE='https://www.reportfraud.police.uk/recruitment-scams/';
const PRESSURE='https://www.ncsc.gov.uk/collection/phishing-scams/spot-scams';
// Human-readable evidence policies, not outputs from the statistical model.
const policies=[
  {id:'payment',title:'Payment requested during recruitment',severity:'high',
   pattern:/\b(?:pay|send|transfer|deposit|purchase|buy|payment|required|charged)\b.{0,75}\b(?:fee|deposit|equipment|training|registration|processing|crypto|bitcoin|gift card|permit)\b|\b(?:registration|processing|administration|security|visa|training)\s+fee\b.{0,45}\b(?:required|payable|pay|send|transfer|before|upfront)\b/i,
   advice:'Confirm any requested charge independently with the employer. Do not use contact details supplied only in the message.',source:SOURCE},
  {id:'mule',title:'Personal account used to move money',severity:'high',
   pattern:/\b(?:receive|transfer|forward|process|move)\b.{0,65}\b(?:payments|funds|money)\b.{0,65}\b(?:personal|your|own)\s+(?:bank\s+)?account\b|\b(?:personal|your|own)\s+(?:bank\s+)?account\b.{0,70}\b(?:receive|transfer|forward|process)\b/i,
   advice:'Do not move an employer’s funds through your personal account. Verify the role directly with the organisation.',
   source:'https://data.actionfraud.police.uk/cms/wp-content/uploads/2020/10/NFIB-Alert-Mystery-Shopper-Recruitment-Scams.pdf'},
  {id:'identity',title:'Identity documents requested over chat',severity:'medium',
   pattern:/\b(?:send|upload|share|provide)\b.{0,70}\b(?:passport|driving licen[cs]e|identity card|bank details)\b.{0,80}\b(?:whatsapp|telegram|chat)\b|\b(?:whatsapp|telegram)\b.{0,80}\b(?:passport|bank details|identity card)\b/i,
   advice:'Confirm the recruiter and the document-handling process through the employer’s independently found official website.',source:SOURCE},
  {id:'pressure',title:'Pressure to act quickly',severity:'medium',
   pattern:/\b(?:act now|pay (?:today|now|immediately)|within (?:\d+|one|two|twenty.four) hours|offer expires|limited slots|last chance)\b/i,
   advice:'Pause and verify the opportunity through an independent contact before acting.',source:PRESSURE},
  {id:'guarantee',title:'An unconditional job or visa guarantee',severity:'medium',
   pattern:/\b(?:guaranteed|guarantee)\b.{0,35}\b(?:visa|job|employment|sponsorship|approval)\b|\b(?:visa|job|employment|sponsorship)\s+(?:is\s+)?guaranteed\b/i,
   advice:'Treat the guarantee as an unverified claim. Check the employer and the relevant official process separately.',source:SOURCE},
  {id:'webmail',title:'Personal email used for recruitment',severity:'low',
   pattern:/[a-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|protonmail)\.[a-z.]{2,}/i,
   advice:'A personal email address is a prompt to verify identity, not evidence of fraud on its own.',source:SOURCE}
];

function isNegated(sentence,match) {
  const start=match.index||0, before=sentence.slice(Math.max(0,start-55),start).toLowerCase();
  const around=sentence.slice(Math.max(0,start-20),start+match[0].length).toLowerCase();
  return /\b(?:never|not|no|don't|do not|won't|will not|without)\b[^.!?;]{0,45}$/.test(before)
    || /\b(?:no fees|no payment|never pay|do not pay|don't pay|never send|do not send|don't send)\b/.test(around);
}
export function findEvidence(text) {
  // Keep each evidence excerpt within a sentence/line to limit spurious matches.
  const sentences=String(text).normalize('NFKC').replace(/<[^>]*>/g,' ').split(/(?<=[.!?;])\s+|[\r\n]+/).filter(Boolean);
  return policies.flatMap(policy=>{
    for (const sentence of sentences) {
      const match=policy.pattern.exec(sentence);
      if(match && !isNegated(sentence,match))return [{id:policy.id,title:policy.title,severity:policy.severity,
        quote:sentence.trim().slice(0,320),advice:policy.advice,source:policy.source}];
    }
    return [];
  });
}
export function assess(text,model) {
  if(typeof text!=='string'||text.length>model.max_chars)throw new Error('Use at most 30,000 characters per advert.');
  if(!text.trim())throw new Error('Paste an advert or recruitment message first.');
  const prediction=predict(text,model),evidence=findEvidence(text);
  const letterCount=(text.match(/\p{L}/gu)||[]).length;
  const ascii=(text.match(/[a-z]/gi)||[]).length;
  const reasons=[];
  if(prediction.wordCount<35)reasons.push('There are fewer than 35 words the model can read.');
  if(prediction.coverage<.45)reasons.push('Too much of this text is outside the model’s vocabulary.');
  if(letterCount&&ascii/letterCount<.65)reasons.push('This model has limited support for this language.');
  const abstained=reasons.length>0;
  const high=evidence.some(e=>e.severity==='high');
  let level=high?'high':evidence.length?'review':abstained?'insufficient':prediction.score>=model.threshold?'review':'low';
  const labels={high:'Strong warning signs',review:'Review before proceeding',insufficient:'Not enough text evidence',low:'Few text warnings found'};
  return {level,label:labels[level],model:prediction,evidence,abstained,abstentionReasons:reasons,
    modelFlagged:!abstained&&prediction.score>=model.threshold,version:model.version,
    checkedAt:new Date().toISOString(),caution:'This is a text screening result. It does not verify that the job, company or recruiter is genuine.'};
}

// RFC-style quoted CSV including commas/newlines and escaped double quotes.
export function parseCSV(text) {
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
    else if(ch==='"'&&field==='')quoted=true;
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}
    else field+=ch;
  }
  if(quoted)throw new Error('A quoted CSV field was not closed.');
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
export function csvCell(value) {
  let s=String(value??'');
  if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
