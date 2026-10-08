import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {adminClient,bearerToken,sendJson,sha256} from '../../_lib/server.js';
import {renderEmailHtml,renderEmailText} from '../../../lib/email-template.mjs';

const createSchema=z.object({workspaceId:z.string().uuid(),email:z.string().trim().toLowerCase().email().max(254),role:z.enum(['admin','project_manager','member','viewer']),expiresInDays:z.number().int().min(1).max(30).default(7)}).strict();
const revokeSchema=z.object({workspaceId:z.string().uuid(),invitationId:z.string().uuid()}).strict();
const acceptSchema=z.object({token:z.string().min(40).max(200)}).strict();
const unlimitedInviteEmails=new Set(['emavericks22@gmail.com','projects@arkhimar.com']);

async function authenticatedContext(req,res,workspaceId){
  const token=bearerToken(req);
  if(!token){sendJson(res,401,{error:'authentication_required'});return null}
  const db=adminClient(),{data:{user},error}=await db.auth.getUser(token);
  if(error||!user){sendJson(res,401,{error:'invalid_session'});return null}
  const {data:membership}=await db.from('workspace_members').select('role').eq('workspace_id',workspaceId).eq('user_id',user.id).maybeSingle();
  if(!membership||!['owner','admin'].includes(membership.role)){sendJson(res,403,{error:'permission_denied'});return null}
  return{db,user,role:membership.role};
}

