export const entitlementCatalog={
  'feature.business_case':['free','growth','professional','enterprise'],
  'feature.charter':['free','growth','professional','enterprise'],
  'feature.schedule.cpm':['free','growth','professional','enterprise'],
  'feature.requirements.rtm':['growth','professional','enterprise'],
  'feature.baseline.scope':['professional','enterprise'],
  'feature.baseline.schedule':['professional','enterprise'],
  'feature.evm':['professional','enterprise'],
  'feature.audit.advanced':['professional','enterprise'],
  'feature.portfolio':['professional','enterprise'],
  'feature.sso.saml':[],
  'feature.sso.scim':[],
  'feature.ai.copilot':[]
};
export const limits={free:{active_projects:2,internal_members:3,external_guests:3},growth:{active_projects:null,internal_members:null,external_guests_per_seat:5},professional:{active_projects:null,internal_members:null,external_guests:null},enterprise:{active_projects:null,internal_members:null,external_guests:null}};
export function hasEntitlement(plan,feature){return entitlementCatalog[feature]?.includes(plan)??false}
export function planLimit(plan,limit){return limits[plan]?.[limit]??null}
