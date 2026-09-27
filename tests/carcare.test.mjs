import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import bookingHandler from '../api/_lib/carcare-bookings.js';
import {verifyResendWebhook} from '../api/_lib/carcare-email-events.js';
import feedbackHandler from '../api/carcare/feedback.js';
import jobHandler from '../api/carcare/job-completed.js';
import {analyzeCarCareFeedback} from '../api/_lib/carcare-intelligence.js';

function response(){return{statusCode:200,headers:{},body:null,setHeader(name,value){this.headers[name]=value},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}}}
const baseHeaders={'x-forwarded-for':'203.0.113.44',host:'www.arkhimar.com',origin:'https://www.arkhimar.com'};
const managerHeaders={...baseHeaders,authorization:'Bearer test-manager-token'};
const testWorkspace='11111111-1111-4111-8111-111111111111';

function configureTestBackend(){
  process.env.SUPABASE_URL='https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-role-test-key';
  process.env.ARKHIMAR_WORKSPACE_ID=testWorkspace;
}

function fakeCarCareFetch(requests,history=[]){
  return async(url,options={})=>{
    const request={url:String(url),options};requests.push(request);
    if(request.url.startsWith('https://database.example/auth/v1/user'))return new Response(JSON.stringify({user:{id:'33333333-3333-4333-8333-333333333333'}}),{status:200,headers:{'Content-Type':'application/json'}});
    if(request.url.startsWith('https://database.example/rest/v1/workspace_members'))return new Response(JSON.stringify({role:'owner'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(request.url.startsWith('https://database.example/rest/v1/form_submissions')){
      if((options.method||'GET')==='GET')return new Response(JSON.stringify(history),{status:200,headers:{'Content-Type':'application/json'}});
      if(options.method==='POST')return new Response(JSON.stringify({id:'22222222-2222-4222-8222-222222222222',received_at:'2026-09-21T10:00:00.000Z',fields:JSON.parse(options.body).fields}),{status:201,headers:{'Content-Type':'application/json'}});
      return new Response(JSON.stringify({}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}});
  };
}

test('CarCare customer, staff and booking forms live on separate public routes',async()=>{
  const [landingPage,customerPage,staffPage,bookingPage,adminPage,adminScript,jobApi,buildScript]=await Promise.all([readFile(new URL('../carcare/index.html',import.meta.url),'utf8'),readFile(new URL('../carcare/customer/index.html',import.meta.url),'utf8'),readFile(new URL('../carcare/staff/index.html',import.meta.url),'utf8'),readFile(new URL('../carcare/book/index.html',import.meta.url),'utf8'),readFile(new URL('../carcare/admin/index.html',import.meta.url),'utf8'),readFile(new URL('../carcare/admin/admin.js',import.meta.url),'utf8'),readFile(new URL('../api/carcare/job-completed.js',import.meta.url),'utf8'),readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8')]);
  assert.match(customerPage,/id="feedback-form"/);
  assert.match(customerPage,/name="gender"/);
  assert.match(customerPage,/name="preferred_title"/);
  assert.doesNotMatch(customerPage,/id="job-form"/);
  assert.match(staffPage,/id="job-form"/);
  assert.doesNotMatch(staffPage,/id="feedback-form"/);
  assert.match(bookingPage,/id="booking-form"/);
  assert.match(bookingPage,/General vehicle inspection/);
  assert.match(bookingPage,/Roadside assistance or towing/);
  for(const route of ['/carcare/complete','/carcare/feedback','/carcare/book','/carcare/admin'])assert.match(landingPage,new RegExp(`href="${route}"`));
  const accessGrid=landingPage.match(/<div class="cc-access-grid">([\s\S]*?)<\/div><\/section>/)?.[1]||'';
  assert.ok(accessGrid.indexOf('href="/carcare/book"')<accessGrid.indexOf('href="/carcare/complete"'),'booking must be the first CarCare workspace');
  assert.match(accessGrid,/href="\/carcare\/book"><span>01 · BOOKING<\/span>/);
  assert.match(buildScript,/carcare\/feedback/);
  assert.match(buildScript,/carcare\/complete/);
  assert.match(jobApi,/\/carcare\/feedback\?\$\{query\}/);
  assert.match(adminPage,/id="archive-records"/);
  assert.match(adminPage,/id="clear-records"/);
  assert.match(adminPage,/id="view"/);
  assert.match(adminPage,/id="record-confirm"/);
  assert.match(adminPage,/id="record-toast"/);
  assert.match(adminScript,/mode:'archive'/);
  assert.match(adminScript,/mode:'clear'/);
  assert.match(adminScript,/showToast\('success'/);
  assert.match(adminScript,/showToast\('error'/);
  assert.match(adminScript,/new URLSearchParams\(location\.search\)\.get\('record'\)/);
  assert.match(adminScript,/scrollIntoView\(\{behavior:'smooth',block:'center'\}\)/);
  assert.match(adminScript,/Email delivered — awaiting customer reply/);
  assert.match(adminScript,/currentSession/);
  assert.match(adminScript,/Authorization:`Bearer \$\{accessToken\}`/);
  assert.match(adminPage,/\/runtime-config\.js/);
  assert.match(adminPage,/id="booking-queue"/);
  assert.match(buildScript,/installSuccessToasts/);
});

test('CarCare management APIs require an authenticated manager session',async()=>{
  const feedbackResult=response();
  await feedbackHandler({method:'GET',query:{action:'admin'},headers:baseHeaders},feedbackResult);
  assert.equal(feedbackResult.statusCode,401);
  assert.equal(feedbackResult.body.error,'authentication_required');
  const bookingResult=response();
  await bookingHandler({method:'GET',query:{mode:'admin'},headers:baseHeaders},bookingResult);
  assert.equal(bookingResult.statusCode,401);
  assert.equal(bookingResult.body.error,'authentication_required');
});

test('CarCare booking creates tracked IDs and sends a structured confirmation',async()=>{
  const oldFetch=globalThis.fetch,previous={supabase:process.env.SUPABASE_URL,role:process.env.SUPABASE_SERVICE_ROLE_KEY,workspace:process.env.ARKHIMAR_WORKSPACE_ID,resendKey:process.env.RESEND_API_KEY,inbound:process.env.CARCARE_INBOUND_DOMAIN};
  configureTestBackend();process.env.RESEND_API_KEY='resend-test-key';process.env.CARCARE_INBOUND_DOMAIN='reply.arkhimar.com';
  const requests=[];globalThis.fetch=fakeCarCareFetch(requests);
  try{
    const result=response();await bookingHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.70'},body:{customer_name:'Jessica Cole',customer_email:'jessica@example.com',gender:'female',preferred_title:'Miss',phone:'+2348000000000',contact_method:'email',vehicle_make:'Toyota',vehicle_model:'Camry',vehicle_year:2022,registration:'LAG-123-AA',vehicle_colour:'Black',mileage:42000,fuel_type:'petrol',transmission:'automatic',vin:'',services:['Routine vehicle service','Computer diagnostics'],location:'Lagos',preferred_date:'2027-01-10',preferred_time:'9:00 AM - 11:00 AM',alternative_date:'',alternative_time:'',service_mode:'drop_off',safe_to_drive:'yes',urgency:'normal',problem_description:'The car needs scheduled maintenance and a diagnostic check.',problem_started:'This week',consent:'on'}},result);
    assert.equal(result.statusCode,200);assert.match(result.body.booking_id,/^BKG-\d{6}-\d{8}$/);assert.equal(result.body.customer_id,'CUS-000001');
    const sent=requests.find(request=>request.url==='https://api.resend.com/emails'),email=JSON.parse(sent.options.body);assert.equal(email.reply_to,'reply+22222222-2222-4222-8222-222222222222@reply.arkhimar.com');assert.match(email.html,/Hi Miss Jessica Cole,/);assert.match(email.html,/Routine vehicle service/);assert.equal(email.attachments.length,1);
    const insert=requests.find(request=>request.url.startsWith('https://database.example/rest/v1/form_submissions')&&request.options.method==='POST');assert.equal(JSON.parse(insert.options.body).form_id,'carcare-booking');
  }finally{globalThis.fetch=oldFetch;for(const [key,name] of Object.entries({supabase:'SUPABASE_URL',role:'SUPABASE_SERVICE_ROLE_KEY',workspace:'ARKHIMAR_WORKSPACE_ID',resendKey:'RESEND_API_KEY',inbound:'CARCARE_INBOUND_DOMAIN'}))if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key]}
});

test('Resend webhook verification accepts an authentic fresh payload and rejects tampering',()=>{
  const raw=Buffer.from(JSON.stringify({type:'email.delivered',data:{email_id:'email-123'}})),id='msg_test',timestamp=String(Math.floor(Date.now()/1000)),secret=`whsec_${Buffer.from('webhook-test-secret').toString('base64')}`,signature=createHmac('sha256',Buffer.from('webhook-test-secret')).update(`${id}.${timestamp}.${raw}`).digest('base64'),headers={'svix-id':id,'svix-timestamp':timestamp,'svix-signature':`v1,${signature}`};
  assert.equal(verifyResendWebhook(raw,headers,secret),true);assert.equal(verifyResendWebhook(Buffer.from(`${raw}x`),headers,secret),false);
});

test('CarCare endpoints reject invalid public and staff submissions',async()=>{
  let result=response();
  await feedbackHandler({method:'POST',headers:baseHeaders,body:{job_id:'JOB-1'}},result);
  assert.equal(result.statusCode,400);
  assert.equal(result.body.error,'invalid_request');

  result=response();
  await jobHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.45'},body:{customer_name:'Ada',customer_email:'ada@example.com',location:'Lagos'}},result);
  assert.equal(result.statusCode,400);
  assert.equal(result.body.error,'invalid_request');
});

test('CarCare feedback forwards normalized content without exposing the workflow secret',async()=>{
  const oldFetch=globalThis.fetch;
  const previous={url:process.env.CARCARE_FEEDBACK_WEBHOOK_URL,secret:process.env.CARCARE_WEBHOOK_SECRET,supabase:process.env.SUPABASE_URL,role:process.env.SUPABASE_SERVICE_ROLE_KEY,workspace:process.env.ARKHIMAR_WORKSPACE_ID};
  configureTestBackend();
  process.env.CARCARE_FEEDBACK_WEBHOOK_URL='https://automation.example/webhook/feedback';
  process.env.CARCARE_WEBHOOK_SECRET='workflow-secret-value';
  const requests=[];
  globalThis.fetch=fakeCarCareFetch(requests);
  try{
    const result=response();
    await feedbackHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.46'},body:{job_id:'JOB-1001',customer_id:'CUS-44',customer_name:'Ada Okafor',customer_email:'ADA@example.com',location:'Lagos',rating:2,feedback:'The visit took much longer than promised.'}},result);
    assert.equal(result.statusCode,200);
    assert.equal(result.body.ok,true);
    const request=requests.find(item=>item.url==='https://automation.example/webhook/feedback');
    assert.ok(request);
    assert.equal(request.options.headers['X-Workflow-Secret'],'workflow-secret-value');
    const payload=JSON.parse(request.options.body);
    assert.equal(payload.customer_email,'ada@example.com');
    assert.match(payload.feedback,/Rating: 2\/5/);
    assert.doesNotMatch(JSON.stringify(result.body),/workflow-secret-value/);
  }finally{
    globalThis.fetch=oldFetch;
    if(previous.url===undefined)delete process.env.CARCARE_FEEDBACK_WEBHOOK_URL;else process.env.CARCARE_FEEDBACK_WEBHOOK_URL=previous.url;
    if(previous.secret===undefined)delete process.env.CARCARE_WEBHOOK_SECRET;else process.env.CARCARE_WEBHOOK_SECRET=previous.secret;
    for(const [key,name] of Object.entries({supabase:'SUPABASE_URL',role:'SUPABASE_SERVICE_ROLE_KEY',workspace:'ARKHIMAR_WORKSPACE_ID'}))if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];
  }
});

test('CarCare honeypot accepts bot-looking submissions without forwarding',async()=>{
  const oldFetch=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;return{ok:true}};
  try{
    const result=response();
    await feedbackHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.47'},body:{job_id:'JOB-9',customer_name:'Bot Name',customer_email:'bot@example.com',location:'Lagos',rating:5,feedback:'A long enough feedback message',website:'https://spam.example'}},result);
    assert.equal(result.statusCode,202);
    assert.equal(called,false);
  }finally{globalThis.fetch=oldFetch}
});

test('CarCare sends a 1 or 2 star urgent alert to the admin and copies the secondary address',async()=>{
  const oldFetch=globalThis.fetch;
  const previous={url:process.env.CARCARE_FEEDBACK_WEBHOOK_URL,secret:process.env.CARCARE_WEBHOOK_SECRET,resendKey:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL,admin:process.env.CARCARE_ADMIN_EMAIL,cc:process.env.CARCARE_ADMIN_ALERT_CC,supabase:process.env.SUPABASE_URL,role:process.env.SUPABASE_SERVICE_ROLE_KEY,workspace:process.env.ARKHIMAR_WORKSPACE_ID};
  configureTestBackend();
  process.env.CARCARE_FEEDBACK_WEBHOOK_URL='https://automation.example/webhook/feedback';
  process.env.CARCARE_WEBHOOK_SECRET='workflow-secret-value';
  process.env.RESEND_API_KEY='resend-test-key';
  process.env.RESEND_FROM_EMAIL='notifications@arkhimar.com';
  delete process.env.CARCARE_ADMIN_EMAIL;
  delete process.env.CARCARE_ADMIN_ALERT_CC;
  const requests=[];
  globalThis.fetch=fakeCarCareFetch(requests);
  try{
    const result=response();
    await feedbackHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.51'},body:{job_id:'JOB-ABCDEFG-0001-20260921',customer_id:'CUS-ABCDEFG',customer_name:'Ada Okafor',customer_email:'ada@example.com',location:'Lagos',rating:1,feedback:'The vehicle was returned with an unsafe brake issue.'}},result);
    assert.equal(result.statusCode,200);
    const emailRequest=requests.find(request=>request.url==='https://api.resend.com/emails'&&JSON.parse(request.options.body).subject.startsWith('URGENT:'));
    assert.ok(emailRequest);
    const email=JSON.parse(emailRequest.options.body);
    assert.deepEqual(email.to,['projects@arkhimar.com']);
    assert.deepEqual(email.cc,['emavericks22@gmail.com']);
    assert.match(email.subject,/URGENT: 1-star CarCare rating/);
    assert.match(email.text,/JOB-ABCDEFG-0001-20260921/);
    assert.match(email.text,/unsafe brake issue/);
    assert.equal(email.reply_to,'ada@example.com');
    assert.match(email.html,/ARKHIMAR CARCARE/);
    assert.match(email.html,/URGENT REVIEW/);
    assert.match(email.html,/VISIT &amp; CUSTOMER/);
    assert.match(email.html,/CUSTOMER FEEDBACK/);
    assert.match(email.html,/AI ASSESSMENT/);
    assert.match(email.html,/DRAFT RESPONSE · HUMAN REVIEW REQUIRED/);
    assert.match(email.html,/REVIEW THIS EXACT CASE/);
    assert.match(email.text,/Open this exact case: https:\/\/www\.arkhimar\.com\/carcare\/admin\?record=22222222-2222-4222-8222-222222222222/);
    assert.match(email.html,/CUS-000001/);
    assert.equal(email.attachments.length,1);
    assert.match(email.attachments[0].filename,/^urgent-carcare-review-.*\.pdf$/);
    assert.equal(Buffer.from(email.attachments[0].content,'base64').subarray(0,5).toString(),'%PDF-');
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,name] of Object.entries({url:'CARCARE_FEEDBACK_WEBHOOK_URL',secret:'CARCARE_WEBHOOK_SECRET',resendKey:'RESEND_API_KEY',from:'RESEND_FROM_EMAIL',admin:'CARCARE_ADMIN_EMAIL',cc:'CARCARE_ADMIN_ALERT_CC',supabase:'SUPABASE_URL',role:'SUPABASE_SERVICE_ROLE_KEY',workspace:'ARKHIMAR_WORKSPACE_ID'})){
      if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];
    }
  }
});

test('CarCare sends non-urgent concerns to the manager with a direct case link',async()=>{
  const oldFetch=globalThis.fetch;
  const previous={url:process.env.CARCARE_FEEDBACK_WEBHOOK_URL,secret:process.env.CARCARE_WEBHOOK_SECRET,resendKey:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL,supabase:process.env.SUPABASE_URL,role:process.env.SUPABASE_SERVICE_ROLE_KEY,workspace:process.env.ARKHIMAR_WORKSPACE_ID};
  configureTestBackend();
  process.env.CARCARE_FEEDBACK_WEBHOOK_URL='https://automation.example/webhook/feedback';
  process.env.CARCARE_WEBHOOK_SECRET='workflow-secret-value';
  process.env.RESEND_API_KEY='resend-test-key';
  process.env.RESEND_FROM_EMAIL='notifications@arkhimar.com';
  const requests=[];globalThis.fetch=fakeCarCareFetch(requests);
  try{
    const result=response();
    await feedbackHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.56'},body:{job_id:'JOB-FOLLOW-UP',customer_name:'Jessica Cole',customer_email:'jessica@example.com',gender:'female',preferred_title:'Miss',location:'Lagos',rating:3,feedback:'The service was delayed and I did not receive an update.'}},result);
    assert.equal(result.statusCode,200);
    const managerRequest=requests.find(request=>request.url==='https://api.resend.com/emails'&&JSON.parse(request.options.body).subject.startsWith('FOLLOW-UP:'));
    assert.ok(managerRequest);
    const email=JSON.parse(managerRequest.options.body);
    assert.match(email.html,/FOLLOW-UP REVIEW/);
    assert.match(email.html,/REVIEW THIS EXACT CASE/);
    assert.match(email.html,/carcare\/admin\?record=22222222-2222-4222-8222-222222222222/);
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,name] of Object.entries({url:'CARCARE_FEEDBACK_WEBHOOK_URL',secret:'CARCARE_WEBHOOK_SECRET',resendKey:'RESEND_API_KEY',from:'RESEND_FROM_EMAIL',supabase:'SUPABASE_URL',role:'SUPABASE_SERVICE_ROLE_KEY',workspace:'ARKHIMAR_WORKSPACE_ID'}))if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];
  }
});

