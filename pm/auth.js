import {backendConfigured,currentSession,mfaRequirement,supabase,verifyMfaCode} from './backend.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const requestedMode=new URLSearchParams(location.search).get('mode');
const invitationStorageKey='arkhimar.pm.pending-invitation';
const invitationFromHash=new URLSearchParams(location.hash.slice(1)).get('invite');
if(invitationFromHash){localStorage.setItem(invitationStorageKey,invitationFromHash);history.replaceState(null,'',`${location.pathname}${location.search}`)}
let mode=location.hash.includes('type=recovery')?'recovery':requestedMode==='signup'?'signup':'signin';
let mfaFactorId=null;

async function acceptPendingInvitation(){const token=localStorage.getItem(invitationStorageKey);if(!token)return null;const {data,error}=await supabase.rpc('accept_workspace_invitation',{invite_token:token});if(error)throw error;localStorage.removeItem(invitationStorageKey);localStorage.setItem('arkhimar.pm.active-workspace',data);return data}

function setMode(next){
  mode=next;
  $$('[data-auth-mode]').forEach(button=>button.classList.toggle('active',button.dataset.authMode===mode));
  $('[data-email]').hidden=['recovery','mfa'].includes(mode);
  $('[data-password]').hidden=['reset','mfa'].includes(mode);
  $('[data-confirm-password]').hidden=!['signup','recovery'].includes(mode);
  $('[data-display-name]').hidden=mode!=='signup';
  $('[data-mfa-code]').hidden=mode!=='mfa';
  $('[name=email]').required=!['recovery','mfa'].includes(mode);
  $('[name=password]').required=!['reset','mfa'].includes(mode);
  $('[name=confirm_password]').required=['signup','recovery'].includes(mode);
  $('[name=mfa_code]').required=mode==='mfa';
  $('[name=password]').autocomplete=['signup','recovery'].includes(mode)?'new-password':'current-password';
  $('[data-auth-intro]').textContent=mode==='recovery'?'Choose a strong new password for your account.':mode==='mfa'?'Enter the six-digit code from your authenticator app.':'Sign in with your verified account to continue.';
  $('[data-auth-submit]').textContent=mode==='signin'?'Sign in securely':mode==='signup'?'Create secure account':mode==='reset'?'Send reset link':mode==='mfa'?'Verify and continue':'Set new password';
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
  if(session&&mode!=='recovery'){
    try{const requirement=await mfaRequirement();if(requirement.required){mfaFactorId=requirement.factor.id;setMode('mfa')}else{await acceptPendingInvitation();location.replace('/pm/')}}catch(error){$('[data-auth-status]').textContent=error.message||'This invitation could not be accepted with the signed-in account.'}
  }
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
      const requirement=await mfaRequirement();
      if(requirement.required){mfaFactorId=requirement.factor.id;setMode('mfa');status.textContent='Password accepted. Complete authenticator verification.';return}
      await acceptPendingInvitation();
      location.replace('/pm/');
    }else if(mode==='signup'){
      const {data,error}=await supabase.auth.signUp({email:values.email,password:values.password,options:{data:{display_name:values.display_name},emailRedirectTo:`${location.origin}/pm/login/`}});
      if(error)throw error;
      status.textContent=data.session?'Account created. Redirecting…':'Check your email to verify your account. Then return to this browser, or reopen the original invitation link, and sign in.';
      if(data.session){await acceptPendingInvitation();location.replace('/pm/')}
    }else if(mode==='reset'){
      const {error}=await supabase.auth.resetPasswordForEmail(values.email,{redirectTo:`${location.origin}/pm/login/`});
      if(error)throw error;
      status.textContent='If that address is registered, a reset email has been sent.';
    }else if(mode==='mfa'){
      if(!mfaFactorId)throw new Error('Authenticator challenge expired. Sign in again.');
      await verifyMfaCode(mfaFactorId,values.mfa_code);
      await acceptPendingInvitation();
      location.replace('/pm/');
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
