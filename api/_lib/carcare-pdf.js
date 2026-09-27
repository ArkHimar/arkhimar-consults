import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';

const A4=[595.28,841.89];
const clean=value=>String(value??'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/[^\x09\x0A\x0D\x20-\x7E]/g,'').trim();

function wrap(text,font,size,maxWidth){
  const lines=[];
  for(const paragraph of clean(text).split(/\n+/)){
    let line='';
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
      const candidate=line?`${line} ${word}`:word;
      if(font.widthOfTextAtSize(candidate,size)<=maxWidth){line=candidate;continue}
      if(line)lines.push(line);
      line=word;
    }
    if(line)lines.push(line);
    if(!paragraph.trim())lines.push('');
  }
  return lines;
}

export async function createCarCarePdf(details={}){
  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const teal=rgb(.055,.52,.45),ink=rgb(.04,.14,.12),muted=rgb(.36,.43,.41),paper=rgb(.97,.95,.91),lime=rgb(.84,.94,.42),red=rgb(.71,.14,.09),white=rgb(1,1,1);
  let page,y;
  const addPage=()=>{
    page=pdf.addPage(A4);y=A4[1]-62;
    page.drawRectangle({x:0,y:A4[1]-12,width:A4[0],height:12,color:details.urgent?red:teal});
    page.drawText('ARKHIMAR CARCARE',{x:48,y,size:10,font:bold,color:teal});
    page.drawText('PRINTABLE RECORD',{x:430,y,size:8,font:bold,color:muted});
    y-=38;
  };
  const ensure=height=>{if(y-height<58)addPage()};
  const line=(label,value)=>{if(!value)return;ensure(28);page.drawText(clean(label).toUpperCase(),{x:48,y,size:8,font:bold,color:muted});page.drawText(clean(value),{x:180,y,size:10,font:bold,color:ink});y-=24};
  const section=(heading,value)=>{
    if(!value)return;
    ensure(55);y-=8;page.drawText(clean(heading).toUpperCase(),{x:48,y,size:9,font:bold,color:teal});y-=19;
    for(const textLine of wrap(value,regular,10.5,499)){ensure(17);page.drawText(textLine,{x:48,y,size:10.5,font:regular,color:ink});y-=16}
    y-=8;
  };
  addPage();
  const title=clean(details.title||'CarCare record');
  for(const titleLine of wrap(title,bold,25,499)){page.drawText(titleLine,{x:48,y,size:25,font:bold,color:ink});y-=30}
  if(details.subtitle){for(const subtitleLine of wrap(details.subtitle,regular,11,499)){page.drawText(subtitleLine,{x:48,y,size:11,font:regular,color:muted});y-=17}}
  y-=17;
  if(details.rating&&details.audience!=='customer'){
    page.drawRectangle({x:48,y:y-50,width:150,height:62,color:ink});page.drawText(`${clean(details.rating)}/5`,{x:91,y:y-22,size:25,font:bold,color:white});page.drawText('CUSTOMER RATING',{x:73,y:y-40,size:7,font:bold,color:lime});
    if(details.severity){page.drawRectangle({x:211,y:y-50,width:150,height:62,color:paper});page.drawText(`${clean(details.severity)}/5`,{x:254,y:y-22,size:25,font:bold,color:details.urgent?red:teal});page.drawText('SEVERITY',{x:264,y:y-40,size:7,font:bold,color:muted})}
    if(details.repeatConcern!==undefined){page.drawRectangle({x:374,y:y-50,width:173,height:62,color:rgb(.89,.96,.93)});page.drawText(details.repeatConcern?'YES':'NO',{x:438,y:y-20,size:18,font:bold,color:teal});page.drawText('REPEAT CONCERN',{x:420,y:y-40,size:7,font:bold,color:muted})}
    y-=80;
  }
  line('Job ID',details.jobId);line('Customer ID',details.customerId);line('Customer',details.customerName);line('Customer email',details.customerEmail);line('Location',details.location);line('Attended by',details.staffName);line('Date',details.date||new Date().toLocaleString('en-NG',{timeZone:'Africa/Lagos'}));
  section('Message',details.message);section('Customer feedback',details.feedback);section('Assessment summary',details.summary);section('Internal note',details.note);section('Draft response - human review required',details.draft);
  ensure(48);page.drawRectangle({x:48,y:y-34,width:499,height:42,color:paper});page.drawText('PRINT OR SAVE AS PDF',{x:64,y:y-10,size:9,font:bold,color:ink});page.drawText('Open this attachment and choose Print. Select an installed printer or Save as PDF.',{x:64,y:y-26,size:9,font:regular,color:muted});
  for(const currentPage of pdf.getPages()){
    currentPage.drawLine({start:{x:48,y:40},end:{x:547,y:40},thickness:.5,color:rgb(.82,.82,.78)});
    currentPage.drawText(`ArkHimar CarCare | ${clean(details.jobId||'Service record')}`,{x:48,y:24,size:7.5,font:regular,color:muted});
  }
  pdf.setTitle(title);pdf.setAuthor('ArkHimar CarCare');pdf.setSubject(clean(details.jobId||'CarCare printable record'));
  return Buffer.from(await pdf.save()).toString('base64');
}

export function carCarePdfAttachment(content,jobId,label='carcare-record'){
  const safe=clean(jobId||'record').replace(/[^A-Za-z0-9_-]+/g,'-');
  return{filename:`${label}-${safe}.pdf`,content};
}
