import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {adminClient,bearerToken,sendJson} from '../_lib/server.js';

export const config={api:{bodyParser:false}};

const checkoutSchema=z.object({workspaceId:z.string().uuid(),plan:z.enum(['free','growth','professional','enterprise']),billingPeriod:z.enum(['monthly','annual']).default('monthly'),seats:z.coerce.number().int().min(1).max(500).default(1)}).strict();
const paidPlans=new Set(['growth','professional']);

async function hydrate(req){
  if(req.rawBody)return;
  if(['GET','HEAD'].includes(req.method)){req.rawBody=Buffer.alloc(0);req.body=req.body||{};return}
  const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  req.rawBody=Buffer.concat(chunks);
  if(!req.rawBody.length){req.body={};return}
  req.body=JSON.parse(req.rawBody.toString('utf8'));
}

async function actor(req,workspaceId){
  const token=bearerToken(req);if(!token)throw Object.assign(new Error('Sign in to manage a subscription.'),{statusCode:401,code:'authentication_required'});
  const db=adminClient(),{data:{user},error}=await db.auth.getUser(token);if(error||!user)throw Object.assign(new Error('Your session has expired.'),{statusCode:401,code:'invalid_session'});
  const {data:membership}=await db.from('workspace_members').select('role').eq('workspace_id',workspaceId).eq('user_id',user.id).maybeSingle();
  if(!membership||!['owner','admin'].includes(membership.role))throw Object.assign(new Error('Only a workspace owner or admin can change its subscription.'),{statusCode:403,code:'permission_denied'});
  return{db,user,membership};
}

export function billingPrice(plan,period,seats,environment=process.env){
  const currency=String(environment.PAYSTACK_CURRENCY||'USD').toUpperCase();
  if(!['USD','NGN'].includes(currency))throw new Error('PAYSTACK_CURRENCY must be USD or NGN.');
  const envKey=`PAYSTACK_${plan.toUpperCase()}_${period.toUpperCase()}_UNIT_SUBUNIT`;
  let unit=Number(environment[envKey]);
  if(!Number.isInteger(unit)||unit<=0){
    if(currency!=='USD')throw new Error(`${envKey} is required for NGN billing.`);
    unit={growth:{monthly:1000,annual:800*12},professional:{monthly:2000,annual:1600*12}}[plan]?.[period];
  }
  return{currency,amountSubunit:unit*seats,unitSubunit:unit};
}

async function paystack(path,{method='GET',body}={}){
  const secret=process.env.PAYSTACK_SECRET_KEY;if(!secret)throw Object.assign(new Error('Payment checkout is not configured yet.'),{statusCode:503,code:'payment_not_configured'});
  const response=await fetch(`https://api.paystack.co${path}`,{method,headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)}),result=await response.json().catch(()=>({}));
  if(!response.ok||result.status===false)throw Object.assign(new Error(result.message||'The payment provider could not complete that request.'),{statusCode:502,code:'payment_provider_error'});
  return result.data;
}

async function planCode(db,{plan,billingPeriod,seats,currency,amountSubunit}){
  const match=await db.from('billing_plan_variants').select('provider_plan_code').eq('provider','paystack').eq('plan',plan).eq('billing_period',billingPeriod).eq('seats',seats).eq('currency',currency).eq('amount_subunit',amountSubunit).maybeSingle();
  if(match.error)throw match.error;if(match.data?.provider_plan_code)return match.data.provider_plan_code;
  const created=await paystack('/plan',{method:'POST',body:{name:`ArkHimar PM ${plan} · ${seats} seat${seats===1?'':'s'} · ${billingPeriod}`,amount:amountSubunit,interval:billingPeriod==='annual'?'annually':'monthly',currency,description:`ArkHimar PM ${plan} subscription for ${seats} paid seat${seats===1?'':'s'}`,send_invoices:true,send_sms:false}});
  const row={provider:'paystack',plan,billing_period:billingPeriod,seats,currency,amount_subunit:amountSubunit,provider_plan_code:created.plan_code},{error}=await db.from('billing_plan_variants').insert(row);
  if(error){const existing=await db.from('billing_plan_variants').select('provider_plan_code').eq('provider','paystack').eq('plan',plan).eq('billing_period',billingPeriod).eq('seats',seats).eq('currency',currency).eq('amount_subunit',amountSubunit).maybeSingle();if(existing.data)return existing.data.provider_plan_code;throw error}
  return created.plan_code;
}

