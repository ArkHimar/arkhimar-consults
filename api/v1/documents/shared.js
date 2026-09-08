import {z} from 'zod';
import {adminClient,requireMethod,sendJson,sha256} from '../../_lib/server.js';
import {loadControlledDocument} from '../../_lib/controlled-documents.js';
import {exportFilename,renderControlledDocument} from '../../../lib/controlled-document-export.mjs';

const schema=z.object({token:z.string().regex(/^akh_share_[a-f0-9]{64}$/)}).strict();
export default async function handler(req,res){
  if(!requireMethod(req,res))return;if(Number(req.headers['content-length']||0)>4096)return sendJson(res,413,{error:'payload_too_large'});const parsed=schema.safeParse(req.body);if(!parsed.success)return sendJson(res,400,{error:'invalid_share_token'});
  try{
    const db=adminClient(),hash=sha256(parsed.data.token),now=new Date().toISOString(),{data:share,error}=await db.from('controlled_document_shares').select('*').eq('token_hash',hash).is('revoked_at',null).gt('expires_at',now).maybeSingle();if(error)throw error;if(!share||share.download_count>=share.max_downloads)return sendJson(res,410,{error:'share_expired_or_unavailable'});
    const payload=await loadControlledDocument(db,share.document_id,share.version);if(!payload)return sendJson(res,410,{error:'document_version_unavailable'});const rendered=await renderControlledDocument(payload,share.format),filename=exportFilename(payload.document,payload.version,share.format);
    const {data:claimed,error:claimError}=await db.from('controlled_document_shares').update({download_count:share.download_count+1,last_downloaded_at:now}).eq('id',share.id).eq('download_count',share.download_count).is('revoked_at',null).gt('expires_at',now).select('id').maybeSingle();if(claimError)throw claimError;if(!claimed)return sendJson(res,409,{error:'share_busy_retry'});
    await db.from('audit_events').insert({workspace_id:share.workspace_id,project_id:share.project_id,actor_user_id:null,action:'downloaded',entity_type:'controlled_document_share',entity_id:share.id,metadata:{document_id:share.document_id,version:share.version,format:share.format,download_number:share.download_count+1}});
    res.setHeader('Content-Type',rendered.contentType);res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).send(rendered.bytes);
  }catch(error){console.error('shared_document_download_failed',error?.message);return sendJson(res,500,{error:'shared_download_failed'})}
}
