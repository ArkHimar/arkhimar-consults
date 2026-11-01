import {carCareSalutation} from './carcare.js';

const negativeTerms=/\b(bad|poor|late|delay|rude|damage|damaged|dirty|wrong|worse|problem|issue|unhappy|disappoint|complain|refund|unsafe|danger|injur|accident|brake|fire|fraud|stolen|theft|discriminat|harass|threat|lawyer|legal|police)\b/i;
const criticalTerms=/\b(unsafe|danger|injur|accident|brake|fire|fraud|stolen|theft|discriminat|harass|threat|lawyer|legal|police)\b/i;
const positiveTerms=/\b(good|great|excellent|amazing|helpful|professional|quick|fast|happy|satisfied|thank|love|perfect|recommend)\b/i;

const clip=(value,max)=>String(value||'').trim().slice(0,max);
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const serialCustomerId=value=>/^CUS-(\d{6})$/.exec(String(value||'').trim());
const formatCustomerId=number=>`CUS-${String(number).padStart(6,'0')}`;
const initialDashboardResetAt=()=>String(process.env.CARCARE_DASHBOARD_RESET_AT||(process.env.VERCEL_ENV==='production'?'2026-09-23T17:46:48Z':'')).trim();

export async function resolveCarCareResetAt(db,workspaceId){
  let resetAt=initialDashboardResetAt();
  const {data,error}=await db.from('form_submissions').select('fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-control').order('received_at',{ascending:false}).limit(1);
  if(!error){
    const latest=String(data?.[0]?.fields?.reset_at||'').trim();
    if(latest&&!Number.isNaN(Date.parse(latest))&&(!resetAt||Date.parse(latest)>Date.parse(resetAt)))resetAt=latest;
  }
  return resetAt&&!Number.isNaN(Date.parse(resetAt))?resetAt:'';
}

export async function backfillCarCareCustomerIds(db,workspaceId){
  const {error:rpcError}=await db.rpc('backfill_carcare_customer_ids',{target_workspace:workspaceId});
  const {data,error}=await db.from('form_submissions').select('id,form_id,submitter_email,fields,received_at').eq('workspace_id',workspaceId).in('form_id',['carcare-job','carcare-feedback']).order('received_at',{ascending:true}).limit(5000);
  if(error)throw error;
  const records=(data||[]).filter(item=>normalizeEmail(item.submitter_email));
  const byEmail=new Map(),usedNumbers=new Map();
  for(const item of records){
    const email=normalizeEmail(item.submitter_email),match=serialCustomerId(item.fields?.customer_id);
    if(!match||byEmail.has(email))continue;
    const number=Number(match[1]);
    if(usedNumbers.has(number)&&usedNumbers.get(number)!==email)continue;
    byEmail.set(email,formatCustomerId(number));usedNumbers.set(number,email);
  }
  let nextNumber=1;
  for(const item of records){
    const email=normalizeEmail(item.submitter_email);
    if(byEmail.has(email))continue;
    while(usedNumbers.has(nextNumber))nextNumber+=1;
    byEmail.set(email,formatCustomerId(nextNumber));usedNumbers.set(nextNumber,email);nextNumber+=1;
  }
  const updated=rpcError?0:records.filter(item=>item.fields?.customer_id===byEmail.get(normalizeEmail(item.submitter_email))).length;
  return{byEmail,updated,nextNumber:Math.max(0,...usedNumbers.keys())+1};
}

export async function resolveCarCareCustomerId(db,workspaceId,customerEmail){
  const email=normalizeEmail(customerEmail);
  if(!email)throw new Error('A customer email is required to assign a Customer ID.');
  const registry=await backfillCarCareCustomerIds(db,workspaceId);
  const existing=registry.byEmail.get(email);
  if(existing)return existing;
  const {data,error}=await db.rpc('resolve_carcare_customer',{target_workspace:workspaceId,customer_email:email});
  if(!error&&serialCustomerId(data))return data;
  return formatCustomerId(registry.nextNumber);
}

