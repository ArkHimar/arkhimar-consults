const $=(selector,root=document)=>root.querySelector(selector);
const feedbackForm=$('#feedback-form');
const jobForm=$('#job-form');
const params=new URLSearchParams(location.search);

const prefill={
  job_id:params.get('job_id')||'',
  customer_id:params.get('customer_id')||params.get('customer_key')||'',
  customer_name:params.get('customer_name')||'',
  customer_email:params.get('customer_email')||'',
  location:params.get('location')||''
};

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
    form.reset();
    if(form===feedbackForm){$('[data-character-count]').textContent='0';status.scrollIntoView({behavior:'smooth',block:'nearest'})}
  }catch(error){
    status.className='cc-form-status is-visible is-error';
    status.textContent=error.message;
  }finally{button.disabled=false}
}

feedbackForm?.addEventListener('submit',event=>{event.preventDefault();submitJson(feedbackForm,'/api/carcare/feedback','[data-feedback-status]','Thank you. Your feedback is with the right team.')});
jobForm?.addEventListener('submit',event=>{event.preventDefault();submitJson(jobForm,'/api/carcare/job-completed','[data-job-status]','The feedback request has been sent.')});
