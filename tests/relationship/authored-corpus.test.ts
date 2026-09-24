import {expect,test} from 'bun:test';

const corpus=await Bun.file('fixtures/relationship/authored/corpus.json').json();

test('@covers US-045-AC2: keyed authored shape corpus uses exact owned endpoint and target Key IDs',()=>{
 const module=corpus.base.modules[0],elements=new Map(module.elements.map((element:any)=>[element.id,element]));
 const records=module.elements.filter((element:any)=>element.kind==='record');
 expect(records).toHaveLength(9);
 const fieldOwners=new Set<string>();
 for(const record of records){
  expect(record.keys.length).toBeGreaterThan(0);
  for(const member of record.members){
   expect(member.module).toBe(module.id);
   const field=elements.get(member.element) as any;
   expect(field?.kind).toBe('field');expect(field.nullability).toBe('required');expect(field.cardinality).toBe('one');
   expect(fieldOwners.has(member.element)).toBe(false);fieldOwners.add(member.element);
  }
  for(const key of record.keys)for(const field of key.fields)expect(record.members).toContainEqual(field);
 }
 expect(corpus.cases.map((row:any)=>row.id)).toEqual(['one-to-one','owned-one-to-many','many-to-one-alternate-key','many-to-many','heterogeneous-source','self-referential','undirected','reified-association']);
 expect(corpus.cases.map((row:any)=>[row.relationship.sourceMultiplicity,row.relationship.targetMultiplicity])).toEqual([
  [{min:1,max:1},{min:0,max:1}],
  [{min:1,max:1},{min:1,max:'*'}],
  [{min:0,max:'*'},{min:1,max:1}],
  [{min:0,max:'*'},{min:0,max:'*'}],
  [{min:0,max:'*'},{min:1,max:1}],
  [{min:0,max:'*'},{min:0,max:1}],
  [{min:0,max:'*'},{min:0,max:'*'}],
  [{min:0,max:'*'},{min:0,max:'*'}],
 ]);
 for(const row of corpus.cases){
  const relationship=row.relationship;
  expect(relationship.source.length).toBeGreaterThan(0);
  expect(relationship.target.length).toBeGreaterThan(0);
  for(const source of relationship.source)expect((elements.get(source.element) as any)?.kind).toBe('record');
  for(const target of relationship.target){
   const record=elements.get(target.element) as any;
   expect(record?.kind).toBe('record');
   expect(record.keys.some((key:any)=>key.id===target.key)).toBe(true);
  }
 }
 expect(corpus.cases[1].relationship.targetLifecycle).toBe('owned');
 expect(corpus.cases[2].relationship.target[0].key).toBe('account');
 expect(corpus.cases[4].relationship.source).toHaveLength(2);
 expect(corpus.cases[5].relationship.source[0].element).toBe(corpus.cases[5].relationship.target[0].element);
 expect(corpus.cases[6].relationship.directed).toBe(false);
 const association=corpus.cases[7].relationship.associationRecord;
 expect(association).toEqual({module:'sales',element:'Enrollment'});
 expect((elements.get('Enrollment') as any).members).toContainEqual({module:'sales',element:'Enrollment.grade'});
});
