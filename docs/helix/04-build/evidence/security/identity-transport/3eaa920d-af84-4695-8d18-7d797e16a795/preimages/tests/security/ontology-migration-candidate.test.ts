import {test,expect} from 'bun:test';
import {securityFixture} from './fixture';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {createValidator} from '../../src/validation/schema';
import schema from '../../docs/helix/02-design/spikes/security/ontology-v0.2.schema.json';
const validate=createValidator().compile(schema);
test('draft migration separates Record classification from association selection',()=>{
 const source=securityFixture().resolution.ontology,result:any=migrateCandidateSecurityOntology(source,'ontology-2');
 expect(result.residuals).toEqual([]);expect(validate(result.target)).toBe(true);expect(result.target.entities).toHaveLength(5);
 expect(result.target.associations[1]).toEqual({kind:'record-members',type:source.associations[1]!.type,keyId:'pk',endpoints:source.associations[1]!.endpoints});expect(result.source).toEqual(source);expect(source.version).toBe('0.1.0');
});
test('unknown source semantics and conflicting declarations remain explicit',()=>{
 const source:any=securityFixture().resolution.ontology;source.associations[1].future={meaning:'kept'};source.entities.push({...structuredClone(source.entities[1]),keyId:'other'});
 const result:any=migrateCandidateSecurityOntology(source,'ontology-2');expect(result.source.associations[1].future).toEqual({meaning:'kept'});expect(result.residuals.some((r:any)=>r.path==='/associations/1/future')).toBe(true);expect(result.residuals.some((r:any)=>r.reason==='conflicting-record-declarations')).toBe(true);
 source.associations[1].future.meaning='changed';expect(result.source.associations[1].future.meaning).toBe('kept');
 expect(()=>migrateCandidateSecurityOntology({...source,version:'0.2.0'},'ontology-2')).toThrow();
});


test('reserved qualifier names remain explicit and target edits cannot corrupt the archive',()=>{
 for(const name of ['constructor','toString','__proto__']){const source:any=securityFixture().resolution.ontology;Object.defineProperty(source.entities[0],name,{enumerable:true,value:{meaning:'retained'}});Object.defineProperty(source.associations[0].endpoints[0],name,{enumerable:true,value:{meaning:'retained'}});const result:any=migrateCandidateSecurityOntology(source,'ontology-2');expect(result.residuals.some((r:any)=>r.path==='/entities/0/'+name)).toBe(true);expect(result.residuals.some((r:any)=>r.path==='/associations/0/endpoints/0/'+name)).toBe(true);expect(result.source.entities[0][name]).toEqual({meaning:'retained'});}
 const result:any=migrateCandidateSecurityOntology(securityFixture().resolution.ontology,'ontology-2');expect(()=>result.target.entities[0].fields[0].protection='protected').toThrow();expect(result.source.entities[0].fields[0].protection).toBe('unprotected');expect(result.target.entities[0].fields).not.toBe(result.source.entities[0].fields);
});


test('ontology migration reissues immutable revision explicitly',()=>{
 const source=securityFixture().resolution.ontology,result:any=migrateCandidateSecurityOntology(source,'ontology-2');expect(result.target.revision).toBe('ontology-2');expect(result.source.revision).toBe('ontology-1');for(const revision of ['',source.revision,{},42])expect(()=>migrateCandidateSecurityOntology(source,revision)).toThrow();
});
