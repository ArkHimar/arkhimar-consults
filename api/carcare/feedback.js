import {createHash} from 'node:crypto';
import {z} from 'zod';
import {carCareLocations,carCareSalutation,feedbackSchema,forwardCarCare,rateLimit,rejectCommon,sameOrigin} from '../_lib/carcare.js';
import {analyzeCarCareFeedback,backfillCarCareCustomerIds,loadCarCareHistory,resolveCarCareCustomerId,resolveCarCareResetAt,storeCarCareFeedback,syncCarCareSheetHistory} from '../_lib/carcare-intelligence.js';
import {carCarePdfAttachment,createCarCarePdf} from '../_lib/carcare-pdf.js';
import bookingHandler from '../_lib/carcare-bookings.js';
import emailEventHandler from '../_lib/carcare-email-events.js';
import {adminClient,sendJson} from '../_lib/server.js';

export const config={api:{bodyParser:false}};

async function hydrateRequestBody(req){
  if(['GET','HEAD'].includes(req.method)||req.body!==undefined)return;
  const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));req.rawBody=Buffer.concat(chunks);
  if(!req.rawBody.length){req.body={};return}
  req.body=JSON.parse(req.rawBody.toString('utf8'));
}

const urgentAdminEmail='projects@arkhimar.com';
const urgentAlertCc='emavericks22@gmail.com';
const updateSchema=z.object({id:z.string().uuid(),human_review_status:z.enum(['pending','needs_clarification','approved','closed']).optional(),response_status:z.enum(['not_sent','sent']).optional(),alert_status:z.enum(['not_required','pending','acknowledged','resolved']).optional(),positive_status:z.enum(['not_applicable','ready_to_post','approved','posted','rejected']).optional()}).strict();
const emailSchema=z.object({id:z.string().uuid(),subject:z.string().trim().min(3).max(200),body:z.string().trim().min(8).max(5000)}).strict();
const bulkSchema=z.object({mode:z.literal('archive')}).strict();
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const printEmailNote='<div style="max-width:620px;margin:0 auto 24px;background:#fffdf8;border:1px solid #d7d9cf;padding:14px 18px;font-family:Arial,sans-serif;color:#42534f;font-size:12px"><strong>PRINT OR SAVE AS PDF</strong><br>A print-ready PDF is attached. Open the attachment and choose Print to select an installed printer or Save as PDF.</div>';

async function latestCarCareState(db,workspaceId,recordId){
  const {data,error}=await db.from('form_submissions').select('fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-status').eq('fields->>target_id',recordId).order('received_at',{ascending:false}).limit(1);
  if(error||!Array.isArray(data))return{};
  return data[0]?.fields?.state||{};
}

async function persistCarCareState(db,workspaceId,record,fields){
  const {error:updateError}=await db.from('form_submissions').update({fields}).eq('id',record.id).eq('workspace_id',workspaceId);
  if(!updateError)return{mode:'updated'};
  const {error:logError}=await db.from('form_submissions').insert({workspace_id:workspaceId,form_id:'carcare-status',submitter_name:record.submitter_name||'CarCare Admin',submitter_email:record.submitter_email||null,message:'Management state update',fields:{target_id:record.id,state:fields},source:'carcare-admin'});
  if(logError)throw updateError;
  console.warn('carcare_state_recorded_as_event',JSON.stringify({recordId:record.id}));
  return{mode:'event'};
}

