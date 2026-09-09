import {renderControlledPdf} from './controlled-document-export.mjs';

const safe=value=>String(value??'').replace(/[\u0000-\u001F]/g,'').trim();
const csv=value=>`"${String(value??'').replaceAll('"','""')}"`;
export const projectExportFilename=(project,format,date=new Date())=>`ARKHIMAR_PM_${safe(project.code).replace(/[^A-Za-z0-9._-]+/g,'-')}_${date.toISOString().slice(0,10)}.${format}`;

export function projectPackText(pack){const {project,execution={},controls={},reports=[]}=pack,work=execution.workItems||[],done=work.filter(item=>item.status==='Done').length,latest=reports[0];return`ARKHIMAR PM · CONTROLLED PROJECT PACK
Generated: ${pack.exportedAt}
Workspace: ${safe(pack.workspace.name)}
Classification: ${safe(project.confidentiality)}

PROJECT
${safe(project.title)} (${safe(project.code)})
Status: ${safe(project.status)}
Approach: ${safe(project.approach)}
Sponsor: ${safe(project.sponsor)||'Unassigned'}
Project manager: ${safe(project.projectManager)||'Unassigned'}

BUSINESS NEED
${safe(project.problem)}

EXPECTED OUTCOME
${safe(project.outcome)}

DELIVERY
Execution version: ${execution.version||0}
Iterations: ${(execution.iterations||[]).length}
Work items: ${work.length}
Done: ${done}
Blocked: ${work.filter(item=>item.status==='Blocked'||item.blocker).length}

CONTROLS
Open risks: ${(controls.risks||[]).filter(item=>item.status!=='Closed').length}
Open issues: ${(controls.issues||[]).filter(item=>!['Resolved','Closed'].includes(item.status)).length}
Change requests: ${(controls.changes||[]).length}
Governance reviews: ${(execution.reviews||[]).length}

LATEST STATUS REPORT
${latest?`${latest.date} · ${latest.health}\n${safe(latest.summary)}`:'No published status report.'}
`}

export function projectPackCsv(pack){const rows=[['register','id','title','owner','status','link','value'],...(pack.planning?.requirements||[]).map(item=>['requirement',item.requirement_code,item.description,item.owner_name,item.status,item.wbs_ref,item.priority]),...(pack.planning?.wbs||[]).map(item=>['wbs',item.outline_number,item.name,item.owner_name,item.node_type,item.parent_key,item.estimated_cost]),...(pack.schedule?.tasks||[]).map(item=>['activity',item.activity_code,item.name,item.owner_name,item.status,item.wbs_ref,item.percent_complete]),...(pack.cost?.items||[]).map(item=>['cost',item.cost_code,item.description,item.vendor,item.invoice_status,item.wbs_ref,item.amount]),...(pack.execution?.workItems||[]).map(item=>['work_item',item.code,item.title,item.owner,item.status,item.iterationCode,item.estimate]),...(pack.execution?.iterations||[]).map(item=>['iteration',item.code,item.name,'',item.status,item.type,item.completedPoints]),...(pack.execution?.reviews||[]).map(item=>['governance_review',item.code,item.title,item.owner,item.status,item.type,'']),...(pack.controls?.risks||[]).map(item=>['risk',item.code,item.event,item.owner,item.status,item.linkedArtifact,num(item.probability)*num(item.impactScore)]),...(pack.controls?.issues||[]).map(item=>['issue',item.code,item.title,item.owner,item.status,item.linkedArtifact,item.severity]),...(pack.controls?.changes||[]).map(item=>['change',item.code,item.title,item.requester,item.status,item.type,item.costImpact]),...(pack.reports||[]).map(item=>['status_report',item.date,item.summary,'',item.health,'',item.publishedAt])];return rows.map(row=>row.map(csv).join(',')).join('\n')}
const num=value=>Number(value)||0;

export async function renderProjectPack(pack,format){if(format==='json')return{bytes:Buffer.from(JSON.stringify({schemaVersion:'arkhimar-pm-project-v2',...pack},null,2)),contentType:'application/json; charset=utf-8'};if(format==='csv')return{bytes:Buffer.from(projectPackCsv(pack)),contentType:'text/csv; charset=utf-8'};const text=projectPackText(pack);if(format==='txt')return{bytes:Buffer.from(text),contentType:'text/plain; charset=utf-8'};if(format==='pdf'){const payload={document:{document_code:pack.project.code,title:`${pack.project.title} — Project Pack`,artifact_type:'Controlled Project Pack',confidentiality:pack.project.confidentiality||'Internal',owner_name:pack.project.projectManager||'',effective_date:pack.exportedAt.slice(0,10)},version:{version:pack.execution?.version||1,status:'generated',content:{summary:text},revision_notes:'Generated from current governed project records',created_at:pack.exportedAt},project:pack.project,workspace:pack.workspace};return{bytes:await renderControlledPdf(payload),contentType:'application/pdf'}}throw new Error('Unsupported export format')}
