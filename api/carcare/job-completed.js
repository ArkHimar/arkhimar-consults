import {createCarCareIds,forwardCarCare,rejectCommon,secretsMatch,staffJobSchema} from '../_lib/carcare.js';
import {sendJson} from '../_lib/server.js';

export default async function handler(req,res){
  if(rejectCommon(req,res,'carcare-job',8))return;
  const parsed=staffJobSchema.safeParse(req.body);
  if(!parsed.success)return sendJson(res,400,{error:'invalid_request',message:'Enter a valid customer, email and location.'});
  if(parsed.data.website)return sendJson(res,202,{ok:true});
  if(!secretsMatch(parsed.data.access_key,process.env.CARCARE_STAFF_ACCESS_KEY))return sendJson(res,401,{error:'invalid_access_key',message:'The staff access key is incorrect.'});
  const {access_key,website,...payload}=parsed.data;
  let ids;
  try{ids=createCarCareIds(payload.customer_email)}catch{return sendJson(res,503,{error:'id_service_unavailable',message:'CarCare ID generation is not configured yet.'})}
  const result=await forwardCarCare('job',{...ids,...payload});
  return result.ok?sendJson(res,200,{ok:true,...ids,message:`The feedback request has been sent. Job ${ids.job_id}; customer ${ids.customer_id}.`}):sendJson(res,result.status,{error:'workflow_unavailable',message:result.message});
}
