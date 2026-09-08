export const designReadinessQuestions=[
  ['purpose','Project purpose and intended outcome are defined.','Clarify the project purpose, intended users and the outcome the design should enable.'],
  ['site','Basic site or property information is available.','Gather the site address, survey information, photographs and known physical constraints.'],
  ['authority','Ownership or authority to commission the work is clear.','Confirm who owns the property or has authority to commission design work.'],
  ['budget','A realistic budget range has been discussed.','Establish a working budget range and identify what it needs to include.'],
  ['decision_makers','Decision-makers and approval roles are known.','List the people who will brief, review and approve project decisions.'],
  ['timeline','The target timeline and urgency are understood.','Define the intended start, key decision dates and target completion window.'],
  ['surveys','Available surveys and existing information are identified.','List existing surveys, drawings, reports and information still to be commissioned.'],
  ['statutory','Planning and statutory research has started.','Identify the relevant planning authority and obtain project-specific professional advice before relying on assumptions.']
];

export function designReadiness(values={}){const completed=designReadinessQuestions.filter(([key])=>values[key]===true).length,score=Math.round(completed/designReadinessQuestions.length*100),level=score>=75?'Prepared':score>=50?'Developing':'Early stage',actions=designReadinessQuestions.filter(([key])=>values[key]!==true).map(([,label,action])=>({label,action}));return{score,level,completed,total:designReadinessQuestions.length,actions,assumptions:['All questions are equally weighted.','The result reflects only the answers supplied.','A high score does not establish legal, statutory, technical or cost compliance.']};}

const allowedProjectTypes=new Set(['Residential','Commercial','Institutional','Religious','Educational','Hospitality','Healthcare','Industrial','Mixed Use','Renovation','Other']);
const allowedSources=new Set(['project-brief-starter-kit','design-readiness-assessment','site-due-diligence-starter-checklist','contractor-tender-comparison-scorecard','design-change-decision-log','handover-snagging-starter-checklist','project-brief-builder']);
export function safeProjectPrefill(values={}){const params=new URLSearchParams(),source=String(values.source_resource||'');if(allowedSources.has(source))params.set('source_resource',source);if(allowedProjectTypes.has(values.project_type))params.set('project_type',values.project_type);return params.toString();}
export function readSafeProjectPrefill(search=''){const input=Object.fromEntries(new URLSearchParams(search)),query=safeProjectPrefill(input);return Object.fromEntries(new URLSearchParams(query));}
