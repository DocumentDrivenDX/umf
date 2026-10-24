// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {canonical} from '../../src/compilation/bundle/hash';
import {compileTableDeployment,compileTableDeploymentWithOperations} from '../../src/table-deployment/index';
import {deriveTableGrantEffectRow,renderTableGrantSql} from '../../src/table-deployment/grants';
import {deploymentFixtureSource} from '../unified/table-deployment-fixture';

const configuration={module:'demo',schema:'operations_schema',ownerRole:'operations_owner',personRole:'operations_person',batchRole:'operations_batch',groupRoles:{readers:'operations_readers'}};

describe('internal table deployment operation sidecar',()=>{
 test('records source-site operations without changing public deployment bytes',()=>{
  const text=JSON.stringify(deploymentFixtureSource);
  const publicResult=compileTableDeployment({text,configuration});
  const internalResult=compileTableDeploymentWithOperations({text,configuration});
  expect(publicResult.status).toBe('compiled');
  expect(internalResult.status).toBe('compiled');
  if(publicResult.status!=='compiled'||internalResult.status!=='compiled')return;
  expect(canonical(internalResult.bundle)).toBe(canonical(publicResult.bundle));
  expect(Object.keys(internalResult.bundle).sort()).toEqual(Object.keys(publicResult.bundle).sort());
  expect(internalResult.operations).toHaveLength(publicResult.bundle.steps.length);
  expect(internalResult.operations.map(operation=>operation.stepId)).toEqual(publicResult.bundle.steps.map(step=>step.id));
  for(const [index,operation] of internalResult.operations.entries()){
   const step=publicResult.bundle.steps[index]!;
   expect({kind:operation.kind,sourcePath:operation.sourcePath,transaction:operation.transaction,sql:operation.sql}).toEqual({kind:step.kind,sourcePath:step.sourcePath,transaction:step.transaction,sql:step.sql});
   if(operation.operation==='grant-schema-usage'){
    expect(operation.subject.kind).toBe('schema-grant');
    if(operation.subject.kind==='schema-grant')expect(operation.subject.audiences).toEqual(['person','batch']);
   }else expect(operation.subject.table).toBeTypeOf('string');
  }
  expect(internalResult.operations.filter(operation=>operation.operation==='create-table')).toHaveLength(2);
  expect(internalResult.operations.filter(operation=>operation.operation==='enable-rls')).toHaveLength(2);
  expect(internalResult.operations.filter(operation=>operation.operation==='force-rls')).toHaveLength(2);
  expect(internalResult.operations.some(operation=>operation.operation==='add-foreign-key'&&operation.subject.kind==='foreignKey'&&operation.subject.id==='parent_fk')).toBe(true);
  const create=internalResult.operations.find(operation=>operation.operation==='create-table');
  expect(create?.subject.kind).toBe('table');
  if(create?.subject.kind==='table')expect(create.subject.catalog.keys.length).toBeGreaterThan(0);
  expect(internalResult.operations.filter(operation=>operation.operation==='set-comment').length).toBe(publicResult.bundle.expectedCatalog.comments?.length??0);
  expect(internalResult.operations.at(-1)?.operation).toBe('grant-schema-usage');
 });
});

function completeGrantFixture(includeGenerated:boolean){
 const source=structuredClone(deploymentFixtureSource) as any,module=source.modules[0]!,record=module.elements.find((element:any)=>element.kind==='record'&&element.id==='Note'),table=module.extensions['umf.tables'].tables.find((item:any)=>item.id==='notes');
 const ref=(element:string)=>({module:'demo',element}),addField=(id:string,extra:Record<string,unknown>={})=>{module.elements.push({id,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{},...extra});record.members.push(ref(id));};
 addField('mutableSecond');addField('compositeA');addField('compositeB');addField('immutableValue');
 record.keys.push({id:'alternateComposite',name:'alternateComposite',primary:false,fields:[ref('compositeA'),ref('compositeB')]});
 table.name='notes"雪';
 table.columns.push(
  {field:ref('mutableSecond'),name:'second',nativeType:{kind:'text'}},
  {field:ref('compositeA'),name:'alternate_a',nativeType:{kind:'text'}},
  {field:ref('immutableValue'),name:'immutable_value',nativeType:{kind:'text'},immutable:true},
  {field:ref('compositeB'),name:'alternate_b',nativeType:{kind:'text'}},
 );
 if(includeGenerated){
  module.elements.push({id:'generatedValue',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}});record.members.push(ref('generatedValue'));
  table.columns.push({field:ref('generatedValue'),name:'generated_value',nativeType:{kind:'int4'},generated:{kind:'identity',generation:'always'}});
  table.policy.person.insert={kind:'deny'};
 }
 return source;
}

