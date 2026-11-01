import {createHash} from 'node:crypto';
import {z} from 'zod';
import {adminClient,sendJson} from './server.js';
import {carCareGenders,carCareLocations,carCareSalutation,carCareTitles,rateLimit,rejectCommon,sameOrigin} from './carcare.js';
import {resolveCarCareCustomerId} from './carcare-intelligence.js';
import {carCarePdfAttachment,createCarCarePdf} from './carcare-pdf.js';

const clean=z.string().trim().min(1).max(180),optional=z.string().trim().max(500).optional().default('');
const bookingSchema=z.object({customer_name:clean,customer_email:z.string().trim().email().max(254).transform(value=>value.toLowerCase()),gender:z.enum(carCareGenders),preferred_title:z.enum([...carCareTitles,'none']),phone:clean,contact_method:z.enum(['email','phone','whatsapp']),vehicle_make:clean,vehicle_model:clean,vehicle_year:z.coerce.number().int().min(1950).max(new Date().getFullYear()+1),registration:clean,vehicle_colour:optional,mileage:z.coerce.number().min(0).max(2000000),fuel_type:z.enum(['petrol','diesel','hybrid','electric','other']),transmission:z.enum(['automatic','manual','other']),vin:optional,services:z.array(z.string().trim().min(1).max(120)).min(1).max(30),location:z.enum(carCareLocations),preferred_date:z.string().date(),preferred_time:clean,alternative_date:z.string().date().optional().or(z.literal('')),alternative_time:optional,service_mode:z.enum(['drop_off','mobile']),safe_to_drive:z.enum(['yes','no','unsure']),urgency:z.enum(['normal','soon','urgent','unsafe']),problem_description:z.string().trim().min(8).max(4000),problem_started:optional,consent:z.union([z.literal(true),z.literal('on')]).transform(()=>true),website:z.string().max(200).optional().default('')}).passthrough();
const updateSchema=z.object({id:z.string().uuid(),booking_status:z.enum(['new_request','under_review','awaiting_customer_information','appointment_proposed','confirmed','rescheduled','in_progress','completed','cancelled','no_show']).optional(),assigned_staff:z.string().trim().max(120).optional(),internal_notes:z.string().trim().max(4000).optional(),customer_reply_status:z.enum(['tracking_not_configured','awaiting_reply','replied','no_reply','closed']).optional()}).strict();
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

function bookingId(number,date=new Date()){return`BKG-${String(number).padStart(6,'0')}-${date.toISOString().slice(0,10).replaceAll('-','')}`}
async function sendConfirmation(payload,recordId){
  if(!process.env.RESEND_API_KEY)return{status:'not_configured',providerId:null};
  const salutation=carCareSalutation(payload.customer_name,payload.preferred_title),services=payload.services.join(', '),base=process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com';
  const inbound=String(process.env.CARCARE_INBOUND_DOMAIN||'').trim(),replyTo=inbound?`reply+${recordId}@${inbound}`:'projects@arkhimar.com';
  const html=`<div style="margin:0;background:#f3efe6;padding:28px 12px;font-family:Arial,sans-serif;color:#0d2622"><table role="presentation" style="width:100%;max-width:640px;margin:auto;border-collapse:collapse;background:#fffdf8"><tr><td style="padding:34px 34px 8px;color:#18a995;font-size:11px;font-weight:800;letter-spacing:2px">SESSION REQUEST RECEIVED</td></tr><tr><td style="padding:8px 34px 30px"><h1 style="margin:0 0 20px;font:400 44px/1.08 Georgia,serif">We’re preparing your CarCare visit.</h1><p style="font-size:16px">Hi ${escapeHtml(salutation)},</p><p style="color:#52635f;line-height:1.7">Your appointment request has been received. A CarCare team member will review the requested services and confirm the final date and time.</p><div style="margin-top:24px;border-left:4px solid #18a995;background:#e5f5ee;padding:18px"><div><strong>BOOKING ID:</strong> ${escapeHtml(payload.booking_id)}</div><div style="margin-top:7px"><strong>CUSTOMER ID:</strong> ${escapeHtml(payload.customer_id)}</div><div style="margin-top:7px"><strong>REQUESTED:</strong> ${escapeHtml(payload.preferred_date)} · ${escapeHtml(payload.preferred_time)}</div><div style="margin-top:7px"><strong>LOCATION:</strong> ${escapeHtml(payload.location)}</div></div><h2 style="margin:26px 0 8px;font:600 16px Arial">Requested services</h2><p style="color:#52635f;line-height:1.7">${escapeHtml(services)}</p><p style="font-size:12px;color:#62716d">This is a request, not a confirmed appointment. Reply to this email if you need to add information.</p><a href="${base}/carcare/book" style="display:inline-block;margin-top:15px;background:#071a17;color:#fff;text-decoration:none;padding:14px 20px;font-size:10px;font-weight:800;letter-spacing:1px">BOOK ANOTHER SESSION ↗</a></td></tr><tr><td style="background:#071512;padding:22px 34px;color:#fff"><strong>ArkHimar CarCare</strong></td></tr></table></div>`;
  const text=`Hi ${salutation},\n\nYour appointment request has been received and is awaiting confirmation.\n\nBOOKING ID: ${payload.booking_id}\nCUSTOMER ID: ${payload.customer_id}\nREQUESTED: ${payload.preferred_date} · ${payload.preferred_time}\nLOCATION: ${payload.location}\nSERVICES: ${services}\n\nThis is not yet a confirmed appointment.`;
  const pdf=await createCarCarePdf({audience:'customer',title:'CarCare session request',subtitle:'Awaiting appointment confirmation.',customerId:payload.customer_id,customerName:salutation,customerEmail:payload.customer_email,location:payload.location,message:`Booking ${payload.booking_id}. Requested ${payload.preferred_date} at ${payload.preferred_time}. Services: ${services}`});
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`carcare-booking/${createHash('sha256').update(recordId).digest('hex').slice(0,32)}`},body:JSON.stringify({from:'ArkHimar CarCare <projects@arkhimar.com>',to:[payload.customer_email],reply_to:replyTo,subject:`CarCare session request received · ${payload.booking_id}`,html,text,attachments:[carCarePdfAttachment(pdf,payload.booking_id,'carcare-booking')]}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return{status:'failed',providerId:null};const data=await response.json().catch(()=>({}));return{status:'sent',providerId:data.id||null};
}

