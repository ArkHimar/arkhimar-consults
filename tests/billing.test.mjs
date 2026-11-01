import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {billingPrice,paystackWebhookSignatureValid} from '../api/v1/billing.js';

test('server-side subscription prices match the published USD plans',()=>{
  assert.deepEqual(billingPrice('growth','monthly',3,{}),{currency:'USD',unitSubunit:1000,amountSubunit:3000});
  assert.deepEqual(billingPrice('growth','annual',3,{}),{currency:'USD',unitSubunit:9600,amountSubunit:28800});
  assert.deepEqual(billingPrice('professional','monthly',2,{}),{currency:'USD',unitSubunit:2000,amountSubunit:4000});
  assert.deepEqual(billingPrice('professional','annual',2,{}),{currency:'USD',unitSubunit:19200,amountSubunit:38400});
});

test('NGN prices must be configured explicitly',()=>{
  assert.throws(()=>billingPrice('growth','monthly',1,{PAYSTACK_CURRENCY:'NGN'}),/PAYSTACK_GROWTH_MONTHLY_UNIT_SUBUNIT/);
  assert.deepEqual(billingPrice('growth','monthly',2,{PAYSTACK_CURRENCY:'NGN',PAYSTACK_GROWTH_MONTHLY_UNIT_SUBUNIT:'1500000'}),{currency:'NGN',unitSubunit:1500000,amountSubunit:3000000});
});

test('Paystack webhook validation accepts only the correct HMAC signature',()=>{
  const secret='test_secret',payload=Buffer.from('{"event":"charge.success"}'),signature=createHmac('sha512',secret).update(payload).digest('hex');
  assert.equal(paystackWebhookSignatureValid(payload,signature,secret),true);
  assert.equal(paystackWebhookSignatureValid(payload,'00'.repeat(64),secret),false);
});
