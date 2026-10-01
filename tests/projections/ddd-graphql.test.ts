import {expect,test} from 'bun:test';
import {parse,print,buildASTSchema,validateSchema} from 'graphql';
import {projectDddToGraphql,recoverDddFromGraphql,recoverDddGraphqlNative,verifyDddGraphqlProjection,importGraphqlSchema,exportGraphqlSchema,readJsonValue,writeJsonValue,type Document,type DddGraphqlProjection} from '../../src';
import {graphqlCases} from '../../scripts/projections/ddd-graphql-cases';
const base=()=>graphqlCases()[0]!;
const project=(f=base(),loss:'strict'|'report'='report')=>projectDddToGraphql(f.logical,f.policy,loss);

test('@covers US-049-AC1 @covers US-049-AC2 @covers US-049-AC3 @covers US-049-AC6: complete selected entity and relationship schemas validate',()=>{
  for(const f of graphqlCases()){
    const p=project(f);expect(p.status).toBe('reported');expect(validateSchema(buildASTSchema(parse(p.candidate!)))).toEqual([]);
    expect(p.candidate).toContain('id: Int!');expect(p.candidate).toContain('tags: [String!]');expect(p.logical).toEqual(f.logical);
    expect(p.mappings.some(x=>x.target==='Order.products')).toBe(true);expect(p.residuals.some(x=>x.path.endsWith('/targetMultiplicity'))).toBe(true);
  }
  expect(project().candidate).toContain('customer: Customer');expect(project().candidate).toContain('orders: [Order]');
  expect(project(graphqlCases().find(x=>x.id==='no-inverse')!).candidate).not.toContain('orders:');
  expect(project(graphqlCases().find(x=>x.id==='heterogeneous')!).candidate).toContain('union CustomerOrProduct = Customer | Product');
});

test('@covers US-049-AC4 @covers US-049-AC5 @covers US-049-AC9: strict emits no partial SDL and all obligations remain source-linked',()=>{
  for(const f of graphqlCases()){const p=project(f,'strict');expect(p.status).toBe('blocked');expect(p.candidate).toBeUndefined();expect(p.targetArchive).toBeUndefined();}
  const p=project();expect(p.diagnostics).toHaveLength(p.residuals.length);
  for(const suffix of ['/target','/targetLifecycle','/sourceMultiplicity','/targetMultiplicity','/directed','/name','/associationRecord','/identity','/aggregate'])expect(p.residuals.some(x=>x.path.endsWith(suffix))).toBe(true);
  expect(p.residuals.some(x=>x.path.includes('/invariants/'))).toBe(true);
  expect(p.residuals.some(x=>x.path==='/extensions/future')).toBe(true);
  expect(p.residuals.some(x=>x.reason.includes('Core Record membership'))).toBe(true);
});

test('@covers US-049-AC7 @covers US-049-AC8 @covers US-049-AC10: fresh native imports and JSON/YAML receipts recover exact authored source',()=>{
  for(const f of graphqlCases())for(const format of ['json','yaml'] as const){
    const p=project(f);const target=readJsonValue(writeJsonValue(importGraphqlSchema(p.candidate!,{id:'independent-native',mode:'schema'}),format),format) as unknown as Document;
    const report=readJsonValue(writeJsonValue(p,format),format) as unknown as DddGraphqlProjection;
    expect(recoverDddFromGraphql(report,target)).toEqual(f.logical);expect(recoverDddGraphqlNative(report,target)).toBe(p.candidate!);
    expect(exportGraphqlSchema(target)).toBe(p.candidate!);expect(target.modules.some(m=>Object.hasOwn(m,'relationships'))).toBe(false);
  }
  const native='# original comment\nscalar Unknown @specifiedBy(url: "https://example.invalid/spec")\ntype Query { value: Unknown }\n';
  const imported=importGraphqlSchema(native,{id:'native',mode:'schema'});imported.vocabularies.future={version:'1.0.0'};imported.extensions={future:{unclaimed:['9007199254740993']}};
  for(const format of ['json','yaml'] as const){const decoded=readJsonValue(writeJsonValue(imported,format),format) as unknown as Document;expect(decoded).toEqual(imported);expect(exportGraphqlSchema(decoded)).toBe(native);}
},30000);

test('@covers US-049-AC7 @covers US-049-AC10: forged, stale, incomplete and getter-bearing reports refuse',()=>{
  const p=project();
  const forged=structuredClone(p);forged.residuals.pop();expect(()=>recoverDddFromGraphql(forged,p.targetArchive!)).toThrow('Forged or stale');
  const stale=importGraphqlSchema(p.candidate!.replace('customer: Customer','customer: String'),{id:'stale',mode:'schema'});expect(()=>recoverDddFromGraphql(p,stale)).toThrow('Forged or stale');
  const altered=structuredClone(p);altered.logical.extensions!.future={changed:true};expect(()=>verifyDddGraphqlProjection(altered)).toThrow('Forged or stale');
  let reads=0;const accessor={...p};Object.defineProperty(accessor,'policy',{enumerable:true,get(){reads++;return p.policy;}});expect(()=>verifyDddGraphqlProjection(accessor as DddGraphqlProjection)).toThrow('accessors');expect(reads).toBe(0);
  expect(()=>recoverDddFromGraphql(project(base(),'strict'),p.targetArchive!)).toThrow();
});

