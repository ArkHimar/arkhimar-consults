import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryMetrics,executionModel,statusMetrics} from '../pm/execution.js';
import {projectExportFilename,projectPackCsv,projectPackText} from '../lib/project-export.mjs';

test('hybrid delivery metrics respect estimates, WIP and blockers',()=>{
  const execution=executionModel({iterations:[{status:'Active',completedPoints:8}],workItems:[{status:'Done',estimate:5},{status:'In progress',estimate:3},{status:'Blocked',estimate:2,blocker:'Dependency'}]});
  assert.deepEqual(deliveryMetrics(execution),{total:3,done:1,blocked:1,completion:50,velocity:8,activeIterations:1,wip:2});
});

test('status metrics connect execution, controls and earned value',()=>{
  const metrics=statusMetrics({readiness:80,execution:{workItems:[{status:'Done',estimate:5},{status:'Blocked',estimate:5}]},cost:{pv:100,ev:80,ac:90},controls:{risks:[{status:'Open',probability:4,impactScore:4}],issues:[{status:'Open'}],changes:[{status:'submitted'}]}});
  assert.equal(metrics.deliveryCompletion,50);assert.equal(metrics.criticalRisks,1);assert.equal(metrics.blockedWork,1);assert.equal(metrics.cpi,80/90);assert.equal(metrics.spi,.8);
});

test('project packs use deterministic safe names and portable registers',()=>{
  const pack={exportedAt:'2026-09-09T12:00:00.000Z',workspace:{name:'ArkHimar'},project:{title:'Civic Hub',code:'AKH/026',status:'Active',approach:'Hybrid',confidentiality:'Internal'},execution:{version:2,iterations:[],workItems:[{code:'WI-1',title:'Deliver',status:'Done'}],reviews:[]},controls:{risks:[],issues:[],changes:[]},reports:[]};
  assert.equal(projectExportFilename(pack.project,'pdf',new Date(pack.exportedAt)),'ARKHIMAR_PM_AKH-026_2026-09-09.pdf');assert.match(projectPackText(pack),/CONTROLLED PROJECT PACK/);assert.match(projectPackCsv(pack),/work_item/);
});
