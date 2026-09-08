export async function loadControlledDocument(db,documentId,requestedVersion){
  const {data:document,error}=await db.from('controlled_documents').select('*').eq('id',documentId).maybeSingle();if(error)throw error;if(!document) return null;
  const versionNumber=requestedVersion||document.current_version;
  const [{data:version,error:versionError},{data:project,error:projectError},{data:workspace,error:workspaceError}]=await Promise.all([
    db.from('controlled_document_versions').select('*').eq('document_id',document.id).eq('version',versionNumber).maybeSingle(),
    db.from('projects').select('id,title,code,workspace_id').eq('id',document.project_id).maybeSingle(),
    db.from('workspaces').select('id,name').eq('id',document.workspace_id).maybeSingle()
  ]);
  if(versionError)throw versionError;if(projectError)throw projectError;if(workspaceError)throw workspaceError;if(!version||!project||!workspace)return null;
  return{document,version,project,workspace};
}

export async function authenticatedDocumentContext(req,db,documentId){
  const authorization=String(req.headers.authorization||''),token=authorization.startsWith('Bearer ')?authorization.slice(7).trim():'';if(!token)return{error:'authentication_required',status:401};
  const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return{error:'invalid_session',status:401};
  const payload=await loadControlledDocument(db,documentId);if(!payload)return{error:'document_not_found',status:404};
  const {data:membership}=await db.from('workspace_members').select('role').eq('workspace_id',payload.document.workspace_id).eq('user_id',user.id).maybeSingle();if(!membership)return{error:'permission_denied',status:403};
  return{user,role:membership.role,payload};
}