test('@covers US-049-AC4 @covers US-049-AC5: missing roots, collisions, ambiguous endpoints and uninterpreted semantics block',()=>{
  const mutations:((f:ReturnType<typeof base>)=>void)[]=[
    f=>{delete (f.policy as any).root;},f=>{f.policy.fields.pop();},f=>{f.policy.relationships[0]!.forwardName='__reserved';},
    f=>{f.policy.relationships[0]!.forwardName='id';},f=>{f.policy.endpoints[0]!.record.element='missing';},
    f=>{f.policy.endpoints.push(structuredClone(f.policy.endpoints[0]!));},f=>{f.policy.relationships.pop();},
    f=>{delete f.policy.relationships[0]!.inverseName;},f=>{f.policy.relationships[1]!.inverseName='invented';},
    f=>{(f.logical.modules[0]!.relationships as any[])[0].directed=false;},
    f=>{(f.logical.modules[0]!.relationships as any[])[0].futureMeaning={unknown:true};},
    f=>{f.policy.fields[0]!.coreField!.element='missing';},f=>{(f.policy as any).futurePolicy=true;},
    f=>{f.policy.relationships[0]!.forwardUnion='Unexpected';},
  ];
  for(const mutate of mutations){const f=base();mutate(f);expect(()=>project(f)).toThrow();}
  const f=graphqlCases().find(x=>x.id==='heterogeneous')!;delete f.policy.relationships[0]!.forwardUnion;expect(()=>project(f)).toThrow('explicit union');
});

test('@covers US-049-AC10: projection recovery composes with collision-preserving migration and rollback',async()=>{
  const {upgradeRelationshipEnvelope,rollbackRelationshipEnvelope}=await import('../../src');
  const f=base(),legacy=structuredClone(f.logical);legacy.umf='0.6.0';legacy.modules[0]!.relationships={futureLegacy:['opaque',1]};
  const upgrade=upgradeRelationshipEnvelope(legacy);
  const p=project(f);const restored=recoverDddFromGraphql(p,importGraphqlSchema(p.candidate!,{id:'fresh',mode:'schema'}));
  const rollback=rollbackRelationshipEnvelope(upgrade,restored as any);
  expect(rollback.target).toEqual(legacy);expect(rollback.source as unknown as Document).toEqual(f.logical);
  expect(rollback.receipt.residuals[0]!.value).toEqual({futureLegacy:['opaque',1]});
});


test('@covers US-049-AC1 @covers US-049-AC6: generated shared authored graph matches independent expected SDL',async()=>{
 const f=graphqlCases().find(x=>x.id==='shared-authored-graph')!;
 const expected=await Bun.file('fixtures/projections/ddd-authored-relationships/expected-relationships.graphql').text();
 expect(print(parse(project(f).candidate!))).toBe(print(parse(expected)));
});

test('@covers US-049-AC4 @covers US-049-AC7: complete result schema rejects partial targets and missing policy/source contracts',async()=>{
  const {createValidator}=await import('../../src/validation/schema');
  const {dddGraphqlProjectionSchema}=await import('../../src');
  const legacy=await Bun.file('spec/core/schema.json').json(),current=await Bun.file('spec/core/relationship-document.schema.json').json();
  const validator=createValidator(false);validator.addSchema(legacy);validator.addSchema(current);const check=validator.compile(dddGraphqlProjectionSchema);
  const p=project();expect(check(p)).toBe(true);expect(check(project(base(),'strict'))).toBe(true);
  const bad:((r:any)=>void)[]=[r=>delete r.sourceVersions,r=>delete r.policy.endpoints,r=>delete r.policy.fields[0].coreField,r=>delete r.policy.relationships[0].id,r=>delete r.targetArchive,r=>r.status='blocked',r=>r.policy.relationships[0].extra='unknown',r=>r.logical.umf='0.6.0'];
  for(const mutate of bad){const r=structuredClone(p);mutate(r);expect(check(r)).toBe(false);}
});

test('@covers US-049-AC4: explicit names reject trailing line terminators instead of parser normalization',async()=>{
 const {projectDddEntitiesToGraphql}=await import('../../src');
 const older=await Bun.file('fixtures/projections/ddd-graphql-core-fields/case.json').json();
 for(const ending of ['\n','\r','\u2028','\u2029']){
  const f=base();f.policy.relationships[0]!.forwardName+=''+ending;expect(()=>project(f)).toThrow();
  const p=structuredClone(older.policy);p.entities[0].name+=ending;expect(()=>projectDddEntitiesToGraphql(older.logical,p,'report')).toThrow('entity name');
 }
});