test('shared grant rows preserve complete source mappings, authored UPDATE order, all-Key exclusion, and quoted SQL',()=>{
 const source=completeGrantFixture(false),table=source.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='notes');
 table.columns.find((column:any)=>column.field.element==='owner').name='owner"λ';
 const result=compileTableDeploymentWithOperations({text:JSON.stringify(source),configuration:{...configuration,schema:'schema"雪',personRole:'person"λ'}});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw new Error(JSON.stringify(result.diagnostics));
 const grants=result.operations.filter(operation=>operation.operation==='grant-table'&&operation.subject.kind==='tableGrant');
 const row=(command:string)=>grants.find(operation=>operation.sourcePath.endsWith('/policy/person/'+command));
 expect(row('select')?.sql).toBe('GRANT SELECT ON TABLE "schema""雪"."notes""雪" TO "person""λ"');
 expect(row('insert')?.sql).toBe('GRANT INSERT ON TABLE "schema""雪"."notes""雪" TO "person""λ"');
 expect(row('delete')?.sql).toBe('GRANT DELETE ON TABLE "schema""雪"."notes""雪" TO "person""λ"');
 expect(row('update')?.sql).toBe('GRANT UPDATE ("owner""λ", "parent_id", "caption", "amount", "second") ON TABLE "schema""雪"."notes""雪" TO "person""λ"');
 if(row('update')?.subject.kind==='tableGrant')expect(row('update')!.subject).toEqual({kind:'tableGrant',table:'notes',role:'person"λ',privilege:'update',columns:['owner"λ','parent_id','caption','amount','second']});
 expect(grants.some(operation=>operation.sourcePath.endsWith('/policy/batch/insert'))).toBe(false);
 expect(result.operations.find(operation=>operation.operation==='revoke-public')?.sql).toBe('REVOKE ALL PRIVILEGES ON TABLE "schema""雪"."notes""雪" FROM PUBLIC');
 expect(result.operations.at(-1)?.sql).toBe('GRANT USAGE ON SCHEMA "schema""雪" TO "person""λ", "operations_batch"');
});

test('generated columns are excluded while insertion remains denied for both audiences',()=>{
 const source=completeGrantFixture(true),table=source.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='notes');
 table.policy.batch.insert={kind:'deny'};
 const result=compileTableDeploymentWithOperations({text:JSON.stringify(source),configuration:{module:'demo',schema:'generated_schema',ownerRole:'owner',personRole:'person',batchRole:'batch',groupRoles:{readers:'readers'}}});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw new Error(JSON.stringify(result.diagnostics));
 const grants=result.operations.filter(operation=>operation.operation==='grant-table'&&operation.subject.kind==='tableGrant');
 const update=grants.find(operation=>operation.sourcePath.endsWith('/policy/person/update'));
 expect(update?.sql).toBe('GRANT UPDATE ("owner", "parent_id", "caption", "amount", "second") ON TABLE "generated_schema"."notes""雪" TO "person"');
 const notesInsert=(role:string)=>grants.some(operation=>operation.subject.kind==='tableGrant'&&operation.subject.table==='notes'&&operation.subject.role===role&&operation.subject.privilege==='insert');
 expect(notesInsert('person')).toBe(false);
 expect(notesInsert('batch')).toBe(false);
 expect(grants.some(operation=>operation.subject.kind==='tableGrant'&&operation.subject.table==='parents'&&operation.subject.role==='person'&&operation.subject.privilege==='insert')).toBe(true);
});

