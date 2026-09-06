import test from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_PM_STAGE,claims,planPrice,pert,pricingPlans,readiness,visibleClaims} from '../project-management/marketing-config.mjs';
import {hasEntitlement,planLimit} from '../project-management/entitlements.mjs';

test('private-beta stage is explicit',()=>assert.equal(PUBLIC_PM_STAGE,'private_beta'));
test('pricing calculates exact seats and billing periods',()=>{const growth=pricingPlans.find(plan=>plan.id==='growth');assert.equal(planPrice(growth,'annual',7),56);assert.equal(planPrice(growth,'monthly',7),70)});
test('PERT and readiness calculations are deterministic',()=>{assert.equal(pert({optimistic:8,mostLikely:12,pessimistic:20}),12.666666666666666);assert.equal(readiness({charter:true,wbs:true,risk:false,cost:false}),50)});
test('planned claims cannot enter published claim output',()=>{assert.equal(claims.ai.publishable,false);assert.equal(visibleClaims().some(claim=>claim.status==='planned'),false)});
test('entitlements stay separate from pricing copy',()=>{assert.equal(hasEntitlement('professional','feature.evm'),true);assert.equal(hasEntitlement('growth','feature.evm'),false);assert.equal(hasEntitlement('enterprise','feature.sso.saml'),false);assert.equal(planLimit('free','active_projects'),2)});
