import '../../success-toast.js';
import '../experience.js';

const $=(selector,root=document)=>root.querySelector(selector);
let records=[],currentPage=1,targetRecordId=new URLSearchParams(location.search).get('record')||'';
const pageSize=5;
const queue=$('#queue'),template=$('#card-template');
const confirmationDialog=$('#record-confirm'),confirmationTitle=$('#record-confirm-title'),confirmationMessage=$('#record-confirm-message'),confirmationSubmit=$('#record-confirm-submit');
let toastTimer;

const label=value=>String(value||'').replaceAll('_',' ');
const date=value=>new Intl.DateTimeFormat('en-NG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const safeDate=value=>value&&Number.isFinite(Date.parse(value))?date(value):'Not recorded';

function confirmRecordAction({title,message,confirmLabel,danger=false}){
  confirmationTitle.textContent=title;confirmationMessage.textContent=message;confirmationSubmit.textContent=confirmLabel;confirmationDialog.classList.toggle('is-danger',danger);
  confirmationDialog.showModal();
  return new Promise(resolve=>{
    const finish=value=>{confirmationDialog.close();confirmationSubmit.removeEventListener('click',approve);$('#record-confirm-cancel').removeEventListener('click',cancel);confirmationDialog.removeEventListener('cancel',cancel);resolve(value)};
    const approve=()=>finish(true),cancel=event=>{event?.preventDefault();finish(false)};
    confirmationSubmit.addEventListener('click',approve);$('#record-confirm-cancel').addEventListener('click',cancel);confirmationDialog.addEventListener('cancel',cancel);
  });
}

function showToast(type,message){
  clearTimeout(toastTimer);const toast=$('#record-toast');toast.className=`toast is-${type}`;$('#record-toast-title').textContent=type==='success'?'Action completed':'Action failed';$('#record-toast-message').textContent=message;toast.hidden=false;toastTimer=setTimeout(()=>toast.hidden=true,5500);
}

async function api(method='GET',body){
  const location=$('#location').value,route=$('#route').value,view=$('#view').value;
  const query=method==='GET'?`?location=${encodeURIComponent(location)}&route=${encodeURIComponent(route)}&view=${encodeURIComponent(view)}`:'';
  const separator=query?'&':'?';
  const response=await fetch(`/api/carcare/feedback${query}${separator}action=admin`,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(result.message||'The management desk could not complete that request.');error.status=response.status;throw error}
  return result;
}

function renderMetrics(summary){
  const values=[['All feedback',summary.total],['Open escalations',summary.urgent],['Unsent drafts',summary.drafts],['Ready to post',summary.readyToPost],['Needs review',summary.needsReview]];
  $('#metrics').innerHTML=values.map(([name,value])=>`<div class="metric"><strong>${value}</strong><span>${name}</span></div>`).join('');
}

const bookingQueue=$('#booking-queue'),bookingTemplate=$('#booking-template');
const bookingLabel=value=>label(value||'').replace(/\b\w/g,letter=>letter.toUpperCase());
function communicationLabel(fields){
  if(fields.customer_reply_status==='replied')return'Customer replied';
  if(fields.customer_reply_status==='tracking_not_configured')return'Reply tracking not configured';
  if(['failed','bounced','complained'].includes(fields.email_delivery_status))return`Email ${fields.email_delivery_status}`;
  if(fields.email_delivery_status==='delivered')return'Email delivered — awaiting customer reply';
  if(fields.email_delivery_status==='opened')return'Email opened — awaiting customer reply';
  if(fields.email_delivery_status==='clicked')return'Email link clicked — awaiting customer reply';
  if(fields.email_delivery_status==='sent'&&fields.customer_reply_status==='awaiting_reply')return'Email sent — awaiting customer reply';
  return`Email ${bookingLabel(fields.email_delivery_status||'queued')}`;
}
async function loadBookings(){
  const response=await fetch('/api/carcare/bookings?mode=admin'),result=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(result.message||'Bookings could not be loaded.');error.status=response.status;throw error}
  const summary=result.summary||{};$('#booking-metrics').innerHTML=[['All bookings',summary.total||0],['New requests',summary.newRequests||0],['Delivered · no reply',summary.awaitingReply||0],['Customer replied',summary.replied||0]].map(([name,value])=>`<div><strong>${value}</strong><span>${name}</span></div>`).join('');bookingQueue.replaceChildren();
  if(!result.records?.length){bookingQueue.innerHTML='<div class="empty">No session bookings yet.</div>';return}
  for(const record of result.records){const f=record.fields||{},node=bookingTemplate.content.cloneNode(true),card=$('.booking-card',node);card.dataset.urgency=f.urgency;card.dataset.recordId=record.id;card.id=`booking-${record.id}`;$('.booking-urgency',node).textContent=bookingLabel(f.urgency);$('h3',node).textContent=`${record.submitter_name} · ${f.booking_id}`;$('.booking-meta',node).textContent=`${record.submitter_email} · ${f.location} · ${f.preferred_date} · ${f.preferred_time}`;$('.booking-status',node).textContent=bookingLabel(f.booking_status);$('.booking-vehicle',node).textContent=`${f.vehicle_year||''} ${f.vehicle_make||''} ${f.vehicle_model||''} · ${f.registration||''}`;$('.booking-services',node).replaceChildren(...(f.services||[]).map(service=>{const item=document.createElement('li');item.textContent=service;return item}));$('.booking-problem',node).textContent=record.message||f.problem_description||'';const comm=$('.communication-state',node);comm.textContent=communicationLabel(f);comm.classList.toggle('is-replied',f.customer_reply_status==='replied');comm.classList.toggle('is-failed',['failed','bounced','complained'].includes(f.email_delivery_status));$('.communication-time',node).textContent=f.customer_replied_at?`Replied ${date(f.customer_replied_at)}`:f.email_delivered_at?`Delivered ${date(f.email_delivered_at)}`:f.email_sent_at?`Sent ${date(f.email_sent_at)}`:'';const email=$('.booking-email',node);email.href=`mailto:${encodeURIComponent(record.submitter_email)}?subject=${encodeURIComponent(`Your CarCare booking ${f.booking_id}`)}`;
    for(const control of node.querySelectorAll('[data-booking-field]'))control.value=f[control.dataset.bookingField]||control.value;
    $('.save-booking',node).addEventListener('click',async event=>{const button=event.currentTarget,payload={id:record.id};for(const control of card.querySelectorAll('[data-booking-field]'))payload[control.dataset.bookingField]=control.value;button.disabled=true;button.textContent='Saving…';try{const update=await fetch('/api/carcare/bookings?mode=admin',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),saved=await update.json().catch(()=>({}));if(!update.ok)throw new Error(saved.message||'Booking changes were not saved.');globalThis.showSuccessToast?.(`Booking ${f.booking_id} was updated.`,'Booking saved');await loadBookings()}catch(error){showToast('error',error.message)}finally{button.disabled=false;button.textContent='Save booking changes'}});bookingQueue.append(node);
  }
  if(targetRecordId){const target=document.querySelector(`.booking-card[data-record-id="${CSS.escape(targetRecordId)}"]`);if(target){target.classList.add('is-linked-case');requestAnimationFrame(()=>target.scrollIntoView({behavior:'smooth',block:'center'}));setTimeout(()=>target.classList.remove('is-linked-case'),7000);targetRecordId=''}}
}

