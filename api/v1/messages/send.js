import {z} from 'zod';
import {adminClient,bearerToken,requireMethod,sendJson} from '../../_lib/server.js';
import {renderEmailHtml,renderEmailText} from '../../../lib/email-template.mjs';

const email=z.string().email().max(254);
const block=z.discriminatedUnion('type',[
  z.object({type:z.literal('heading'),text:z.string().max(500)}),
  z.object({type:z.literal('text'),text:z.string().max(10000)}),
  z.object({type:z.literal('button'),label:z.string().max(120),url:z.string().url().max(2000)}),
  z.object({type:z.literal('divider')}),
  z.object({type:z.literal('signature'),text:z.string().max(1000)})
]);
const schema=z.object({workspaceId:z.string().uuid(),projectId:z.string().uuid().nullable().optional(),templateId:z.string().uuid().nullable().optional(),to:z.array(email).min(1).max(50),cc:z.array(email).max(50).default([]),bcc:z.array(email).max(50).default([]),subject:z.string().trim().min(1).max(200),preheader:z.string().max(180).default(''),blocks:z.array(block).min(1).max(30),attachmentIds:z.array(z.string().uuid()).max(10).default([]),idempotencyKey:z.string().uuid()}).strict();

export default async function handler(req,res){
  if(!requireMethod(req,res))return;
  if(Number(req.headers['content-length']||0)>262144)return sendJson(res,413,{error:'payload_too_large'});
  const token=bearerToken(req),parsed=schema.safeParse(req.body);
  if(!token)return sendJson(res,401,{error:'authentication_required'});
  if(!parsed.success)return sendJson(res,400,{error:'invalid_request',issues:parsed.error.issues.map(({path,message})=>({field:path.join('.'),message}))});
  const value=parsed.data;
  let db,queuedId=null;
  try{
    db=adminClient();
    const {data:{user},error:userError}=await db.auth.getUser(token);
    if(userError||!user)return sendJson(res,401,{error:'invalid_session'});
    const {data:membership}=await db.from('workspace_members').select('role').eq('workspace_id',value.workspaceId).eq('user_id',user.id).maybeSingle();
    if(!membership||!['owner','admin','project_manager'].includes(membership.role))return sendJson(res,403,{error:'permission_denied'});
    if(value.projectId){const {data:project}=await db.from('projects').select('id').eq('id',value.projectId).eq('workspace_id',value.workspaceId).maybeSingle();if(!project)return sendJson(res,400,{error:'project_not_in_workspace'});}
    const {data:existing}=await db.from('outbound_messages').select('id,status,provider_message_id').eq('idempotency_key',value.idempotencyKey).maybeSingle();
    if(existing)return sendJson(res,200,{ok:existing.status==='sent',messageId:existing.id,providerMessageId:existing.provider_message_id,status:existing.status,idempotent:true});
    const {data:brand}=await db.from('workspace_brand_settings').select('*').eq('workspace_id',value.workspaceId).maybeSingle();
    const {data:queued,error:queueError}=await db.from('outbound_messages').insert({workspace_id:value.workspaceId,project_id:value.projectId||null,template_id:value.templateId||null,recipients:{to:value.to,cc:value.cc,bcc:value.bcc},subject:value.subject,blocks:value.blocks,attachment_ids:value.attachmentIds,status:'queued',idempotency_key:value.idempotencyKey,created_by:user.id}).select('id').single();
    if(queueError)throw queueError;
    queuedId=queued.id;
    if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL){await db.from('outbound_messages').update({status:'failed',error_message:'Email provider is not configured'}).eq('id',queued.id);return sendJson(res,503,{error:'email_provider_not_configured'});}
    const attachments=[];let totalBytes=0;
    if(value.attachmentIds.length){
      const {data:docs,error:docsError}=await db.from('project_documents').select('id,filename,size_bytes,storage_path').eq('workspace_id',value.workspaceId).in('id',value.attachmentIds);
      if(docsError||docs.length!==value.attachmentIds.length)throw new Error('One or more attachments are unavailable');
      for(const doc of docs){totalBytes+=Number(doc.size_bytes);if(totalBytes>10485760)throw new Error('Email attachments exceed the 10 MB workspace limit');const {data:file,error:fileError}=await db.storage.from('project-documents').download(doc.storage_path);if(fileError)throw fileError;attachments.push({filename:doc.filename,content:Buffer.from(await file.arrayBuffer()).toString('base64')});}
    }
    for(const [pathField,urlField,contentId] of [['logo_path','logo_url','workspace-logo'],['letterhead_path','letterhead_url','workspace-letterhead']]){
      const path=brand?.[pathField];if(!path||path.toLowerCase().endsWith('.pdf'))continue;
      const {data:file,error:fileError}=await db.storage.from('workspace-brand-assets').download(path);if(fileError)throw fileError;
      const bytes=Buffer.from(await file.arrayBuffer());totalBytes+=bytes.length;if(totalBytes>10485760)throw new Error('Email and brand attachments exceed the 10 MB workspace limit');
      attachments.push({filename:path.split('/').pop(),content:bytes.toString('base64'),content_id:contentId});brand[urlField]=`cid:${contentId}`;
    }
    const senderName=(brand?.sender_name||'ArkHimar PM').replace(/[<>\r\n]/g,'').slice(0,120),from=`${senderName} <${process.env.RESEND_FROM_EMAIL}>`,html=renderEmailHtml({subject:value.subject,preheader:value.preheader,blocks:value.blocks,brand}),text=renderEmailText({subject:value.subject,blocks:value.blocks,brand});
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`message/${value.idempotencyKey}`},body:JSON.stringify({from,to:value.to,cc:value.cc,bcc:value.bcc,reply_to:brand?.reply_to||undefined,subject:value.subject,html,text,attachments})});
    const result=await response.json();
    if(!response.ok){await db.from('outbound_messages').update({status:'failed',error_message:String(result.message||'Provider rejected the email').slice(0,1000)}).eq('id',queued.id);return sendJson(res,502,{error:'email_delivery_failed',message:result.message||'Provider rejected the email'});}
    await db.from('outbound_messages').update({status:'sent',provider_message_id:result.id,sent_at:new Date().toISOString()}).eq('id',queued.id);
    await db.from('audit_events').insert({workspace_id:value.workspaceId,project_id:value.projectId||null,actor_user_id:user.id,action:'sent',entity_type:'outbound_message',entity_id:queued.id,metadata:{subject:value.subject,recipient_count:value.to.length,attachment_count:attachments.length}});
    return sendJson(res,201,{ok:true,messageId:queued.id,providerMessageId:result.id,status:'sent'});
  }catch(error){
    if(db&&queuedId)await db.from('outbound_messages').update({status:'failed',error_message:String(error?.message||'Unable to send message').slice(0,1000)}).eq('id',queuedId);
    console.error('message_send_failed',error?.message);
    return sendJson(res,500,{error:'message_send_failed',message:error?.message||'Unable to send message'});
  }
}