async function publicTestimonials(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendJson(res,405,{error:'method_not_allowed'})}
  if(!rateLimit(req,'carcare-testimonials',80,60000))return sendJson(res,429,{error:'rate_limited'});
  try{
    const db=adminClient(),workspaceId=process.env.ARKHIMAR_WORKSPACE_ID;if(!workspaceId)throw new Error('CarCare workspace is not configured.');
    const [{data,error},{data:events,error:eventError}]=await Promise.all([
      db.from('form_submissions').select('id,submitter_name,message,fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-feedback').order('received_at',{ascending:false}).limit(200),
      db.from('form_submissions').select('fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-status').order('received_at',{ascending:false}).limit(1000)
    ]);if(error||eventError)throw error||eventError;
    const stateByRecord=new Map();for(const event of events||[]){const target=event.fields?.target_id;if(target&&!stateByRecord.has(target))stateByRecord.set(target,event.fields?.state||{})}
    const testimonials=(data||[]).map(record=>({...record,fields:{...(record.fields||{}),...(stateByRecord.get(record.id)||{})}})).filter(record=>record.fields.positive_status==='ready_to_post'&&record.fields.sentiment==='positive'&&Number(record.fields.rating)>=4).slice(0,30).map(record=>{const words=String(record.submitter_name||'Customer').trim().split(/\s+/),displayName=words.length>1?`${words[0]} ${words.at(-1)[0]}.`:words[0];return{id:record.id,name:displayName,location:record.fields.location||'',rating:Number(record.fields.rating),feedback:String(record.message||'').slice(0,600),date:record.received_at}});
    return sendJson(res,200,{ok:true,testimonials});
  }catch(error){console.error('carcare_testimonials_failed',error?.message);return sendJson(res,503,{error:'testimonials_unavailable'})}
}

