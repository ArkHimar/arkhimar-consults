import {feedbackSchema,forwardCarCare,rejectCommon} from '../_lib/carcare.js';
import {sendJson} from '../_lib/server.js';

export default async function handler(req,res){
  if(rejectCommon(req,res,'carcare-feedback',12))return;
  const parsed=feedbackSchema.safeParse(req.body);
  if(!parsed.success)return sendJson(res,400,{error:'invalid_request',message:'Complete your visit details, choose a rating and tell us what happened.'});
  if(parsed.data.website)return sendJson(res,202,{ok:true});
  const {website,rating,feedback,...visit}=parsed.data;
  const payload={...visit,rating,feedback:`Rating: ${rating}/5\n${feedback}`};
  const result=await forwardCarCare('feedback',payload);
  return result.ok?sendJson(res,200,{ok:true,message:'Thank you. Your feedback is now with the right team.'}):sendJson(res,result.status,{error:'workflow_unavailable',message:result.message});
}
