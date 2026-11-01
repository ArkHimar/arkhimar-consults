import {randomUUID} from 'node:crypto';
import {adminClient,bearerToken,sendJson} from './server.js';
import {deliverCapstone,snapshotHash} from './instiserve-capstone.js';

export default async function instiserveCapstoneSubmit(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendJson(res,405,{error:'method_not_allowed'})}
  if(Number(req.headers['content-length']||0)>1048576)return sendJson(res,413,{error:'payload_too_large'});
  const token=bearerToken(req);if(!token)return sendJson(res,401,{error:'authentication_required'});
  try{
    const db=adminClient(),{data:{user},error:authError}=await db.auth.getUser(token);
    if(authError||!user)return sendJson(res,401,{error:'invalid_session'});
    const input=req.body||{};
    if(!input.projectId||!input.revision||!input.snapshot)return sendJson(res,400,{error:'projectId_revision_snapshot_required'});
    const {data:project,error:projectError}=await db.from('projects').select('id,workspace_id,code,title').eq('id',input.projectId).maybeSingle();
    if(projectError)throw projectError;if(!project)return sendJson(res,404,{error:'project_not_found'});
    const {data:membership,error:membershipError}=await db.from('workspace_members').select('role').eq('workspace_id',project.workspace_id).eq('user_id',user.id).maybeSingle();
    if(membershipError)throw membershipError;if(!membership)return sendJson(res,403,{error:'permission_denied'});
    const submittedAt=new Date().toISOString(),event={
      eventId:input.eventId||randomUUID(),eventType:'capstone.submitted.v1',occurredAt:submittedAt,
      institutionCode:process.env.INSTISERVE_INSTITUTION_CODE||'TBSC',courseCode:process.env.INSTISERVE_CAPSTONE_COURSE_CODE||'PJM 499',assignmentTitle:process.env.INSTISERVE_CAPSTONE_ASSIGNMENT_TITLE||'Integrated Capstone Project',
      submission:{studentEmail:user.email,matricNo:input.matricNo||null,projectId:project.id,projectCode:project.code||null,projectTitle:project.title,projectUrl:`${process.env.ARKHIMAR_PUBLIC_URL||process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com'}/pm/?project=${project.id}`,submittedAt,revision:Number(input.revision),snapshotHash:snapshotHash(input.snapshot),summary:input.summary||{},exports:Array.isArray(input.exports)?input.exports.slice(0,25):[]}
    };
    try{const receipt=await deliverCapstone(event);return sendJson(res,200,{submitted:true,eventId:event.eventId,receipt})}
    catch(error){console.error('instiserve_capstone_delivery_failed',{eventId:event.eventId,message:error.message});return sendJson(res,error.status>=400&&error.status<500?error.status:502,{submitted:false,eventId:event.eventId,error:error.message})}
  }catch(error){console.error('instiserve_capstone_submit_failed',error?.message);return sendJson(res,500,{error:'submission_failed'})}
}
