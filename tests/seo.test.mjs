import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SITE_ORIGIN,canonicalFor,indexableRoutes,pageMeta,robotsText,sitemapXml} from '../seo/config.mjs';
import {applySeo,seoHead} from '../seo/render.mjs';
import {normalizeBrand,renderEmailHtml,renderEmailText} from '../lib/email-template.mjs';

test('all public routes have unique metadata and normalized production canonicals',()=>{
  const titles=new Set();const descriptions=new Set();
  for(const route of indexableRoutes){const meta=pageMeta(route);assert.ok(meta);assert.ok(meta.title.length>20);assert.ok(meta.description.length>70);assert.equal(meta.canonical,canonicalFor(route));assert.ok(!meta.canonical.endsWith('/')||meta.canonical===`${SITE_ORIGIN}/`);assert.ok(!titles.has(meta.title),`duplicate title: ${meta.title}`);assert.ok(!descriptions.has(meta.description),`duplicate description: ${meta.description}`);titles.add(meta.title);descriptions.add(meta.description);}
});

test('sitemap contains public canonicals and excludes private or preview hosts',()=>{
  const xml=sitemapXml();assert.match(xml,/xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);assert.match(xml,/https:\/\/www\.arkhimar\.com\/project-management<\/loc>/);assert.doesNotMatch(xml,/<loc>[^<]*\/pm(?:\/|<)/);assert.doesNotMatch(xml,/vercel\.app|lovable\.app/);
});

