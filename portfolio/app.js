const body=document.body;
const menuButton=document.querySelector('[data-menu]');
const mobileNav=document.querySelector('[data-mobile-nav]');
menuButton?.addEventListener('click',()=>{
  const open=!mobileNav.classList.contains('is-open');
  mobileNav.classList.toggle('is-open',open);body.classList.toggle('menu-open',open);
  menuButton.setAttribute('aria-expanded',String(open));
});
mobileNav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{mobileNav.classList.remove('is-open');body.classList.remove('menu-open');menuButton?.setAttribute('aria-expanded','false')}));

document.querySelectorAll('a[href="mailto:emavericks22@gmail.com"]').forEach(link=>{link.href='mailto:projects@arkhimar.com';link.innerHTML=link.innerHTML.replaceAll('emavericks22@gmail.com','projects@arkhimar.com')});
document.querySelectorAll('[data-contact-form]').forEach(form=>{
  form.enctype='multipart/form-data';
  if(!form.querySelector('input[type="file"]')){
    const label=document.createElement('label');label.className='full attachment-field';label.innerHTML='Attachments<input name="attachment" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.dwg,.dxf"><small>Images, documents, drawings or archives — up to 20 MB total.</small>';
    form.querySelector('button[type="submit"]')?.before(label);
  }
});

const socialProfiles=[
  ['instagram','Instagram','@emavericks_studio','https://www.instagram.com/emavericks_studio?igsh=MTV4Z3AyZHdmY2tpNQ=='],
  ['linkedin','LinkedIn','Emmanuel Olaniyan','https://www.linkedin.com/in/emmanuel-olaniyan-638985120/'],
  ['x','X / Twitter','@Emavericks_Arch','https://x.com/Emavericks_Arch?s=09'],
  ['tiktok','TikTok','@emmanuelolaniyan97','https://www.tiktok.com/@emmanuelolaniyan97'],
  ['youtube','YouTube','@olaniyan_emmanuel','https://www.youtube.com/@olaniyan_emmanuel'],
  ['pinterest','Pinterest','ArkHimar inspiration','https://pin.it/1ZP60B1aZ'],
  ['linktree','Linktree','olaniyan.emmanuel','https://linktr.ee/olaniyan.emmanuel'],
  ['github','GitHub','@ArkHimar','https://github.com/ArkHimar'],
  ['facebook','Facebook','Emmanuel Olaniyan','https://www.facebook.com/share/1KqMBYtwxz/']
];
const socialIcons={
  instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" class="fill"/>',
  linkedin:'<rect x="3" y="9" width="3" height="11" class="fill"/><circle cx="4.5" cy="5" r="1.8" class="fill"/><path d="M10 20V9h3v1.8c1-1.4 2.3-2.1 4-2.1 3 0 4 2 4 5V20h-3v-5.5c0-1.8-.5-3-2.2-3-1.8 0-2.8 1.2-2.8 3V20z" class="fill"/>',
  x:'<path d="M5 4l14 16M19 4L5 20"/>',
  tiktok:'<path d="M14 4v10.5a4.5 4.5 0 1 1-4-4.47V13a2 2 0 1 0 1.5 1.94V4z"/><path d="M14 4c.7 2.2 2.3 3.6 5 3.8"/>',
  youtube:'<rect x="2.5" y="6" width="19" height="12" rx="4"/><path d="M10 9.5l6 2.5-6 2.5z" class="fill"/>',
  pinterest:'<circle cx="12" cy="12" r="9"/><path d="M10.2 18l1.5-6.2m-1.2 3.5c.8.8 2 1.1 3.2.7 2.5-.8 3.5-4.6 1.9-6.5-1.8-2.2-5.7-1.4-6.5 1.4-.5 1.6 0 3 1.2 3.6"/>',
  linktree:'<path d="M12 3v18M7 8l5-5 5 5M6 13l6-6 6 6M5 18l7-7 7 7"/>',
  github:'<path d="M12 2.8a9.2 9.2 0 0 0-2.9 17.9c.5.1.7-.2.7-.5v-1.8c-3 .7-3.6-1.3-3.6-1.3-.5-1.2-1.2-1.5-1.2-1.5-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.1.9.1-.7.4-1.2.7-1.5-2.4-.3-4.9-1.2-4.9-5.3 0-1.2.4-2.1 1.1-2.9-.1-.3-.5-1.4.1-2.9 0 0 .9-.3 3 1.1a10.3 10.3 0 0 1 5.4 0c2.1-1.4 3-1.1 3-1.1.6 1.5.2 2.6.1 2.9.7.8 1.1 1.7 1.1 2.9 0 4.1-2.5 5-4.9 5.3.4.3.7 1 .7 2v2.9c0 .3.2.6.7.5A9.2 9.2 0 0 0 12 2.8z" class="fill"/>',
  facebook:'<circle cx="12" cy="12" r="9"/><path d="M13.5 20v-7h2.3l.4-3h-2.7V8.2c0-.9.3-1.5 1.6-1.5h1.3V4.1c-.5-.1-1.2-.2-2.1-.2-2.2 0-3.8 1.4-3.8 3.9V10H8v3h2.5v7z" class="fill"/>'
};

