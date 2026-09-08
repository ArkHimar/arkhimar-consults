import {z} from 'zod';
import {adminClient,bearerToken,requireMethod,sendJson} from '../../_lib/server.js';
import {authenticatedDocumentContext,loadControlledDocument} from '../../_lib/controlled-documents.js';
import {exportFilename,renderControlledDocument} from '../../../lib/controlled-document-export.mjs';

const schema=z.object({documentId:z.string().uuid(),version:z.number().int().positive().optional(),format:z.enum(['docx','pdf'])}).strict();
export default async function handler(req,res){
  if(!requireMethod(req,res))return;if(Number(req.headers['content-length']||0)>16384)return sendJson(res,413,{error:'payload_too_large'});
  if(!bearerToken(req))return sendJson(res,401,{error:'authentication_required'});
  const parsed=schema.safeParse(req.body);if(!parsed.success)return sendJson(res,400,{error:'invalid_request'});
  try{
    const db=adminClient(),context=await authenticatedDocumentContext(req,db,parsed.data.documentId);if(context.error)return sendJson(res,context.status,{error:context.error});
    const payload=parsed.data.version?await loadControlledDocument(db,parsed.data.documentId,parsed.data.version):context.payload;if(!payload)return sendJson(res,404,{error:'document_version_not_found'});
    const rendered=await renderControlledDocument(payload,parsed.data.format),filename=exportFilename(payload.document,payload.version,parsed.data.format);
    await db.from('audit_events').insert({workspace_id:payload.document.workspace_id,project_id:payload.document.project_id,actor_user_id:context.user.id,action:'exported',entity_type:'controlled_document',entity_id:payload.document.id,metadata:{version:payload.version.version,format:parsed.data.format}});
    res.setHeader('Content-Type',rendered.contentType);res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).send(rendered.bytes);
  }catch(error){console.error('controlled_document_export_failed',error?.message);return sendJson(res,500,{error:'export_failed',message:error?.message||'Unable to generate document'})}
}