function themesFor(text){
  const checks=[['safety',/unsafe|danger|injur|accident|brake|fire/i],['delay',/late|delay|wait|slow|time/i],['staff conduct',/rude|staff|team|manager|attitude/i],['work quality',/damage|damaged|dirty|wrong|repair|fix|problem|issue/i],['billing',/price|cost|bill|charge|refund|money/i],['communication',/call|email|message|communicat|explain|update/i]];
  return checks.filter(([,pattern])=>pattern.test(text)).map(([name])=>name).slice(0,6);
}

function draftFor({customer_name,preferred_title,rating,feedback},route,themes){
  const customerName=carCareSalutation(clip(customer_name,120),preferred_title);
  const topic=themes.length?themes.join(', '):'your recent visit';
  if(route==='ready_to_post')return`Hi ${customerName}, thank you for sharing your feedback. We’re glad your visit went well, especially your comments about ${topic}. We appreciate you choosing CarCare.`;
  const detail=clip(feedback,220);
  return`Hi ${customerName}, thank you for telling us about your experience. We’re sorry your visit did not meet expectations. We’ve noted your concerns about ${topic}${detail?` (“${detail}”)`:''}. A member of our service team will review the visit and contact you privately. If there is any immediate safety concern, please do not drive the vehicle and let us know the safest way to reach you.`;
}

export function analyzeCarCareFeedback(payload,history=[]){
  const text=clip(payload.feedback,4000);
  const rating=Number(payload.rating);
  const priorNegatives=history.filter(item=>Number(item?.fields?.rating)<=3||['needs_follow_up','manager_escalation'].includes(item?.fields?.route));
  const critical=criticalTerms.test(text);
  const textualNegative=negativeTerms.test(text);
  const positive=rating>=4&&positiveTerms.test(text)&&!textualNegative;
  const unclear=text.length<20||(!positive&&!textualNegative&&rating===3);
  const repeatConcern=priorNegatives.length>0&&(rating<=3||textualNegative);
  let severity=rating<=1?5:rating===2?4:rating===3?3:2;
  if(critical)severity=5;
  if(repeatConcern)severity=Math.max(4,severity);
  let route='ready_to_post';
  if(rating<=3||textualNegative||unclear)route='needs_follow_up';
  if(rating<=2||critical||repeatConcern||severity>=4)route='manager_escalation';
  const sentiment=positive?'positive':(rating<=3||textualNegative?'negative':'neutral');
  const confidence=unclear?.58:(critical||rating<=2?.96:.86);
  const themes=themesFor(text);
  const draftNeeded=sentiment==='negative'||route!=='ready_to_post';
  return{
    classification:critical?'urgent_safety':(sentiment==='positive'?'praise':sentiment==='negative'?'complaint':'suggestion'),
    sentiment,severity,confidence,repeat_concern:repeatConcern,prior_negative_count:priorNegatives.length,
    route,summary:clip(`${rating}/5 rating: ${text}`,500),themes,
    draft_response:draftNeeded?draftFor(payload,route,themes):draftFor(payload,route,themes),
    manager_note:route==='manager_escalation'?`Priority review required${repeatConcern?' — returning customer with prior negative feedback':''}${critical?' — possible safety/legal risk language detected':''}. Verify facts before contacting the customer.`:unclear?'Low-confidence feedback: a human should clarify the concern before acting.':'Review the draft and visit record before any response.',
    ai_model:'carcare-triage-v1',human_review_status:unclear?'needs_clarification':'pending',
    response_status:'not_sent',alert_status:route==='manager_escalation'?'pending':'not_required',
    positive_status:route==='ready_to_post'?'ready_to_post':'not_applicable'
  };
}

export async function loadCarCareHistory(db,workspaceId,customerId,customerEmail=''){
  let query=db.from('form_submissions').select('id,fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-feedback');
  const resetAt=await resolveCarCareResetAt(db,workspaceId);
  if(resetAt)query=query.gte('received_at',resetAt);
  query=customerEmail?query.ilike('submitter_email',normalizeEmail(customerEmail)):query.eq('fields->>customer_id',customerId);
  const {data,error}=await query.order('received_at',{ascending:false}).limit(50);
  if(error)throw error;
  return data||[];
}