async function manageFeedback(req,res){
  if(!['GET','PATCH','POST','DELETE'].includes(req.method)){res.setHeader('Allow','GET, PATCH, POST, DELETE');return sendJson(res,405,{error:'method_not_allowed'})}
  if(!rateLimit(req,'carcare-admin',60,60000))return sendJson(res,429,{error:'rate_limited'});
  if(req.method!=='GET'&&!sameOrigin(req))return sendJson(res,403,{error:'origin_not_allowed',message:'Open the CarCare dashboard before changing records.'});
  try{
    const db=adminClient(),workspaceId=process.env.ARKHIMAR_WORKSPACE_ID;
    if(!workspaceId)throw new Error('CarCare workspace is not configured.');
    if(req.method==='DELETE'){
      const parsed=bulkSchema.safeParse(req.body);
      if(!parsed.success)return sendJson(res,400,{error:'invalid_request',message:'Only archiving is available from the dashboard.'});
      const now=new Date().toISOString();
      const resetAt=await resolveCarCareResetAt(db,workspaceId);
      let query=db.from('form_submissions').select('id,submitter_name,submitter_email,fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-feedback');
      if(resetAt)query=query.gte('received_at',resetAt);
      const {data,error}=await query.order('received_at',{ascending:false}).limit(500);
      if(error)throw error;
      const active=(data||[]).filter(record=>record.fields?.dashboard_visibility!=='archived');
      for(const record of active)await persistCarCareState(db,workspaceId,record,{...(record.fields||{}),dashboard_visibility:'archived',archived_at:now,last_updated_at:now});
      return sendJson(res,200,{ok:true,mode:'archive',count:active.length,message:`${active.length} record${active.length===1?' was':'s were'} archived.`});
    }
    if(req.method==='GET'){
      const resetAt=await resolveCarCareResetAt(db,workspaceId);
      const hasResetBoundary=Boolean(resetAt);
      if(!hasResetBoundary){try{await syncCarCareSheetHistory(db,workspaceId)}catch(error){console.error('carcare_sheet_sync_failed',error?.message)}}
      let feedbackQuery=db.from('form_submissions').select('id,submitter_name,submitter_email,message,fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-feedback');
      const [{data,error},{data:stateEvents,error:stateError},{data:bookings,error:bookingError},{data:jobs,error:jobError}]=await Promise.all([
        feedbackQuery.order('received_at',{ascending:false}).limit(500),
        db.from('form_submissions').select('fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-status').order('received_at',{ascending:false}).limit(2000),
        db.from('form_submissions').select('submitter_email,fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-booking').order('received_at',{ascending:false}).limit(1000),
        db.from('form_submissions').select('fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-job').order('received_at',{ascending:false}).limit(1000)
      ]);
      if(error)throw error;
      if(stateError||bookingError||jobError)throw stateError||bookingError||jobError;
      const registry=await backfillCarCareCustomerIds(db,workspaceId);
      const stateByRecord=new Map();
      for(const event of stateEvents||[]){const target=event.fields?.target_id;if(target&&!stateByRecord.has(target))stateByRecord.set(target,event.fields?.state||{})}
      const bookingDatesByEmail=new Map();
      for(const booking of bookings||[]){const email=String(booking.submitter_email||'').trim().toLowerCase();if(!email)continue;if(!bookingDatesByEmail.has(email))bookingDatesByEmail.set(email,[]);bookingDatesByEmail.get(email).push(booking.received_at)}
      const jobById=new Map();
      for(const job of jobs||[]){const jobId=String(job.fields?.job_id||'');if(jobId&&!jobById.has(jobId))jobById.set(jobId,job.received_at)}
      const normalizedRecords=(data||[]).map(item=>{
        const email=String(item.submitter_email||'').trim().toLowerCase(),state=stateByRecord.get(item.id)||{},base=item.fields||{};
        const relatedBookings=bookingDatesByEmail.get(email)||[],bookingDate=relatedBookings.find(value=>Date.parse(value)<=Date.parse(item.received_at))||relatedBookings[0]||'';
        const fields={...base,...state,customer_id:registry.byEmail.get(email)||base.customer_id||'',booking_date:state.booking_date||base.booking_date||bookingDate||jobById.get(String(base.job_id||''))||'',last_updated_at:state.last_updated_at||state.updated_at||base.last_updated_at||base.updated_at||item.received_at};
        if(fields.route==='ready_to_post'||fields.sentiment==='positive')fields.repeat_concern=false;
        return{...item,fields};
      });
      const location=String(req.query?.location||''),route=String(req.query?.route||''),view=req.query?.view==='archived'?'archived':'active';
      const records=normalizedRecords.filter(item=>{
        const archived=item.fields?.dashboard_visibility==='archived';
        const afterReset=!resetAt||Date.parse(item.received_at)>=Date.parse(resetAt);
        return(view==='archived'?archived:!archived&&afterReset)&&(!location||item.fields?.location===location)&&(!route||item.fields?.route===route);
      });
      const summary={total:records.length,urgent:records.filter(item=>item.fields?.route==='manager_escalation'&&item.fields?.alert_status!=='resolved').length,drafts:records.filter(item=>item.fields?.response_status!=='sent'&&item.fields?.draft_response).length,readyToPost:records.filter(item=>item.fields?.positive_status==='ready_to_post').length,needsReview:records.filter(item=>['pending','needs_clarification'].includes(item.fields?.human_review_status)).length};
      return sendJson(res,200,{ok:true,view,locations:carCareLocations,summary,records});
    }
    if(req.method==='POST'){
      const parsed=emailSchema.safeParse(req.body);
      if(!parsed.success)return sendJson(res,400,{error:'invalid_email',message:'Add a subject and a complete email message.'});
      const {data:record,error:readError}=await db.from('form_submissions').select('id,submitter_name,submitter_email,message,fields').eq('id',parsed.data.id).eq('workspace_id',workspaceId).eq('form_id','carcare-feedback').single();
      if(readError||!record?.submitter_email)return sendJson(res,404,{error:'not_found'});
      if(!process.env.RESEND_API_KEY)return sendJson(res,503,{error:'email_provider_not_configured',message:'Email delivery is not configured.'});
      const sentAt=new Date().toISOString(),jobId=record.fields?.job_id||'CarCare visit';
      const htmlBody=escapeHtml(parsed.data.body).replaceAll('\n','<br>');
      const html=`<div style="margin:0;background:#f3efe6;padding:28px 12px;font-family:Arial,sans-serif;color:#0d2622"><table role="presentation" style="width:100%;max-width:620px;margin:auto;border-collapse:collapse;background:#fffdf8"><tr><td style="padding:30px 32px 10px;color:#18a995;font-size:11px;font-weight:700;letter-spacing:2px">ARKHIMAR CARCARE</td></tr><tr><td style="padding:8px 32px 32px"><h1 style="font:400 35px/1.1 Georgia,serif;margin:0 0 22px">A response from our service team</h1><div style="font-size:15px;line-height:1.75">${htmlBody}</div><div style="margin-top:28px;padding:14px 16px;border-left:4px solid #18a995;background:#e5f5ee;font-size:12px"><strong>Visit reference:</strong> ${escapeHtml(jobId)}</div><div style="margin-top:18px;border:1px solid #d7d9cf;padding:14px 16px;font-size:12px"><strong>PRINT OR SAVE AS PDF</strong><br>A print-ready copy is attached. Open it and choose Print.</div></td></tr><tr><td style="background:#071512;padding:22px 32px;color:#fff"><strong>ArkHimar CarCare</strong><div style="margin-top:7px;color:#9aaaa6;font-size:11px">Sent by the service team from projects@arkhimar.com</div></td></tr></table></div>`;
      const pdf=await createCarCarePdf({audience:'customer',title:'A response from our service team',jobId,customerName:record.submitter_name,customerEmail:record.submitter_email,message:parsed.data.body});
      const idempotency=createHash('sha256').update(`carcare-response:${record.id}:${parsed.data.subject}:${parsed.data.body}`).digest('hex').slice(0,32);
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`carcare-response/${idempotency}`},body:JSON.stringify({from:'ArkHimar CarCare <projects@arkhimar.com>',to:[record.submitter_email],reply_to:'projects@arkhimar.com',subject:parsed.data.subject,text:`${parsed.data.body}\n\nA print-ready PDF is attached.`,html,attachments:[carCarePdfAttachment(pdf,jobId,'carcare-response')]}),signal:AbortSignal.timeout(10000)});
      const provider=await response.json().catch(()=>({}));
      if(!response.ok){console.error('carcare_admin_email_rejected',JSON.stringify({status:response.status}));return sendJson(res,502,{error:'email_failed',message:'The email provider could not send this message.'})}
      const currentState=await latestCarCareState(db,workspaceId,record.id);
      const fields={...record.fields,...currentState,response_status:'sent',human_review_status:(currentState.human_review_status||record.fields?.human_review_status)==='pending'?'approved':(currentState.human_review_status||record.fields?.human_review_status),response_sent_at:sentAt,response_sent_from:'projects@arkhimar.com',response_provider_id:provider.id||null,email_delivery_status:'sent',customer_reply_status:'awaiting_reply',last_updated_at:sentAt};
      await persistCarCareState(db,workspaceId,record,fields);
      return sendJson(res,200,{ok:true,id:record.id,fields,message:`Email sent to ${record.submitter_email}.`});
    }
    const parsed=updateSchema.safeParse(req.body);
    if(!parsed.success)return sendJson(res,400,{error:'invalid_request'});
    const {data:current,error:readError}=await db.from('form_submissions').select('id,fields').eq('id',parsed.data.id).eq('workspace_id',workspaceId).eq('form_id','carcare-feedback').single();
    if(readError||!current)return sendJson(res,404,{error:'not_found'});
    const latestState=await latestCarCareState(db,workspaceId,current.id);
    const now=new Date().toISOString(),fields={...current.fields,...latestState};
    for(const key of ['human_review_status','response_status','alert_status','positive_status'])if(parsed.data[key])fields[key]=parsed.data[key];
    if(parsed.data.response_status==='sent')fields.response_sent_at=now;
    if(parsed.data.alert_status&&['acknowledged','resolved'].includes(parsed.data.alert_status))fields.alert_acted_at=now;
    fields.last_updated_at=now;
    await persistCarCareState(db,workspaceId,current,fields);
    return sendJson(res,200,{ok:true,id:current.id,fields});
  }catch(error){
    console.error('carcare_admin_failed',error?.message);
    return sendJson(res,error?.statusCode||500,{error:error?.code||'dashboard_unavailable',message:error?.message||'The management desk is unavailable.'});
  }
}