function renderFeedbackFailure(){
  const message='The feedback queue could not be loaded. Please retry.';
  queue.innerHTML=`<div class="empty"><strong>Feedback queue unavailable</strong><br>${message}<br><button type="button" id="retry-feedback">Retry feedback queue</button></div>`;
  $('#retry-feedback')?.addEventListener('click',()=>load().catch(renderFeedbackFailure));
  $('#sync').textContent=message;
}

function renderBookingsFailure(){
  const message='Bookings are temporarily unavailable. Feedback cases remain available below.';
  bookingQueue.innerHTML=`<div class="empty"><strong>Booking queue unavailable</strong><br>${message}<br><button type="button" id="retry-bookings">Retry bookings</button></div>`;
  $('#retry-bookings')?.addEventListener('click',()=>loadBookings().catch(renderBookingsFailure));
}

const sortValue=(record,key)=>{
  const fields=record.fields||{};
  if(key==='job_id')return String(fields.job_id||'').toLocaleLowerCase();
  if(key==='name')return String(record.submitter_name||'').toLocaleLowerCase();
  if(key==='location')return String(fields.location||'').toLocaleLowerCase();
  if(key==='booking_date')return Date.parse(fields.booking_date||'')||Number.NEGATIVE_INFINITY;
  if(key==='modified_date')return Date.parse(fields.last_updated_at||fields.updated_at||record.received_at||'')||Number.NEGATIVE_INFINITY;
  return Date.parse(record.received_at||'')||Number.NEGATIVE_INFINITY;
};

function sortedRecords(){
  const key=$('#sort-by').value,direction=$('#sort-direction').value==='asc'?1:-1;
  return records.map((record,index)=>({record,index})).sort((left,right)=>{
    const a=sortValue(left.record,key),b=sortValue(right.record,key);
    if(a===b)return left.index-right.index;
    if(typeof a==='number'&&typeof b==='number')return(a-b)*direction;
    return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'})*direction;
  }).map(item=>item.record);
}

