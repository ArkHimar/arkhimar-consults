import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {requestIpHash,sendJson} from './server.js';

const clean=z.string().trim().min(1).max(120);
const jobSchema=z.object({
  job_id:z.string().trim().min(1).max(80),
  customer_id:z.string().trim().max(80).optional().default(''),
  customer_name:clean,
  customer_email:z.string().trim().email().max(254).transform(value=>value.toLowerCase()),
  location:clean,
  website:z.string().max(200).optional().default('')
}).passthrough();

export const feedbackSchema=jobSchema.extend({feedback:z.string().trim().min(8).max(4000),rating:z.coerce.number().int().min(1).max(5)});
export const staffJobSchema=jobSchema.extend({access_key:z.string().min(1).max(300)});
const buckets=new Map();

export function sameOrigin(req){
  const origin=String(req.headers.origin||'');
  if(!origin)return true;
  try{return new URL(origin).host===String(req.headers['x-forwarded-host']||req.headers.host||'')}catch{return false}
}

export function rateLimit(req,scope,limit=12,windowMs=60000){
  const now=Date.now(),key=`${scope}:${requestIpHash(req)}`,current=buckets.get(key);
  if(!current||current.resetAt<=now){buckets.set(key,{count:1,resetAt:now+windowMs});return true}
  if(current.count>=limit)return false;
  current.count+=1;
  if(buckets.size>2000)for(const [bucketKey,bucket] of buckets)if(bucket.resetAt<=now)buckets.delete(bucketKey);
  return true;
}

export function secretsMatch(provided,expected){
  const left=Buffer.from(String(provided||'')),right=Buffer.from(String(expected||''));
  return left.length>0&&left.length===right.length&&timingSafeEqual(left,right);
}

export async function forwardCarCare(kind,payload){
  const url=kind==='job'?process.env.CARCARE_JOB_WEBHOOK_URL:process.env.CARCARE_FEEDBACK_WEBHOOK_URL;
  const secret=process.env.CARCARE_WEBHOOK_SECRET;
  if(!url||!secret)return{ok:false,status:503,message:'CarCare automation is not configured yet.'};
  let endpoint;try{endpoint=new URL(url)}catch{return{ok:false,status:503,message:'CarCare automation is not configured correctly.'}}
  const local=process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(endpoint.hostname);
  if(endpoint.protocol!=='https:'&&!local)return{ok:false,status:503,message:'CarCare automation requires a secure webhook URL.'};
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Workflow-Secret':secret},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    if(response.ok)return{ok:true};
    console.error('carcare_webhook_rejected',JSON.stringify({kind,upstreamHost:endpoint.host,upstreamStatus:response.status}));
    return{ok:false,status:502,message:'The automation could not accept this request. Please try again.'};
  }catch(error){
    console.error('carcare_webhook_unavailable',JSON.stringify({kind,upstreamHost:endpoint.host,error:error?.name||'Error'}));
    return{ok:false,status:502,message:'The automation is temporarily unavailable. Please try again.'};
  }
}

export function rejectCommon(req,res,scope,limit){
  if(req.method!=='POST'){res.setHeader('Allow','POST');sendJson(res,405,{error:'method_not_allowed',message:'Use POST for this endpoint.'});return true}
  if(Number(req.headers['content-length']||0)>32768){sendJson(res,413,{error:'payload_too_large',message:'The request is too large.'});return true}
  if(!sameOrigin(req)){sendJson(res,403,{error:'origin_not_allowed',message:'This request origin is not allowed.'});return true}
  if(!rateLimit(req,scope,limit)){sendJson(res,429,{error:'rate_limited',message:'Too many requests. Please wait and try again.'});return true}
  return false;
}
