const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeColor=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(value||'')?value:fallback;
const safeLink=value=>{try{const url=new URL(String(value));return ['https:','mailto:'].includes(url.protocol)?url.href:'#'}catch{return'#'}};
const safeImage=value=>{const text=String(value||'');if(/^cid:[a-z0-9_-]{1,127}$/i.test(text)||/^data:image\/(png|jpeg|webp);base64,/i.test(text))return text;try{const url=new URL(text);return url.protocol==='https:'?url.href:''}catch{return''}};
const paragraphs=value=>escapeHtml(value).split(/\n{2,}/).map(text=>`<p style="margin:0 0 18px;color:#42423d;font-size:16px;line-height:1.7">${text.replaceAll('\n','<br>')}</p>`).join('');

export const normalizeBrand=(brand={})=>({
  senderName:String(brand.senderName||brand.sender_name||'ArkHimar PM').slice(0,120),
  primaryColor:safeColor(brand.primaryColor||brand.primary_color,'#191916'),
  accentColor:safeColor(brand.accentColor||brand.accent_color,'#B86B42'),
  backgroundColor:safeColor(brand.backgroundColor||brand.background_color,'#F5F3ED'),
  footerText:String(brand.footerText||brand.footer_text||'Generated with ArkHimar PM').slice(0,500),
  logoUrl:safeImage(brand.logoUrl||brand.logo_url),
  letterheadUrl:safeImage(brand.letterheadUrl||brand.letterhead_url)
});

export function renderEmailHtml({subject='',preheader='',blocks=[],brand={}}={}){
  const b=normalizeBrand(brand);
  const content=blocks.map(block=>{
    if(block.type==='heading')return`<h1 style="margin:0 0 22px;color:${b.primaryColor};font-family:Arial,sans-serif;font-size:34px;line-height:1.15;letter-spacing:-.03em">${escapeHtml(block.text).slice(0,500)}</h1>`;
    if(block.type==='text')return paragraphs(String(block.text||'').slice(0,10000));
    if(block.type==='button')return`<p style="margin:28px 0"><a href="${escapeHtml(safeLink(block.url))}" style="display:inline-block;background:${b.primaryColor};color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:3px;font-weight:700">${escapeHtml(block.label||'Continue').slice(0,120)}</a></p>`;
    if(block.type==='divider')return`<hr style="border:0;border-top:1px solid #d9d7ce;margin:30px 0">`;
    if(block.type==='signature')return`<p style="margin:24px 0 0;color:#66665f;font-size:14px;line-height:1.6">${escapeHtml(block.text).replaceAll('\n','<br>').slice(0,1000)}</p>`;
    return'';
  }).join('');
  const logo=b.logoUrl?`<img src="${escapeHtml(b.logoUrl)}" alt="" style="display:block;max-width:150px;max-height:56px;margin-bottom:10px">`:'';
  const letterhead=b.letterheadUrl?`<img src="${escapeHtml(b.letterheadUrl)}" alt="" style="display:block;width:100%;max-height:180px;object-fit:contain;margin:0 0 28px">`:'';
  return`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:${b.backgroundColor};padding:32px 14px"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader).slice(0,180)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fcfbf7;border:1px solid #d9d7ce"><tr><td style="padding:22px 34px;border-bottom:4px solid ${b.accentColor};font:700 18px Arial,sans-serif;color:${b.primaryColor}">${logo}${escapeHtml(b.senderName)}</td></tr><tr><td style="padding:42px 34px">${letterhead}${content}</td></tr><tr><td style="padding:22px 34px;border-top:1px solid #d9d7ce;color:#777770;font:12px/1.5 Arial,sans-serif">${escapeHtml(b.footerText)}</td></tr></table></td></tr></table></body></html>`;
}

export function renderEmailText({subject='',blocks=[],brand={}}={}){
  const b=normalizeBrand(brand),lines=[b.senderName,subject,''];
  for(const block of blocks){
    if(['heading','text','signature'].includes(block.type))lines.push(String(block.text||''),'');
    if(block.type==='button')lines.push(`${block.label||'Continue'}: ${safeLink(block.url)}`,'');
    if(block.type==='divider')lines.push('---','');
  }
  lines.push(b.footerText);
  return lines.join('\n').trim();
}