test('large valid comment-rich deployment retains standard bundle admission and copies its bounded private sidecar',()=>{
 const source=completeGrantFixture(false),module=source.modules[0]!;
 for(const tableId of ['notes','parents']){
  const table=module.extensions['umf.tables'].tables.find((item:any)=>item.id===tableId),record=module.elements.find((item:any)=>item.kind==='record'&&item.id===table.record.element);
  for(let index=0;index<1550;index++){
   const id=`${tableId}_comment_${index}`,field={module:'demo',element:id};
   module.elements.push({id,name:id,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',description:`Reviewed deployment comment ${index}: source-owned text retained exactly.`,extensions:{}});
   record.members.push(field);table.columns.push({field,name:`comment_${index}`,nativeType:{kind:'text'}});
  }
 }
 const text=JSON.stringify(source),publicResult=compileTableDeployment({text,configuration}),internalResult=compileTableDeploymentWithOperations({text,configuration});
 expect(publicResult.status).toBe('compiled');expect(internalResult.status).toBe('compiled');
 if(publicResult.status!=='compiled'||internalResult.status!=='compiled')return;
 expect(publicResult.bundle.expectedCatalog.comments).toHaveLength(3100);
 const commentOperations=internalResult.operations.filter(operation=>operation.operation==='set-comment');
 expect(commentOperations).toHaveLength(3100);
 const target=commentOperations[0]!;
 if(target.subject.kind!=='comment')throw new Error('Expected a typed comment operation');
 const original=publicResult.bundle.expectedCatalog.comments![0]!.text;
 target.subject.text='mutated private copy';
 expect(publicResult.bundle.expectedCatalog.comments![0]!.text).toBe(original);
 expect(JSON.parse(text).modules[0]!.elements.some((element:any)=>element.description==='mutated private copy')).toBe(false);
},60000);

test('shared grant SQL renderer refuses malformed row variants instead of coercing them',()=>{
 const base={table:'notes',schema:'s',relation:'t',role:'r',privilege:'update' as const,columns:['owner'],grantOption:false as const};
 expect(renderTableGrantSql(base,'grant')).toBe('GRANT UPDATE ("owner") ON TABLE "s"."t" TO "r"');
 expect(renderTableGrantSql({...base,columns:['owner']},'revoke')).toBe('REVOKE UPDATE ("owner") ON TABLE "s"."t" FROM "r"');
 expect(()=>renderTableGrantSql({...base,columns:[]},'grant')).toThrow('TABLE_GRANT_UPDATE_COLUMNS');
 expect(()=>renderTableGrantSql({...base,grantOption:true as unknown as false},'grant')).toThrow('TABLE_GRANT_ROW');
 expect(()=>renderTableGrantSql({...base,privilege:'select' as const,columns:[]},'grant')).toThrow('TABLE_GRANT_NONUPDATE_COLUMNS');
 expect(()=>renderTableGrantSql({...base,columns:['owner','owner']},'grant')).toThrow('TABLE_GRANT_UPDATE_COLUMNS');
 expect(()=>renderTableGrantSql(base,'invalid' as unknown as 'grant')).toThrow('TABLE_GRANT_DIRECTION');
});

test('shared source derivation rejects an unrelated Record binding and denied policies produce no row',()=>{
 const source=structuredClone(deploymentFixtureSource) as any,module=source.modules[0]!,table=module.extensions['umf.tables'].tables.find((item:any)=>item.id==='notes'),record=module.elements.find((element:any)=>element.kind==='record'&&element.id==='Note');
 expect(()=>deriveTableGrantEffectRow({table,recordModule:'foreign.module',record,schema:configuration.schema,role:configuration.personRole,audience:'person',command:'update'})).toThrow('TABLE_GRANT_RECORD_BINDING');
 expect(()=>deriveTableGrantEffectRow({table,recordModule:'demo',record:{...record,id:'Other'},schema:configuration.schema,role:configuration.personRole,audience:'person',command:'select'})).toThrow('TABLE_GRANT_RECORD_BINDING');
 expect(()=>deriveTableGrantEffectRow({table,recordModule:'demo',record:{...record,id:'Other'},schema:configuration.schema,role:configuration.personRole,audience:'person',command:'update'})).toThrow('TABLE_GRANT_RECORD_BINDING');
 expect(()=>deriveTableGrantEffectRow({table,recordModule:'demo',record,schema:configuration.schema,role:configuration.batchRole,audience:'batch',command:'insert'})).toThrow('TABLE_GRANT_DENIED_POLICY');
});

test('an allowed person UPDATE with no mutable ordinary column retains its located refusal',()=>{
 const source=structuredClone(deploymentFixtureSource) as any,table=source.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='notes');
 for(const column of table.columns)column.immutable=true;
 const result=compileTableDeployment({text:JSON.stringify(source),configuration});
 expect(result.status).toBe('blocked');
 if(result.status==='blocked')expect(result.diagnostics[0]).toMatchObject({code:'TABLE_DEPLOYMENT_UNSUPPORTED',path:'/modules/0/extensions/umf.tables/tables/0/policy/person/update',message:'UPDATE has no mutable ordinary columns'});
});
