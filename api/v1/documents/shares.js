import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {adminClient,bearerToken,sendJson,sha256} from '../../_lib/server.js';
import {authenticatedDocumentContext,loadControlledDocument} from '../../_lib/controlled-documents.js';

const createSchema=z.object({documentId:z.string().uuid(),version:z.number().int().positive(),format:z.enum(['docx','pdf']),expiresInHours:z.number().int().min(1).max(720).default(168),maxDownloads:z.number().int().min(1).max(100).default(10)}).strict();
const revokeSchema=z.object({shareId:z.string().uuid(),documentId:z.string().uuid()}).strict();
export default async function handler(req,res){
  if(!['POST','DELETE'].includes(req.method)){res.setHeader('Allow','POST, DELETE');return sendJson(res,405,{error:'method_not_allowed'})}if(!bearerToken(req))return sendJson(res,401,{error:'authentication_required'});
  const parsed=(req.method==='POST'?createSchema:revokeSchema).safeParse(req.body);if(!parsed.success)return sendJson(res,400,{error:'invalid_request'});
  try{
    const value=parsed.data,db=adminClient(),context=await authenticatedDocumentContext(req,db,value.documentId);if(context.error)return sendJson(res,context.status,{error:context.error});if(!['owner','admin','project_manager'].includes(context.role))return sendJson(res,403,{error:'permission_denied'});
    if(req.method==='DELETE'){const {data,error}=await db.from('controlled_document_shares').update({revoked_at:new Date().toISOString()}).eq('id',value.shareId).eq('document_id',value.documentId).is('revoked_at',null).select('id').maybeSingle();if(error)throw error;if(!data)return sendJson(res,404,{error:'share_not_found'});await db.from('audit_events').insert({workspace_id:context.payload.document.workspace_id,project_id:context.payload.document.project_id,actor_user_id:context.user.id,action:'revoked',entity_type:'controlled_document_share',entity_id:data.id,metadata:{document_id:value.documentId}});return sendJson(res,200,{ok:true,id:data.id})}
    const payload=await loadControlledDocument(db,value.documentId,value.version);if(!payload)return sendJson(res,404,{error:'document_version_not_found'});if(payload.version.status!=='approved'&&payload.version.status!=='superseded')return sendJson(res,409,{error:'approved_version_required'});
    const token=`akh_share_${randomBytes(32).toString('hex')}`,expiresAt=new Date(Date.now()+value.expiresInHours*3600000).toISOString(),{data:share,error}=await db.from('controlled_document_shares').insert({workspace_id:payload.document.workspace_id,project_id:payload.document.project_id,document_id:payload.document.id,version:payload.version.version,token_hash:sha256(token),format:value.format,expires_at:expiresAt,max_downloads:value.maxDownloads,created_by:context.user.id}).select('id').single();if(error)throw error;
    await db.from('audit_events').insert({workspace_id:payload.document.workspace_id,project_id:payload.document.project_id,actor_user_id:context.user.id,action:'shared',entity_type:'controlled_document_share',entity_id:share.id,metadata:{document_id:payload.document.id,version:payload.version.version,format:value.format,expires_at:expiresAt,max_downloads:value.maxDownloads}});
    const site=(process.env.PUBLIC_SITE_URL||'https://www.arkhimar.com').replace(/\/$/,'');return sendJson(res,201,{ok:true,id:share.id,url:`${site}/share/#token=${encodeURIComponent(token)}`,expiresAt});
  }catch(error){console.error('controlled_document_share_failed',error?.message);return sendJson(res,500,{error:'share_failed',message:error?.message||'Unable to manage share'})}
}
