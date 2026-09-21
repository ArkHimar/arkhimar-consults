import test from 'node:test';
import assert from 'node:assert/strict';
import feedbackHandler from '../api/carcare/feedback.js';
import jobHandler from '../api/carcare/job-completed.js';

function response(){return{statusCode:200,headers:{},body:null,setHeader(name,value){this.headers[name]=value},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}}}
const baseHeaders={'x-forwarded-for':'203.0.113.44',host:'www.arkhimar.com',origin:'https://www.arkhimar.com'};

test('CarCare endpoints reject invalid public and staff submissions',async()=>{
  let result=response();
  await feedbackHandler({method:'POST',headers:baseHeaders,body:{job_id:'JOB-1'}},result);
  assert.equal(result.statusCode,400);
  assert.equal(result.body.error,'invalid_request');

  result=response();
  process.env.CARCARE_STAFF_ACCESS_KEY='a-long-private-staff-key';
  await jobHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.45'},body:{job_id:'JOB-1',customer_name:'Ada',customer_email:'ada@example.com',location:'Lagos',access_key:'wrong'}},result);
  assert.equal(result.statusCode,401);
  assert.equal(result.body.error,'invalid_access_key');
});

test('CarCare feedback forwards normalized content without exposing the workflow secret',async()=>{
  const oldFetch=globalThis.fetch;
  const previous={url:process.env.CARCARE_FEEDBACK_WEBHOOK_URL,secret:process.env.CARCARE_WEBHOOK_SECRET};
  process.env.CARCARE_FEEDBACK_WEBHOOK_URL='https://automation.example/webhook/feedback';
  process.env.CARCARE_WEBHOOK_SECRET='workflow-secret-value';
  let request;
  globalThis.fetch=async(url,options)=>{request={url:String(url),options};return{ok:true}};
  try{
    const result=response();
    await feedbackHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.46'},body:{job_id:'JOB-1001',customer_id:'CUS-44',customer_name:'Ada Okafor',customer_email:'ADA@example.com',location:'Lagos',rating:2,feedback:'The visit took much longer than promised.'}},result);
    assert.equal(result.statusCode,200);
    assert.equal(result.body.ok,true);
    assert.equal(request.url,'https://automation.example/webhook/feedback');
    assert.equal(request.options.headers['X-Workflow-Secret'],'workflow-secret-value');
    const payload=JSON.parse(request.options.body);
    assert.equal(payload.customer_email,'ada@example.com');
    assert.match(payload.feedback,/Rating: 2\/5/);
    assert.doesNotMatch(JSON.stringify(result.body),/workflow-secret-value/);
  }finally{
    globalThis.fetch=oldFetch;
    if(previous.url===undefined)delete process.env.CARCARE_FEEDBACK_WEBHOOK_URL;else process.env.CARCARE_FEEDBACK_WEBHOOK_URL=previous.url;
    if(previous.secret===undefined)delete process.env.CARCARE_WEBHOOK_SECRET;else process.env.CARCARE_WEBHOOK_SECRET=previous.secret;
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

test('CarCare assigns unique job IDs and a stable returning-customer ID',async()=>{
  const oldFetch=globalThis.fetch;
  const previous={jobUrl:process.env.CARCARE_JOB_WEBHOOK_URL,webhookSecret:process.env.CARCARE_WEBHOOK_SECRET,staffKey:process.env.CARCARE_STAFF_ACCESS_KEY,idSecret:process.env.CARCARE_ID_SECRET};
  process.env.CARCARE_JOB_WEBHOOK_URL='https://automation.example/webhook/job';
  process.env.CARCARE_WEBHOOK_SECRET='workflow-secret-value';
  process.env.CARCARE_STAFF_ACCESS_KEY='a-long-private-staff-key';
  process.env.CARCARE_ID_SECRET='stable-customer-identity-secret';
  const payloads=[];
  globalThis.fetch=async(_url,options)=>{payloads.push(JSON.parse(options.body));return{ok:true}};
  try{
    const first=response(),second=response();
    const body={customer_name:'Ada Okafor',customer_email:' ADA@Example.com ',location:'Lagos',access_key:'a-long-private-staff-key'};
    await jobHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.48'},body},first);
    await jobHandler({method:'POST',headers:{...baseHeaders,'x-forwarded-for':'203.0.113.49'},body},second);
    assert.equal(first.statusCode,200);
    assert.match(first.body.job_id,/^JOB-\d{8}-[0-9A-F-]{36}$/);
    assert.match(first.body.customer_id,/^CUS-[A-Z0-9_-]{20}$/);
    assert.notEqual(first.body.job_id,second.body.job_id);
    assert.equal(first.body.customer_id,second.body.customer_id);
    assert.equal(payloads[0].job_id,first.body.job_id);
    assert.equal(payloads[0].customer_id,first.body.customer_id);
    assert.equal(payloads[0].customer_email,'ada@example.com');
    assert.doesNotMatch(first.body.customer_id,/ADA|EXAMPLE/);
  }finally{
    globalThis.fetch=oldFetch;
    for(const [key,name] of Object.entries({jobUrl:'CARCARE_JOB_WEBHOOK_URL',webhookSecret:'CARCARE_WEBHOOK_SECRET',staffKey:'CARCARE_STAFF_ACCESS_KEY',idSecret:'CARCARE_ID_SECRET'})){
      if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];
    }
  }
});