async function activate(db,checkout,provider={}){
  const now=new Date().toISOString();
  const {data:current}=await db.from('workspace_subscriptions').select('provider_customer_code,provider_subscription_code,provider_email_token,current_period_end').eq('workspace_id',checkout.workspace_id).maybeSingle();
  const subscription={workspace_id:checkout.workspace_id,plan:checkout.plan,billing_period:checkout.billing_period,seats:checkout.seats,status:'active',provider:checkout.provider,provider_customer_code:provider.customerCode||current?.provider_customer_code||null,provider_subscription_code:provider.subscriptionCode||current?.provider_subscription_code||null,provider_email_token:provider.emailToken||current?.provider_email_token||null,provider_plan_code:checkout.provider_plan_code||null,current_period_end:provider.periodEnd||current?.current_period_end||null,updated_at:now,updated_by:checkout.user_id};
  const {error}=await db.from('workspace_subscriptions').upsert(subscription);if(error)throw error;
  await db.from('billing_checkout_sessions').update({status:'successful',completed_at:now}).eq('id',checkout.id);
  return subscription;
}

async function checkout(req,res){
  const parsed=checkoutSchema.safeParse(req.body);if(!parsed.success)return sendJson(res,400,{error:'invalid_checkout',message:'Choose a valid plan, billing period and seat count.'});
  const value=parsed.data,{db,user}=await actor(req,value.workspaceId),email=String(user.email||'').toLowerCase();
  const {data:current}=await db.from('workspace_subscriptions').select('*').eq('workspace_id',value.workspaceId).maybeSingle();
  if(current?.provider==='paystack'&&['active','past_due','non_renewing'].includes(current.status)){
    const same=current.plan===value.plan&&current.billing_period===value.billingPeriod&&Number(current.seats)===value.seats;
    if(same)return sendJson(res,200,{ok:true,status:current.status,plan:current.plan,redirectUrl:'/pm/?billing=existing'});
    return sendJson(res,409,{error:'subscription_change_requires_review',message:'This workspace already has a paid subscription. Contact projects@arkhimar.com before changing its plan or seat count so you are not charged twice.'});
  }
  if(value.plan==='free'){
    const row={workspace_id:value.workspaceId,user_id:user.id,email,plan:'free',billing_period:value.billingPeriod,seats:Math.min(value.seats,3),currency:'USD',amount_subunit:0,provider:'none',status:'successful',completed_at:new Date().toISOString()},{data,error}=await db.from('billing_checkout_sessions').insert(row).select().single();if(error)throw error;await activate(db,data);return sendJson(res,200,{ok:true,status:'active',plan:'free',redirectUrl:'/pm/?billing=free'});
  }
  if(value.plan==='enterprise'){
    const row={workspace_id:value.workspaceId,user_id:user.id,email,plan:'enterprise',billing_period:'annual',seats:value.seats,currency:'USD',amount_subunit:0,provider:'none',status:'contact_required'},{error}=await db.from('billing_checkout_sessions').insert(row);if(error)throw error;await db.from('workspace_subscriptions').upsert({workspace_id:value.workspaceId,plan:'enterprise',billing_period:'annual',seats:value.seats,status:'contact_required',provider:'none',updated_at:new Date().toISOString(),updated_by:user.id});return sendJson(res,200,{ok:true,status:'contact_required',redirectUrl:'/project-management/early-access/#enterprise'});
  }
  if(!paidPlans.has(value.plan))return sendJson(res,400,{error:'invalid_plan'});
  const {currency,amountSubunit}=billingPrice(value.plan,value.billingPeriod,value.seats),providerPlanCode=await planCode(db,{...value,currency,amountSubunit}),reference=`AKHPM-${Date.now()}-${randomBytes(6).toString('hex')}`,site=(process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com').replace(/\/$/,'');
  const row={workspace_id:value.workspaceId,user_id:user.id,email,plan:value.plan,billing_period:value.billingPeriod,seats:value.seats,currency,amount_subunit:amountSubunit,provider:'paystack',provider_reference:reference,provider_plan_code:providerPlanCode,status:'initialized'},{data:session,error}=await db.from('billing_checkout_sessions').insert(row).select().single();if(error)throw error;
  const metadata={checkout_id:session.id,workspace_id:value.workspaceId,user_id:user.id,plan:value.plan,billing_period:value.billingPeriod,seats:value.seats};
  try{
    const initialized=await paystack('/transaction/initialize',{method:'POST',body:{email,amount:amountSubunit,currency,plan:providerPlanCode,reference,callback_url:`${site}/pm/?billing=return&reference=${encodeURIComponent(reference)}`,metadata:JSON.stringify(metadata)}});
    await db.from('billing_checkout_sessions').update({status:'pending'}).eq('id',session.id);
    return sendJson(res,200,{ok:true,status:'pending',authorizationUrl:initialized.authorization_url,reference});
  }catch(error){await db.from('billing_checkout_sessions').update({status:'failed'}).eq('id',session.id);throw error}
}

function providerDetails(data={}){return{customerCode:data.customer?.customer_code||data.customer_code||null,subscriptionCode:data.subscription?.subscription_code||data.subscription_code||null,emailToken:data.subscription?.email_token||data.email_token||null,periodEnd:data.subscription?.next_payment_date||data.next_payment_date||data.paid_at||null}}

async function verify(req,res){
  const reference=String(req.query.reference||'');if(!/^AKHPM-[A-Za-z0-9-]{12,80}$/.test(reference))return sendJson(res,400,{error:'invalid_reference'});
  const token=bearerToken(req);if(!token)return sendJson(res,401,{error:'authentication_required'});const db=adminClient(),{data:{user}}=await db.auth.getUser(token);if(!user)return sendJson(res,401,{error:'invalid_session'});
  const {data:session}=await db.from('billing_checkout_sessions').select('*').eq('provider_reference',reference).eq('user_id',user.id).maybeSingle();if(!session)return sendJson(res,404,{error:'checkout_not_found'});
  if(session.status==='successful')return sendJson(res,200,{ok:true,status:'active',plan:session.plan});
  const transaction=await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);let metadata=transaction.metadata||{};if(typeof metadata==='string'){try{metadata=JSON.parse(metadata||'{}')}catch{metadata={}}}
  if(transaction.status!=='success'||Number(transaction.amount)!==Number(session.amount_subunit)||transaction.currency!==session.currency||metadata.workspace_id!==session.workspace_id)return sendJson(res,409,{error:'payment_not_verified',status:transaction.status||'unknown'});
  await activate(db,session,providerDetails(transaction));return sendJson(res,200,{ok:true,status:'active',plan:session.plan});
}

