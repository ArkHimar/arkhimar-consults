import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formatNumericInput,parseNumericInput,stripNumberFormatting} from '../lib/number-format.mjs';

test('financial input groups thousands without changing the numeric value',()=>{
  assert.equal(formatNumericInput('20000000'),'20,000,000');
  assert.equal(formatNumericInput('1234567.50'),'1,234,567.50');
  assert.equal(formatNumericInput('-1000000'),'-1,000,000');
  assert.equal(stripNumberFormatting('20,000,000'),'20000000');
  assert.equal(parseNumericInput('20,000,000.50'),20000000.5);
});

test('cost controls format monetary inputs and sign-in produces a one-time success toast',async()=>{
  const [pm,auth,page]=await Promise.all([readFile('pm/pm.js','utf8'),readFile('pm/auth.js','utf8'),readFile('pm/index.html','utf8')]);
  assert.match(pm,/data-cost-settings[^;]+varianceThreshold/);
  assert.match(pm,/input\.value=formatNumericInput\(input\.value\)/);
  assert.match(pm,/stripNumberFormatting\(input\.value\)/);
  assert.match(auth,/Signed in successfully/);
  assert.match(auth,/arkhimar\.pm\.auth-flash/);
  assert.match(pm,/sessionStorage\.removeItem\(AUTH_FLASH_KEY\)/);
  assert.match(page,/data-toast role="status" aria-live="polite"/);
});

test('invited users can recover from a signed-in email mismatch without losing the invitation',async()=>{
  const [auth,login,migration]=await Promise.all([
    readFile('pm/auth.js','utf8'),
    readFile('pm/login/index.html','utf8'),
    readFile('supabase/migrations/202609100018_workspace_invitation_join_reliability.sql','utf8')
  ]);
  assert.match(auth,/Sign out below, then sign in with the exact address/);
  assert.match(auth,/signOut\(\{scope:'local'\}\)/);
  assert.match(login,/data-switch-invite-account hidden/);
  assert.doesNotMatch(migration,/account already belongs to another workspace/i);
  assert.match(migration,/on conflict\(workspace_id,user_id\) do update/);
});
