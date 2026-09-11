export function stripNumberFormatting(value=''){
  return String(value??'').replaceAll(',','').trim();
}

export function parseNumericInput(value=''){
  const parsed=Number(stripNumberFormatting(value));
  return Number.isFinite(parsed)?parsed:0;
}

export function formatNumericInput(value=''){
  const raw=stripNumberFormatting(value);
  if(!raw)return'';
  const negative=raw.startsWith('-'),unsigned=raw.replaceAll('-','').replace(/[^\d.]/g,''),hasDecimal=unsigned.includes('.');
  const [wholePart='',...fractionParts]=unsigned.split('.'),whole=(wholePart.replace(/^0+(?=\d)/,'')||'0'),fraction=fractionParts.join('');
  const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return`${negative?'-':''}${grouped}${hasDecimal?`.${fraction}`:''}`;
}
