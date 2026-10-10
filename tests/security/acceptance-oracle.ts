import {ref,securityFixture} from './fixture';
import type {SecurityExpr} from '../../src/extensions/security/types';

/** Authored refusal oracle: it never invokes a policy validator or compiler. */
export const invalidPolicyCases = [
  {id:'wrong-endpoint-role',change:(f:ReturnType<typeof securityFixture>)=>{
    f.policy.rules[1]!.condition={op:'exists',association:ref('Ownership'),as:'o',where:{op:'eq',left:{kind:'variable',name:'o',endpoint:'wrong'},right:{kind:'resource',identity:true}}};}},
  {id:'undeclared-action',change:(f:ReturnType<typeof securityFixture>)=>{f.policy.rules[0]!.actions=['undeclared'];}},
  {id:'boolean-string',change:(f:ReturnType<typeof securityFixture>)=>{
    f.policy.rules[1]!.condition={op:'exists',association:ref('Assignment'),as:'a',where:{op:'eq',left:{kind:'variable',name:'a',field:ref('active')},right:{kind:'constant',field:ref('staffId'),value:{string:'true'}}}};}},
  {id:'unknown-operator',change:(f:ReturnType<typeof securityFixture>)=>{f.policy.rules[0]!.condition={op:'future'} as any;}},
  {id:'depth-excess',change:(f:ReturnType<typeof securityFixture>)=>{
    let e:SecurityExpr={op:'literal',value:true};for(let i=0;i<16;i++)e={op:'not',arg:e};f.policy.rules[0]!.condition=e;}},
  {id:'node-excess',change:(f:ReturnType<typeof securityFixture>)=>{
    f.policy.rules[0]!.condition={op:'and',args:Array.from({length:64},()=>({op:'and',args:Array.from({length:64},()=>({op:'literal',value:true}))}))};}},
] as const;
export const refusalExpectation={valid:false,complete:false};
export const nativeArchive={system:'native-archive-only',format:'sql',text:'-- Preserve CRLF\r\nCREATE POLICY opaque;\r\n',
  bytesHex:'00ff0a0d',unknownExtension:{meaning:['uninterpreted',null]}};

/** Authored access expectations; independent of the evaluator implementation. */
export const accessExpectations={
  assigned:'permit',inactive:'deny',missing:'deny',sibling:'deny',otherStaff:'deny',ownerless:'deny',
  forbidden:'deny',untrusted:'indeterminate',stale:'indeterminate',policy:'indeterminate',
  subject:'indeterminate',ambiguous:'indeterminate',coverage:'indeterminate',attribute:'indeterminate',
  duplicate:'indeterminate',budget:'indeterminate'
} as const;

export const disclosureExpectations={
  withheld:[{field:{documentId:'domain',moduleId:'m',elementId:'salary'},disposition:'withheld'}],
  null:[{field:{documentId:'domain',moduleId:'m',elementId:'salary'},disposition:'original',value:null}],
  absent:[{field:{documentId:'domain',moduleId:'m',elementId:'salary'},disposition:'absent'}],
  transformed:[{field:{documentId:'domain',moduleId:'m',elementId:'salary'},disposition:'transformed',outputType:{documentId:'domain',moduleId:'m',elementId:'staffId'},value:{string:'redacted'}}]
};
export const queryOperators=['predicate','order','group','join','aggregate'] as const;

export const ownershipExpectations={sameProject:'permit',inactive:'deny',missing:'deny',sameClientSiblingProject:'deny',otherClientProject:'deny',ownerlessAny:'deny',multipleAny:'permit',multipleAll:'deny',ownerlessAll:'permit',ownerlessNonemptyAll:'deny'} as const;

export const identityExpectations={otherDocument:'deny',unicodeDistinct:'deny',largeIntegerDistinct:'deny',largeIntegerExact:'permit'} as const;

export const generatedPolicyCases = [
  ...(['documentId','moduleId','elementId'] as const).flatMap(component=>
    ['missing','same-label-other-scope',''].map(value=>({id:'reference:'+component+':'+value,
      change:(f:ReturnType<typeof securityFixture>)=>{f.policy.rules[0]!.target[0]![component]=value;}}))),
  ...['issuer','trusted','nativeRole','authorityGeneration'].map(member=>({id:'fabricated:'+member,
    change:(f:ReturnType<typeof securityFixture>)=>{(f.policy as any)[member]={trusted:true,role:'owner',source:'client'};}})),
  ...['Staff','Project','Resource'].map(type=>({id:'unknown-classification:'+type,
    change:(f:ReturnType<typeof securityFixture>)=>{(f.resolution.ontology.entities.find(e=>e.type.elementId===type)!.fields[0] as any).protection='future-permission';}})),
] as const;
export const registrationExpectations={refused:true,unchanged:'withheld',untrusted:'refused'} as const;