async function sendUrgentRatingAlert(payload,analysis,recordId){
  if(analysis.route==='ready_to_post')return{required:false,sent:false};
  const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
  if(!apiKey||!from){console.error('carcare_urgent_alert_not_configured');return{required:true,sent:false}}
  const to=process.env.CARCARE_ADMIN_EMAIL||urgentAdminEmail;
  const cc=process.env.CARCARE_ADMIN_ALERT_CC||urgentAlertCc;
  const urgent=analysis.route==='manager_escalation',alertLabel=urgent?'URGENT REVIEW':'FOLLOW-UP REVIEW';
  const subject=urgent?`URGENT: ${payload.rating}-star CarCare rating - ${payload.location} - ${payload.job_id}`:`FOLLOW-UP: CarCare feedback - ${payload.location} - ${payload.job_id}`;
  const safe={rating:Number(payload.rating),severity:Number(analysis.severity),jobId:escapeHtml(payload.job_id),customerId:escapeHtml(payload.customer_id),customerName:escapeHtml(payload.customer_name),customerEmail:escapeHtml(payload.customer_email),location:escapeHtml(payload.location),feedback:escapeHtml(payload.feedback).replaceAll('\n','<br>'),summary:escapeHtml(analysis.summary),note:escapeHtml(analysis.manager_note),draft:escapeHtml(analysis.draft_response).replaceAll('\n','<br>'),recordId:escapeHtml(recordId)};
  const dashboardUrl=`${process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com'}/carcare/admin?record=${encodeURIComponent(recordId)}`;
  const text=`${urgent?'Urgent CarCare review required':'CarCare follow-up review required'}\n\nRating: ${payload.rating}/5\nSeverity: ${analysis.severity}/5\nRoute: ${analysis.route}\nRepeat concern: ${analysis.repeat_concern?'Yes':'No'}\nJob ID: ${payload.job_id}\nCustomer ID: ${payload.customer_id||'Not provided'}\nCustomer: ${payload.customer_name}\nCustomer email: ${payload.customer_email}\nLocation: ${payload.location}\n\nFeedback:\n${payload.feedback}\n\nAI summary:\n${analysis.summary}\n\nInternal note:\n${analysis.manager_note}\n\nDRAFT RESPONSE — HUMAN REVIEW REQUIRED; DO NOT SEND UNCHECKED:\n${analysis.draft_response}\n\nOpen this exact case: ${dashboardUrl}\nDashboard record: ${recordId}\n\nNo response has been sent to the customer.`;
  const html=`<!doctype html><html><body style="margin:0;padding:0;background:#f3efe6;font-family:Arial,Helvetica,sans-serif;color:#0d2622"><div style="display:none;max-height:0;overflow:hidden">${safe.rating}-star feedback from ${safe.customerName} requires review.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3efe6"><tr><td align="center" style="padding:30px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fffdf8;border-collapse:collapse;border:1px solid #ded9cf"><tr><td style="height:7px;background:#d84b3e"></td></tr><tr><td style="padding:30px 34px 12px"><table role="presentation" width="100%"><tr><td style="color:#18a995;font-size:11px;font-weight:800;letter-spacing:2px">ARKHIMAR CARCARE</td><td align="right"><span style="display:inline-block;background:#fde6e2;color:#a62f25;border-radius:999px;padding:7px 11px;font-size:10px;font-weight:800;letter-spacing:1px">${alertLabel}</span></td></tr></table><h1 style="margin:24px 0 10px;font:400 40px/1.08 Georgia,serif;color:#0d2622">A customer needs your attention.</h1><p style="margin:0;color:#62716d;font-size:15px;line-height:1.65">A ${safe.rating}-star CarCare response has been privately routed to management. Review the visit and approve the drafted response before contacting the customer.</p></td></tr><tr><td style="padding:18px 34px 4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="31%" style="background:#071512;color:#fff;padding:16px;text-align:center"><div style="font:700 27px Georgia,serif">${safe.rating}/5</div><div style="margin-top:5px;color:#a9b6b2;font-size:9px;font-weight:700;letter-spacing:1.2px">RATING</div></td><td width="3%"></td><td width="31%" style="background:#f6e7df;padding:16px;text-align:center"><div style="font:700 27px Georgia,serif;color:#9e352c">${safe.severity}/5</div><div style="margin-top:5px;color:#7c645d;font-size:9px;font-weight:700;letter-spacing:1.2px">SEVERITY</div></td><td width="3%"></td><td width="32%" style="background:#e5f5ee;padding:16px;text-align:center"><div style="font:700 18px Georgia,serif;color:#126b5f">${analysis.repeat_concern?'YES':'NO'}</div><div style="margin-top:9px;color:#55736c;font-size:9px;font-weight:700;letter-spacing:1.2px">REPEAT CONCERN</div></td></tr></table></td></tr><tr><td style="padding:25px 34px 0"><div style="color:#18a995;font-size:10px;font-weight:800;letter-spacing:1.5px;margin-bottom:11px">VISIT &amp; CUSTOMER</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px"><tr><td style="padding:10px 12px;background:#f5f2eb;color:#62716d;width:34%">Job ID</td><td style="padding:10px 12px;background:#f5f2eb;font-weight:700">${safe.jobId}</td></tr><tr><td style="padding:10px 12px;color:#62716d">Customer ID</td><td style="padding:10px 12px;font-weight:700">${safe.customerId}</td></tr><tr><td style="padding:10px 12px;background:#f5f2eb;color:#62716d">Customer</td><td style="padding:10px 12px;background:#f5f2eb;font-weight:700">${safe.customerName}</td></tr><tr><td style="padding:10px 12px;color:#62716d">Email</td><td style="padding:10px 12px"><a href="mailto:${safe.customerEmail}" style="color:#126b5f">${safe.customerEmail}</a></td></tr><tr><td style="padding:10px 12px;background:#f5f2eb;color:#62716d">Location</td><td style="padding:10px 12px;background:#f5f2eb;font-weight:700">${safe.location}</td></tr></table></td></tr><tr><td style="padding:26px 34px 0"><div style="color:#18a995;font-size:10px;font-weight:800;letter-spacing:1.5px;margin-bottom:10px">CUSTOMER FEEDBACK</div><div style="border-left:4px solid #d84b3e;background:#fff3ef;padding:18px 20px;font:italic 17px/1.65 Georgia,serif;color:#402b27">“${safe.feedback}”</div></td></tr><tr><td style="padding:25px 34px 0"><div style="color:#18a995;font-size:10px;font-weight:800;letter-spacing:1.5px;margin-bottom:10px">AI ASSESSMENT</div><p style="margin:0 0 10px;font-size:14px;line-height:1.65"><strong>Summary:</strong> ${safe.summary}</p><p style="margin:0;font-size:14px;line-height:1.65"><strong>Internal note:</strong> ${safe.note}</p></td></tr><tr><td style="padding:25px 34px 0"><div style="background:#071512;padding:22px 24px;color:#fff"><div style="color:#d7f06a;font-size:10px;font-weight:800;letter-spacing:1.5px">DRAFT RESPONSE · HUMAN REVIEW REQUIRED</div><div style="margin-top:14px;color:#eef3f1;font-size:14px;line-height:1.7">${safe.draft}</div><div style="margin-top:15px;color:#9aaaa6;font-size:11px">This draft has not been sent. Verify the facts and edit it before delivery.</div></div></td></tr><tr><td align="center" style="padding:28px 34px 34px"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#d7f06a;color:#071512;text-decoration:none;padding:15px 24px;font-size:11px;font-weight:800;letter-spacing:1.4px">REVIEW THIS EXACT CASE ↗</a><div style="margin-top:16px;color:#7b8884;font-size:10px">Dashboard record: ${safe.recordId}</div></td></tr><tr><td style="background:#071512;padding:22px 34px;color:#fff"><strong>ArkHimar CarCare</strong><div style="margin-top:7px;color:#9aaaa6;font-size:11px">Private service-recovery alert · Sent to the CarCare administration team</div></td></tr></table></td></tr></table></body></html>`;
  const pdf=await createCarCarePdf({title:'Urgent CarCare review',subtitle:'Management review required before contacting the customer.',urgent:true,jobId:payload.job_id,customerId:payload.customer_id,customerName:payload.customer_name,customerEmail:payload.customer_email,location:payload.location,rating:payload.rating,severity:analysis.severity,repeatConcern:analysis.repeat_concern,feedback:payload.feedback,summary:analysis.summary,note:analysis.manager_note,draft:analysis.draft_response});
  const idempotency=createHash('sha256').update(`carcare-urgent:${recordId}`).digest('hex').slice(0,32);
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`carcare-urgent/${idempotency}`},body:JSON.stringify({from,to:[to],cc:[cc],reply_to:payload.customer_email,subject,text:`${text}\n\nA print-ready PDF is attached.`,html:`${html}${printEmailNote}`,attachments:[carCarePdfAttachment(pdf,payload.job_id,'urgent-carcare-review')]}),signal:AbortSignal.timeout(10000)});
    if(response.ok)return{required:true,sent:true};
    console.error('carcare_urgent_alert_rejected',JSON.stringify({status:response.status}));
  }catch(error){console.error('carcare_urgent_alert_unavailable',JSON.stringify({error:error?.name||'Error'}))}
  return{required:true,sent:false};
}

