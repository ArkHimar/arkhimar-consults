import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {PDFDocument} from 'pdf-lib';
import {exportFilename,renderControlledDocx,renderControlledPdf} from '../lib/controlled-document-export.mjs';

const payload={document:{document_code:'AKH-PMP-001',title:'Ìlànà Project Management Plan',artifact_type:'Project Management Plan',confidentiality:'Confidential',owner_name:'Ọlá Níyàn',effective_date:'2026-09-07'},version:{version:2,status:'approved',content:{summary:'Approved scope and delivery controls for the Lagos project.'},revision_notes:'Approved issue',approved_at:'2026-09-07T12:00:00.000Z',created_at:'2026-09-07T10:00:00.000Z'},project:{title:'Lagos Civic Learning Hub',code:'AKH-026'},workspace:{name:'ArkHimar Consults'}};

test('DOCX controlled export is editable OOXML with metadata and Unicode content',async()=>{
  const bytes=await renderControlledDocx(payload),zip=await JSZip.loadAsync(bytes),documentXml=await zip.file('word/document.xml').async('string');
  assert.equal(bytes.subarray(0,2).toString(),'PK');assert.match(documentXml,/Ìlànà Project Management Plan/);assert.match(documentXml,/AKH-PMP-001/);assert.match(documentXml,/Version/);assert.match(documentXml,/Approved scope and delivery controls/);
});

test('PDF controlled export parses, embeds Unicode metadata and has deterministic naming',async()=>{
  const bytes=await renderControlledPdf(payload),pdf=await PDFDocument.load(bytes);
  assert.equal(bytes.subarray(0,4).toString(),'%PDF');assert.equal(pdf.getPageCount(),1);assert.equal(pdf.getTitle(),'Ìlànà Project Management Plan');assert.equal(exportFilename(payload.document,payload.version,'pdf'),'ARKHIMAR_PM_AKH-PMP-001_v2_2026-09-07.pdf');
  assert.equal(exportFilename(payload.document,{...payload.version,approved_at:'2026-09-07T23:59:59.000Z'},'pdf'),'ARKHIMAR_PM_AKH-PMP-001_v2_2026-09-07.pdf');
});
