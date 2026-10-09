import exportHandler from '../_lib/document-export-handler.js';
import sharedHandler from '../_lib/document-shared-handler.js';
import {sendJson} from '../_lib/server.js';

export default function handler(req,res){
  if(req.query?.action==='export')return exportHandler(req,res);
  if(req.query?.action==='shared')return sharedHandler(req,res);
  return sendJson(res,404,{error:'document_action_not_found'});
}
