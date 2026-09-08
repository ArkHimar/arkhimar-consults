import {z} from 'zod';
import {adminClient,requestIpHash,requireMethod,sendJson} from '../../_lib/server.js';
import {renderEmailHtml,renderEmailText} from '../../../lib/email-template.mjs';
import {resourceBySlug} from '../../../lib/resource-catalog.mjs';
import {renderResourceAsset} from '../../../lib/resource-assets.mjs';

const attributionSchema=z.record(z.string().max(40),z.string().trim().max(120)).default({});
const schema=z.object({resourceSlug:z.string().regex(/^[a-z0-9-]{3,80}$/),name:z.string().trim().min(2).max(160),email:z.string().email().max(254),projectType:z.string().trim().max(80).optional(),location:z.string().trim().max(160).optional(),timeframe:z.string().trim().max(80).optional(),budgetRange:z.string().trim().max(80).optional(),marketingConsent:z.boolean().default(false),company:z.string().max(200).optional(),attribution:attributionSchema}).strict();
const safeAttribution=value=>Object.fromEntries(Object.entries(value).filter(([key])=>['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ref'].includes(key)));

export default async function handler(req,res){
  if(!requireMethod(req,res))return;if(Number(req.headers['content-length']||0)>32768)return sendJson(res,413,{error:'payload_too_large'});
  const parsed=schema.safeParse(req.body);if(!parsed.success)return sendJson(res,400,{error:'invalid_request'});if(parsed.data.company)return sendJson(res,202,{ok:true,emailed:false});
  const resource=resourceBySlug(parsed.data.resourceSlug);if(!resource||resource.access_mode!=='lead_magnet'||resource.status!=='live')return sendJson(res,404,{error:'resource_not_available'});
  try{
    const db=adminClient(),workspaceId=process.env.ARKHIMAR_WORKSPACE_ID;if(!workspaceId)throw new Error('Resource delivery workspace is not configured');const ipHash=requestIpHash(req),since=new Date(Date.now()-3600000).toISOString(),{count,error:countError}=await db.from('resource_leads').select('id',{count:'exact',head:true}).eq('ip_hash',ipHash).gte('created_at',since);if(countError)throw countError;if((count||0)>=10)return sendJson(res,429,{error:'rate_limited',message:'Too many requests. Please try again later.'});
    const value=parsed.data,{data:lead,error}=await db.from('resource_leads').insert({workspace_id:workspaceId,resource_slug:resource.slug,resource_version:resource.version,submitter_name:value.name,submitter_email:value.email.toLowerCase(),project_type:value.projectType||null,project_location:value.location||null,timeframe:value.timeframe||null,budget_range:value.budgetRange||null,marketing_consent:value.marketingConsent,attribution:safeAttribution(value.attribution),ip_hash:ipHash,delivered_at:new Date().toISOString()}).select('id').single();if(error)throw error;
    let emailed=false;if(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL){const subject=`Your ArkHimar ${resource.title}`,blocks=[{type:'heading',text:resource.title},{type:'text',text:renderResourceAsset(resource)},{type:'button',label:'Open the resource',url:`${process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com'}/resources/architecture/${resource.slug}`}];const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`resource/${lead.id}`},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[value.email],bcc:process.env.FORM_NOTIFICATION_EMAIL?[process.env.FORM_NOTIFICATION_EMAIL]:undefined,subject,html:renderEmailHtml({subject,blocks}),text:renderEmailText({subject,blocks})})});emailed=response.ok;}
    return sendJson(res,201,{ok:true,leadId:lead.id,emailed});
  }catch(error){console.error('resource_claim_failed',error?.message);return sendJson(res,500,{error:'resource_delivery_failed',message:'The resource could not be prepared right now.'})}
}
