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

test('account creation requires password confirmation',async()=>{
  const login=await readFile('dist/pm/login/index.html','utf8');
  const auth=await readFile('pm/auth.js','utf8');
  assert.match(login,/name="confirm_password"/);
  assert.match(auth,/values\.password!==values\.confirm_password/);
  assert.match(auth,/Passwords do not match/);
});

test('redirects preserve old routes and enforce canonical host',async()=>{
  const config=JSON.parse(await readFile('vercel.json','utf8'));assert.ok(config.redirects.some(item=>item.source==='/work'&&item.destination==='/projects'));assert.ok(config.redirects.some(item=>item.has?.some(rule=>rule.type==='host'&&rule.value==='arkhimar.com')&&item.destination.startsWith(SITE_ORIGIN)));
});
