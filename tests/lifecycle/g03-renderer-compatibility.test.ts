// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment} from '../../src/table-deployment';
import {columnDefinitionSql} from '../../src/table-deployment/sql';
import {compileTableMigration,discoverTableMigrationChanges} from '../../src/table-migration';
import fixture from '../binding/fixtures/table-lifecycle-note.json';

const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const ref=(element:string)=>({module:'demo',element});
function bundle(document:any){
 const result=compileTableDeployment({text:JSON.stringify(document),configuration});
 if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 return result.bundle;
}
function source({append=false,operation=true,existingOptional=false,futureDefault=false}:{append?:boolean;operation?:boolean;existingOptional?:boolean;futureDefault?:boolean}={}){
 const document=structuredClone(fixture) as any,module=document.modules[0]!,payload=module.extensions['umf.tables'],table=payload.tables[0]!;
 if(append||existingOptional){
  module.elements.push({id:'summary',kind:'field',scalarType:'string',cardinality:'one',nullability:append?'required':'absent-allowed',...(append?{facets:{length:{min:1,max:100,unit:'unicode-scalar'}}}:{}),extensions:{}});
  module.elements.find((item:any)=>item.id==='Note')!.members.push(ref('summary'));
  table.columns.push({field:ref('summary'),name:'summary',nativeType:{kind:'text'},...(futureDefault?{default:{kind:'literal',value:{string:'future'}}}:{})});
 }
 if(operation)payload.commands.push({version:'umf.table-operation/0.2',id:'derive_summary',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:ref('summary')},values:[{field:ref('summary'),value:{kind:'rowExpression',expression:{op:'concat',args:[{op:'field',field:ref('owner')},{op:'literal',value:{string:' / '}},{op:'field',field:ref('id')}]}}}],returning:[],maxRows:100}});
 return document;
}
function g01Plan(){
 const previous=bundle(source({existingOptional:true,futureDefault:true,operation:false}));
 const nextDocument=source({existingOptional:true,futureDefault:true,operation:false});
 nextDocument.modules[0]!.elements.find((item:any)=>item.id==='summary')!.nullability='required';
 nextDocument.modules[0]!.extensions['umf.tables'].commands.push({version:'umf.table-operation/0.1',id:'fill_summary',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:ref('summary')},values:[{field:ref('summary'),value:{kind:'literal',value:{string:'filled'}}}],returning:[],maxRows:100}});
 const next=bundle(nextDocument),candidate=discoverTableMigrationChanges(previous,next).find(item=>item.kind==='tighten-not-null');
 if(!candidate)throw Error('Missing G01 tightening marker');
 const {oldValue:_old,newValue:_new,...marker}=candidate;
 return compileTableMigration({id:'g01-fill-002',predecessor:{id:'g01-fill-001',digest:'a'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.3',backfills:[{table:'notes',column:ref('summary'),operation:'fill_summary',scopedRows:true}],concurrentIndexes:[],reviewedChanges:[marker],validations:[]}});
}
function g02Plan(){
 const previous=bundle(source({operation:false})),next=bundle(source({append:true,futureDefault:true}));
 return compileTableMigration({id:'g02-append-002',predecessor:{id:'g02-initial-001',digest:'a'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.4',backfills:[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true}],concurrentIndexes:[],reviewedChanges:[],validations:[]}});
}

test('typed literal, clock and UUID default rendering remains byte-stable',()=>{
 const cases:[unknown,string,string][]=[
  [null,'text','"value" pg_catalog."text" COLLATE pg_catalog."C" DEFAULT NULL'],
  [{boolean:true},'boolean','"value" pg_catalog."bool" DEFAULT TRUE'],
  [{boolean:false},'boolean','"value" pg_catalog."bool" DEFAULT FALSE'],
  [{string:"a'\\b é"},'text',`"value" pg_catalog."text" COLLATE pg_catalog."C" DEFAULT (E'a''\\\\b é'::pg_catalog.text COLLATE pg_catalog."C")`],
  [{integerToken:'12345678901234567890'},'numeric',`"value" pg_catalog."numeric"(38,2) DEFAULT E'1234567890123456789e1'::pg_catalog.numeric`],
  [{decimalToken:'-12.3400e2'},'numeric',`"value" pg_catalog."numeric"(38,2) DEFAULT E'-1234'::pg_catalog.numeric`],
  [{uuid:'00000000-0000-4000-8000-000000000001'},'uuid',`"value" pg_catalog."uuid" DEFAULT E'00000000-0000-4000-8000-000000000001'::pg_catalog.uuid`],
  [{date:'2024-02-29'},'date',`"value" pg_catalog."date" DEFAULT E'2024-02-29'::pg_catalog.date`],
  [{timestamp:'2024-01-02T03:04:05Z'},'timestamptz',`"value" pg_catalog."timestamptz" DEFAULT E'2024-01-02T03:04:05.000000Z'::pg_catalog.timestamptz`],
  [{binaryHex:'00ff'},'bytea',`"value" pg_catalog."bytea" DEFAULT pg_catalog.decode(E'00ff','hex')`],
  [{bits128Hex:'00000000000000000000000000000001'},'bytea',`"value" pg_catalog."bytea" DEFAULT pg_catalog.decode(E'00000000000000000000000000000001','hex')`],
 ];
 for(const [value,kind,expected] of cases)expect(columnDefinitionSql({name:'value',nativeType:kind==='numeric'?{kind,precision:38,scale:2}:{kind},default:{kind:'literal',value}} as any,true)).toBe(expected);
 expect(columnDefinitionSql({name:'clock',nativeType:{kind:'timestamptz'},default:{kind:'currentTimestamp'}} as any,true)).toBe('"clock" pg_catalog."timestamptz" DEFAULT CURRENT_TIMESTAMP');
 expect(columnDefinitionSql({name:'id',nativeType:{kind:'uuid'},default:{kind:'randomUuid'}} as any,true)).toBe('"id" pg_catalog."uuid" DEFAULT pg_catalog.gen_random_uuid()');
 expect(()=>columnDefinitionSql({name:'bad',nativeType:{kind:'text'},default:{kind:'literal',value:{string:'nul\0'}}} as any,true)).toThrow();
});

test('historical G01 existing-default fill/tighten plan remains byte-identical',()=>{
 const result=g01Plan();
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(result.plan.digest).toBe('e6610e1f6ef59395355e2a337103d5e8ef33afa3258778dbc30d083e6601b5b8');
 expect(result.plan.previous?.bundleDigest).toBe('c95d9b9035a3859eb2933d103317cb4cce09c3686732b17f7629781a89c86cf3');
 expect(result.plan.next.bundleDigest).toBe('c662960fe7855fcd95d0390fca50e2df04156a7429f60d409c7a9fd554b3e510');
 expect(result.plan.next.expectedCatalog.columns.find(column=>column.name==='summary')?.definitionSql).toBe('"summary" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL DEFAULT (E\'future\'::pg_catalog.text COLLATE pg_catalog."C")');
 expect(result.plan.steps.map(step=>step.sql)).toEqual(['','ALTER TABLE "plugin_demo"."notes" ALTER COLUMN "summary" SET NOT NULL']);
});

test('historical G02 append/fill/default/tighten plan remains byte-identical',()=>{
 const result=g02Plan();
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(result.plan.digest).toBe('dfdf88b70b80a228c381fe4ddf8db9233e2c099dc4de6a7bebcdbf4307ef65ae');
 expect(result.plan.previous?.bundleDigest).toBe('b608b963d05fbfb23fac202e76e3778d3c42ab689fb513aced2dbaf7d307bd45');
 expect(result.plan.next.bundleDigest).toBe('bbc76942ebe862a021f08a7f51e20198d1818839556b8351c4db3339ab09bf71');
 expect(result.plan.next.expectedCatalog.columns.find(column=>column.name==='summary')?.definitionSql).toBe('"summary" pg_catalog."text" COLLATE pg_catalog."C" NOT NULL DEFAULT (E\'future\'::pg_catalog.text COLLATE pg_catalog."C")');
 expect(result.plan.steps.map(step=>step.sql)).toEqual([
  'ALTER TABLE "plugin_demo"."notes" ADD COLUMN "summary" pg_catalog."text" COLLATE pg_catalog."C"',
  'ALTER TABLE "plugin_demo"."notes" ADD CONSTRAINT "umf_d_ce482e95ca77b32011777081ad263ca5" CHECK (pg_catalog.char_length("summary") >= 1 AND pg_catalog.char_length("summary") <= 100)',
  '',
  'ALTER TABLE "plugin_demo"."notes" ALTER COLUMN "summary" SET DEFAULT (E\'future\'::pg_catalog.text COLLATE pg_catalog."C")',
  'ALTER TABLE "plugin_demo"."notes" ALTER COLUMN "summary" SET NOT NULL',
  'REVOKE UPDATE ("owner") ON TABLE "plugin_demo"."notes" FROM "plugin_person"',
  'GRANT UPDATE ("owner", "summary") ON TABLE "plugin_demo"."notes" TO "plugin_person"',
 ]);
});
