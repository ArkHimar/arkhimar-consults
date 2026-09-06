import {createClient} from '@supabase/supabase-js';

const config=globalThis.__ARKHIMAR_CONFIG__||{};
export const backendConfigured=Boolean(config.supabaseUrl&&config.supabaseAnonKey);
export const supabase=backendConfigured?createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;

function publicProject(project){const {_version,_documents,...data}=project;return data}
export async function currentSession(){if(!supabase)return null;const {data:{session},error:sessionError}=await supabase.auth.getSession();if(sessionError)throw sessionError;if(!session)return null;const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)return null;return{...session,user}}
export async function loadWorkspaceContext(){
  if(!backendConfigured)return{configured:false,session:null,workspace:null,role:null,projects:[]};
  const session=await currentSession();if(!session)return{configured:true,session:null,workspace:null,role:null,projects:[]};
  const {data:memberships,error:memberError}=await supabase.from('workspace_members').select('workspace_id,role,workspaces(id,name,slug)').order('joined_at',{ascending:true}).limit(1);if(memberError)throw memberError;
  const membership=memberships?.[0];if(!membership)return{configured:true,session,workspace:null,role:null,projects:[]};
  const {data:rows,error}=await supabase.from('projects').select('id,title,code,data,version,created_at,updated_at').eq('workspace_id',membership.workspace_id).is('archived_at',null).order('updated_at',{ascending:false});if(error)throw error;
  return{configured:true,session,workspace:membership.workspaces,role:membership.role,projects:(rows||[]).map(row=>({...row.data,id:row.id,title:row.title,code:row.code,_version:row.version}))};
}
export async function bootstrapWorkspace(name){const {data,error}=await supabase.rpc('bootstrap_workspace',{workspace_name:name});if(error)throw error;return data}
export async function createProject(workspaceId,project,userId){const payload=publicProject(project);const {data,error}=await supabase.from('projects').insert({id:project.id,workspace_id:workspaceId,title:project.title,code:project.code,data:payload,created_by:userId}).select('id,title,code,data,version').single();if(error)throw error;return{...data.data,id:data.id,title:data.title,code:data.code,_version:data.version}}
export async function updateProject(project){const payload=publicProject(project);const {data,error}=await supabase.from('projects').update({title:project.title,code:project.code,data:payload}).eq('id',project.id).eq('version',project._version||1).select('version').maybeSingle();if(error)throw error;if(!data)throw new Error('This project changed in another session. Reload before saving again.');project._version=data.version;return project}
export async function listDocuments(projectId){const {data,error}=await supabase.from('project_documents').select('id,filename,content_type,size_bytes,created_at,storage_path').eq('project_id',projectId).order('created_at',{ascending:false});if(error)throw error;return data||[]}
export async function uploadDocument({workspaceId,projectId,userId,file}){const safe=file.name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-120),path=`${workspaceId}/${projectId}/${crypto.randomUUID()}-${safe}`;const {error:uploadError}=await supabase.storage.from('project-documents').upload(path,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;const {data,error}=await supabase.from('project_documents').insert({workspace_id:workspaceId,project_id:projectId,storage_path:path,filename:file.name,content_type:file.type,size_bytes:file.size,uploaded_by:userId}).select().single();if(error){await supabase.storage.from('project-documents').remove([path]);throw error}return data}
export async function signedDocumentUrl(path){const {data,error}=await supabase.storage.from('project-documents').createSignedUrl(path,60);if(error)throw error;return data.signedUrl}
export async function signOut(){if(supabase)await supabase.auth.signOut();location.replace('/pm/login/')}
