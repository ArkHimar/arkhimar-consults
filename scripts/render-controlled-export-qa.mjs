import {mkdir,writeFile} from 'node:fs/promises';
import {renderControlledDocx,renderControlledPdf} from '../lib/controlled-document-export.mjs';

const destination=process.argv[2];if(!destination)throw new Error('Provide an output directory');await mkdir(destination,{recursive:true});
const payload={document:{document_code:'AKH-PMP-001',title:'Project Management Plan',artifact_type:'Project Management Plan',confidentiality:'Confidential',owner_name:'Olanìyàn Emmanuel Ayobami',effective_date:'2026-09-07'},version:{version:2,status:'approved',content:{summary:'This controlled plan defines the approved governance, delivery approach, reporting expectations and decision controls for the Lagos Civic Learning Hub.\n\nThe project manager will maintain the schedule, cost baseline, risk register and stakeholder communications in ArkHimar PM. Changes affecting approved baselines require formal review and approval before implementation.'},revision_notes:'Approved issue following sponsor review',approved_at:'2026-09-07T12:00:00.000Z',created_at:'2026-09-07T10:00:00.000Z'},project:{title:'Lagos Civic Learning Hub',code:'AKH-026'},workspace:{name:'ArkHimar Consults'}};
await Promise.all([writeFile(`${destination}/controlled-document.docx`,await renderControlledDocx(payload)),writeFile(`${destination}/controlled-document.pdf`,await renderControlledPdf(payload))]);
console.log(destination);