async function sendCustomerAcknowledgement(payload,analysis,recordId){
  const apiKey=process.env.RESEND_API_KEY;
  if(!apiKey){console.error('carcare_customer_ack_not_configured');return{sent:false}}
  const hasConcern=analysis.route!=='ready_to_post'||analysis.sentiment==='negative';
  const customerName=escapeHtml(carCareSalutation(payload.customer_name,payload.preferred_title));
  const headline=hasConcern?'We received your concern.':'Thank you for your feedback.';
  const reassurance=hasConcern
    ?`<p style="margin:0 0 16px;color:#42534f;font-size:15px;line-height:1.75">We sincerely apologize for the inconvenience you experienced. Please be assured that your feedback has been assigned to the service team and the issue will be investigated and resolved as quickly as possible. A team member may contact you if more information is needed.</p>`
    :`<p style="margin:0 0 16px;color:#42534f;font-size:15px;line-height:1.75">We appreciate you taking the time to tell us about your experience. Your feedback has been received and shared with the service team.</p>`;
  const subject=`We received your CarCare feedback · ${payload.job_id}`;
  const html=`<div style="margin:0;background:#f3efe6;padding:28px 12px;font-family:Arial,sans-serif;color:#0d2622"><table role="presentation" style="width:100%;max-width:620px;margin:auto;border-collapse:collapse;background:#fffdf8"><tr><td style="padding:32px 32px 10px;color:#18a995;font-size:11px;font-weight:700;letter-spacing:2px">FEEDBACK RECEIVED</td></tr><tr><td style="padding:8px 32px 32px"><h1 style="font:400 40px/1.08 Georgia,serif;margin:0 0 22px">${headline}</h1><p style="margin:0 0 16px;font-size:16px">Hi ${customerName},</p>${reassurance}<div style="margin-top:26px;border-left:4px solid #18a995;background:#e5f5ee;padding:16px 18px"><div style="color:#62716d;font-size:10px;font-weight:700;letter-spacing:1.3px">YOUR REFERENCES</div><div style="margin-top:8px;font-size:13px"><strong>JOB ID:</strong> ${escapeHtml(payload.job_id)}</div><div style="margin-top:5px;font-size:13px"><strong>CUSTOMER ID:</strong> ${escapeHtml(payload.customer_id||'Not provided')}</div></div><p style="margin:24px 0 0;color:#62716d;font-size:12px;line-height:1.6">You can reply directly to this email if you need to add more information. No feedback is published automatically.</p></td></tr><tr><td style="background:#071512;padding:22px 32px;color:#fff"><strong>ArkHimar CarCare</strong><div style="margin-top:7px;color:#9aaaa6;font-size:11px">Customer care from projects@arkhimar.com</div></td></tr></table></div>`;
  const text=hasConcern
    ?`Hi ${carCareSalutation(payload.customer_name,payload.preferred_title)},\n\nWe have received your feedback. We sincerely apologize for the inconvenience you experienced. Please be assured that the service team will investigate and resolve the issue as quickly as possible.\n\nJOB ID: ${payload.job_id}\nCUSTOMER ID: ${payload.customer_id||'Not provided'}\n\nYou can reply to this email if you need to add more information.`
    :`Hi ${carCareSalutation(payload.customer_name,payload.preferred_title)},\n\nThank you for your feedback. It has been received and shared with the CarCare service team.\n\nJOB ID: ${payload.job_id}\nCUSTOMER ID: ${payload.customer_id||'Not provided'}`;
  const pdf=await createCarCarePdf({audience:'customer',title:headline,subtitle:'Your feedback has been received by ArkHimar CarCare.',jobId:payload.job_id,customerId:payload.customer_id,customerName:payload.customer_name,customerEmail:payload.customer_email,location:payload.location,message:hasConcern?'We apologize for the inconvenience. The service team will investigate and work to resolve the issue.':'Thank you for taking the time to share your experience.',feedback:payload.feedback});
  const idempotency=createHash('sha256').update(`carcare-customer-ack:${recordId}`).digest('hex').slice(0,32);
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`carcare-customer-ack/${idempotency}`},body:JSON.stringify({from:'ArkHimar CarCare <projects@arkhimar.com>',to:[payload.customer_email],reply_to:'projects@arkhimar.com',subject,html:`${html}${printEmailNote}`,text:`${text}\n\nA print-ready PDF is attached.`,attachments:[carCarePdfAttachment(pdf,payload.job_id,'carcare-feedback-receipt')]}),signal:AbortSignal.timeout(10000)});
    if(response.ok){const data=await response.json().catch(()=>({}));return{sent:true,providerId:data.id||null}}
    console.error('carcare_customer_ack_rejected',JSON.stringify({status:response.status}));
  }catch(error){console.error('carcare_customer_ack_unavailable',JSON.stringify({error:error?.name||'Error'}))}
  return{sent:false};
}

