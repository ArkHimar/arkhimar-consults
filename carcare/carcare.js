import '../success-toast.js';
import './experience.js';

const $=(selector,root=document)=>root.querySelector(selector);
const feedbackForm=$('#feedback-form');
const jobForm=$('#job-form');
const bookingForm=$('#booking-form');
const params=new URLSearchParams(location.search);
const roleGateway=$('[data-role-gateway]');
const rootPath=location.pathname.replace(/\/$/,'');
if(rootPath==='/carcare'&&params.get('job_id'))location.replace(`/carcare/feedback?${params.toString()}`);

if(jobForm){
  const style=document.createElement('style');
  style.textContent='.cc-print-tools{display:flex;gap:10px;margin:18px 0 0}.cc-print-tools button,.cc-receipt button{border:1px solid #0d2622;background:transparent;color:#0d2622;padding:8px 13px;font:700 9px Inter;letter-spacing:.08em;text-transform:uppercase}.cc-receipt{grid-column:1/-1;margin-top:24px;background:#fffdf8;border:1px solid #d7d9cf;border-left:6px solid #18a995;padding:28px}.cc-receipt h2{font:600 28px Syne;margin:5px 0 18px}.cc-receipt dl{display:grid;grid-template-columns:150px 1fr;margin:0 0 22px}.cc-receipt dt,.cc-receipt dd{margin:0;padding:9px;border-bottom:1px solid #e3e1da}.cc-receipt dt{color:#62716d}.cc-receipt dd{font-weight:700}@media print{@page{size:A4;margin:14mm}.cc-header,.cc-footer,.cc-print-tools,.cc-receipt button,.cc-form-status{display:none!important}body{background:#fff}.cc-staff{display:block!important;padding:0!important}.cc-staff-copy{margin-bottom:10mm}.cc-form{box-shadow:none!important}.print-job-receipt .cc-staff-copy,.print-job-receipt #job-form{display:none!important}.print-job-receipt .cc-receipt{display:block!important;border:0;margin:0;padding:0}.cc-form input,.cc-form textarea,.cc-form select{border:0;border-bottom:1px solid #999}}';
  document.head.append(style);
  const tools=document.createElement('div');tools.className='cc-print-tools';tools.innerHTML='<button type="button" data-print-staff>Print</button>';
  jobForm.previousElementSibling?.append(tools);tools.querySelector('button').addEventListener('click',()=>window.print());
  const receipt=document.createElement('section');receipt.className='cc-receipt';receipt.hidden=true;receipt.innerHTML='<p class="cc-kicker"><span></span> Printable completion record</p><h2>Job marked complete</h2><dl><dt>Job ID</dt><dd data-receipt-job></dd><dt>Customer ID</dt><dd data-receipt-customer-id></dd><dt>Customer</dt><dd data-receipt-customer></dd><dt>Email</dt><dd data-receipt-email></dd><dt>Location</dt><dd data-receipt-location></dd><dt>Attended by</dt><dd data-receipt-staff></dd></dl><button type="button" data-print-receipt>Print</button>';
  jobForm.after(receipt);receipt.querySelector('[data-print-receipt]').addEventListener('click',()=>{document.body.classList.add('print-job-receipt');window.print();setTimeout(()=>document.body.classList.remove('print-job-receipt'),500)});
  addEventListener('afterprint',()=>document.body.classList.remove('print-job-receipt'));
}

const prefill={
  job_id:params.get('job_id')||'',
  customer_id:params.get('customer_id')||params.get('customer_key')||'',
  customer_name:params.get('customer_name')||'',
  customer_email:params.get('customer_email')||'',
  gender:params.get('gender')||'',
  preferred_title:params.get('preferred_title')||'',
  location:params.get('location')||''
};

for(const button of document.querySelectorAll('[data-role]'))button.addEventListener('click',()=>{
  const role=button.dataset.role;
  if(role==='admin'){location.href='/carcare/admin';return}
  location.href=role==='staff'?'/carcare/complete':'/carcare/feedback';
});

function applyPrefill(){
  for(const [name,value] of Object.entries(prefill)){
    const input=feedbackForm?.elements.namedItem(name);
    if(input&&value)input.value=value.slice(0,input.maxLength>0?input.maxLength:254);
  }
}
applyPrefill();
addEventListener('pageshow',applyPrefill,{once:true});
setTimeout(applyPrefill,0);

