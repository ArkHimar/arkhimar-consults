import {backendConfigured,currentSession,mfaRequirement,supabase,verifyMfaCode} from './backend.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const authParams=new URLSearchParams(location.search),requestedMode=authParams.get('mode');
const invitationStorageKey='arkhimar.pm.pending-invitation';
const authFlashKey='arkhimar.pm.auth-flash';
const invitationFromHash=new URLSearchParams(location.hash.slice(1)).get('invite');
if(invitationFromHash){localStorage.setItem(invitationStorageKey,invitationFromHash);history.replaceState(null,'',`${location.pathname}${location.search}`)}
const hasPendingInvitation=Boolean(localStorage.getItem(invitationStorageKey));
const recoveryRequested=location.hash.includes('type=recovery')||(requestedMode==='recovery'&&authParams.has('code'));
let mode=recoveryRequested?'recovery':requestedMode==='signup'&&!hasPendingInvitation?'signup':'signin';
let mfaFactorId=null;

function friendlyAuthError(error){
  const message=String(error?.message||'');
  if(error?.status===429||/email rate limit|rate limit.*email|over_email_send_rate_limit/i.test(message))return hasPendingInvitation?'Verification email delivery is temporarily at capacity. Do not keep retrying. If you already have an ArkHimar PM account, choose Sign in. If you are new, your invitation is saved in this browser; try New user again later.':'Verification email delivery is temporarily at capacity. Do not keep retrying; try again later.';
  if(/invitation email does not match/i.test(message))return 'This invitation was sent to a different email address. Sign out below, then sign in with the exact address that received the invitation.';
  if(/already belongs to another workspace/i.test(message))return 'Your account could not yet be added to this additional project workspace. Please try the invitation again; if this continues, ask the project manager to resend it.';
  if(/already registered|already exists/i.test(message))return 'An account already exists for this email address. Choose Sign in, or use Reset password if needed.';
  return message||'Authentication failed. Please try again.';
}

function showAuthError(error){
  const message=String(error?.message||'');
  $('[data-auth-status]').textContent=friendlyAuthError(error);
  $('[data-switch-invite-account]').hidden=!/invitation email does not match/i.test(message);
}

async function requestAuthEmail(payload){
  const response=await fetch('/api/v1/auth/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();
  if(!response.ok){const error=new Error(result.message||({account_exists:'An account already exists for this email address. Choose Sign in or Reset password.',too_many_requests:'Please wait 15 minutes before requesting another email.'}[result.error])||'The secure email could not be sent.');error.status=response.status;throw error}
  return result;
}

async function acceptPendingInvitation(){const token=localStorage.getItem(invitationStorageKey);if(!token)return null;const {data,error}=await supabase.rpc('accept_workspace_invitation',{invite_token:token});if(error)throw error;localStorage.removeItem(invitationStorageKey);localStorage.setItem('arkhimar.pm.active-workspace',data);return data}

function setMode(next){
  mode=next;
  $$('[data-auth-mode]').forEach(button=>button.classList.toggle('active',button.dataset.authMode===mode));
  $('[data-auth-title]').textContent=hasPendingInvitation?'Join your project workspace.':'Welcome to ArkHimar PM.';
  $('[data-invitation-notice]').hidden=!hasPendingInvitation;
  $('[data-auth-mode="signup"]').textContent=hasPendingInvitation?'New user':'Create account';
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
  $('[data-auth-intro]').textContent=mode==='recovery'?'Choose a strong new password for your existing account. After it is saved, you will return to Sign in.':mode==='reset'?'Enter your existing account email. We will send a secure reset link; you do not need to create a new account.':mode==='mfa'?'Enter the six-digit code from your authenticator app.':hasPendingInvitation&&mode==='signup'?'Create one account using the exact email address that received the invitation. We will then return you to the invited workspace.':hasPendingInvitation?'Sign in to accept the invitation immediately. No new verification email is needed for an existing account.':'Sign in with your verified account to continue.';
  $('[data-auth-submit]').textContent=mode==='signin'?'Sign in securely':mode==='signup'?'Create secure account':mode==='reset'?'Send reset link':mode==='mfa'?'Verify and continue':'Set new password';
  $('[data-auth-status]').textContent=backendConfigured?'':'Authentication is not configured on this deployment. Add the Supabase public environment variables and redeploy.';
  $('[data-switch-invite-account]').hidden=true;
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
    try{const requirement=await mfaRequirement();if(requirement.required){mfaFactorId=requirement.factor.id;setMode('mfa')}else{await acceptPendingInvitation();location.replace('/pm/')}}catch(error){showAuthError(error)}
  }
}

$$('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.authMode)));
$('[data-switch-invite-account]').addEventListener('click',async()=>{
  const status=$('[data-auth-status]'),button=$('[data-switch-invite-account]');
  button.disabled=true;
  status.textContent='Signing out…';
  const {error}=await supabase.auth.signOut({scope:'local'});
  button.disabled=false;
  if(error){showAuthError(error);return}
  $('[data-auth-form]').reset();
  setMode('signin');
  status.textContent='Signed out. Enter the exact email address that received this project invitation.';
  $('[name=email]').focus();
});
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
      const joined=await acceptPendingInvitation();
      sessionStorage.setItem(authFlashKey,JSON.stringify({title:'Signed in successfully',copy:joined?'Your invitation was accepted and the project workspace is ready.':'Welcome back to your secure workspace.'}));
      location.replace('/pm/');
    }else if(mode==='signup'){
      await requestAuthEmail({action:'signup',email:values.email,password:values.password,displayName:values.display_name||'',redirectTo:`${location.origin}/pm/login/`});
      setMode('signin');form.elements.email.value=values.email;status.textContent='Verification email sent through ArkHimar. Open it within 24 hours, then sign in. Your invitation remains saved in this browser.';
    }else if(mode==='reset'){
      await requestAuthEmail({action:'recovery',email:values.email,redirectTo:`${location.origin}/pm/login/?mode=recovery`});
      status.textContent='If that address is registered, a reset email has been sent. Open it to choose a new password, then return to Sign in.';
    }else if(mode==='mfa'){
      if(!mfaFactorId)throw new Error('Authenticator challenge expired. Sign in again.');
      await verifyMfaCode(mfaFactorId,values.mfa_code);
      const joined=await acceptPendingInvitation();
      sessionStorage.setItem(authFlashKey,JSON.stringify({title:'Signed in successfully',copy:joined?'Your invitation was accepted and the project workspace is ready.':'Identity verification completed.'}));
      location.replace('/pm/');
    }else{
      const {error}=await supabase.auth.updateUser({password:values.password});
      if(error)throw error;
      await supabase.auth.signOut();
      history.replaceState(null,'',`${location.pathname}?mode=signin`);
      setMode('signin');
      form.reset();
      status.textContent='Password updated. Sign in with your new password.';
    }
  }catch(error){
    showAuthError(error);
  }finally{
    button.disabled=!backendConfigured;
  }
});
