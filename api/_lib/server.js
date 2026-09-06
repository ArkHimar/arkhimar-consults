import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

export function sendJson(res,status,payload){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(status).json(payload);
}

export function requireMethod(req,res,method='POST'){
  if(req.method===method)return true;
  res.setHeader('Allow',method);
  sendJson(res,405,{error:'method_not_allowed'});
  return false;
}

export function serverConfig(){
  const url=process.env.SUPABASE_URL||process.env.PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!serviceKey)throw new Error('Server backend is not configured');
  return{url,serviceKey};
}

export function adminClient(){
  const {url,serviceKey}=serverConfig();
  return createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
}

export const sha256=value=>createHash('sha256').update(String(value)).digest('hex');

export function bearerToken(req){
  const value=req.headers.authorization||'';
  return value.startsWith('Bearer ')?value.slice(7).trim():'';
}

export function requestIpHash(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  return sha256(`${process.env.API_IP_HASH_SALT||'arkhimar'}:${forwarded||'unknown'}`);
}
