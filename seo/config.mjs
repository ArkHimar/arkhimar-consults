export const SITE_ORIGIN='https://www.arkhimar.com';
export const CONSULT_IMAGE='/assets/images/og-arkhimar-consult.jpg';
export const PM_IMAGE='/assets/images/og-arkhimar-pm.png';

export const services=[
  ['architectural-design','Architectural Design','Concept-to-completion architectural design grounded in context, function, climate and buildability.'],
  ['residential-design','Residential Design','Homes, duplexes, apartments and estates planned around how families live.'],
  ['commercial-architecture','Commercial Architecture','Offices, retail and mixed-use developments balancing commercial value with design quality.'],
  ['building-plans','Building Plans','Coordinated architectural plans, elevations and sections prepared to professional standards.'],
  ['working-drawings','Working Drawings','Detailed technical drawings that help contractors build accurately and confidently.'],
  ['planning-approval-drawings','Planning and Approval Drawings','Documentation prepared for statutory planning and building-control requirements.'],
  ['renovation-remodeling','Renovation and Remodeling','Careful reworking of existing structures to improve performance, layout and value.'],
  ['interior-space-planning','Interior Space Planning','Efficient interior layouts with considered circulation, light and materials.'],
  ['3d-architectural-visualization','3D Architectural Visualization','Architectural renders and walkthroughs that communicate a project before construction.'],
  ['construction-documentation','Construction Documentation','Coordinated drawing sets, schedules and specifications for tendering and construction.'],
  ['site-consultation','Site Consultation','Site appraisal, constraints analysis and advice on the effective use of land.'],
  ['design-consultancy','Design Consultancy','Independent design review and technical guidance at any project stage.']
];

const architecturePages={
  '/': ['ArkHimar Consult | Architecture & Built-Environment Consultancy','ArkHimar Consult is an architectural and built-environment consultancy delivering thoughtful design, technical documentation and project support for clients in Lagos, Nigeria.'],
  '/about': ['About ArkHimar Consult | Architecture & Built Environment','Learn about ArkHimar Consult, our design approach, technical process and commitment to buildable architectural solutions.'],
  '/services': ['Architectural Services | ArkHimar Consult','Explore ArkHimar Consult’s architectural design, documentation, coordination and built-environment services.'],
  '/projects': ['Architecture Projects | ArkHimar Consult','Explore selected ArkHimar Consult residential, commercial and interior architecture projects.'],
  '/how-it-works': ['How Our Architecture Process Works | ArkHimar Consult','Understand ArkHimar Consult’s process from project brief and consultation through proposal and architectural design.'],
  '/start-a-project': ['Start an Architecture Project | ArkHimar Consult','Submit your architectural project brief to ArkHimar Consult for professional review and a tailored project proposal.'],
  '/contact': ['Contact ArkHimar Consult | Architecture Consultancy','Contact ArkHimar Consult about architectural design, project documentation and built-environment consultancy services.']
};

const pmPages={
  '/project-management': ['ArkHimar PM | Project Management Software from Business Case to Benefits','ArkHimar PM connects Business Cases, Project Charters, WBS, schedules, budgets, risks, change control, reports and project documents in one professional project management system.'],
  '/project-management/features': ['Project Management Software Features | ArkHimar PM','Explore ArkHimar PM capabilities for business cases, charters, scope, WBS, schedules, cost, risk, change control and reporting.'],
  '/project-management/pricing': ['ArkHimar PM Pricing | Project Management Software','Compare ArkHimar PM plans for individuals, project teams, consultants, PMOs and enterprises.'],
  '/project-management/demo': ['ArkHimar PM Demo | Professional Project Planning','Explore the ArkHimar PM project lifecycle, controls and reporting workflow in the interactive product demo.'],
  '/project-management/templates': ['Project Management Templates | ArkHimar PM','Use professional templates for Business Cases, Project Charters, WBS, risk registers, schedules, status reports and project closure.'],
  '/project-management/resources': ['Project Management Resources | ArkHimar PM','Practical project management resources connecting professional guidance, examples and templates to ArkHimar PM workflows.'],
  '/project-management/tools': ['Free Project Management Tools | ArkHimar PM','Use free project management calculators for ROI, NPV, payback, critical path and earned value analysis.'],
  '/project-management/solutions': ['Project Management Solutions | ArkHimar PM','Explore ArkHimar PM workflows for project managers, PMOs, consultants, construction and technology teams.'],
  '/project-management/compare': ['Compare Project Management Approaches | ArkHimar PM','Compare connected project governance in ArkHimar PM with fragmented documents, spreadsheets and task boards.'],
  '/project-management/security': ['ArkHimar PM Security | Project Data Protection','Review the current ArkHimar PM security architecture, tenant isolation, permissions and private storage controls.'],
  '/project-management/changelog': ['ArkHimar PM Changelog | Product Updates','Follow verified ArkHimar PM product changes, beta improvements and current capability boundaries.'],
  '/project-management/early-access': ['ArkHimar PM Early Access | Join the Private Beta','Request ArkHimar PM private-beta access or apply to help validate professional project workflows.'],
  '/project-management/privacy': ['ArkHimar PM Privacy Notice','Read how ArkHimar PM handles marketing enquiries, beta workspace data and privacy choices.'],
  '/project-management/terms': ['ArkHimar PM Private-Beta Terms','Read the plain-language evaluation terms for the current ArkHimar PM private beta.']
};

export const pages=new Map([...Object.entries(architecturePages),...Object.entries(pmPages)]);
for(const [slug,name,description] of services){pages.set(`/services/${slug}`,[`${name} | ArkHimar Consult`,`${description} Discuss your project with ArkHimar Consult in Lagos, Nigeria.`]);}

export const indexableRoutes=[...pages.keys()];

export function canonicalFor(route='/'){
  const normalized=route==='/'?'/':`/${route.replace(/^\/+|\/+$/g,'')}`;
  return `${SITE_ORIGIN}${normalized}`;
}

export function pageMeta(route){
  const value=pages.get(route);
  if(!value) return null;
  const isPm=route.startsWith('/project-management');
  return {route,title:value[0],description:value[1],canonical:canonicalFor(route),image:canonicalFor(isPm?PM_IMAGE:CONSULT_IMAGE),imageAlt:isPm?'ArkHimar PM — From Business Case to Benefits':'ArkHimar Consult architecture and built-environment consultancy'};
}

export function robotsText(indexable){
  return indexable
    ?`User-agent: *\nAllow: /\nDisallow: /pm\nDisallow: /api\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`
    :'User-agent: *\nDisallow: /\n';
}

export function sitemapXml(routes=indexableRoutes){
  const urls=routes.map(route=>`  <url><loc>${canonicalFor(route)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
