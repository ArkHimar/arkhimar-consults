import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {CONSULT_IMAGE,PM_IMAGE,SITE_ORIGIN,canonicalFor,indexableRoutes,pageMeta,robotsText,services,sitemapXml} from './config.mjs';

const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const jsonScript=data=>`<script type="application/ld+json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script>`;

const organization={
  '@context':'https://schema.org','@type':['Organization','ProfessionalService'],'@id':`${SITE_ORIGIN}/#organization`,
  name:'ArkHimar Consult',url:SITE_ORIGIN,description:'Architectural and built-environment consultancy providing design, documentation and advisory services.',
  email:'projects@arkhimar.com',telephone:'+2348058716249',areaServed:{'@type':'Country',name:'Nigeria'},
  contactPoint:{'@type':'ContactPoint',contactType:'project enquiries',email:'projects@arkhimar.com',telephone:'+2348058716249',areaServed:'NG'}
};

function breadcrumb(route){
  const labels={'project-management':'Project Management','how-it-works':'How It Works','services':'Services','projects':'Projects'};
  const segments=route.split('/').filter(Boolean);let path='';
  const items=[{'@type':'ListItem',position:1,name:'Home',item:SITE_ORIGIN}];
  segments.forEach((segment,index)=>{path+=`/${segment}`;items.push({'@type':'ListItem',position:index+2,name:labels[segment]||segment.split('-').map(word=>word[0].toUpperCase()+word.slice(1)).join(' '),item:canonicalFor(path)});});
  return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items};
}

function schemasFor(route){
  const schemas=[];
  if(route==='/'||route==='/about') schemas.push(organization);
  if(route==='/project-management') schemas.push({'@context':'https://schema.org','@type':'SoftwareApplication','@id':`${SITE_ORIGIN}/project-management#software`,'name':'ArkHimar PM','applicationCategory':'BusinessApplication','operatingSystem':'Web','description':pageMeta(route).description,'url':canonicalFor(route),'publisher':{'@id':`${SITE_ORIGIN}/#organization`}});
  const service=services.find(([slug])=>route===`/services/${slug}`);
  if(service) schemas.push({'@context':'https://schema.org','@type':'Service','name':service[1],'description':service[2],'serviceType':service[1],'url':canonicalFor(route),'areaServed':{'@type':'Country','name':'Nigeria'},'provider':{'@id':`${SITE_ORIGIN}/#organization`}});
  if(route!=='/') schemas.push(breadcrumb(route));
  return schemas;
}

export function seoHead(route,{indexable=true,verification=''}={}){
  const meta=pageMeta(route);if(!meta)return '';
  const robots=indexable?'index,follow,max-image-preview:large':'noindex,nofollow';
  return `<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${meta.canonical}">
<meta property="og:site_name" content="ArkHimar"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(meta.title)}"><meta property="og:description" content="${escapeHtml(meta.description)}"><meta property="og:url" content="${meta.canonical}"><meta property="og:image" content="${meta.image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escapeHtml(meta.imageAlt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(meta.title)}"><meta name="twitter:description" content="${escapeHtml(meta.description)}"><meta name="twitter:image" content="${meta.image}"><meta name="twitter:image:alt" content="${escapeHtml(meta.imageAlt)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">${verification?`\n<meta name="google-site-verification" content="${escapeHtml(verification)}">`:''}
${schemasFor(route).map(jsonScript).join('\n')}`;
}

export function applySeo(html,route,options={}){
  html=html.replace(/<title>[\s\S]*?<\/title>/gi,'').replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/gi,'').replace(/<link\s+rel="canonical"[^>]*>/gi,'').replace(/<link\s+rel="(?:icon|apple-touch-icon|manifest)"[^>]*>/gi,'').replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi,'');
  if(!route.startsWith('/project-management')&&!html.includes('data-pm-nav'))html=html.replace('</nav>','<a data-pm-nav href="/project-management">ArkHimar PM</a></nav>');
  if(!html.includes('data-auth-nav')){
    const control='<a class="auth-nav-link" data-auth-nav href="/pm/login/?mode=signup">Sign Up</a>';
    html=html.includes('</nav>')?html.replace('</nav>',`${control}</nav>`):html.replace('</header>',`${control}</header>`);
  }
  if(!html.includes('/auth-nav.js'))html=html.replace('</body>','<script src="/runtime-config.js"></script><script type="module" src="/auth-nav.js"></script></body>');
  return html.replace('</head>',`${seoHead(route,options)}\n</head>`);
}