export default async function handler(req,res){
  if(!['POST','DELETE'].includes(req.method)){res.setHeader('Allow','POST, DELETE');return sendJson(res,405,{error:'method_not_allowed'})}
  if(Number(req.headers['content-length']||0)>32768)return sendJson(res,413,{error:'payload_too_large'});
  if(!bearerToken(req))return sendJson(res,401,{error:'authentication_required'});
  const accepting=req.method==='POST'&&req.query?.action==='accept';
  const parsed=(accepting?acceptSchema:req.method==='POST'?createSchema:revokeSchema).safeParse(req.body);
  if(!parsed.success)return sendJson(res,400,{error:'invalid_request',issues:parsed.error.issues.map(({path,message})=>({field:path.join('.'),message}))});
  const value=parsed.data;
  if(accepting){
    try{
    const db=adminClient(),{data:{user},error:userError}=await db.auth.getUser(bearerToken(req));if(userError||!user)return sendJson(res,401,{error:'invalid_session'});
    const email=String(user.email||'').toLowerCase(),tokenHash=sha256(value.token),now=new Date().toISOString();
    const {data:invite,error:inviteError}=await db.from('workspace_invitations').select('*').eq('token_hash',tokenHash).is('accepted_at',null).is('revoked_at',null).gt('expires_at',now).maybeSingle();if(inviteError)throw inviteError;
    if(!invite)return sendJson(res,404,{error:'invitation_invalid',message:'This invitation is invalid or has expired.'});
    if(!email||email!==invite.email)return sendJson(res,403,{error:'invitation_email_mismatch',message:'Sign in with the email address that received this invitation.'});
    if(!unlimitedInviteEmails.has(email)){const {count,error:countError}=await db.from('workspace_members').select('workspace_id',{count:'exact',head:true}).eq('user_id',user.id);if(countError)throw countError;if((count||0)>=2){const {data:existing}=await db.from('workspace_members').select('workspace_id').eq('workspace_id',invite.workspace_id).eq('user_id',user.id).maybeSingle();if(!existing)return sendJson(res,409,{error:'workspace_limit_reached',message:'This account has reached the two-workspace invitation limit.'})}}
    const {error:memberError}=await db.from('workspace_members').upsert({workspace_id:invite.workspace_id,user_id:user.id,role:invite.role},{onConflict:'workspace_id,user_id'});if(memberError)throw memberError;
    const {error:acceptedError}=await db.from('workspace_invitations').update({accepted_at:now,accepted_by:user.id}).eq('id',invite.id);if(acceptedError)throw acceptedError;
    await db.from('audit_events').insert({workspace_id:invite.workspace_id,actor_user_id:user.id,action:'accepted',entity_type:'workspace_invitation',entity_id:invite.id,metadata:{role:invite.role,unlimited_invites:unlimitedInviteEmails.has(email)}});
      return sendJson(res,200,{ok:true,workspaceId:invite.workspace_id});
    }catch(error){console.error('workspace_invitation_accept_failed',error?.message);return sendJson(res,500,{error:'workspace_invitation_accept_failed',message:'The invitation could not be accepted.'})}
  }
  const context=await authenticatedContext(req,res,value.workspaceId);
  if(!context)return;
  const {db,user,role:actorRole}=context;
  let invitationId=null;
  try{
    if(req.method==='DELETE'){
      const {data:invite}=await db.from('workspace_invitations').select('id,role').eq('id',value.invitationId).eq('workspace_id',value.workspaceId).is('accepted_at',null).is('revoked_at',null).maybeSingle();
      if(!invite)return sendJson(res,404,{error:'invitation_not_found'});
      if(actorRole==='admin'&&invite.role==='admin')return sendJson(res,403,{error:'permission_denied'});
      const {error}=await db.from('workspace_invitations').update({revoked_at:new Date().toISOString()}).eq('id',invite.id);if(error)throw error;
      await db.from('audit_events').insert({workspace_id:value.workspaceId,actor_user_id:user.id,action:'revoked',entity_type:'workspace_invitation',entity_id:invite.id,metadata:{role:invite.role}});
      return sendJson(res,200,{ok:true,id:invite.id,status:'revoked'});
    }
    if(actorRole==='admin'&&value.role==='admin')return sendJson(res,403,{error:'owner_required_for_admin_invite'});
    if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)return sendJson(res,503,{error:'email_provider_not_configured'});
    const [{data:workspace},{data:brand}]=await Promise.all([db.from('workspaces').select('name').eq('id',value.workspaceId).single(),db.from('workspace_brand_settings').select('*').eq('workspace_id',value.workspaceId).maybeSingle()]);
    await db.from('workspace_invitations').update({revoked_at:new Date().toISOString()}).eq('workspace_id',value.workspaceId).eq('email',value.email).is('accepted_at',null).is('revoked_at',null);
    const token=`akh_inv_${randomBytes(32).toString('hex')}`,expiresAt=new Date(Date.now()+value.expiresInDays*86400000).toISOString();
    const {data:invite,error:insertError}=await db.from('workspace_invitations').insert({workspace_id:value.workspaceId,email:value.email,role:value.role,token_hash:sha256(token),invited_by:user.id,expires_at:expiresAt}).select('id').single();
    if(insertError)throw insertError;
    invitationId=invite.id;
    const site=(process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com').replace(/\/$/,'');
    const inviteUrl=`${site}/pm/login/?mode=invite#invite=${encodeURIComponent(token)}`;
    const subject=`You are invited to ${workspace?.name||'ArkHimar PM'}`;
    const blocks=[{type:'heading',text:`Join ${workspace?.name||'ArkHimar PM'}`},{type:'text',text:`You have been invited as ${value.role.replace('_',' ')}. Use the invited email address when you create an account or sign in. If email verification opens in another browser, reopen this invitation afterward. Already have an account? Choose Sign in on the invitation page. This invitation expires in ${value.expiresInDays} day${value.expiresInDays===1?'':'s'}.`},{type:'button',label:'Accept invitation',url:inviteUrl},{type:'divider'},{type:'signature',text:'Sent securely by ArkHimar PM'}];
    const senderName=(brand?.sender_name||'ArkHimar PM').replace(/[<>\r\n]/g,'').slice(0,120);
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`invitation/${invite.id}`},body:JSON.stringify({from:`${senderName} <${process.env.RESEND_FROM_EMAIL}>`,to:[value.email],reply_to:brand?.reply_to||undefined,subject,html:renderEmailHtml({subject,blocks,brand}),text:renderEmailText({subject,blocks,brand})})});
    const result=await response.json();
    if(!response.ok){await db.from('workspace_invitations').update({delivery_status:'failed',delivery_error:String(result.message||'Provider rejected the invitation').slice(0,1000)}).eq('id',invite.id);return sendJson(res,502,{error:'invitation_delivery_failed',message:result.message||'Provider rejected the invitation'});}
    await db.from('workspace_invitations').update({delivery_status:'sent',delivery_error:null}).eq('id',invite.id);
    await db.from('audit_events').insert({workspace_id:value.workspaceId,actor_user_id:user.id,action:'invited',entity_type:'workspace_invitation',entity_id:invite.id,metadata:{role:value.role,email_domain:value.email.split('@')[1]}});
    return sendJson(res,201,{ok:true,id:invite.id,status:'sent',expiresAt});
  }catch(error){
    if(invitationId)await db.from('workspace_invitations').update({delivery_status:'failed',delivery_error:String(error?.message||'Unable to send invitation').slice(0,1000)}).eq('id',invitationId);
    console.error('workspace_invitation_failed',error?.message);
    return sendJson(res,500,{error:'workspace_invitation_failed',message:error?.message||'Unable to manage invitation'});
  }
}
