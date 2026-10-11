import {test,expect} from 'bun:test';
import {securityFixture} from './fixture';
import {migrateCandidateSecurityPolicy} from '../../src/extensions/security/policy-migration-candidate';
import {createValidator} from '../../src/validation/schema';
import schema from '../../docs/helix/02-design/spikes/security/policy-v0.2.schema.json';
const check=createValidator().compile(schema),destination={documentId:'domain',revision:'ontology-2'};
test('policy draft migration preserves rules and explicitly rebinds ontology revision',()=>{
 const source=securityFixture().policy,result:any=migrateCandidateSecurityPolicy(source,destination,'policy-2');expect(result.residuals).toEqual([]);expect(result.target.rules).toEqual(source.rules);expect(result.source).toEqual(source);expect(result.target.ontology).toEqual(destination);expect(check(result.target)).toBe(true);expect(Object.isFrozen(result.target.rules[1].condition)).toBe(true);expect(result.source.rules).not.toBe(result.target.rules);
 expect(()=>migrateCandidateSecurityPolicy(source,source.ontology,'policy-2')).toThrow();
});
test('relationship refs stay distinct and unknown nested semantics remain visible',()=>{
 const source:any=securityFixture().policy;Object.defineProperty(source.rules[1].condition.where.args[1].where.args[2].left,'constructor',{value:{future:true},enumerable:true});const result:any=migrateCandidateSecurityPolicy(source,destination,'policy-2');expect(result.residuals.map((r:any)=>r.path)).toEqual(['/rules/1/condition/where/args/1/where/args/2/left/constructor']);expect(result.source.rules[1].condition.where.args[1].where.args[2].left.constructor).toEqual({future:true});
 const graph=structuredClone(result.target);graph.rules[1].condition.association={documentId:'domain',moduleId:'m',relationshipId:'OwnershipRelation'};expect(check(graph)).toBe(true);graph.rules[1].condition.association.elementId='Ownership';expect(check(graph)).toBe(false);
});


test('policy migration refuses reused or malformed destination revisions',()=>{
 const source=securityFixture().policy;for(const revision of ['',source.revision,{},42])expect(()=>migrateCandidateSecurityPolicy(source,destination,revision)).toThrow();
});
