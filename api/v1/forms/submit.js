import {z} from 'zod';
import {adminClient,bearerToken,requestIpHash,requireMethod,sendJson,sha256} from '../../_lib/server.js';
import {renderEmailHtml,renderEmailText} from '../../../lib/email-template.mjs';

const scalar=z.union([z.string().max(5000),z.number(),z.boolean(),z.null()]);
const schema=z.object({
  formId:z.string().trim().min(1).max(100).default('external-form'),
  projectId:z.string().uuid().optional(),
  name:z.string().trim().max(160).optional(),
  email:z.string().email().max(254).optional(),
  phone:z.string().trim().max(60).optional(),
  message:z.string().trim().max(20000).optional(),
  fields:z.record(z.string().max(100),scalar).default({})
}).strict();

export default async function handler(req,res){
  if(!requireMethod(req,res))return;
  if(Number(req.headers['content-length']||0)>262144)return sendJson(res,413,{error:'payload_too_large'});
  const apiKey=req.headers['x-api-key']||bearerToken(req);
  if(!apiKey||!String(apiKey).startsWith('akh_live_'))return sendJson(res,401,{error:'invalid_api_key'});
  const parsed=schema.safeParse(req.body);
  if(!parsed.success)return sendJson(res,400,{error:'invalid_request',issues:parsed.error.issues.map(({path,message})=>({field:path.join('.'),message}))});
  try{
    const db=adminClient();
    const {data:authorization,error:authError}=await db.rpc('authorize_api_key_request',{request_key_hash:sha256(apiKey),request_scope:'forms:submit',request_ip_hash:requestIpHash(req)});
    if(authError)throw authError;
    if(!authorization?.ok)return sendJson(res,authorization?.error==='rate_limited'?429:401,{error:authorization?.error||'invalid_api_key'});
    const value=parsed.data;
    if(value.projectId){
      const {data:project}=await db.from('projects').select('id').eq('id',value.projectId).eq('workspace_id',authorization.workspace_id).maybeSingle();
      if(!project)return sendJson(res,400,{error:'project_not_in_workspace'});
    }
    const {data:submission,error}=await db.from('form_submissions').insert({workspace_id:authorization.workspace_id,project_id:value.projectId||null,api_key_id:authorization.api_key_id,form_id:value.formId,submitter_name:value.name||null,submitter_email:value.email||null,submitter_phone:value.phone||null,message:value.message||null,fields:value.fields,source:'api'}).select('id,received_at').single();
    if(error)throw error;
    if(process.env.RESEND_API_KEY&&process.env.FORM_NOTIFICATION_EMAIL&&process.env.RESEND_FROM_EMAIL){
      const subject=`New ArkHimar form submission · ${value.formId}`;
      const blocks=[{type:'heading',text:'New form submission'},{type:'text',text:[`Form: ${value.formId}`,value.name&&`Name: ${value.name}`,value.email&&`Email: ${value.email}`,value.phone&&`Phone: ${value.phone}`,value.message&&`Message:\n${value.message}`].filter(Boolean).join('\n\n')},{type:'button',label:'Open ArkHimar PM',url:`${process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com'}/pm/`}];
      await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`form/${submission.id}`},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[process.env.FORM_NOTIFICATION_EMAIL],subject,html:renderEmailHtml({subject,blocks}),text:renderEmailText({subject,blocks})})});
    }
    return sendJson(res,201,{ok:true,submissionId:submission.id,receivedAt:submission.received_at});
  }catch(error){
    console.error('form_submit_failed',error?.message);
    return sendJson(res,500,{error:'submission_failed'});
  }
}