export async function storeCarCareFeedback(db,workspaceId,payload,analysis){
  const fields={job_id:payload.job_id,customer_id:payload.customer_id||'',location:payload.location,gender:payload.gender||'',preferred_title:payload.preferred_title||'',rating:Number(payload.rating),...analysis,alert_delivery:'pending'};
  const {data,error}=await db.from('form_submissions').insert({workspace_id:workspaceId,form_id:'carcare-feedback',submitter_name:payload.customer_name,submitter_email:payload.customer_email,message:payload.feedback,fields,source:'carcare'}).select('id,received_at,fields').single();
  if(error)throw error;
  return data;
}

function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let index=0;index<text.length;index+=1){
    const character=text[index];
    if(quoted&&character==='"'&&text[index+1]==='"'){field+='"';index+=1;continue}
    if(character==='"'){quoted=!quoted;continue}
    if(!quoted&&character===','){row.push(field);field='';continue}
    if(!quoted&&(character==='\n'||character==='\r')){
      if(character==='\r'&&text[index+1]==='\n')index+=1;
      row.push(field);field='';if(row.some(value=>value!==''))rows.push(row);row=[];continue;
    }
    field+=character;
  }
  if(field||row.length){row.push(field);rows.push(row)}
  const headers=(rows.shift()||[]).map(value=>value.replace(/^\uFEFF/,'').trim());
  return rows.map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index]||''])));
}

export async function syncCarCareSheetHistory(db,workspaceId){
  const sheetUrl='https://docs.google.com/spreadsheets/d/1UJoWjgu7M05-euV2mfAl5aNegJpmYIVtWNxo-szMv34/export?format=csv&gid=0';
  const response=await fetch(sheetUrl,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`Historical feedback sheet returned ${response.status}.`);
  const rows=parseCsv(await response.text()).filter(row=>row.job_id&&row.customer_email&&Number(row.rating)>=1);
  const {data:existing,error}=await db.from('form_submissions').select('id,message,submitter_email,fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-feedback').limit(1000);
  if(error)throw error;
  const fingerprint=(jobId,message)=>`${String(jobId||'').trim()}|${String(message||'').trim().toLowerCase()}`;
  const knownFeedback=new Set((existing||[]).map(item=>fingerprint(item.fields?.job_id,item.message)));
  const historyByCustomer=new Map();
  for(const item of existing||[]){const customerId=item.fields?.customer_id||'';if(!customerId)continue;const history=historyByCustomer.get(customerId)||[];history.push(item);historyByCustomer.set(customerId,history)}
  const registry=await backfillCarCareCustomerIds(db,workspaceId);
  const customerIds=new Map(registry.byEmail);let nextCustomerNumber=registry.nextNumber;
  let imported=0;
  for(const row of rows){
    const email=normalizeEmail(row.customer_email);
    if(!customerIds.has(email)){customerIds.set(email,formatCustomerId(nextCustomerNumber));nextCustomerNumber+=1}
    const rating=Number(row.rating),customerId=customerIds.get(email);
    const feedback=String(row.feedback||'').replace(/^Rating:\s*\d\s*\/\s*5\s*/i,'').trim();
    const rowFingerprint=fingerprint(row.job_id,feedback);
    if(knownFeedback.has(rowFingerprint))continue;
    const payload={job_id:row.job_id,customer_id:customerId,customer_name:row.customer_name,customer_email:email,location:row.location,rating,feedback};
    const analysis=analyzeCarCareFeedback(payload,historyByCustomer.get(customerId)||[]);
    const fields={job_id:payload.job_id,customer_id:customerId,location:payload.location,rating,...analysis,alert_delivery:'historical',workflow_delivery:'historical',imported_from:'google_sheets'};
    const {data:inserted,error:insertError}=await db.from('form_submissions').insert({workspace_id:workspaceId,form_id:'carcare-feedback',submitter_name:payload.customer_name,submitter_email:payload.customer_email,message:payload.feedback,fields,source:'google_sheets',received_at:row.received_at||new Date().toISOString()}).select('id,fields,received_at').single();
    if(insertError)throw insertError;
    knownFeedback.add(rowFingerprint);imported+=1;
    if(customerId){const history=historyByCustomer.get(customerId)||[];history.push(inserted);historyByCustomer.set(customerId,history)}
  }
  await backfillCarCareCustomerIds(db,workspaceId);
  return imported;
}
