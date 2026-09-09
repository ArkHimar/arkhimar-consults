import test from 'node:test';
import assert from 'node:assert/strict';
import formHandler from '../api/v1/forms/submit.js';
import messageHandler from '../api/v1/messages/send.js';
import invitationHandler from '../api/v1/workspace/invitations.js';
import exportHandler from '../api/v1/documents/export.js';
import sharesHandler from '../api/v1/documents/shares.js';
import sharedHandler from '../api/v1/documents/shared.js';
import resourceClaimHandler from '../api/v1/resources/claim.js';
import projectExportHandler from '../api/v1/projects/export.js';

function response(){return{statusCode:200,headers:{},body:null,setHeader(name,value){this.headers[name]=value},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}}}

test('form API rejects unsupported methods and missing keys',async()=>{
  const methodResponse=response();
  await formHandler({method:'GET',headers:{}},methodResponse);
  assert.equal(methodResponse.statusCode,405);
  assert.equal(methodResponse.body.error,'method_not_allowed');
  const keyResponse=response();
  await formHandler({method:'POST',headers:{},body:{}},keyResponse);
  assert.equal(keyResponse.statusCode,401);
  assert.equal(keyResponse.body.error,'invalid_api_key');
});

test('message API requires an authenticated user session',async()=>{
  const result=response();
  await messageHandler({method:'POST',headers:{},body:{}},result);
  assert.equal(result.statusCode,401);
  assert.equal(result.body.error,'authentication_required');
});

test('workspace invitation API requires an authenticated owner or admin session',async()=>{
  const result=response();
  await invitationHandler({method:'POST',headers:{},body:{}},result);
  assert.equal(result.statusCode,401);
  assert.equal(result.body.error,'authentication_required');
});

test('controlled export and share administration require authentication',async()=>{
  for(const handler of [exportHandler,sharesHandler]){const result=response();await handler({method:'POST',headers:{},body:{}},result);assert.equal(result.statusCode,401);assert.equal(result.body.error,'authentication_required')}
});

test('project pack export requires authentication',async()=>{
  const result=response();await projectExportHandler({method:'POST',headers:{},body:{}},result);assert.equal(result.statusCode,401);assert.equal(result.body.error,'authentication_required');
});

test('public shared download rejects malformed tokens before database access',async()=>{
  const result=response();await sharedHandler({method:'POST',headers:{},body:{token:'not-a-share'}},result);assert.equal(result.statusCode,400);assert.equal(result.body.error,'invalid_share_token');
});

test('resource delivery validates requests and catalog access before database use',async()=>{
  const invalid=response();await resourceClaimHandler({method:'POST',headers:{},body:{}},invalid);assert.equal(invalid.statusCode,400);
  const unavailable=response();await resourceClaimHandler({method:'POST',headers:{},body:{resourceSlug:'not-a-resource',name:'Ada Example',email:'ada@example.com',marketingConsent:false,attribution:{}}},unavailable);assert.equal(unavailable.statusCode,404);
  const honeypot=response();await resourceClaimHandler({method:'POST',headers:{},body:{resourceSlug:'project-brief-starter-kit',name:'Ada Example',email:'ada@example.com',company:'bot value',marketingConsent:false,attribution:{}}},honeypot);assert.equal(honeypot.statusCode,202);
});