async function status(req,res){
  const workspaceId=String(req.query.workspaceId||'');if(!z.string().uuid().safeParse(workspaceId).success)return sendJson(res,400,{error:'invalid_workspace'});const {db}=await actor(req,workspaceId),{data}=await db.from('workspace_subscriptions').select('*').eq('workspace_id',workspaceId).maybeSingle();return sendJson(res,200,{ok:true,subscription:data||{workspace_id:workspaceId,plan:'free',billing_period:'monthly',seats:1,status:'active',provider:'none'}});
}

export function paystackWebhookSignatureValid(raw,provided,secret=process.env.PAYSTACK_SECRET_KEY){
  if(!secret||!provided)return false;const expected=createHmac('sha512',secret).update(raw).digest('hex');
  try{return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(String(provided),'hex'))}catch{return false}
}

async function webhook(req,res){
  if(!paystackWebhookSignatureValid(req.rawBody,String(req.headers['x-paystack-signature']||'')))return sendJson(res,401,{error:'invalid_signature'});
  const event=req.body||{},data=event.data||{},db=adminClient();
  if(event.event==='charge.success'&&data.reference){const {data:session}=await db.from('billing_checkout_sessions').select('*').eq('provider_reference',data.reference).maybeSingle();if(session&&Number(data.amount)===Number(session.amount_subunit)&&data.currency===session.currency)await activate(db,session,providerDetails(data))}
  const subscriptionCode=data.subscription_code||data.subscription?.subscription_code;
  if(subscriptionCode){const changes={updated_at:new Date().toISOString()};if(event.event==='subscription.create')Object.assign(changes,{status:'active',provider_subscription_code:subscriptionCode,provider_customer_code:data.customer?.customer_code||null,provider_email_token:data.email_token||null,current_period_end:data.next_payment_date||null});if(event.event==='subscription.disable')changes.status='cancelled';if(event.event==='subscription.not_renew')changes.status='non_renewing';if(event.event==='invoice.payment_failed')changes.status='past_due';await db.from('workspace_subscriptions').update(changes).eq('provider_subscription_code',subscriptionCode)}
  return sendJson(res,200,{ok:true});
}

export default async function handler(req,res){
  try{await hydrate(req)}catch{return sendJson(res,400,{error:'invalid_json'})}
  const action=String(req.query.action||''),routes={checkout:['POST',checkout],verify:['GET',verify],status:['GET',status],webhook:['POST',webhook]},route=routes[action];if(!route)return sendJson(res,404,{error:'route_not_found'});if(req.method!==route[0])return sendJson(res,405,{error:'method_not_allowed'});
  try{return await route[1](req,res)}catch(error){console.error(`billing_${action}_failed`,error.message);return sendJson(res,error.statusCode||500,{error:error.code||'billing_failed',message:error.message||'Billing could not complete that request.'})}
}
