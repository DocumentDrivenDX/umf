import {copyJson} from './json';
import {UmfError,type Document,type Json} from './types';
import {validateDocument} from '../validation/document';
import {validateRelationshipCandidate,type RelationshipCandidate} from '../validation/relationships';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/key-document.schema.json';
import candidate from '../../spec/core/relationship-document.schema.json';
import schema from '../../spec/core/relationship-transition.schema.json';

const reason='Legacy module relationships are opaque; no association inferred' as const;
export interface RelationshipUpgradeReceipt {operation:'upgrade-relationship-envelope';version:'1.0.0';source:Document;target:RelationshipCandidate;residuals:{path:string;value:Json;reason:typeof reason}[]}
export interface RelationshipRollbackReceipt {operation:'rollback-relationship-envelope';version:'1.0.0';source:RelationshipCandidate;target:Document;receipt:RelationshipUpgradeReceipt;reason:'Original envelope restored; all subsequent content retained in source, not applied to legacy target'}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(candidate);const check=validator.compile(schema);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
function finish<T>(value:T):T {const copied=copyJson(value);if(!check(copied))throw new UmfError('RELATIONSHIP_TRANSITION_RESULT',JSON.stringify(check.errors));return copied as T;}

/** All module collisions are archived, including content that looks like a valid assertion. */
export function upgradeRelationshipEnvelope(input:Document):RelationshipUpgradeReceipt {
 const source=copyJson(input) as unknown as Document;
 if(source.umf!=='0.6.0'||!validateDocument(source).valid)throw new UmfError('RELATIONSHIP_TRANSITION_INPUT','Expected valid 0.6.0 envelope');
 const target=copyJson(source) as unknown as RelationshipCandidate;target.umf='0.7.0';const residuals:RelationshipUpgradeReceipt['residuals']=[];
 target.modules.forEach((module,index)=>{if(Object.hasOwn(module,'relationships')){residuals.push({path:`/modules/${index}/relationships`,value:copyJson(module.relationships),reason});delete module.relationships;}});
 const validation=validateRelationshipCandidate(target);if(!validation.valid)throw new UmfError('RELATIONSHIP_TRANSITION_TARGET',JSON.stringify(validation.diagnostics));
 return finish({operation:'upgrade-relationship-envelope',version:'1.0.0',source,target,residuals});
}

/** Restore exactly the old document; later assertions and native changes remain in source. */
export function rollbackRelationshipEnvelope(input:RelationshipUpgradeReceipt,current:RelationshipCandidate):RelationshipRollbackReceipt {
 const receipt=copyJson(input) as unknown as RelationshipUpgradeReceipt;
 if(!check(receipt)||receipt.operation!=='upgrade-relationship-envelope')throw new UmfError('RELATIONSHIP_TRANSITION_RECEIPT','Malformed relationship upgrade receipt');
 const expected=upgradeRelationshipEnvelope(receipt.source);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('RELATIONSHIP_TRANSITION_RECEIPT','Receipt conflicts with retained source');
 const source=copyJson(current) as unknown as RelationshipCandidate;
 if(!validateRelationshipCandidate(source).valid)throw new UmfError('RELATIONSHIP_TRANSITION_CURRENT','Expected valid current 0.7.0 candidate');
 if(source.id!==receipt.target.id)throw new UmfError('RELATIONSHIP_TRANSITION_ID','Current document identity differs from upgrade');
 return finish({operation:'rollback-relationship-envelope',version:'1.0.0',source,target:receipt.source,receipt,reason:'Original envelope restored; all subsequent content retained in source, not applied to legacy target'});
}

export function verifyRelationshipTransition(input:RelationshipUpgradeReceipt|RelationshipRollbackReceipt):RelationshipUpgradeReceipt|RelationshipRollbackReceipt {
 const receipt=copyJson(input) as unknown as typeof input;
 if(!check(receipt))throw new UmfError('RELATIONSHIP_TRANSITION_RECEIPT','Malformed relationship transition');
 const expected=receipt.operation==='upgrade-relationship-envelope'?upgradeRelationshipEnvelope(receipt.source):rollbackRelationshipEnvelope(receipt.receipt,receipt.source);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('RELATIONSHIP_TRANSITION_RECEIPT','Transition conflicts with retained source');
 return expected;
}