function renderPageNumbers(totalPages){
  const holder=$('#page-numbers');holder.replaceChildren();
  for(let page=1;page<=totalPages;page+=1){
    const button=document.createElement('button');button.type='button';button.textContent=String(page);button.className='page-number';button.disabled=page===currentPage;button.setAttribute('aria-label',`Go to page ${page}`);
    button.addEventListener('click',()=>{currentPage=page;render();scrollTo({top:queue.offsetTop-30,behavior:'smooth'})});holder.append(button);
  }
}

function render(){
  queue.replaceChildren();
  const ordered=sortedRecords(),totalPages=Math.max(1,Math.ceil(ordered.length/pageSize));
  currentPage=Math.min(currentPage,totalPages);
  const start=ordered.length?(currentPage-1)*pageSize+1:0,end=Math.min(currentPage*pageSize,ordered.length);
  $('#page-count').textContent=`Showing ${start}–${end} of ${ordered.length} · Page ${currentPage} of ${totalPages}`;
  renderPageNumbers(totalPages);
  $('#previous').disabled=currentPage<=1;$('#next').disabled=currentPage>=totalPages;
  if(!ordered.length){queue.innerHTML='<div class="empty">No feedback matches these filters.</div>';return}
  const pageRecords=ordered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  for(const record of pageRecords){
    const node=template.content.cloneNode(true),card=$('.case',node),f=record.fields||{};
    const rating=Math.max(1,Math.min(5,Number(f.rating)||3));
    const severity=Math.max(1,Math.min(5,Number(f.severity)||3));
    const repeatConcern=Boolean(f.repeat_concern)&&f.route==='manager_escalation'&&f.sentiment!=='positive';
    card.dataset.recordId=record.id;card.id=`feedback-${record.id}`;card.dataset.route=f.route;card.dataset.rating=String(rating);card.dataset.severity=String(severity);card.dataset.repeat=String(repeatConcern);
    $('.route',node).textContent=label(f.route);$('.repeat-badge',node).hidden=!repeatConcern;$('h2',node).textContent=`${record.submitter_name||'Customer'} · ${f.job_id||'No job ID'}`;
    $('.meta',node).textContent=`${record.submitter_email||''} · ${f.location||''} · ${f.rating||'–'}/5 · Booked ${safeDate(f.booking_date)} · Feedback ${safeDate(record.received_at)} · Modified ${safeDate(f.last_updated_at||f.updated_at||record.received_at)}`;
    const communication=document.createElement('div');communication.className='feedback-communication';communication.textContent=communicationLabel(f);communication.classList.toggle('is-replied',f.customer_reply_status==='replied');communication.classList.toggle('is-failed',['failed','bounced','complained'].includes(f.email_delivery_status));$('.meta',node).after(communication);
    $('.score strong',node).textContent=`${rating}/5`;$('.score-label',node).textContent=`customer rating · severity ${severity}/5`;$('blockquote',node).textContent=record.message||'';$('.summary',node).textContent=f.summary||'No summary available.';$('.note',node).textContent=f.manager_note||'';
    $('.tags',node).replaceChildren(...(f.themes||[]).map(value=>{const span=document.createElement('span');span.textContent=value;return span}));
    const draft=$('.draft textarea',node);draft.value=f.draft_response||'';
    const emailSubject=$('.email-subject',node),emailBody=$('.email-body',node);
    emailSubject.value=`Re: Your CarCare visit ${f.job_id||''}`.trim();emailBody.value=f.draft_response||`Hi ${String(record.submitter_name||'there').trim()},\n\nThank you for sharing your feedback. A member of the CarCare team has reviewed your visit.`;
    $('.copy',node).addEventListener('click',async event=>{await navigator.clipboard.writeText(draft.value);event.currentTarget.textContent='Copied';setTimeout(()=>event.currentTarget.textContent='Copy draft',1200)});
    const printButton=document.createElement('button');printButton.type='button';printButton.className='print-review';printButton.textContent='Print review / Save PDF';$('.copy',node).after(printButton);
    printButton.addEventListener('click',()=>{document.body.classList.add('print-single');card.classList.add('is-print-target');preparePrint();window.print();setTimeout(cleanupPrint,500)});
    $('.send-email',node).addEventListener('click',async event=>{const status=$('.email-status',card),button=event.currentTarget;if(!emailSubject.value.trim()||emailBody.value.trim().length<8){status.textContent='Add a subject and message first.';return}if(!confirm(`Send this email from projects@arkhimar.com to ${record.submitter_email}?`))return;button.disabled=true;status.textContent='Sending…';try{const result=await api('POST',{id:record.id,subject:emailSubject.value.trim(),body:emailBody.value.trim()});record.fields=result.fields;status.textContent=`Sent to ${record.submitter_email}`;globalThis.showSuccessToast?.(`Email sent to ${record.submitter_email}.`,'Message sent');const responseSelect=card.querySelector('[data-field="response_status"]');if(responseSelect)responseSelect.value='sent'}catch(error){status.textContent=error.message}finally{button.disabled=false}});
    for(const select of node.querySelectorAll('.controls select')){
      const field=select.dataset.field;select.value=f[field]||select.options[0].value;
      select.addEventListener('change',async()=>{const saved=$('.saved',card);saved.textContent='Saving…';select.disabled=true;try{const result=await api('PATCH',{id:record.id,[field]:select.value});record.fields=result.fields;saved.textContent='Saved';globalThis.showSuccessToast?.('The case status was updated.','Change saved');await load(false)}catch(error){saved.textContent=error.message}finally{select.disabled=false}});
    }
    queue.append(node);
  }
}