export default async function handler(req,res){
  try{await hydrateRequestBody(req)}catch{return sendJson(res,400,{error:'invalid_json'})}
  if(req.query?.action==='bookings')return bookingHandler(req,res);
  if(req.query?.action==='email-events')return emailEventHandler(req,res);
  if(req.query?.action==='testimonials')return publicTestimonials(req,res);
  if(req.query?.action==='admin')return manageFeedback(req,res);
  if(rejectCommon(req,res,'carcare-feedback',12))return;
  const parsed=feedbackSchema.safeParse(req.body);
  if(!parsed.success)return sendJson(res,400,{error:'invalid_request',message:'Complete your visit details, choose a rating and tell us what happened.'});
  if(parsed.data.website)return sendJson(res,202,{ok:true});
  const {website,...submittedPayload}=parsed.data;
  try{
    const db=adminClient(),workspaceId=process.env.ARKHIMAR_WORKSPACE_ID;
    if(!workspaceId)throw new Error('CarCare workspace is not configured.');
    const customerId=await resolveCarCareCustomerId(db,workspaceId,submittedPayload.customer_email);
    const payload={...submittedPayload,customer_id:customerId};
    const history=await loadCarCareHistory(db,workspaceId,customerId,payload.customer_email);
    const analysis=analyzeCarCareFeedback(payload,history);
    const stored=await storeCarCareFeedback(db,workspaceId,payload,analysis);
    const workflowPayload={...payload,feedback:`Rating: ${payload.rating}/5\n${payload.feedback}`,analysis,record_id:stored.id,dashboard_url:`${process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com'}/carcare/admin?record=${encodeURIComponent(stored.id)}`};
    const [forwarded,alert,acknowledgement]=await Promise.all([forwardCarCare('feedback',workflowPayload),sendUrgentRatingAlert(payload,analysis,stored.id),sendCustomerAcknowledgement(payload,analysis,stored.id)]);
    const fields={...stored.fields,alert_delivery:alert.required?(alert.sent?'sent':'failed'):'not_required',workflow_delivery:forwarded.ok?'sent':'failed',customer_ack_delivery:acknowledgement.sent?'sent':'failed',customer_ack_sent_at:acknowledgement.sent?new Date().toISOString():null,customer_ack_provider_id:acknowledgement.providerId||null,email_delivery_status:acknowledgement.sent?'sent':'failed',customer_reply_status:acknowledgement.sent?'awaiting_reply':'closed'};
    await persistCarCareState(db,workspaceId,{id:stored.id,submitter_name:payload.customer_name,submitter_email:payload.customer_email},fields);
    if(!forwarded.ok)console.error('carcare_secondary_workflow_failed',JSON.stringify({recordId:stored.id,status:forwarded.status}));
    return sendJson(res,200,{ok:true,reference:stored.id,route:analysis.route,message:'Thank you. Your feedback is now with the right team.'});
  }catch(error){
    console.error('carcare_feedback_pipeline_failed',error?.message);
    return sendJson(res,503,{error:'workflow_unavailable',message:'The feedback service is temporarily unavailable. Please try again.'});
  }
}
