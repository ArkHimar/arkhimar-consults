const assets={
  'project-brief-starter-kit':[
    ['Project intent',['What change or opportunity is prompting the project?','Who will use the completed space and what should it enable?','What would a successful outcome look like?']],
    ['Space and function',['List each space or function required.','Estimate capacity, occupancy or key furniture and equipment.','Note relationships, privacy, access and future flexibility needs.']],
    ['Site and existing information',['Record the site address and known ownership or authority.','List surveys, drawings, photographs and reports available.','Note access, utilities, boundaries, levels, neighbouring uses and known constraints.']],
    ['Budget, programme and decisions',['State the working budget range and what it includes.','Record target start, decision dates and completion window.','Name the briefing, review and approval decision-makers.']]
  ],
  'site-due-diligence-starter-checklist':[
    ['Authority and records',['Confirm who is authorized to commission the work.','Gather title, survey and boundary records for professional review.','Record easements, rights of way or known disputes without assuming their legal effect.']],
    ['Physical context',['Photograph access, edges, vegetation, structures, drainage and neighbours.','Record apparent slope, water, noise, hazards and seasonal conditions.','Identify where measured, geotechnical or environmental surveys may be needed.']],
    ['Services and statutory research',['List known electricity, water, drainage, data and waste connections.','Identify the relevant planning and building-control authorities.','Record each assumption, evidence source, owner and due date.']]
  ],
  'contractor-tender-comparison-scorecard':[
    ['Evaluation setup',['Define mandatory pass/fail requirements before scoring.','Choose criteria and weights totalling 100%.','Record the evidence expected for every criterion.']],
    ['Suggested criteria',['Relevant experience and proposed team','Methodology, programme and capacity','Commercial submission and exclusions','Quality, safety and risk approach','References, clarifications and compliance evidence']],
    ['Decision control',['Score every bidder on the same published scale.','Add an evidence reference and assessor comment beside each score.','Treat weighted totals as decision support, not an automatic recommendation.','Record due diligence, the authorized decision and approval date.']]
  ],
  'design-change-decision-log':[
    ['Record fields',['Decision or change ID and date raised','Question, proposed change or decision required','Originator, owner and required-by date','Options considered and evidence references','Scope, cost, programme, quality and risk impacts','Decision, approver, date and follow-up action']],
    ['Working rules',['Separate a proposal from an authorized instruction.','Record assumptions and unknowns instead of presenting them as facts.','Link affected drawings, specifications, approvals and prior decisions.','Close only after follow-up actions and document updates are confirmed.']]
  ],
  'handover-snagging-starter-checklist':[
    ['Documents and demonstrations',['List drawings, manuals, warranties, test records and approvals expected.','Record version, source, recipient, date and outstanding gaps.','Schedule systems demonstrations and identify attendees.','Record keys, access credentials, spares, contacts and training materials.']],
    ['Outstanding items',['Give every item an ID, location, description, owner and target date.','Attach evidence without asserting contractual defect liability.','Track closure evidence and the person authorized to accept it.']],
    ['Post-handover',['Record follow-up dates, warranty contacts and seasonal checks.','Confirm the owner of benefits, maintenance and unresolved risk actions.','Retain signed contractual and professional records separately.']]
  ]
};

export function resourceAssetSections(slug){return assets[slug]||[]}
export function renderResourceAsset(resource){const sections=resourceAssetSections(resource.slug);return `${resource.title}\nVersion ${resource.version} · reviewed ${resource.last_reviewed_at}\n\nOUTCOME\n${resource.outcome}\n\n${sections.map(([heading,items])=>`${heading.toUpperCase()}\n${items.map(item=>`[ ] ${item}`).join('\n')}`).join('\n\n')}\n\nWHEN TO USE\n${resource.when_to_use}\n\nWHEN NOT TO USE\n${resource.when_not_to_use}\n\nIMPORTANT\n${resource.professional_disclaimer}\n\nPrepared with ArkHimar Consult · https://www.arkhimar.com`}
