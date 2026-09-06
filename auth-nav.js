import {createClient} from '@supabase/supabase-js';

const config=globalThis.__ARKHIMAR_CONFIG__||{};
const target=document.querySelector('[data-auth-nav]');

if(target){
  const setVisitor=()=>{
    target.className='auth-nav-link';
    target.href='/pm/login/?mode=signup';
    target.textContent='Sign Up';
    target.removeAttribute('title');
    target.removeAttribute('aria-haspopup');
    target.removeAttribute('aria-expanded');
  };

  if(!config.supabaseUrl||!config.supabaseAnonKey){
    setVisitor();
  }else{
    target.textContent='Signing in…';
    target.classList.add('is-loading');
    const supabase=createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

    const setAccount=user=>{
      const name=user.user_metadata?.display_name?.trim()||user.email?.split('@')[0]||'Account';
      const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'A';
      const account=document.createElement('div');
      account.className='auth-nav-account';
      account.innerHTML=`<button class="auth-profile-button" type="button" aria-expanded="false" aria-haspopup="menu" title="${escapeAttribute(name)}"><span aria-hidden="true">${escapeHtml(initials)}</span><span class="sr-only">Open profile for ${escapeHtml(name)}</span></button><section class="auth-profile-menu" role="menu" hidden><p class="auth-profile-name">${escapeHtml(name)}</p><p class="auth-profile-email">${escapeHtml(user.email||'')}</p><a role="menuitem" href="/pm/">Open ArkHimar PM</a><button role="menuitem" type="button" data-auth-signout>Sign out</button></section>`;
      target.replaceWith(account);
      const button=account.querySelector('.auth-profile-button');
      const menu=account.querySelector('.auth-profile-menu');
      const close=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false')};
      button.addEventListener('click',()=>{const opening=menu.hidden;menu.hidden=!opening;button.setAttribute('aria-expanded',String(opening))});
      account.querySelector('[data-auth-signout]').addEventListener('click',async()=>{await supabase.auth.signOut();location.reload()});
      document.addEventListener('click',event=>{if(!account.contains(event.target))close()});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'){close();button.focus()}});
    };

    const {data:{session}}=await supabase.auth.getSession();
    if(session?.user)setAccount(session.user);else setVisitor();
  }
}

function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function escapeAttribute(value){return escapeHtml(value).replace(/`/g,'&#96;')}