test('robots policy differs safely between production and preview',()=>{
  assert.match(robotsText(true),/Allow: \//);assert.match(robotsText(true),/Disallow: \/pm/);assert.match(robotsText(true),/Sitemap: https:\/\/www\.arkhimar\.com\/sitemap\.xml/);assert.equal(robotsText(false),'User-agent: *\nDisallow: /\n');
});

test('metadata renderer adds social, canonical, schema and preview noindex',()=>{
  const production=seoHead('/project-management',{indexable:true,verification:'verified-token'});assert.match(production,/SoftwareApplication/);assert.match(production,/summary_large_image/);assert.match(production,/google-site-verification/);assert.match(production,/index,follow,max-image-preview:large/);
  const preview=applySeo('<html><head><title>Old</title></head><body></body></html>','/',{indexable:false});assert.match(preview,/noindex,nofollow/);assert.doesNotMatch(preview,/>Old<\/title>/);
});

test('generated public pages load the approved Inter and Syne font families',async()=>{
  const projects=await readFile('dist/projects/index.html','utf8');
  assert.match(projects,/family=Inter:wght@300;400;500;600/);
  assert.match(projects,/family=Syne:wght@400;500;600;700/);
  assert.doesNotMatch(projects,/font-family:[^;]*(monospace|Courier)/i);
});

test('every public page exposes signup and shared account controls',async()=>{
  for(const route of indexableRoutes){
    const file=route==='/'?'dist/index.html':`dist${route}/index.html`;
    const html=await readFile(file,'utf8');
    assert.match(html,/data-auth-nav[^>]+href="\/pm\/login\/\?mode=signup"/,`missing signup control: ${route}`);
    assert.match(html,/src="\/runtime-config\.js"/,`missing auth config: ${route}`);
    assert.match(html,/src="\/auth-nav\.js"/,`missing account behavior: ${route}`);
  }
});

test('architecture navigation links directly to ArkHimar PM',async()=>{
  for(const route of ['/','/about','/services','/projects','/how-it-works','/contact','/start-a-project']){
    const file=route==='/'?'dist/index.html':`dist${route}/index.html`;
    const html=await readFile(file,'utf8');
    assert.match(html,/data-pm-nav href="\/project-management"/,`missing PM navigation link: ${route}`);
  }
});

test('built private workspace remains noindex and out of sitemap',async()=>{
  const pm=await readFile('dist/pm/index.html','utf8');const sitemap=await readFile('dist/sitemap.xml','utf8');assert.match(pm,/noindex,nofollow/);assert.match(pm,/Loading your secure workspace/);assert.doesNotMatch(sitemap,/\/pm/);
});

test('project brief delivery is permitted by the production content security policy',async()=>{
  const form=await readFile('start-a-project/form.js','utf8');
  const config=JSON.parse(await readFile('vercel.json','utf8'));
  const policy=config.headers.flatMap(rule=>rule.headers).find(header=>header.key==='Content-Security-Policy')?.value||'';
  const endpoint=form.match(/fetch\('([^']+)'/)?.[1];
  assert.equal(endpoint,'https://formsubmit.co/ajax/projects@arkhimar.com');
  assert.match(policy,/connect-src[^;]*https:\/\/formsubmit\.co(?:\s|;)/);
});

test('authenticated database migration grants only the application operations required by the client',async()=>{
  const sql=await readFile('supabase/migrations/202609070003_authenticated_privileges.sql','utf8');
  assert.match(sql,/grant select on table[\s\S]+to authenticated/i);
  assert.match(sql,/grant insert on table[\s\S]+public\.projects[\s\S]+to authenticated/i);
  assert.doesNotMatch(sql,/grant all|to anon/i);
});

test('server role migration grants only operations used by production API routes',async()=>{
  const sql=await readFile('supabase/migrations/202609070004_service_role_privileges.sql','utf8');
  assert.match(sql,/grant select on table[\s\S]+public\.projects[\s\S]+to service_role/i);
  assert.match(sql,/grant insert on table[\s\S]+public\.form_submissions[\s\S]+to service_role/i);
  assert.match(sql,/grant update on table[\s\S]+public\.outbound_messages[\s\S]+to service_role/i);
  assert.doesNotMatch(sql,/grant all|to anon|public\.api_keys/i);
});

test('server document rendering can read workspace identity without broad mutation rights',async()=>{
  const sql=await readFile('supabase/migrations/202609080011_service_workspace_read.sql','utf8');assert.match(sql,/grant select on table public\.workspaces to service_role/i);assert.doesNotMatch(sql,/grant all|grant (insert|update|delete)/i);
});

test('controlled export handler keeps the browser document available for downloads',async()=>{
  const source=await readFile('pm/pm.js','utf8'),handler=source.match(/\$\$\('\[data-export-document\]'\).*?\n/)?.[0]||'';assert.match(handler,/const controlledDocument=/);assert.doesNotMatch(handler,/const document=/);
});

test('membership policies prevent admins from taking ownership or changing themselves',async()=>{
  const sql=await readFile('supabase/migrations/202609070005_membership_role_boundaries.sql','utf8');
  assert.match(sql,/user_id\s*<>\s*auth\.uid\(\)/i);
  assert.match(sql,/workspace_role_for\(workspace_id\)\s*=\s*'owner'[\s\S]+role in \('admin','project_manager','member','viewer'\)/i);
  assert.match(sql,/workspace_role_for\(workspace_id\)\s*=\s*'admin'[\s\S]+role in \('project_manager','member','viewer'\)/i);
  assert.doesNotMatch(sql,/role in \([^)]*'owner'/i);
});

test('outbound message recipients use the API object contract',async()=>{
  const sql=await readFile('supabase/migrations/202609070006_outbound_recipient_contract.sql','utf8');
  assert.match(sql,/jsonb_typeof\(recipients\)\s*=\s*'object'/i);
  assert.match(sql,/recipients->'to'[\s\S]+jsonb_array_length\(recipients->'to'\) between 1 and 50/i);
  assert.match(sql,/recipients->'cc'[\s\S]+recipients->'bcc'/i);
});

test('email rendering uses safe ArkHimar defaults when a workspace has no brand settings',()=>{
  assert.equal(normalizeBrand(null).senderName,'ArkHimar PM');
  const message={subject:'Project update',blocks:[{type:'heading',text:'Your update'}],brand:null};
  assert.match(renderEmailHtml(message),/ArkHimar PM/);
  assert.match(renderEmailText(message),/^ArkHimar PM/);
});

test('workspace invitations are expiring, email-bound and owner-safe',async()=>{
  const sql=await readFile('supabase/migrations/202609070007_workspace_invitations.sql','utf8');
  assert.match(sql,/role public\.workspace_role not null check \(role<>'owner'\)/i);
  assert.match(sql,/token_hash=encode\(digest\(invite_token,'sha256'\),'hex'\)/i);
  assert.match(sql,/signed_in_email<>matched\.email/i);
  assert.match(sql,/expires_at>now\(\)/i);
  assert.match(sql,/grant execute on function public\.accept_workspace_invitation\(text\) to authenticated/i);
});

test('workspace invitation acceptance supports established users and selects the joined workspace',async()=>{
  const sql=await readFile('supabase/migrations/202609100018_workspace_invitation_join_reliability.sql','utf8');
  const auth=await readFile('pm/auth.js','utf8');
  const backend=await readFile('pm/backend.js','utf8');
  const invitationApi=await readFile('api/v1/workspace/invitations.js','utf8');
  assert.doesNotMatch(sql,/already belongs to another workspace/i);
  assert.match(sql,/on conflict\(workspace_id,user_id\) do update/i);
  assert.match(auth,/arkhimar\.pm\.active-workspace/);
  assert.match(backend,/find\(item=>item\.workspace_id===preferred\)/);
  assert.match(invitationApi,/\?mode=invite#invite=/);
  assert.match(auth,/requestedMode==='signup'&&!hasPendingInvitation/);
  assert.match(auth,/Verification email delivery is temporarily at capacity/);
});

test('account creation requires password confirmation',async()=>{
  const login=await readFile('dist/pm/login/index.html','utf8');
  const auth=await readFile('pm/auth.js','utf8');
  assert.match(login,/name="confirm_password"/);
  assert.match(auth,/values\.password!==values\.confirm_password/);
  assert.match(auth,/Passwords do not match/);
});

test('account security supports enforced TOTP and selective session revocation',async()=>{
  const login=await readFile('dist/pm/login/index.html','utf8');
  const auth=await readFile('pm/auth.js','utf8');
  const account=await readFile('pm/account.js','utf8');
  const backend=await readFile('pm/backend.js','utf8');
  assert.match(login,/name="mfa_code"[^>]+pattern="\[0-9\]\{6\}"/);
  assert.match(auth,/requirement\.required[\s\S]+setMode\('mfa'\)/);
  assert.match(account,/mfa\.enroll\(\{factorType:'totp'/);
  assert.match(account,/mfa\.unenroll/);
  assert.match(account,/signOut\(\{scope:'others'\}\)/);
  assert.match(backend,/signOut\(\{scope:'local'\}\)/);
});

test('controlled documents are tenant-scoped, versioned and immutable after approval',async()=>{
  const sql=await readFile('supabase/migrations/202609070008_controlled_documents.sql','utf8');
  const client=await readFile('pm/backend.js','utf8');
  assert.match(sql,/foreign key\(project_id,workspace_id\) references public\.projects\(id,workspace_id\)/i);
  assert.match(sql,/old\.status in \('approved','superseded'\)[\s\S]+immutable/i);
  assert.match(sql,/new\.status='superseded'[\s\S]+to_jsonb\(new\)-'status'/i);
  assert.match(sql,/actor_role in \('owner','admin'\)[\s\S]+status='approved'/i);
  assert.match(sql,/create policy controlled_documents_member_read/i);
  assert.doesNotMatch(sql,/grant (insert|update|delete) on table public\.controlled_documents/i);
  assert.match(client,/listControlledDocuments[\s\S]+controlled_document_versions/);
  assert.match(client,/transitionControlledDocument[\s\S]+transition_controlled_document/);
});

test('external document shares are hashed, expiring, revocable and download limited',async()=>{
  const sql=await readFile('supabase/migrations/202609070009_document_exports_and_shares.sql','utf8'),shares=await readFile('api/v1/documents/shares.js','utf8'),shared=await readFile('api/v1/documents/shared.js','utf8'),page=await readFile('dist/share/index.html','utf8'),config=JSON.parse(await readFile('vercel.json','utf8')),shareHeaders=config.headers.find(item=>item.source==='/share')?.headers||[];
  assert.match(sql,/token_hash text not null unique/);assert.match(sql,/expires_at timestamptz not null/);assert.match(sql,/max_downloads integer/);assert.match(sql,/revoked_at timestamptz/);assert.match(shares,/sha256\(token\)/);assert.match(shares,/approved_version_required/);assert.match(shared,/download_count>=share\.max_downloads/);assert.match(page,/noindex,nofollow/);
  assert.ok(shareHeaders.some(header=>header.key==='X-Robots-Tag'&&header.value==='noindex, nofollow'));assert.ok(shareHeaders.some(header=>header.key==='Referrer-Policy'&&header.value==='no-referrer'));assert.ok(shareHeaders.some(header=>header.key==='Cache-Control'&&header.value==='no-store'));
});

test('initiation artifacts are tenant-scoped, versioned and decided on the server',async()=>{
  const sql=await readFile('supabase/migrations/202609080012_phase2_initiation.sql','utf8'),client=await readFile('pm/backend.js','utf8'),ui=await readFile('pm/pm.js','utf8');
  assert.match(sql,/foreign key\(project_id,workspace_id\) references public\.projects\(id,workspace_id\)/i);
  assert.match(sql,/protect_approved_initiation_version/);assert.match(sql,/Approved initiation versions are immutable/);
  assert.match(sql,/actor_role in \('owner','admin'\)[\s\S]+status='approved'/i);
  assert.match(sql,/At least two options are required/);assert.match(sql,/strategicFit'[\s\S]+\*30[\s\S]+benefit'[\s\S]+\*25/);
  assert.match(sql,/create policy business_cases_member_read/);assert.match(sql,/create policy project_charters_member_read/);
  assert.match(sql,/revoke insert,update,delete on public\.business_cases/);assert.match(sql,/grant execute on function public\.save_business_case/);
  assert.match(client,/saveBusinessCase[\s\S]+save_business_case/);assert.match(client,/transitionProjectCharter[\s\S]+transition_project_charter/);
  assert.match(ui,/transitionBusinessCase/);assert.match(ui,/transitionProjectCharter/);assert.doesNotMatch(ui,/charterAction\(/);
});

test('core planning is normalized, traceable and protected by immutable scope baselines',async()=>{
  const sql=await readFile('supabase/migrations/202609090013_phase3_core_planning.sql','utf8'),client=await readFile('pm/backend.js','utf8'),ui=await readFile('pm/pm.js','utf8');
  for(const table of ['core_planning_sets','core_planning_versions','requirements','requirement_traces','wbs_nodes','scope_baselines'])assert.match(sql,new RegExp(`create table public\\.${table}`));
  assert.match(sql,/protect_scope_baselines/);assert.match(sql,/Approved planning records are immutable/);
  assert.match(sql,/Start an authorized baseline revision before editing/);assert.match(sql,/change_reference/);
  assert.match(sql,/Project manager permission required/);assert.match(sql,/Owner or admin approval required/);
  assert.match(sql,/create policy requirements_member_read/);assert.match(sql,/revoke insert,update,delete on public\.core_planning_sets/);
  assert.match(client,/loadPlanningForProjects/);assert.match(client,/saveCorePlanning[\s\S]+save_core_planning/);assert.match(client,/approveScopeBaseline[\s\S]+approve_scope_baseline/);
  assert.match(ui,/subsidiaryPlanTypes/);assert.match(ui,/data-move-wbs/);assert.match(ui,/data-revise-scope/);assert.match(ui,/traceStatus/);
  assert.doesNotMatch(ui,/data-baseline="scope"/);
});

test('schedule and cost controls are normalized, versioned and baseline-governed',async()=>{
  const sql=await readFile('supabase/migrations/202609090014_phase4_schedule_cost.sql','utf8'),client=await readFile('pm/backend.js','utf8'),ui=await readFile('pm/pm.js','utf8');
  for(const table of ['schedule_control_sets','schedule_versions','schedule_tasks','schedule_dependencies','schedule_baselines','cost_control_sets','cost_versions','cost_items','cash_flow_entries','cost_baselines'])assert.match(sql,new RegExp(`create table public\\.${table}`));
  assert.match(sql,/dependency_type in \('FS','SS','FF','SF'\)/);assert.match(sql,/revision_reference/);assert.match(sql,/protect_schedule_baselines/);assert.match(sql,/protect_cost_baselines/);
  assert.match(sql,/Owner or admin approval required/);assert.match(sql,/create policy schedule_tasks_member_read/);assert.match(sql,/revoke insert,update,delete on public\.schedule_control_sets/);
  assert.match(client,/loadDeliveryForProjects/);assert.match(client,/saveScheduleControl[\s\S]+save_schedule_control/);assert.match(client,/saveCostControl[\s\S]+save_cost_control/);
  assert.match(ui,/data-dependency-index/);assert.match(ui,/data-approve-delivery/);assert.match(ui,/cash-curve/);assert.match(ui,/Gantt/);
  assert.doesNotMatch(ui,/data-baseline="schedule"/);assert.doesNotMatch(ui,/data-baseline="cost"/);
});

test('risk issue stakeholder and change controls are normalized and server-governed',async()=>{
  const sql=await readFile('supabase/migrations/202609090015_phase5_project_controls.sql','utf8'),privacy=await readFile('supabase/migrations/202609090016_phase5_snapshot_privacy.sql','utf8'),client=await readFile('pm/backend.js','utf8'),ui=await readFile('pm/pm.js','utf8');
  for(const table of ['project_control_sets','control_register_versions','project_risks','project_issues','project_stakeholders','stakeholder_private_notes','stakeholder_engagement_actions','change_requests','change_request_history'])assert.match(sql,new RegExp(`create table public\\.${table}`));
  assert.match(sql,/Threat','Opportunity/);assert.match(sql,/protect_control_register_versions/);assert.match(sql,/stakeholder_private_notes_manager_read/);
  assert.match(privacy,/drop policy if exists control_register_versions_member_read/);assert.match(privacy,/control_register_versions_manager_read/);assert.match(privacy,/workspace_role_for\(workspace_id\) in \('owner','admin','project_manager'\)/);
  assert.match(sql,/actor_role in \('owner','admin'\)/);assert.match(sql,/Change transition not permitted/);assert.match(sql,/revoke insert,update,delete on public\.project_control_sets/);
  assert.match(client,/loadControlsForProjects/);assert.match(client,/saveProjectControls[\s\S]+save_project_controls/);assert.match(client,/transitionChangeRequest[\s\S]+transition_change_request/);
  assert.match(client,/if\(!result\.has\(projectId\)&&!projectChanges\.length\)continue/);
  assert.match(ui,/Probability × impact matrix/);assert.match(ui,/data-change-transition/);assert.match(ui,/Private PM-only notes/);assert.match(ui,/immutable register snapshot/);
  assert.doesNotMatch(ui,/data-approve-change/);
});

test('redirects preserve old routes and enforce canonical host',async()=>{
  const config=JSON.parse(await readFile('vercel.json','utf8'));assert.ok(config.redirects.some(item=>item.source==='/work'&&item.destination==='/projects'));assert.ok(config.redirects.some(item=>item.has?.some(rule=>rule.type==='host'&&rule.value==='arkhimar.com')&&item.destination.startsWith(SITE_ORIGIN)));
});
