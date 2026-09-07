import {signOut,supabase} from './backend.js';

const esc=(value='')=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const qrSrc=value=>String(value||'').startsWith('data:')?value:`data:image/svg+xml;utf-8,${encodeURIComponent(value||'')}`;
let pendingFactor=null;

async function accountState(context){
  let [{data:factors,error:factorError},{data:assurance,error:assuranceError}]=await Promise.all([supabase.auth.mfa.listFactors(),supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
  if(factorError)throw factorError;if(assuranceError)throw assuranceError;
  const abandoned=(factors.all||[]).filter(factor=>factor.status==='unverified'&&factor.id!==pendingFactor?.id);
  if(abandoned.length){for(const factor of abandoned)await supabase.auth.mfa.unenroll({factorId:factor.id});const refreshed=await supabase.auth.mfa.listFactors();if(refreshed.error)throw refreshed.error;factors=refreshed.data}
  return{factors:factors.totp||[],assurance,user:context.session.user};
}

function status(dialog,message=''){dialog.querySelector('[data-account-status]').textContent=message}

function render(dialog,context,state){
  const name=state.user.user_metadata?.display_name||state.user.email||'ArkHimar PM user',initials=name.split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  dialog.querySelector('[data-account-content]').innerHTML=`<div class="account-identity"><span>${esc(initials)}</span><div><strong>${esc(name)}</strong><p>${esc(state.user.email)} · ${esc(context.role.replaceAll('_',' '))}</p></div></div><section><div class="section-title"><div><p class="eyebrow">AUTHENTICATOR SECURITY</p><h3>${state.factors.length?'Two-step verification enabled':'Add two-step verification'}</h3></div><span class="status-chip ${state.assurance.currentLevel==='aal2'?'approved':''}">${esc(state.assurance.currentLevel||'aal1')}</span></div>${state.factors.length?`<div class="record-list">${state.factors.map(factor=>`<article><div><strong>${esc(factor.friendly_name||'Authenticator app')}</strong><p>Verified TOTP factor</p></div><button class="row-action" type="button" data-remove-factor="${factor.id}">Remove</button></article>`).join('')}</div>`:`<p class="helper">Use Google Authenticator, Microsoft Authenticator, 1Password or another TOTP application.</p><button class="secondary" type="button" data-enroll-mfa>Set up authenticator</button>`}${pendingFactor?`<div class="mfa-enrollment"><img src="${esc(qrSrc(pendingFactor.totp.qr_code))}" alt="Authenticator enrollment QR code"><p>Scan this private QR code, then enter the six-digit code. Do not share the QR code or setup secret.</p><form data-verify-enrollment><label>Six-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button class="primary" type="submit">Verify authenticator</button></form></div>`:''}</section><section><p class="eyebrow">ACTIVE SESSIONS</p><h3>Control signed-in devices</h3><p class="helper">Revoke every other refresh session while keeping this device signed in. Existing short-lived access tokens expire automatically.</p><div class="button-group"><button class="secondary" type="button" data-revoke-sessions>Sign out other sessions</button><button class="secondary" type="button" data-sign-out>Sign out this device</button></div></section>`;
  bindActions(dialog,context);
}

async function refresh(dialog,context){try{render(dialog,context,await accountState(context))}catch(error){dialog.querySelector('[data-account-content]').innerHTML=`<p class="status">${esc(error.message||'Account security could not be loaded.')}</p>`}}

function bindActions(dialog,context){
  dialog.querySelector('[data-enroll-mfa]')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;status(dialog,'Creating a private authenticator setup…');try{const {data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'ArkHimar PM authenticator',issuer:'ArkHimar PM'});if(error)throw error;pendingFactor=data;status(dialog,'');await refresh(dialog,context)}catch(error){event.currentTarget.disabled=false;status(dialog,error.message||'Authenticator setup could not start.')}});
  dialog.querySelector('[data-verify-enrollment]')?.addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button'),code=new FormData(event.currentTarget).get('code');button.disabled=true;try{const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:pendingFactor.id,code});if(error)throw error;pendingFactor=null;await refresh(dialog,context);status(dialog,'Authenticator verified. Future sign-ins require a code.')}catch(error){button.disabled=false;status(dialog,error.message||'The authenticator code was not accepted.')}});
  dialog.querySelectorAll('[data-remove-factor]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Remove this authenticator factor? Your next sign-in will use password-only access.'))return;button.disabled=true;try{const {error}=await supabase.auth.mfa.unenroll({factorId:button.dataset.removeFactor});if(error)throw error;await refresh(dialog,context);status(dialog,'Authenticator removed.')}catch(error){button.disabled=false;status(dialog,error.message||'Authenticator could not be removed.')}}));
  dialog.querySelector('[data-revoke-sessions]')?.addEventListener('click',async event=>{if(!confirm('Sign out every other ArkHimar PM session?'))return;event.currentTarget.disabled=true;const {error}=await supabase.auth.signOut({scope:'others'});event.currentTarget.disabled=false;status(dialog,error?error.message:'Other sessions have been revoked.');});
  dialog.querySelector('[data-sign-out]')?.addEventListener('click',signOut);
}

export function initializeAccount(context){
  const button=document.querySelector('[data-account]'),dialog=document.querySelector('[data-account-dialog]'),name=context.session.user.user_metadata?.display_name||context.session.user.email||'Account',initials=name.split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  button.textContent=initials;button.title=name;button.setAttribute('aria-label',`Account information for ${name}`);
  button.addEventListener('click',async()=>{dialog.showModal();status(dialog,'');await refresh(dialog,context)});
  dialog.querySelector('[data-close-account]').addEventListener('click',()=>{pendingFactor=null;dialog.close()});
}