test('CarCare sends the customer a branded HTML receipt with an apology and resolution assurance for a concern',async()=>{
  const oldFetch=globalThis.fetch;
  const previous={url:process.env.CARCARE_FEEDBACK_WEBHOOK_URL,secret:process.env.CARCARE_WEBHOOK_SECRET,resendKey:process.env.RESEND_API_KEY,supabase:process.env.SUPABASE_URL,role:process.env.SUPABASE_SERVICE_ROLE_KEY,workspace:process.env.ARKHIMAR_WORKSPACE_ID};
  configureTestBackend();
  process.env.CARCARE_FEEDBACK_WEBHOOK_URL='https://automation.example/webhook/feedback';
  process.env.CARCARE_WEBHOOK_SECRET='workflow-secret-value';
  process.env.RESEND_API_KEY='resend-test-key';
  const requests=[];
  globalThis.fetch=fakeCarCareFetch(requests);
  try{
    const result=response();
    await feedbackHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.52'},body:{job_id:'JOB-ABCDEFG-0002-20260921',customer_id:'CUS-ABCDEFG',customer_name:'Ada Okafor',customer_email:'ada@example.com',gender:'female',preferred_title:'Mrs.',location:'Lagos',rating:2,feedback:'The repair was delayed and the issue remains unresolved.'}},result);
    assert.equal(result.statusCode,200);
    const emailRequest=requests.find(request=>request.url==='https://api.resend.com/emails'&&JSON.parse(request.options.body).subject.startsWith('We received your CarCare feedback'));
    assert.ok(emailRequest);
    const email=JSON.parse(emailRequest.options.body);
    assert.equal(email.from,'ArkHimar CarCare <projects@arkhimar.com>');
    assert.deepEqual(email.to,['ada@example.com']);
    assert.equal(email.reply_to,'projects@arkhimar.com');
    assert.match(email.html,/FEEDBACK RECEIVED/);
    assert.match(email.html,/Hi Mrs\. Ada Okafor,/);
    assert.match(email.html,/sincerely apologize/i);
    assert.match(email.html,/investigated and resolved/i);
    assert.match(email.html,/JOB-ABCDEFG-0002-20260921/);
    assert.match(email.html,/CUS-000001/);
    assert.doesNotMatch(email.html,/RATING:/i);
    assert.doesNotMatch(email.text,/RATING:/i);
    assert.equal(email.attachments.length,1);
    assert.match(email.attachments[0].filename,/^carcare-feedback-receipt-.*\.pdf$/);
    assert.equal(Buffer.from(email.attachments[0].content,'base64').subarray(0,5).toString(),'%PDF-');
    const statusUpdate=requests.find(request=>request.url.startsWith('https://database.example/rest/v1/form_submissions')&&request.options.method==='PATCH');
    assert.ok(statusUpdate);
    assert.equal(JSON.parse(statusUpdate.options.body).fields.customer_ack_delivery,'sent');
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,name] of Object.entries({url:'CARCARE_FEEDBACK_WEBHOOK_URL',secret:'CARCARE_WEBHOOK_SECRET',resendKey:'RESEND_API_KEY',supabase:'SUPABASE_URL',role:'SUPABASE_SERVICE_ROLE_KEY',workspace:'ARKHIMAR_WORKSPACE_ID'})){
      if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];
    }
  }
});

