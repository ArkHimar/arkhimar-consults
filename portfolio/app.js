const body=document.body;
const menuButton=document.querySelector('[data-menu]');
const mobileNav=document.querySelector('[data-mobile-nav]');
menuButton?.addEventListener('click',()=>{
  const open=!mobileNav.classList.contains('is-open');
  mobileNav.classList.toggle('is-open',open);body.classList.toggle('menu-open',open);
  menuButton.setAttribute('aria-expanded',String(open));
});
mobileNav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{mobileNav.classList.remove('is-open');body.classList.remove('menu-open');menuButton?.setAttribute('aria-expanded','false')}));

const observer='IntersectionObserver'in window?new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.12}):null;
document.querySelectorAll('.reveal').forEach(element=>observer?observer.observe(element):element.classList.add('is-visible'));

document.querySelectorAll('[data-contact-form]').forEach(form=>form.addEventListener('submit',event=>{
  event.preventDefault();
  const data=new FormData(form),name=String(data.get('name')||'').trim(),email=String(data.get('email')||'').trim(),service=String(data.get('service')||'Project enquiry'),message=String(data.get('message')||'').trim();
  const subject=encodeURIComponent(`${service} enquiry from ${name}`),bodyText=encodeURIComponent(`Name: ${name}\nEmail: ${email}\nService: ${service}\n\n${message}`);
  const status=form.querySelector('[data-form-status]');if(status)status.textContent='Opening your email app…';
  location.href=`mailto:emavericks22@gmail.com?subject=${subject}&body=${bodyText}`;
}));