const shell=(route,eyebrow,h1,intro,body)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f7f5ef"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&amp;family=Syne:wght@400;500;600;700&amp;display=swap" rel="stylesheet"><link rel="stylesheet" href="/styles.css"></head><body class="inner-page"><a class="skip-link" href="#main">Skip to content</a><header class="site-header solid" data-header><a class="wordmark" href="/" aria-label="ArkHimar home">Arkhimar<span>.</span></a><button class="menu-button" type="button" aria-expanded="false" aria-controls="main-nav" data-menu>Menu</button><nav class="main-nav" id="main-nav" aria-label="Main"><a href="/about">About</a><a href="/services">Services</a><a href="/projects">Projects</a><a href="/how-it-works">How It Works</a><a href="/contact">Contact</a><a class="nav-cta" href="/start-a-project">Start a Project ↗</a></nav></header><main id="main"><section class="page-hero"><div class="container"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true"> / </span><span>${escapeHtml(h1)}</span></nav><p class="overline">${escapeHtml(eyebrow)}</p><h1>${h1}</h1><p class="intro">${escapeHtml(intro)}</p></div></section>${body}</main><footer class="site-footer"><div class="container footer-grid"><div><p class="footer-logo">Arkhimar<span>.</span></p><p>Architectural and built-environment consultancy in Lagos, Nigeria.</p></div><div><h2>Navigate</h2><ul><li><a href="/services">Architectural Services</a></li><li><a href="/projects">Architecture Projects</a></li><li><a href="/project-management">ArkHimar PM</a></li></ul></div><div><h2>Contact</h2><ul><li><a href="mailto:projects@arkhimar.com">projects@arkhimar.com</a></li><li><a href="tel:+2348058716249">+234 805 871 6249</a></li><li>Lagos, Nigeria</li></ul></div></div><div class="container footer-bottom"><p>© 2026 ArkHimar Consult. All rights reserved.</p></div></footer><script src="/app.js" defer></script></body></html>`;

