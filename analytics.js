(()=>{
  const measurementId=String(globalThis.__ARKHIMAR_CONFIG__?.googleAnalyticsId||'').trim();
  const restricted=['/pm','/share','/carcare/admin','/carcare/feedback','/carcare/complete'];
  if(!/^G-[A-Z0-9]+$/i.test(measurementId)||restricted.some(path=>location.pathname===path||location.pathname.startsWith(`${path}/`)))return;

  const key='arkhimar.analytics-consent.v1';
  const read=()=>{try{return localStorage.getItem(key)}catch{return null}};
  const write=value=>{try{localStorage.setItem(key,value)}catch{}}
  globalThis.dataLayer=globalThis.dataLayer||[];
  globalThis.gtag=globalThis.gtag||function(){globalThis.dataLayer.push(arguments)};
  gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});

  let loaded=false;
  function safeLocation(value){try{const url=new URL(value,location.origin);return `${url.origin}${url.pathname}`}catch{return''}}
  function enable(){
    if(loaded)return;loaded=true;globalThis.__ARKHIMAR_ANALYTICS_READY__=true;
    gtag('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    gtag('js',new Date());
    gtag('config',measurementId,{send_page_view:true,page_location:safeLocation(location.href),page_referrer:safeLocation(document.referrer),allow_google_signals:false,allow_ad_personalization_signals:false});
    const script=document.createElement('script');script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;document.head.append(script);
  }

  function styles(){
    if(document.querySelector('[data-analytics-consent-style]'))return;
    const style=document.createElement('style');style.dataset.analyticsConsentStyle='';style.textContent='.analytics-consent{position:fixed;z-index:10000;left:18px;right:18px;bottom:18px;max-width:760px;margin:auto;padding:20px 22px;background:#171714;color:#fff;border:1px solid rgba(255,255,255,.22);box-shadow:0 18px 60px rgba(0,0,0,.35);font:400 15px/1.55 Inter,system-ui,sans-serif}.analytics-consent strong{display:block;font:600 19px/1.25 Syne,Inter,sans-serif;margin-bottom:6px}.analytics-consent p{margin:0;color:#deddd6}.analytics-consent a{color:#fff}.analytics-consent div{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.analytics-consent button,.analytics-choices{border:1px solid #fff;padding:10px 15px;background:#fff;color:#171714;font:600 13px Inter,sans-serif;cursor:pointer}.analytics-consent [data-decline]{background:transparent;color:#fff}.analytics-choices{position:fixed;z-index:9999;left:12px;bottom:12px;padding:8px 11px;border-color:#171714;background:#f7f4eb;font-size:12px}@media(max-width:560px){.analytics-consent{left:10px;right:10px;bottom:10px;padding:18px}.analytics-consent button{flex:1}}';document.head.append(style);
  }
  function preferencesButton(){
    if(document.querySelector('[data-analytics-choices]'))return;
    styles();const button=document.createElement('button');button.type='button';button.className='analytics-choices';button.dataset.analyticsChoices='';button.textContent='Privacy choices';button.addEventListener('click',()=>showConsent(true));document.body.append(button);
  }
  function showConsent(reconsider=false){
    document.querySelector('[data-analytics-consent]')?.remove();styles();
    const panel=document.createElement('section');panel.className='analytics-consent';panel.dataset.analyticsConsent='';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Analytics privacy choices');panel.innerHTML='<strong>Help us improve ArkHimar.com</strong><p>With your permission, we use Google Analytics to understand which public pages are useful. We do not send names, emails, form contents, customer references, or private ArkHimar PM data. <a href="/project-management/privacy/">Privacy notice</a></p><div><button type="button" data-accept>Accept analytics</button><button type="button" data-decline>Decline</button></div>';
    panel.querySelector('[data-accept]').addEventListener('click',()=>{write('granted');panel.remove();enable();preferencesButton()});
    panel.querySelector('[data-decline]').addEventListener('click',()=>{write('denied');globalThis.__ARKHIMAR_ANALYTICS_READY__=false;gtag('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});panel.remove();preferencesButton()});
    document.body.append(panel);panel.querySelector(reconsider&&read()==='granted'?'[data-decline]':'[data-accept]').focus();
  }

  const consent=read();
  if(consent==='granted')enable();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>consent?preferencesButton():showConsent(),{once:true});else consent?preferencesButton():showConsent();
})();