test('CarCare reuses one canonical serial Customer ID for repeat submissions from the same email',async()=>{
  const oldFetch=globalThis.fetch;
  const previous={url:process.env.CARCARE_FEEDBACK_WEBHOOK_URL,secret:process.env.CARCARE_WEBHOOK_SECRET,resendKey:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL,supabase:process.env.SUPABASE_URL,role:process.env.SUPABASE_SERVICE_ROLE_KEY,workspace:process.env.ARKHIMAR_WORKSPACE_ID};
  configureTestBackend();
  process.env.CARCARE_FEEDBACK_WEBHOOK_URL='https://automation.example/webhook/feedback';
  process.env.CARCARE_WEBHOOK_SECRET='workflow-secret-value';
  process.env.RESEND_API_KEY='resend-test-key';
  process.env.RESEND_FROM_EMAIL='notifications@arkhimar.com';
  const existing=[{id:'33333333-3333-4333-8333-333333333333',form_id:'carcare-feedback',submitter_email:'repeat@example.com',received_at:'2026-09-20T10:00:00.000Z',fields:{customer_id:'CUS-000007',rating:2,route:'manager_escalation'}}];
  const requests=[];globalThis.fetch=fakeCarCareFetch(requests,existing);
  try{
    const result=response();
    await feedbackHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.53'},body:{job_id:'JOB-REPEAT',customer_id:'WRONG-BROWSER-ID',customer_name:'Repeat Customer',customer_email:'REPEAT@example.com',location:'Lagos',rating:2,feedback:'The same delay happened again on this visit.'}},result);
    assert.equal(result.statusCode,200);
    const workflowRequest=requests.find(request=>request.url==='https://automation.example/webhook/feedback');
    assert.equal(JSON.parse(workflowRequest.options.body).customer_id,'CUS-000007');
    const urgentRequest=requests.find(request=>request.url==='https://api.resend.com/emails'&&JSON.parse(request.options.body).subject.startsWith('URGENT:'));
    assert.match(JSON.parse(urgentRequest.options.body).text,/Customer ID: CUS-000007/);
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,name] of Object.entries({url:'CARCARE_FEEDBACK_WEBHOOK_URL',secret:'CARCARE_WEBHOOK_SECRET',resendKey:'RESEND_API_KEY',from:'RESEND_FROM_EMAIL',supabase:'SUPABASE_URL',role:'SUPABASE_SERVICE_ROLE_KEY',workspace:'ARKHIMAR_WORKSPACE_ID'}))if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];
  }
});