function architecturePage(route){
  if(route==='/about')return shell(route,'About ArkHimar Consult','Architecture shaped by technical rigour.','We turn clear briefs, site understanding and coordinated documentation into buildable architectural solutions.',`<section class="section container content-grid"><article><h2>Design clarity, grounded in delivery</h2><p>ArkHimar Consult provides architectural design, documentation and advisory services across residential, commercial and institutional projects. We consider site constraints, statutory requirements, budget realities and construction practice throughout the work.</p></article><article><h2>A dependable technical process</h2><p>Each engagement begins with a clear brief and progresses through review, consultation, proposal and coordinated design information. The goal is documentation clients and contractors can understand and use with confidence.</p><a class="text-link" href="/how-it-works">Explore our architecture process →</a></article></section>`);
  if(route==='/services'){const cards=services.map(([slug,name,description],i)=>`<article class="service-card"><span class="number">${String(i+1).padStart(2,'0')}</span><h2><a href="/services/${slug}">${escapeHtml(name)}</a></h2><p>${escapeHtml(description)}</p></article>`).join('');return shell(route,'Architectural Services','Professional services across the project lifecycle.','Explore real services offered by ArkHimar Consult, from early site advice and concept design to coordinated construction information.',`<section class="section tinted"><div class="container service-grid static-services">${cards}</div></section>`);}
  if(route==='/projects')return shell(route,'Selected Projects','Architecture for places people use.','Representative residential, commercial and interior architecture work from the ArkHimar Consult portfolio.',`<section class="section container"><div class="project-grid"><article class="project-card"><div class="project-media"><img src="/assets/images/project-duplex.jpg" alt="Contemporary proposed four-bedroom duplex in Lekki, Lagos" width="1280" height="1600" loading="lazy"></div><p>Residential</p><h2>Proposed 4-Bedroom Duplex</h2><small>Lekki, Lagos</small></article><article class="project-card"><div class="project-media"><img src="/assets/images/project-commercial.jpg" alt="Contemporary corporate office development" width="1280" height="1600" loading="lazy"></div><p>Commercial</p><h2>Corporate Office Development</h2><small>Central Business District</small></article><article class="project-card"><div class="project-media"><img src="/assets/images/project-interior.jpg" alt="Double-height reception hall interior in Abuja" width="1280" height="1600" loading="lazy"></div><p>Interior Architecture</p><h2>Double-Height Reception Hall</h2><small>Abuja</small></article></div><div class="button-row"><a class="button button-dark" href="/start-a-project">Discuss your project ↗</a></div></section>`);
  if(route==='/how-it-works')return shell(route,'How It Works','A clear path from enquiry to commencement.','Our four-step process establishes the project brief, feasibility and professional scope before design work begins.',`<section class="section container"><ol class="process-list"><li><span>Step 01</span><h2>Tell us about your project</h2><p>Share your requirements, location, size, references and budget expectations.</p></li><li><span>Step 02</span><h2>We review your brief</h2><p>We assess requirements, constraints and the information needed for consultation.</p></li><li><span>Step 03</span><h2>Consultation and proposal</h2><p>We clarify the brief and present the appropriate professional engagement.</p></li><li><span>Step 04</span><h2>Project commencement</h2><p>Once terms are agreed, work begins with a clear programme and deliverables.</p></li></ol></section>`);
  if(route==='/contact')return shell(route,'Contact','Begin a conversation about your project.','Contact ArkHimar Consult in Lagos about architectural design, technical documentation or built-environment consultancy.',`<section class="section container content-grid"><article><h2>Project enquiries</h2><p><a href="mailto:projects@arkhimar.com">projects@arkhimar.com</a><br><a href="tel:+2348058716249">+234 805 871 6249</a><br>Lagos, Nigeria</p></article><article><h2>Send a detailed brief</h2><p>Use the project form to include your requirements and attach reference images, existing floor plans or other useful documents.</p><a class="button button-dark" href="/start-a-project">Start a Project ↗</a></article></section>`);
  const service=services.find(([slug])=>route===`/services/${slug}`);if(service){const [slug,name,description]=service;return shell(route,'Architectural Service',escapeHtml(name),description,`<section class="section container content-grid"><article><h2>What this service supports</h2><p>${escapeHtml(description)} The scope and deliverables are agreed after ArkHimar Consult reviews the project brief, site context and available information.</p></article><article><h2>Start with the right information</h2><p>Share the project location, intended use, constraints and any existing drawings or reference images. This helps us recommend an appropriate next step.</p><a class="button button-dark" href="/start-a-project">Request a tailored proposal ↗</a><p><a class="text-link" href="/services">View all architectural services →</a></p></article></section>`);}
  return null;
}

export async function renderSeo(output,{indexable=false,verification=''}={}){
  const generated=['/about','/services','/projects','/how-it-works','/contact',...services.map(([slug])=>`/services/${slug}`)];
  for(const route of generated){const html=architecturePage(route);const dir=`${output}${route}`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/index.html`,applySeo(html,route,{indexable,verification}));}
  const existing={'/':'index.html','/start-a-project':'start-a-project/index.html','/project-management':'project-management/index.html'};
  for(const suffix of ['features','pricing','demo','templates','resources','tools','solutions','compare','security','changelog','early-access','privacy','terms'])existing[`/project-management/${suffix}`]=`project-management/${suffix}/index.html`;
  for(const [route,file] of Object.entries(existing)){const path=`${output}/${file}`;const html=await readFile(path,'utf8');await writeFile(path,applySeo(html,route,{indexable,verification}));}
  for(const file of ['pm/index.html','pm/login/index.html']){const path=`${output}/${file}`;let html=await readFile(path,'utf8');html=html.replace(/<meta name="robots"[^>]*>/i,'<meta name="robots" content="noindex,nofollow">');await writeFile(path,html);}
  await writeFile(`${output}/robots.txt`,robotsText(indexable));
  await writeFile(`${output}/sitemap.xml`,indexable?sitemapXml(indexableRoutes):sitemapXml([]));
}