async function adminBookings(req,res){
  if(!['GET','PATCH'].includes(req.method)){res.setHeader('Allow','GET, PATCH');return sendJson(res,405,{error:'method_not_allowed'})}
  if(!rateLimit(req,'carcare-booking-admin',80,60000))return sendJson(res,429,{error:'rate_limited'});
  if(req.method!=='GET'&&!sameOrigin(req))return sendJson(res,403,{error:'origin_not_allowed',message:'Open the CarCare dashboard before changing a booking.'});
  try{
    const db=adminClient(),workspaceId=process.env.ARKHIMAR_WORKSPACE_ID;if(!workspaceId)throw new Error('CarCare workspace is not configured.');
    if(req.method==='PATCH'){
      const parsed=updateSchema.safeParse(req.body);if(!parsed.success)return sendJson(res,400,{error:'invalid_update'});
      const {data:record,error}=await db.from('form_submissions').select('id,fields').eq('workspace_id',workspaceId).eq('form_id','carcare-booking').eq('id',parsed.data.id).single();if(error||!record)return sendJson(res,404,{error:'not_found'});
      const fields={...(record.fields||{}),...Object.fromEntries(Object.entries(parsed.data).filter(([key,value])=>key!=='id'&&value!==undefined)),updated_at:new Date().toISOString()};
      const {error:updateError}=await db.from('form_submissions').update({fields}).eq('id',record.id);if(updateError)throw updateError;
      return sendJson(res,200,{ok:true,fields});
    }
    const {data,error}=await db.from('form_submissions').select('id,submitter_name,submitter_email,message,fields,received_at').eq('workspace_id',workspaceId).eq('form_id','carcare-booking').order('received_at',{ascending:false}).limit(500);if(error)throw error;
    const records=data||[],summary={total:records.length,newRequests:records.filter(item=>item.fields?.booking_status==='new_request').length,awaitingReply:records.filter(item=>['sent','delivered','opened','clicked'].includes(item.fields?.email_delivery_status)&&item.fields?.customer_reply_status==='awaiting_reply').length,replied:records.filter(item=>item.fields?.customer_reply_status==='replied').length};
    return sendJson(res,200,{ok:true,summary,records});
  }catch(error){console.error('carcare_booking_admin_failed',error?.message);return sendJson(res,error?.statusCode||500,{error:error?.code||'dashboard_unavailable',message:error?.message||'The management desk is unavailable.'})}
}

export default async function handler(req,res){
  if(req.query?.mode==='admin'||req.query?.action==='admin')return adminBookings(req,res);
  if(rejectCommon(req,res,'carcare-booking',8))return;
  const parsed=bookingSchema.safeParse(req.body);if(!parsed.success)return sendJson(res,400,{error:'invalid_booking',message:'Complete your contact, vehicle, service and appointment details.'});
  if(parsed.data.website)return sendJson(res,202,{ok:true});
  if(Date.parse(`${parsed.data.preferred_date}T23:59:59`)<Date.now())return sendJson(res,400,{error:'invalid_date',message:'Choose today or a future appointment date.'});
  if(parsed.data.alternative_date&&parsed.data.alternative_date<parsed.data.preferred_date)return sendJson(res,400,{error:'invalid_alternative_date',message:'Choose an alternative date on or after the preferred date.'});
  try{
    const db=adminClient(),workspaceId=process.env.ARKHIMAR_WORKSPACE_ID;if(!workspaceId)throw new Error('CarCare workspace is not configured.');
    const customerId=await resolveCarCareCustomerId(db,workspaceId,parsed.data.customer_email),{count,error:countError}=await db.from('form_submissions').select('id',{count:'exact',head:true}).eq('workspace_id',workspaceId).eq('form_id','carcare-booking');if(countError)throw countError;
    const fields={...parsed.data,consent_at:new Date().toISOString(),customer_id:customerId,booking_id:bookingId(Number(count||0)+1),booking_status:'new_request',email_delivery_status:'queued',customer_reply_status:'awaiting_reply',assigned_staff:'',internal_notes:'',created_at:new Date().toISOString()};delete fields.website;
    const {data:record,error}=await db.from('form_submissions').insert({workspace_id:workspaceId,form_id:'carcare-booking',submitter_name:fields.customer_name,submitter_email:fields.customer_email,message:fields.problem_description,fields,source:'carcare'}).select('id,received_at').single();if(error)throw error;
    const delivery=await sendConfirmation(fields,record.id);fields.email_delivery_status=delivery.status;fields.customer_reply_status=delivery.status==='sent'?'awaiting_reply':'closed';fields.email_provider_id=delivery.providerId;fields.email_sent_at=delivery.status==='sent'?new Date().toISOString():null;await db.from('form_submissions').update({fields}).eq('id',record.id);
    return sendJson(res,200,{ok:true,record_id:record.id,booking_id:fields.booking_id,customer_id:customerId,email_status:delivery.status,message:'Your session request has been received and is awaiting confirmation.'});
  }catch(error){console.error('carcare_booking_failed',error?.message);return sendJson(res,503,{error:'booking_unavailable',message:'The booking request could not be completed. Please try again.'})}
}