test('CarCare demonstrates positive, first-negative, repeat-negative and unclear routing',()=>{
  const base={job_id:'JOB-ABCDEFG-0001-20260921',customer_id:'CUS-ABCDEFG',customer_name:'Ada Okafor',customer_email:'ada@example.com',gender:'female',preferred_title:'Miss',location:'Lagos'};
  const positive=analyzeCarCareFeedback({...base,rating:5,feedback:'Excellent and professional service. Thank you.'});
  assert.equal(positive.route,'ready_to_post');
  assert.equal(positive.positive_status,'ready_to_post');
  assert.equal(positive.repeat_concern,false);

  const firstNegative=analyzeCarCareFeedback({...base,rating:3,feedback:'The visit was delayed and nobody gave me an update.'});
  assert.equal(firstNegative.route,'needs_follow_up');
  assert.match(firstNegative.draft_response,/sorry/i);
  assert.match(firstNegative.draft_response,/^Hi Miss Ada Okafor,/);

  const repeatNegative=analyzeCarCareFeedback({...base,rating:3,feedback:'The repair issue happened again.'},[{fields:{rating:2,route:'manager_escalation'}}]);
  assert.equal(repeatNegative.repeat_concern,true);
  assert.equal(repeatNegative.route,'manager_escalation');

  const mildRatedRepeat=analyzeCarCareFeedback({...base,rating:4,feedback:'The visit was generally good, but the same delay happened again.'},[{fields:{rating:2,route:'manager_escalation'}}]);
  assert.equal(mildRatedRepeat.repeat_concern,true);
  assert.equal(mildRatedRepeat.severity,4);
  assert.equal(mildRatedRepeat.route,'manager_escalation');

  const unclear=analyzeCarCareFeedback({...base,rating:3,feedback:'Not sure about it'});
  assert.equal(unclear.human_review_status,'needs_clarification');
});

