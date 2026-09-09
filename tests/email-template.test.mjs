import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEmailHtml,renderEmailText} from '../lib/email-template.mjs';

test('branded email renderer escapes content and rejects unsafe links',()=>{
  const html=renderEmailHtml({subject:'Hello <team>',blocks:[{type:'heading',text:'Welcome <script>'},{type:'button',label:'Open',url:'javascript:alert(1)'}],brand:{primaryColor:'#123456'}});
  assert.match(html,/Welcome &lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(html,/javascript:/);
  assert.match(html,/background:#123456/);
});

test('plain text renderer preserves readable calls to action',()=>{
  const text=renderEmailText({subject:'Update',blocks:[{type:'text',text:'Friendly copy'},{type:'button',label:'Review',url:'https://arkhimar.com/review'}]});
  assert.match(text,/Friendly copy/);
  assert.match(text,/Review: https:\/\/arkhimar\.com\/review/);
});

test('email call-to-action opens outside an embedded preview safely',()=>{
  const html=renderEmailHtml({blocks:[{type:'button',label:'Review project',url:'https://www.arkhimar.com/pm'}]});
  assert.match(html,/target="_blank"/);
  assert.match(html,/rel="noopener noreferrer"/);
});