document.querySelectorAll('.contact-links').forEach(contactLinks=>{
  const socialSection=document.createElement('section');
  socialSection.className='social-profiles';
  socialSection.setAttribute('aria-label','Social media profiles');
  socialSection.innerHTML=`<p>Follow me on Social Media</p><div>${socialProfiles.map(([icon,network,handle,url])=>`<a href="${url}" aria-label="${network}: ${handle}"><svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true">${socialIcons[icon]}</svg><span>${network}</span><strong>${handle}</strong><b aria-hidden="true">↗</b></a>`).join('')}</div>`;
  contactLinks.insertAdjacentElement('afterend',socialSection);
});

document.querySelectorAll('a[href]').forEach(link=>{
  try{
    const url=new URL(link.href,location.href);
    if(/^https?:$/.test(url.protocol)&&url.origin!==location.origin){link.target='_blank';link.rel=[...new Set(`${link.rel} noopener noreferrer`.trim().split(/\s+/))].join(' ')}
  }catch{}
});

const observer='IntersectionObserver'in window?new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.12}):null;
document.querySelectorAll('.reveal').forEach(element=>observer?observer.observe(element):element.classList.add('is-visible'));

const track=(name,parameters={})=>{if(globalThis.__ARKHIMAR_ANALYTICS_READY__&&typeof globalThis.gtag==='function')globalThis.gtag('event',name,parameters)};
document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link)return;try{const url=new URL(link.href,location.href);if(/^https?:$/.test(url.protocol)&&url.origin!==location.origin)track('portfolio_outbound_click',{link_domain:url.hostname,link_url:`${url.origin}${url.pathname}`})}catch{}});

document.querySelectorAll('[data-contact-form]').forEach(form=>form.addEventListener('submit',async event=>{
  event.preventDefault();
  const data=new FormData(form),name=String(data.get('name')||'').trim(),service=String(data.get('service')||'Project enquiry');
  const status=form.querySelector('[data-form-status]'),button=form.querySelector('button[type="submit"]'),files=[...form.querySelectorAll('input[type="file"]')].flatMap(input=>[...input.files]);
  if(files.reduce((total,file)=>total+file.size,0)>20*1024*1024){if(status)status.textContent='Please keep all attachments under 20 MB in total.';return}
  data.set('_subject',`${service} enquiry from ${name}`);data.set('_template','table');data.set('_captcha','false');
  if(status)status.textContent='Sending your project enquiry…';if(button)button.disabled=true;
  try{
    const response=await fetch('https://formsubmit.co/ajax/projects@arkhimar.com',{method:'POST',body:data,headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('Submission failed');
    form.reset();if(status)status.textContent='Thank you — your message and attachments have been sent.';track('portfolio_contact_submit',{service});
  }catch{
    if(status)status.textContent='The form could not send. Please email projects@arkhimar.com directly.';
  }finally{if(button)button.disabled=false}
}));

if(/^\/portfolio\/(automation|development|architecture|design)\/?$/.test(location.pathname)){
  const script=document.createElement('script');script.type='module';script.src='/portfolio/projects.js';document.body.append(script);
}
