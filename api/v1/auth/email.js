import {z} from 'zod';
import {adminClient,requestIpHash,sendJson} from '../../_lib/server.js';
import {renderEmailHtml,renderEmailText} from '../../../lib/email-template.mjs';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('signup'),email:z.string().trim().toLowerCase().email().max(254),password:z.string().min(10).max(128),displayName:z.string().trim().max(120).default(''),redirectTo:z.string().url().max(1000)}).strict(),
  z.object({action:z.literal('recovery'),email:z.string().trim().toLowerCase().email().max(254),redirectTo:z.string().url().max(1000)}).strict()
]);
const windows=new Map();

function allowedOrigin(value){
  try{const url=new URL(value),site=new URL(process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com'),preview=process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:'';return url.origin===site.origin||url.origin===preview||url.hostname==='localhost'||url.hostname==='127.0.0.1'}catch{return false}
}
function rateLimit(key){
  const now=Date.now(),prior=windows.get(key)||[];const recent=prior.filter(time=>now-time<15*60*1000);recent.push(now);windows.set(key,recent);return recent.length<=5;
}
async function sendAuthEmail({to,subject,heading,copy,label,url,idempotencyKey}){
  if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)throw Object.assign(new Error('Email provider is not configured'),{statusCode:503,code:'email_provider_not_configured'});
  const blocks=[{type:'heading',text:heading},{type:'text',text:copy},{type:'button',label,url},{type:'divider'},{type:'signature',text:'ArkHimar PM · Secure project delivery'}];
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from:`ArkHimar PM <${process.env.RESEND_FROM_EMAIL}>`,to:[to],subject,html:renderEmailHtml({subject,blocks}),text:renderEmailText({subject,blocks})})});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.message||'Email delivery failed'),{statusCode:502,code:'email_delivery_failed'});return result.id;
}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendJson(res,405,{error:'method_not_allowed'})}
  if(Number(req.headers['content-length']||0)>16384)return sendJson(res,413,{error:'payload_too_large'});
  const parsed=schema.safeParse(req.body);if(!parsed.success)return sendJson(res,400,{error:'invalid_request'});
  const value=parsed.data;if(!allowedOrigin(value.redirectTo))return sendJson(res,400,{error:'invalid_redirect'});
  const limiter=`${requestIpHash(req)}:${value.action}`;if(!rateLimit(limiter))return sendJson(res,429,{error:'too_many_requests',message:'Please wait 15 minutes before requesting another email.'});
  try{
    const db=adminClient(),params=value.action==='signup'?{type:'signup',email:value.email,password:value.password,options:{data:{display_name:value.displayName},redirectTo:value.redirectTo}}:{type:'recovery',email:value.email,options:{redirectTo:value.redirectTo}};
    let {data,error}=await db.auth.admin.generateLink(params);
    if(error){
      if(value.action==='recovery'&&/not found/i.test(error.message||''))return sendJson(res,200,{ok:true});
      if(value.action==='signup'&&/already|registered|exists/i.test(error.message||'')){const retry=await db.auth.admin.generateLink({type:'magiclink',email:value.email,options:{redirectTo:value.redirectTo}});data=retry.data;error=retry.error}else throw error;
      if(error)throw error;
    }
    const link=data?.properties?.action_link;if(!link)throw new Error('Supabase did not return a verification link');
    const signup=value.action==='signup';
    await sendAuthEmail({to:value.email,subject:signup?'Verify your ArkHimar PM account':'Reset your ArkHimar PM password',heading:signup?'Verify your account':'Reset your password',copy:signup?'Your ArkHimar PM account is ready. Verify this email address to activate secure workspace access. This link remains valid for 24 hours.':'Use the secure link below to choose a new password. This link remains valid for 24 hours. If you did not request this, you can ignore this email.',label:signup?'Verify account':'Reset password',url:link,idempotencyKey:`auth/${value.action}/${data.user?.id||requestIpHash(req)}/${data.properties.hashed_token.slice(0,16)}`});
    return sendJson(res,201,{ok:true,delivery:'resend'});
  }catch(error){console.error('auth_email_failed',error?.message);return sendJson(res,error.statusCode||500,{error:error.code||'auth_email_failed',message:error.message||'Authentication email could not be sent'});}
}
