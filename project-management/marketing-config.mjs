export const PUBLIC_PM_STAGE='private_beta';

export const claims={
  lifecycle:{label:'Connected project lifecycle',status:'beta',publishable:true,proof:'/pm/'},
  calculations:{label:'Deterministic financial, CPM, risk and EVM calculations',status:'beta',publishable:true,proof:'/project-management/tools/'},
  approvals:{label:'Versioned charter approval and baseline snapshots',status:'beta',publishable:true,proof:'/pm/'},
  exports:{label:'JSON, CSV, TXT and print/PDF exports',status:'beta',publishable:true,proof:'/pm/'},
  ai:{label:'ArkHimar AI Copilot',status:'planned',publishable:false,proof:null},
  sso:{label:'Enterprise SSO and SCIM',status:'planned',publishable:false,proof:null},
  controlledExports:{label:'Controlled DOCX and PDF exports',status:'live',publishable:true,proof:'Server-generated, versioned document exports with audit events'},
  office:{label:'XLSX and PPTX controlled exports',status:'planned',publishable:false,proof:null}
};

export const pricingPlans=[
  {id:'free',name:'Free',annual:0,monthly:0,description:'Build and evaluate a credible project.',cta:'Request early access',features:['Up to 2 active projects','Business Case and Charter','Scope, WBS and basic schedule','Risk and issue registers','TXT and print/PDF export']},
  {id:'growth',name:'Growth',annual:8,monthly:10,description:'Complete professional planning for growing teams.',cta:'Join the Growth waitlist',features:['Exact per-seat billing','Advanced planning controls','Requirements and traceability','Professional register exports','3–5 guest allowance per paid seat']},
  {id:'professional',name:'Professional / PMO',annual:16,monthly:20,description:'Govern projects, baselines and performance.',cta:'Become a design partner',features:['Formal approvals and baselines','Integrated change control','Earned value management','Governance and audit history','Portfolio capabilities as released']},
  {id:'enterprise',name:'Enterprise',annual:null,monthly:null,description:'A supported path for formal organizations.',cta:'Talk to ArkHimar',features:['Security and deployment discovery','Advanced permissions roadmap','Migration and onboarding planning','Commercial terms based on scope','No unearned compliance claims']}
];

export const lifecycle=[
  ['01','Justify','Build the case, compare options and test financial assumptions.'],['02','Authorize','Create a controlled Charter and record the decision.'],['03','Plan','Connect scope, requirements, WBS, schedule, cost and people.'],['04','Baseline','Approve the reference point without erasing its history.'],['05','Deliver','Coordinate work, evidence, decisions and acceptance.'],['06','Control','Manage risk, issues, performance and integrated change.'],['07','Close','Complete handover, closure and lessons learned.'],['08','Realize','Track whether intended benefits became real outcomes.']
];

export const features=[
  {slug:'business-case',name:'Business Case',status:'beta',summary:'Frame the problem, compare the investment and show the assumptions behind the numbers.'},
  {slug:'project-charter',name:'Project Charter',status:'beta',summary:'Turn intent into explicit authorization with a versioned decision record.'},
  {slug:'wbs',name:'Scope, Requirements & WBS',status:'beta',summary:'Decompose approved scope and keep requirements connected to delivery.'},
  {slug:'gantt-critical-path',name:'Schedule & Critical Path',status:'beta',summary:'Model activities and dependencies with deterministic critical-path calculations.'},
  {slug:'cost-management-evm',name:'Cost & Earned Value',status:'beta',summary:'Establish the budget and understand CV, SV, CPI, SPI, EAC and VAC.'},
  {slug:'risk-management',name:'Risk & Issues',status:'beta',summary:'Make ownership, exposure and response visible before surprises compound.'},
  {slug:'change-control',name:'Integrated Change Control',status:'beta',summary:'Record impact and approvals while preserving prior baseline history.'},
  {slug:'project-reporting',name:'Status & Export',status:'beta',summary:'Create repeatable project snapshots and portable project records.'},
  {slug:'ai-copilot',name:'ArkHimar AI Copilot',status:'planned',summary:'Grounded drafting and review assistance with explicit human acceptance.'}
];

export const templates=[
  ['business-case','Business Case','Initiation',['Executive summary','Problem or opportunity','Options and recommendation','Financial analysis','Decision']],
  ['project-charter','Project Charter','Initiation',['Purpose','Objectives','High-level scope','Milestones and budget','Authority and approval']],
  ['scope-management-plan','Scope Management Plan','Planning',['Scope approach','Roles','Validation','Control','Tailoring']],
  ['schedule-management-plan','Schedule Management Plan','Planning',['Scheduling method','Calendar','Thresholds','Control','Reporting']],
  ['cost-management-plan','Cost Management Plan','Planning',['Estimating','Budgeting','Reserves','EVM rules','Control']],
  ['quality-management-plan','Quality Management Plan','Control',['Objectives','Metrics','Assurance','Quality control','Corrective action']],
  ['risk-management-plan','Risk Management Plan','Control',['Method','Categories','Scales','Responses','Reporting']],
  ['wbs','Work Breakdown Structure','Planning',['Deliverables','Control accounts','Work packages','Owners','Dictionary links']],
  ['wbs-dictionary','WBS Dictionary','Planning',['Scope','Deliverable','Acceptance','Estimate','Responsibility']],
  ['risk-register','Risk Register','Control',['Cause','Event','Impact','Exposure','Response and owner']],
  ['raci','RACI Matrix','People',['Deliverable','Responsible','Accountable','Consulted','Informed']],
  ['change-request','Change Request','Control',['Reason','Impact','Options','Decision','Implementation']],
  ['status-report','Project Status Report','Reporting',['Executive summary','Health','Achievements','Forecast','Decisions needed']],
  ['lessons-learned','Lessons Learned','Closure',['Context','Observation','Impact','Recommendation','Reuse']],
  ['closure-report','Project Closure Report','Closure',['Acceptance','Performance','Handover','Lessons','Benefits follow-up']]
].map(([slug,name,category,fields])=>({slug,name,category,fields}));

export const solutions=[
  ['Project managers','Run the project, not the paperwork.','Connected plans, controls, approvals and reports.'],
  ['PMOs','Govern every project with one repeatable standard.','Templates, gates, baselines, health and audit foundations.'],
  ['Consultants','Turn professional delivery into a repeatable service.','Reusable structures, client-ready records and clear decisions.'],
  ['Construction teams','Connect scope, schedule, cost, quality, risk and change.','A project-controls layer shaped for formal delivery.'],
  ['Technology teams','Govern the project while teams deliver iteratively.','Hybrid planning connects releases to wider business outcomes.']
];

export function primaryCta(){return PUBLIC_PM_STAGE==='prelaunch'?{label:'Join the waitlist',href:'/project-management/early-access/'}:PUBLIC_PM_STAGE==='private_beta'?{label:'Request early access',href:'/project-management/early-access/'}:{label:'Start a project — free',href:'/pm/'}}
export function visibleClaims(){return Object.values(claims).filter(claim=>claim.publishable&&['beta','live'].includes(claim.status))}
export function planPrice(plan,period,seats){if(plan.annual===null)return null;const unit=period==='annual'?plan.annual:plan.monthly;return unit*seats}
export function pert({optimistic,mostLikely,pessimistic}){return(Number(optimistic)+4*Number(mostLikely)+Number(pessimistic))/6}
export function readiness(values){const entries=Object.values(values);return entries.length?Math.round(entries.filter(Boolean).length/entries.length*100):0}
