import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('project managers can save progress manually and edits autosave through governed routes',async()=>{
  const [ui,styles]=await Promise.all([
    readFile('pm/pm.js','utf8'),
    readFile('pm/pm.css','utf8')
  ]);

  assert.match(ui,/data-save-progress>Save progress<\/button>/);
  assert.match(ui,/const DRAFT_CACHE_PREFIX='arkhimar\.pm\.recovery\.v1'/);
  assert.match(ui,/const AUTOSAVE_DELAY=800/);
  assert.match(ui,/control\.addEventListener\('input',scheduleProgressSave\)/);
  assert.match(ui,/localStorage\.setItem\(draftCacheKey/);
  assert.match(ui,/localStorage\.removeItem\(draftCacheKey/);
  assert.match(ui,/restoreCachedProgress\(active\(\),state\.view\)/);
  assert.match(ui,/addEventListener\('pagehide'/);
  assert.match(ui,/document\.addEventListener\('visibilitychange'/);
  assert.match(ui,/AUTOSAVE_RETRY_MIN/);
  assert.match(ui,/AUTOSAVE_RETRY_MAX/);
  assert.match(ui,/Saved on device · retrying/);
  assert.match(ui,/if\(!progressDirty\)clearCachedProgress/);
  assert.match(ui,/queueMicrotask\(scheduleProgressSave\)/);
  assert.match(ui,/if\(view==='business'\)saved=await saveBusinessDraft\([^;]+false,true\)/);
  assert.match(ui,/else if\(view==='planning'\)saved=await savePlanningDraft\([^;]+false,true\)/);
  assert.match(ui,/else if\(view==='controls'\)saved=await saveControlsDraft\(false,true\)/);
  assert.match(ui,/else if\(view==='execution'\)saved=await saveExecutionDraft\(false,true\)/);
  assert.match(ui,/if\(progressDirty&&active\(\)&&progressViewAvailable\(active\(\)\)\)await saveCurrentProgress\(\)/);
  assert.match(styles,/\.save-progress-status\[data-tone="saved"\]/);
});

test('PM greets the signed-in user and supports group plus individual permissions',async()=>{
  const [ui,team,backend,migration]=await Promise.all([
    readFile('pm/pm.js','utf8'),
    readFile('pm/team.js','utf8'),
    readFile('pm/backend.js','utf8'),
    readFile('supabase/migrations/202609230021_workspace_permissions.sql','utf8')
  ]);

  assert.match(ui,/Good day, \$\{signedInFirstName\(\)\}\./);
  assert.match(ui,/cloud\.profile\?\.display_name/);
  assert.match(backend,/from\('profiles'\)\.select\('display_name'\)/);
  assert.match(ui,/const canManageProject=permissions\.edit/);
  assert.match(team,/GROUP PERMISSIONS/);
  assert.match(team,/INDIVIDUAL PERMISSIONS/);
  assert.match(team,/View.*Create.*Edit \/ Update.*Approve.*Delete/s);
  assert.match(backend,/get_my_workspace_permissions/);
  assert.match(migration,/create or replace function public\.workspace_has_permission/);
  assert.match(migration,/when 'edit' then true/);
  assert.match(migration,/Owner permissions are protected/);
});
