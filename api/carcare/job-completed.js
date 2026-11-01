import {createHash} from 'node:crypto';
import {createCarCareJobId,rejectCommon,staffJobSchema} from '../_lib/carcare.js';
import {resolveCarCareCustomerId} from '../_lib/carcare-intelligence.js';
import {carCarePdfAttachment,createCarCarePdf} from '../_lib/carcare-pdf.js';
import {adminClient,sendJson} from '../_lib/server.js';

const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

async function sendFeedbackRequest(payload){
  const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
  if(!apiKey||!from)throw new Error('CarCare email delivery is not configured.');
  const query=new URLSearchParams({job_id:payload.job_id,customer_id:payload.customer_id,customer_name:payload.customer_name,customer_email:payload.customer_email,location:payload.location});
  const link=`${process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com'}/carcare/feedback?${query}`;
  const subject=`How did your CarCare visit go? · ${payload.job_id}`;
  const html=`<div style="margin:0;background:#f3efe6;padding:28px 12px;font-family:Arial,sans-serif;color:#0d2622"><table role="presentation" style="width:100%;max-width:620px;margin:auto;border-collapse:collapse;background:#fffdf8"><tr><td style="padding:34px 32px 8px;color:#18a995;font-size:11px;font-weight:700;letter-spacing:2px">YOUR VISIT IS COMPLETE</td></tr><tr><td style="padding:6px 32px 20px"><h1 style="margin:0;font:400 48px/1.05 Georgia,serif">How did it really go?</h1><p style="font-size:17px">Hi ${escapeHtml(payload.customer_name)},</p><p style="color:#62716d;line-height:1.7">Your visit at <strong style="color:#0d2622">${escapeHtml(payload.location)}</strong> is complete. Your feedback helps the right person understand what happened and improve the next visit.</p><a href="${escapeHtml(link)}" style="display:inline-block;margin:18px 0;background:#d7f06a;color:#071a17;padding:17px 26px;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:1.6px">SHARE YOUR FEEDBACK ↗</a><div style="border-left:4px solid #18a995;background:#e5f5ee;padding:16px 18px;margin-top:18px"><div style="color:#62716d;font-size:10px;font-weight:700;letter-spacing:1.4px">VISIT REFERENCES</div><div style="margin-top:8px;font-size:14px"><strong>JOB ID:</strong> ${escapeHtml(payload.job_id)}</div><div style="margin-top:5px;font-size:14px"><strong>CUSTOMER ID:</strong> ${escapeHtml(payload.customer_id)}</div><div style="margin-top:5px;font-size:12px;color:#62716d"><strong>ATTENDED BY:</strong> ${escapeHtml(payload.staff_name)}</div></div><div style="margin-top:18px;border:1px solid #d7d9cf;padding:14px 16px;font-size:12px;color:#42534f"><strong>PRINT OR SAVE AS PDF</strong><br>A print-ready copy of this visit record is attached. Open it and choose Print to select an installed printer or Save as PDF.</div><p style="margin-top:24px;color:#62716d;font-size:12px;line-height:1.6">Good, bad or somewhere in between—your words go directly to the service team. We never publish feedback automatically.</p></td></tr><tr><td style="background:#071512;padding:22px 32px;color:#fff"><strong>ArkHimar CarCare</strong><div style="margin-top:7px;color:#9aaaa6;font-size:11px">A secure feedback experience by ArkHimar Consult.</div></td></tr></table></div>`;
  const text=`Hi ${payload.customer_name},\n\nYour CarCare visit at ${payload.location} is complete.\n\nJOB ID: ${payload.job_id}\nCUSTOMER ID: ${payload.customer_id}\nATTENDED BY: ${payload.staff_name}\n\nShare your feedback: ${link}\n\nA print-ready PDF is attached. Open it and choose Print to use an installed printer or Save as PDF.\n\nNo feedback is published automatically.`;
  const pdf=await createCarCarePdf({audience:'customer',title:'Your CarCare visit is complete',subtitle:'Keep this record with your service documents.',jobId:payload.job_id,customerId:payload.customer_id,customerName:payload.customer_name,customerEmail:payload.customer_email,location:payload.location,staffName:payload.staff_name,message:'Your visit is complete. Use the feedback link in the email to tell us how it went.'});
  const idempotency=createHash('sha256').update(`carcare-job-email:${payload.job_id}`).digest('hex').slice(0,32);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`carcare-job/${idempotency}`},body:JSON.stringify({from,to:[payload.customer_email],subject,html,text,attachments:[carCarePdfAttachment(pdf,payload.job_id,'carcare-visit')]}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`CarCare email provider rejected the request (${response.status}).`);
}

export default async function handler(req,res){
  if(rejectCommon(req,res,'carcare-job',8))return;
  const parsed=staffJobSchema.safeParse(req.body);
  if(!parsed.success)return sendJson(res,400,{error:'invalid_request',message:'Enter a valid customer, email, location and attending staff member.'});
  if(parsed.data.website)return sendJson(res,202,{ok:true});
  const {website,...payload}=parsed.data;
  try{
    const db=adminClient(),workspaceId=process.env.ARKHIMAR_WORKSPACE_ID;
    if(!workspaceId)throw new Error('CarCare workspace is not configured.');
    const customerId=await resolveCarCareCustomerId(db,workspaceId,payload.customer_email);
    const {count,error:countError}=await db.from('form_submissions').select('id',{count:'exact',head:true}).eq('workspace_id',workspaceId).eq('form_id','carcare-job').eq('fields->>customer_id',customerId);
    if(countError)throw countError;
    const visitCount=Number(count||0)+1,jobId=createCarCareJobId(customerId);
    const completed={...payload,customer_id:customerId,job_id:jobId,visit_count:visitCount,completed_at:new Date().toISOString()};
    const {error:storeError}=await db.from('form_submissions').insert({workspace_id:workspaceId,form_id:'carcare-job',submitter_name:payload.customer_name,submitter_email:payload.customer_email,message:`Attended by ${payload.staff_name}`,fields:completed,source:'carcare'});
    if(storeError)throw storeError;
    await sendFeedbackRequest(completed);
    return sendJson(res,200,{ok:true,job_id:jobId,customer_id:customerId,visit_count:visitCount,message:`The feedback request has been sent. Job ${jobId}; customer ${customerId}.`});
  }catch(error){
    console.error('carcare_job_pipeline_failed',error?.message);
    return sendJson(res,503,{error:'workflow_unavailable',message:'The feedback request could not be sent. Please try again.'});
  }
}
