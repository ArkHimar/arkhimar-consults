import {createHmac,timingSafeEqual} from 'node:crypto';
import {adminClient,sendJson} from './server.js';

export const config={api:{bodyParser:false}};

const deliveryStatus={
  'email.scheduled':'scheduled','email.sent':'sent','email.delivered':'delivered','email.delivery_delayed':'delivery_delayed',
  'email.opened':'opened','email.clicked':'clicked','email.bounced':'bounced','email.complained':'complained','email.failed':'failed','email.suppressed':'suppressed'
};

async function readRawBody(req){
  if(Buffer.isBuffer(req.rawBody))return req.rawBody;
  if(Buffer.isBuffer(req.body))return req.body;
  if(typeof req.body==='string')return Buffer.from(req.body);
  if(req.body&&typeof req.body==='object')return Buffer.from(JSON.stringify(req.body));
  const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return Buffer.concat(chunks);
}

export function verifyResendWebhook(raw,headers,secret,now=Date.now()){
  const id=String(headers['svix-id']||''),timestamp=String(headers['svix-timestamp']||''),signature=String(headers['svix-signature']||'');
  if(!id||!timestamp||!signature||!secret?.startsWith('whsec_'))return false;
  const seconds=Number(timestamp);if(!Number.isFinite(seconds)||Math.abs(now-seconds*1000)>5*60*1000)return false;
  let key;try{key=Buffer.from(secret.slice(6),'base64')}catch{return false}
  const expected=createHmac('sha256',key).update(`${id}.${timestamp}.${raw.toString('utf8')}`).digest();
  return signature.split(/\s+/).some(candidate=>{
    const encoded=candidate.startsWith('v1,')?candidate.slice(3):'';if(!encoded)return false;
    try{const actual=Buffer.from(encoded,'base64');return actual.length===expected.length&&timingSafeEqual(actual,expected)}catch{return false}
  });
}

const cleanFilterValue=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'');
async function locateRecord(db,workspaceId,event){
  const recipients=Array.isArray(event.data?.to)?event.data.to:[event.data?.to].filter(Boolean);
  for(const recipient of recipients){
    const match=String(recipient).match(/reply\+([0-9a-f-]{36})@/i);
    if(match){const {data}=await db.from('form_submissions').select('id,form_id,submitter_name,submitter_email,fields').eq('workspace_id',workspaceId).eq('id',match[1]).in('form_id',['carcare-booking','carcare-feedback']).maybeSingle();if(data)return data}
  }
  const providerId=cleanFilterValue(event.data?.email_id);if(!providerId)return null;
  const {data}=await db.from('form_submissions').select('id,form_id,submitter_name,submitter_email,fields').eq('workspace_id',workspaceId).in('form_id',['carcare-booking','carcare-feedback']).or(`fields->>email_provider_id.eq.${providerId},fields->>customer_ack_provider_id.eq.${providerId},fields->>response_provider_id.eq.${providerId}`).limit(1).maybeSingle();
  return data||null;
}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendJson(res,405,{error:'method_not_allowed'})}
  const secret=process.env.RESEND_WEBHOOK_SECRET;if(!secret)return sendJson(res,503,{error:'webhook_not_configured'});
  try{
    const raw=await readRawBody(req);if(!verifyResendWebhook(raw,req.headers,secret))return sendJson(res,401,{error:'invalid_signature'});
    const event=JSON.parse(raw.toString('utf8')),eventId=String(req.headers['svix-id']),workspaceId=process.env.ARKHIMAR_WORKSPACE_ID;
    if(!workspaceId)throw new Error('CarCare workspace is not configured.');
    const db=adminClient(),{data:duplicate}=await db.from('form_submissions').select('id').eq('workspace_id',workspaceId).eq('form_id','carcare-email-event').eq('fields->>provider_event_id',eventId).limit(1).maybeSingle();
    if(duplicate)return sendJson(res,200,{ok:true,duplicate:true});
    const record=await locateRecord(db,workspaceId,event),occurredAt=event.created_at||new Date().toISOString();
    if(record){
      const fields={...(record.fields||{}),last_email_event:event.type,last_email_event_at:occurredAt};
      if(event.type==='email.received')Object.assign(fields,{customer_reply_status:'replied',customer_replied_at:occurredAt,reply_from:event.data?.from||'',reply_subject:event.data?.subject||''});
      else if(deliveryStatus[event.type]){fields.email_delivery_status=deliveryStatus[event.type];fields[`email_${deliveryStatus[event.type]}_at`]=occurredAt}
      const {error}=await db.from('form_submissions').update({fields}).eq('workspace_id',workspaceId).eq('id',record.id);if(error)throw error;
    }
    const {error:auditError}=await db.from('form_submissions').insert({workspace_id:workspaceId,form_id:'carcare-email-event',submitter_name:'Resend webhook',submitter_email:event.data?.from||null,message:event.type,fields:{provider_event_id:eventId,event_type:event.type,provider_email_id:event.data?.email_id||null,parent_record_id:record?.id||null,occurred_at:occurredAt},source:'resend-webhook'});if(auditError)throw auditError;
    return sendJson(res,200,{ok:true,matched:Boolean(record)});
  }catch(error){console.error('carcare_email_event_failed',error?.message);return sendJson(res,400,{error:'invalid_webhook'})}
}