async function load(showSync=true){
  if(showSync)$('#sync').textContent='Syncing…';
  const result=await api();records=result.records;renderMetrics(result.summary);
  if(targetRecordId){const targetIndex=sortedRecords().findIndex(record=>record.id===targetRecordId);if(targetIndex>=0)currentPage=Math.floor(targetIndex/pageSize)+1}
  $('#archive-records').disabled=$('#view').value==='archived'||records.length===0;
  if($('#location').options.length===1)for(const value of result.locations){const option=document.createElement('option');option.value=option.textContent=value;$('#location').append(option)}
  render();$('#sync').textContent=`Updated ${new Date().toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}`;
  if(targetRecordId){const target=document.querySelector(`.case[data-record-id="${CSS.escape(targetRecordId)}"]`);if(target){target.classList.add('is-linked-case');requestAnimationFrame(()=>target.scrollIntoView({behavior:'smooth',block:'center'}));setTimeout(()=>target.classList.remove('is-linked-case'),7000);targetRecordId=''}}
}

$('#refresh').addEventListener('click',()=>load().catch(error=>$('#sync').textContent=error.message));
$('#location').addEventListener('change',()=>{currentPage=1;load().catch(error=>$('#sync').textContent=error.message)});
$('#route').addEventListener('change',()=>{currentPage=1;load().catch(error=>$('#sync').textContent=error.message)});
$('#view').addEventListener('change',()=>{currentPage=1;load().catch(error=>$('#sync').textContent=error.message)});
$('#sort-by').addEventListener('change',()=>{currentPage=1;render()});
$('#sort-direction').addEventListener('change',()=>{currentPage=1;render()});
$('#archive-records').addEventListener('click',async event=>{if(!records.length)return;const confirmed=await confirmRecordAction({title:'Archive active records?',message:'The records will leave the active queue but remain available from the Archived records view.',confirmLabel:'Yes, archive records'});if(!confirmed)return;const button=event.currentTarget,status=$('#record-action-status');button.disabled=true;status.textContent='Archiving records…';try{const result=await api('DELETE',{mode:'archive'});status.textContent='';showToast('success',result.message);currentPage=1;await load(false)}catch(error){status.textContent='';showToast('error',error.message)}finally{button.disabled=false}});
$('#record-toast-close').addEventListener('click',()=>{$('#record-toast').hidden=true;clearTimeout(toastTimer)});
$('#previous').addEventListener('click',()=>{if(currentPage>1){currentPage-=1;render();scrollTo({top:$('#queue').offsetTop-30,behavior:'smooth'})}});
$('#next').addEventListener('click',()=>{if(currentPage<Math.ceil(records.length/pageSize)){currentPage+=1;render();scrollTo({top:$('#queue').offsetTop-30,behavior:'smooth'})}});
function preparePrint(){document.querySelectorAll('.draft textarea').forEach(area=>area.style.height=`${area.scrollHeight}px`)}
function cleanupPrint(){document.body.classList.remove('print-single');document.querySelectorAll('.is-print-target').forEach(node=>node.classList.remove('is-print-target'));document.querySelectorAll('.draft textarea').forEach(area=>area.style.height='')}
$('#print-dashboard').addEventListener('click',()=>{preparePrint();window.print()});
addEventListener('afterprint',cleanupPrint);
load().catch(renderFeedbackFailure);
loadBookings().catch(renderBookingsFailure);
