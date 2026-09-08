import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {architectureResources,pmWorkflowPacks,resourceBySlug,resourceCatalog,validateResourceCatalog} from '../lib/resource-catalog.mjs';
import {designReadiness,readSafeProjectPrefill,safeProjectPrefill} from '../lib/resource-tools.mjs';
import {renderResourceAsset,resourceAssetSections} from '../lib/resource-assets.mjs';

test('resource registry contains the required launch catalog and valid metadata',()=>{
  assert.equal(architectureResources.length,6);assert.equal(pmWorkflowPacks.length,5);assert.equal(resourceCatalog.length,11);assert.deepEqual(validateResourceCatalog(),[]);assert.equal(new Set(resourceCatalog.map(item=>item.slug)).size,resourceCatalog.length);assert.equal(resourceBySlug('project-initiation-pack').importable,true);
});

test('lead magnets deliver substantive original worksheet content',()=>{
  for(const resource of architectureResources.filter(item=>item.access_mode==='lead_magnet')){const sections=resourceAssetSections(resource.slug),text=renderResourceAsset(resource);assert.ok(sections.length>=2,`${resource.slug} needs worksheet sections`);assert.ok(text.length>900,`${resource.slug} needs substantive delivery content`);assert.match(text,/WHEN NOT TO USE/);assert.match(text,/\[ \]/);}
});

test('design readiness is deterministic and explains missing preparation',()=>{
  const early=designReadiness({purpose:true,site:true});assert.deepEqual({score:early.score,level:early.level,completed:early.completed,total:early.total},{score:25,level:'Early stage',completed:2,total:8});assert.equal(early.actions.length,6);assert.equal(designReadiness(Object.fromEntries(['purpose','site','authority','budget','decision_makers','timeline','surveys','statutory'].map(key=>[key,true]))).score,100);
});

test('project handoff accepts only allowlisted context and never raw brief content',()=>{
  const query=safeProjectPrefill({source_resource:'project-brief-builder',project_type:'Residential',project_title:'Private title',location:'Private location'});assert.deepEqual(readSafeProjectPrefill(`?${query}`),{source_resource:'project-brief-builder',project_type:'Residential'});assert.equal(safeProjectPrefill({source_resource:'attacker-value',project_type:'Unknown'}),'');assert.doesNotMatch(query,/Private|location|title/i);
});

test('PM resource import is draft-only, allowlisted, role-checked and audited',async()=>{
  const sql=await readFile('supabase/migrations/202609080010_resource_growth_engine.sql','utf8');assert.match(sql,/when 'project-initiation-pack'/);assert.match(sql,/when 'built-environment-project-pack'/);assert.match(sql,/values\([^)]*,1,'draft'/i);assert.match(sql,/workspace_role_for\(target_workspace\) not in \('owner','admin','project_manager'\)/i);assert.match(sql,/insert into public\.resource_import_events/i);assert.match(sql,/insert into public\.audit_events/i);assert.doesNotMatch(sql,/grant (insert|update|delete) on public\.resource_import_events to authenticated/i);
});

test('resource analytics rejects sensitive project fields',async()=>{
  const analytics=await readFile('project-management/analytics.mjs','utf8');assert.match(analytics,/resource_claim_completed/);assert.match(analytics,/pm_import_completed/);assert.match(analytics,/project_\(\?:title\|content\|location\|budget\)/);assert.doesNotMatch(analytics,/localStorage/);
});
