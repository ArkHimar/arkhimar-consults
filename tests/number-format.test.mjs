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