if(prefill.job_id&&prefill.location){
  const summary=$('[data-visit-summary]');
  summary.hidden=false;
  $('[data-visit-location]').textContent=prefill.location;
  $('[data-visit-job]').textContent=`Job ${prefill.job_id}`;
}

const feedback=feedbackForm?.elements.namedItem('feedback');
feedback?.addEventListener('input',()=>{$('[data-character-count]').textContent=String(feedback.value.length)});

async function submitJson(form,url,statusSelector,successText){
  const status=$(statusSelector),button=$('button[type="submit"]',form);
  if(!form.reportValidity())return;
  button.disabled=true;
  status.className='cc-form-status is-visible';
  status.textContent='Sending securely…';
  try{
    const values=Object.fromEntries(new FormData(form));
    if(values.rating)values.rating=Number(values.rating);
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.message||'We could not complete that request. Please try again.');
    status.className='cc-form-status is-visible is-success';
    status.textContent=result.message||successText;
    globalThis.showSuccessToast?.(result.message||successText,form===jobForm?'Job completed':'Feedback received');
    if(form===jobForm)showJobReceipt(result,values);
    form.reset();
    if(form===feedbackForm){$('[data-character-count]').textContent='0';status.scrollIntoView({behavior:'smooth',block:'nearest'})}
  }catch(error){
    status.className='cc-form-status is-visible is-error';
    status.textContent=error.message;
  }finally{button.disabled=false}
}

function showJobReceipt(result,values){
  const receipt=$('.cc-receipt');if(!receipt)return;
  const content={job:result.job_id||'',customerId:result.customer_id||'',customer:values.customer_name||'',email:values.customer_email||'',location:values.location||'',staff:values.staff_name||''};
  for(const [key,value] of Object.entries(content)){const target=receipt.querySelector(`[data-receipt-${key.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)}]`);if(target)target.textContent=value}
  receipt.hidden=false;receipt.scrollIntoView({behavior:'smooth',block:'nearest'});
}

feedbackForm?.addEventListener('submit',event=>{event.preventDefault();submitJson(feedbackForm,'/api/carcare/feedback','[data-feedback-status]','Thank you. Your feedback is with the right team.')});
jobForm?.addEventListener('submit',event=>{event.preventDefault();submitJson(jobForm,'/api/carcare/job-completed','[data-job-status]','The feedback request has been sent.')});

if(bookingForm){
  const preferredDate=bookingForm.elements.namedItem('preferred_date'),alternativeDate=bookingForm.elements.namedItem('alternative_date'),vehicleYear=bookingForm.elements.namedItem('vehicle_year'),consent=bookingForm.querySelector('.cc-consent input'),today=new Date().toISOString().slice(0,10);preferredDate.min=today;alternativeDate.min=today;vehicleYear.max=String(new Date().getFullYear()+1);consent.name='consent';
  preferredDate.addEventListener('change',()=>{alternativeDate.min=preferredDate.value||today;if(alternativeDate.value&&alternativeDate.value<alternativeDate.min)alternativeDate.value=''});
  bookingForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!bookingForm.reportValidity())return;
    const data=new FormData(bookingForm),services=data.getAll('services');if(!services.length){globalThis.showSuccessToast?.('Choose at least one service before submitting.','Service required');return}
    const values=Object.fromEntries(data);values.services=services;values.vehicle_year=Number(values.vehicle_year);values.mileage=Number(values.mileage);
    const status=$('[data-booking-status]'),button=bookingForm.querySelector('button[type="submit"]');button.disabled=true;status.className='cc-form-status is-visible';status.textContent='Sending your request securely…';
    try{const response=await fetch('/api/carcare/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||'The booking request could not be completed.');status.className='cc-form-status is-visible is-success';status.textContent=result.message;const receipt=$('.cc-booking-receipt');$('[data-booking-id]').textContent=result.booking_id;$('[data-booking-customer]').textContent=result.customer_id;receipt.hidden=false;receipt.scrollIntoView({behavior:'smooth',block:'center'});globalThis.showSuccessToast?.(`Booking ${result.booking_id} was received.`, 'Session requested');bookingForm.reset()}catch(error){status.className='cc-form-status is-visible is-error';status.textContent=error.message}finally{button.disabled=false}
  });
  $('[data-print-booking]')?.addEventListener('click',()=>window.print());
}

if(!matchMedia('(prefers-reduced-motion: reduce)').matches){const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-revealed');revealObserver.unobserve(entry.target)}}),{threshold:.08});document.querySelectorAll('[data-reveal],.cc-access-card,.cc-process li').forEach(node=>revealObserver.observe(node))}
