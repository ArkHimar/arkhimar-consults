import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('execution-control browser contract is backed by an idempotent production migration',async()=>{
  const [backend,migration]=await Promise.all([
    readFile(new URL('../pm/backend.js',import.meta.url),'utf8'),
    readFile(new URL('../supabase/migrations/202609270022_repair_execution_reporting.sql',import.meta.url),'utf8')
  ]);
  const rpc=backend.match(/supabase\.rpc\('save_execution_control',\{([^}]+)\}\)/);
  assert.ok(rpc,'frontend save_execution_control call is missing');
  const rpcArguments=[...rpc[1].matchAll(/([a-z_]+)\s*:/g)].map(match=>match[1]).sort();
  const signature=migration.match(/create or replace function public\.save_execution_control\(([^)]+)\)/i);
  assert.ok(signature,'repair migration must create save_execution_control');
  const sqlArguments=signature[1].split(',').map(argument=>argument.trim().split(/\s+/)[0]).sort();
  assert.deepEqual(rpcArguments,sqlArguments,'frontend RPC keys must exactly match the SQL function arguments');
  for(const table of ['execution_control_sets','execution_versions','delivery_iterations','delivery_work_items','governance_reviews','governance_review_history','project_status_reports']){
    assert.match(migration,new RegExp(`create table if not exists public\\.${table}\\b`,'i'),`${table} must be repaired idempotently`);
  }
  for(const fn of ['save_execution_control','transition_governance_review','publish_status_report'])assert.match(migration,new RegExp(`create or replace function public\\.${fn}\\b`,'i'));
  assert.match(migration,/grant execute on function public\.save_execution_control\(uuid,integer,jsonb,jsonb,jsonb,jsonb\)[\s\S]+to authenticated/i);
  assert.match(migration,/notify pgrst,\s*'reload schema'/i,'migration must refresh the PostgREST schema cache');
});
