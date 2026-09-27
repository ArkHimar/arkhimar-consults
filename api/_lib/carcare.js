import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {adminClient,bearerToken,requestIpHash,sendJson} from './server.js';

const clean=z.string().trim().min(1).max(120);
export const carCareLocations=['Abuja','Lagos','Enugu','Ogun State','Port Harcourt'];
export const carCareGenders=['female','male','non_binary','prefer_not_to_say'];
export const carCareTitles=['Mr.','Mrs.','Miss','Ms.','Dr.'];
export function carCareSalutation(customerName,preferredTitle=''){
  const name=String(customerName||'').trim()||'there',title=carCareTitles.includes(String(preferredTitle||'').trim())?String(preferredTitle).trim():'';
  if(!title)return name;
  const withoutExistingTitle=name.replace(/^(mr|mrs|miss|ms|dr)\.?\s+/i,'').trim()||name;
  return`${title} ${withoutExistingTitle}`;
}
const jobSchema=z.object({
  job_id:z.string().trim().min(1).max(80),
  customer_id:z.string().trim().max(80).optional().default(''),
  customer_name:clean,
  customer_email:z.string().trim().email().max(254).transform(value=>value.toLowerCase()),
  gender:z.enum([...carCareGenders,'']).optional().default(''),
  preferred_title:z.enum([...carCareTitles,'none','']).optional().default(''),
  location:z.enum(carCareLocations),
  website:z.string().max(200).optional().default('')
}).passthrough();

export const feedbackSchema=jobSchema.extend({feedback:z.string().trim().min(8).max(4000),rating:z.coerce.number().int().min(1).max(5)});
export const staffJobSchema=z.object({
  customer_name:clean,
  customer_email:z.string().trim().email().max(254).transform(value=>value.toLowerCase()),
  location:z.enum(carCareLocations),
  staff_name:clean,
  website:z.string().max(200).optional().default('')
}).passthrough();
const buckets=new Map();

export async function requireCarCareManager(req){
  const token=bearerToken(req);
  if(!token)throw Object.assign(new Error('Sign in to ArkHimar PM to open the CarCare management desk.'),{statusCode:401,code:'authentication_required'});
  const workspaceId=process.env.ARKHIMAR_WORKSPACE_ID;
  if(!workspaceId)throw new Error('CarCare workspace is not configured.');
  const db=adminClient(),{data:{user},error}=await db.auth.getUser(token);
  if(error||!user)throw Object.assign(new Error('Your management session has expired. Sign in again.'),{statusCode:401,code:'invalid_session'});
  const {data:member,error:membershipError}=await db.from('workspace_members').select('role').eq('workspace_id',workspaceId).eq('user_id',user.id).maybeSingle();
  if(membershipError)throw membershipError;
  if(!member||!['owner','admin','project_manager'].includes(member.role))throw Object.assign(new Error('Your account does not have permission to manage CarCare records.'),{statusCode:403,code:'permission_denied'});
  return{db,workspaceId,user,role:member.role};
}

export function createCarCareCustomerId(customerEmail){
  const identitySecret=process.env.CARCARE_ID_SECRET||process.env.CARCARE_WEBHOOK_SECRET||process.env.CARCARE_STAFF_ACCESS_KEY;
  if(!identitySecret)throw new Error('CarCare ID generation is not configured.');
  const normalizedEmail=String(customerEmail).trim().toLowerCase();
  const digest=createHmac('sha256',identitySecret).update(`carcare-customer:${normalizedEmail}`).digest();
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let customerToken='';
  for(let index=0;index<7;index+=1)customerToken+=alphabet[digest[index]&31];
  return`CUS-${customerToken}`;
}

export function createCarCareJobId(customerId,date=new Date()){
  const token=String(customerId).replace(/^CUS-/,'').slice(0,7);
  const day=date.toISOString().slice(0,10).replaceAll('-','');
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=randomBytes(6);
  let nonce='';
  for(let index=0;index<6;index+=1)nonce+=alphabet[bytes[index]&31];
  return`JOB-${token}-${day}-${nonce}`;
}

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
    if(response.ok){
      const contentType=String(response.headers?.get?.('content-type')||'');
      let data={};
      if(contentType.includes('application/json'))try{data=await response.json()}catch{}
      return{ok:true,data};
    }
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
