import {test,expect} from 'bun:test';
import {projectRelationshipToTableSpec,verifyRelationshipTableSpecProjection,recoverRelationshipTableSpecIdeal,recoverRelationshipTableSpecNativeSources} from '../../src/core-ideals/relationship-tablespec-projection';
import {classifyTableSpecRelationships,recoverTableSpecRelationshipSource} from '../../src/core-ideals/relationship-tablespec';
import {importTableSpec,exportTableSpec,importTableSpecBundle,exportTableSpecBundle,getTableSpecTable} from '../../src/adapters/tablespec';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {relationshipTableSpecProjectionCases,relationshipTableSpecCase} from '../../scripts/core-ideals/relationship-tablespec-projection-cases';
const archive=(d:any)=>d.extensions['umf.tablespec'].splitFiles?exportTableSpecBundle(d):exportTableSpec(d);
// @covers US-045-AC4
// @covers US-045-AC5
// @covers US-045-AC6
// @covers US-045-AC7
// @covers US-045-AC8
for(const c of relationshipTableSpecProjectionCases())test(c.name+' has qualified projection and recovery',()=>{
 const before=structuredClone(c),r=projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,c.request);
 expect(c).toEqual(before);expect(r.status).toBe(c.expected);expect(r.residuals.length).toBeGreaterThan(0);
 if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.mappings).toEqual([]);return;}
 const native=archive(r.target),imported=typeof native==='string'?importTableSpec(native,{id:'fresh',format:'json'}):importTableSpecBundle(native,{id:'fresh'});
 expect(getTableSpecTable(imported)).toEqual(getTableSpecTable(r.target!));
 for(const format of ['json','yaml'] as const){
  const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;
  expect(recoverRelationshipTableSpecIdeal(saved,imported)).toEqual(c.source);
  expect(recoverRelationshipTableSpecNativeSources(saved,imported)).toEqual({source:archive(c.nativeSource),target:archive(c.nativeTarget)});
  const observed=classifyTableSpecRelationships(imported,{mode:'report',profile:'declared-metadata'});
  const receipt=readJsonValue(writeJsonValue(observed,format),format) as unknown as typeof observed;
  expect(recoverTableSpecRelationshipSource(receipt,receipt.target!)).toEqual(native);
  expect(receipt.target!.modules.every(m=>!m.relationships)).toBe(true);
 }
 const fake=structuredClone(r);fake.mappings[0]!.targetKey='forged';expect(()=>verifyRelationshipTableSpecProjection(fake,imported)).toThrow();
 const mutated=structuredClone(imported);mutated.modules[0]!.elements[0]!.name='changed';expect(()=>verifyRelationshipTableSpecProjection(r,mutated)).toThrow();
});
test('changed author, endpoint component and request accessors reject',()=>{
 const c=relationshipTableSpecCase();const project=()=>projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,c.request);
 c.source.modules[0]!.elements.find(e=>e.id==='Customer.id')!.scalarType='string';expect(project).toThrow();
 const d=relationshipTableSpecCase();d.author.request.name='forged';expect(()=>projectRelationshipToTableSpec(d.source,d.author,d.nativeSource,d.nativeTarget,d.request)).toThrow();
 let reads=0;const e=relationshipTableSpecCase();expect(()=>projectRelationshipToTableSpec(e.source,e.author,e.nativeSource,e.nativeTarget,{...e.request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
});

// @covers US-045-AC5
test('unknown residual retains exactly the value at its qualified path',()=>{
 const c=relationshipTableSpecCase('unknown');
 const r=projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,c.request);
 const residual=r.residuals.find(x=>x.path.endsWith('/future'))!;
 expect(residual.value).toEqual({uninterpreted:true});expect(residual.outcome).toBe('unknown');
});
