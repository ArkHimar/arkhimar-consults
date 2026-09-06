import {backendConfigured,currentSession,supabase} from './backend.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const requestedMode=new URLSearchParams(location.search).get('mode');
let mode=location.hash.includes('type=recovery')?'recovery':requestedMode==='signup'?'signup':'signin';

function setMode(next){
  mode=next;
  $$('[data-auth-mode]').forEach(button=>button.classList.toggle('active',button.dataset.authMode===mode));
  $('[data-email]').hidden=mode==='recovery';
  $('[data-password]').hidden=mode==='reset';
  $('[data-confirm-password]').hidden=!['signup','recovery'].includes(mode);
  $('[data-display-name]').hidden=mode!=='signup';
  $('[name=email]').required=mode!=='recovery';
  $('[name=password]').required=mode!=='reset';
  $('[name=confirm_password]').required=['signup','recovery'].includes(mode);
  $('[name=password]').autocomplete=['signup','recovery'].includes(mode)?'new-password':'current-password';
  $('[data-auth-intro]').textContent=mode==='recovery'?'Choose a strong new password for your account.':'Sign in with your verified account to continue.';
  $('[data-auth-submit]').textContent=mode==='signin'?'Sign in securely':mode==='signup'?'Create secure account':mode==='reset'?'Send reset link':'Set new password';
  $('[data-auth-status]').textContent=backendConfigured?'':'Authentication is not configured on this deployment. Add the Supabase public environment variables and redeploy.';
}

setMode(mode);
if(!backendConfigured){
  $('[data-auth-status]').textContent='Authentication is not configured on this deployment. Add the Supabase public environment variables and redeploy.';
  $('[data-auth-submit]').disabled=true;
}else{
  supabase.auth.onAuthStateChange(event=>{
    if(event==='PASSWORD_RECOVERY')setMode('recovery');
  });
  const session=await currentSession();
  if(session&&mode!=='recovery')location.replace('/pm/');
}

$$('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.authMode)));
$('[data-auth-form]').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=$('[data-auth-submit]'),status=$('[data-auth-status]'),values=Object.fromEntries(new FormData(form));
  button.disabled=true;
  status.textContent='Working…';
  try{
    if(['signup','recovery'].includes(mode)&&values.password!==values.confirm_password){
      $('[name=confirm_password]').focus();
      throw new Error('Passwords do not match. Type the same password in both fields.');
    }
    if(mode==='signin'){
      const {error}=await supabase.auth.signInWithPassword({email:values.email,password:values.password});
      if(error)throw error;
      location.replace('/pm/');
    }else if(mode==='signup'){
      const {data,error}=await supabase.auth.signUp({email:values.email,password:values.password,options:{data:{display_name:values.display_name},emailRedirectTo:`${location.origin}/pm/login/`}});
      if(error)throw error;
      status.textContent=data.session?'Account created. Redirecting…':'Check your email to verify your account before signing in.';
      if(data.session)location.replace('/pm/');
    }else if(mode==='reset'){
      const {error}=await supabase.auth.resetPasswordForEmail(values.email,{redirectTo:`${location.origin}/pm/login/`});
      if(error)throw error;
      status.textContent='If that address is registered, a reset email has been sent.';
    }else{
      const {error}=await supabase.auth.updateUser({password:values.password});
      if(error)throw error;
      await supabase.auth.signOut();
      history.replaceState(null,'',location.pathname);
      setMode('signin');
      form.reset();
      status.textContent='Password updated. Sign in with your new password.';
    }
  }catch(error){
    status.textContent=error.message||'Authentication failed. Please try again.';
  }finally{
    button.disabled=!backendConfigured;
  }
});