test('CarCare dashboard only displays a red priority badge for repeat-negative feedback',async()=>{
  const [dashboard,admin]=await Promise.all([
    readFile('carcare/admin/index.html','utf8'),
    readFile('carcare/admin/admin.js','utf8')
  ]);
  assert.match(admin,/Boolean\(f\.repeat_concern\)&&f\.route==='manager_escalation'&&f\.sentiment!=='positive'/);
  assert.match(dashboard,/\.repeat-badge\[hidden\]\{display:none!important\}/);
  assert.match(dashboard,/\.repeat-badge\{[^}]*background:#b42318;color:#fff/);
  assert.match(dashboard,/body \.case\[data-repeat="true"\]\{outline:3px solid #b42318/);
});

test('CarCare admin sends a structured response only to the customer on the selected record',async()=>{
  const oldFetch=globalThis.fetch;
  const previous={supabase:process.env.SUPABASE_URL,role:process.env.SUPABASE_SERVICE_ROLE_KEY,workspace:process.env.ARKHIMAR_WORKSPACE_ID,resendKey:process.env.RESEND_API_KEY};
  configureTestBackend();process.env.RESEND_API_KEY='resend-test-key';
  const requests=[];
  globalThis.fetch=async(url,options={})=>{
    const request={url:String(url),options};requests.push(request);
    if(request.url.startsWith('https://database.example/auth/v1/user'))return new Response(JSON.stringify({user:{id:'33333333-3333-4333-8333-333333333333'}}),{status:200,headers:{'Content-Type':'application/json'}});
    if(request.url.startsWith('https://database.example/rest/v1/workspace_members'))return new Response(JSON.stringify({role:'owner'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(request.url.startsWith('https://database.example/rest/v1/form_submissions')&&(options.method||'GET')==='GET')return new Response(JSON.stringify({id:'22222222-2222-4222-8222-222222222222',submitter_name:'Ada Okafor',submitter_email:'ada@example.com',message:'The visit was delayed.',fields:{job_id:'JOB-ABC',response_status:'not_sent',human_review_status:'pending'}}),{status:200,headers:{'Content-Type':'application/json'}});
    if(request.url.startsWith('https://database.example/rest/v1/form_submissions'))return new Response(JSON.stringify({}),{status:200,headers:{'Content-Type':'application/json'}});
    return new Response(JSON.stringify({id:'email-123'}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const result=response();
    await feedbackHandler({method:'POST',query:{action:'admin'},headers:{...managerHeaders,'x-forwarded-for':'203.0.113.61'},body:{id:'22222222-2222-4222-8222-222222222222',subject:'Your CarCare visit',body:'Hi Ada,\n\nWe reviewed your feedback and would like to help.'}},result);
    assert.equal(result.statusCode,200);
    assert.equal(result.body.fields.response_status,'sent');
    const emailRequest=requests.find(request=>request.url==='https://api.resend.com/emails');
    const email=JSON.parse(emailRequest.options.body);
    assert.equal(email.from,'ArkHimar CarCare <projects@arkhimar.com>');
    assert.deepEqual(email.to,['ada@example.com']);
    assert.match(email.html,/A response from our service team/);
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,name] of Object.entries({supabase:'SUPABASE_URL',role:'SUPABASE_SERVICE_ROLE_KEY',workspace:'ARKHIMAR_WORKSPACE_ID',resendKey:'RESEND_API_KEY'}))if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];
  }
});

test('CarCare confirms email delivery when management state is stored as an append-only event',async()=>{
  const oldFetch=globalThis.fetch;
  const previous={supabase:process.env.SUPABASE_URL,role:process.env.SUPABASE_SERVICE_ROLE_KEY,workspace:process.env.ARKHIMAR_WORKSPACE_ID,resendKey:process.env.RESEND_API_KEY};
  configureTestBackend();process.env.RESEND_API_KEY='resend-test-key';
  const requests=[];
  globalThis.fetch=async(url,options={})=>{
    const request={url:String(url),options};requests.push(request);
    if(request.url.startsWith('https://database.example/auth/v1/user'))return new Response(JSON.stringify({user:{id:'33333333-3333-4333-8333-333333333333'}}),{status:200,headers:{'Content-Type':'application/json'}});
    if(request.url.startsWith('https://database.example/rest/v1/workspace_members'))return new Response(JSON.stringify({role:'owner'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(request.url.startsWith('https://database.example/rest/v1/form_submissions')&&(options.method||'GET')==='GET')return new Response(JSON.stringify({id:'44444444-4444-4444-8444-444444444444',submitter_name:'Ada Okafor',submitter_email:'ada@example.com',fields:{job_id:'JOB-44',response_status:'not_sent',human_review_status:'pending'}}),{status:200,headers:{'Content-Type':'application/json'}});
    if(request.url.startsWith('https://database.example/rest/v1/form_submissions')&&options.method==='PATCH')return new Response(JSON.stringify({message:'permission denied'}),{status:403,headers:{'Content-Type':'application/json'}});
    if(request.url.startsWith('https://database.example/rest/v1/form_submissions')&&options.method==='POST')return new Response(JSON.stringify({}),{status:201,headers:{'Content-Type':'application/json'}});
    return new Response(JSON.stringify({id:'email-event-44'}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const result=response();
    await feedbackHandler({method:'POST',query:{action:'admin'},headers:{...managerHeaders,'x-forwarded-for':'203.0.113.62'},body:{id:'44444444-4444-4444-8444-444444444444',subject:'Your CarCare visit',body:'Hi Ada,\n\nWe reviewed your feedback and would like to help.'}},result);
    assert.equal(result.statusCode,200);
    assert.equal(result.body.fields.response_status,'sent');
    const stateEvent=requests.find(request=>request.url.startsWith('https://database.example/rest/v1/form_submissions')&&request.options.method==='POST'&&JSON.parse(request.options.body).form_id==='carcare-status');
    assert.ok(stateEvent);
    assert.equal(JSON.parse(stateEvent.options.body).fields.state.response_provider_id,'email-event-44');
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,name] of Object.entries({supabase:'SUPABASE_URL',role:'SUPABASE_SERVICE_ROLE_KEY',workspace:'ARKHIMAR_WORKSPACE_ID',resendKey:'RESEND_API_KEY'}))if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];
  }
});

test('CarCare generates both IDs, records the attending staff member and includes all three in the email',async()=>{
  const oldFetch=globalThis.fetch;
  const previous={idSecret:process.env.CARCARE_ID_SECRET,supabase:process.env.SUPABASE_URL,role:process.env.SUPABASE_SERVICE_ROLE_KEY,workspace:process.env.ARKHIMAR_WORKSPACE_ID,resendKey:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL,site:process.env.PUBLIC_SITE_URL};
  configureTestBackend();
  process.env.CARCARE_ID_SECRET='stable-customer-identity-secret';
  process.env.RESEND_API_KEY='resend-test-key';
  process.env.RESEND_FROM_EMAIL='notifications@arkhimar.com';
  process.env.PUBLIC_SITE_URL='https://www.arkhimar.com';
  const requests=[];globalThis.fetch=fakeCarCareFetch(requests);
  try{
    const first=response();
    const body={customer_name:'Ada Okafor',customer_email:' ADA@Example.com ',location:'Lagos',staff_name:'Chidi Eze'};
    await jobHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.48'},body},first);
    assert.equal(first.statusCode,200);
    assert.match(first.body.job_id,/^JOB-\d{6}-\d{8}-[A-Z2-9]{6}$/);
    assert.equal(first.body.customer_id,'CUS-000001');
    assert.equal(first.body.visit_count,1);
    assert.doesNotMatch(first.body.customer_id,/ADA|EXAMPLE/);
    const emailRequest=requests.find(request=>request.url==='https://api.resend.com/emails');
    assert.ok(emailRequest);
    const email=JSON.parse(emailRequest.options.body);
    assert.match(email.html,new RegExp(first.body.job_id));
    assert.match(email.html,new RegExp(first.body.customer_id));
    assert.match(email.html,/Chidi Eze/);
    assert.match(email.html,/PRINT OR SAVE AS PDF/);
    assert.equal(email.attachments.length,1);
    assert.match(email.attachments[0].filename,/^carcare-visit-.*\.pdf$/);
    assert.equal(Buffer.from(email.attachments[0].content,'base64').subarray(0,5).toString(),'%PDF-');
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,name] of Object.entries({idSecret:'CARCARE_ID_SECRET',supabase:'SUPABASE_URL',role:'SUPABASE_SERVICE_ROLE_KEY',workspace:'ARKHIMAR_WORKSPACE_ID',resendKey:'RESEND_API_KEY',from:'RESEND_FROM_EMAIL',site:'PUBLIC_SITE_URL'})){
      if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];
    }
  }
});
