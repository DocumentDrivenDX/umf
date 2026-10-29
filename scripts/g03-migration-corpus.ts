// SPDX-License-Identifier: MIT OR Apache-2.0
/** Cross-runtime G03 selector and plan corpus. Historical corpus stays frozen. */
import fixture from '../tests/binding/fixtures/table-lifecycle-note.json';
import {compileTableDeployment,type TableDeploymentBundle} from '../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges,verifyTableMigration} from '../src/table-migration';
import {hashCanonical} from '../src/compilation/bundle/hash';
import '../scripts/codegen/entry';

const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const selector={version:'umf.table-migration-discovery/0.2'} as const;
const literal=(value:unknown)=>({kind:'literal',value});
const source=(value:unknown, present:boolean, nullable=false)=>{
 const doc=structuredClone(fixture) as any;
 const field=doc.modules[0]!.elements.find((item:any)=>item.id==='owner')!;
 const column=doc.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.field.element==='owner')!;
 if(present)column.default=value;
 if(nullable){field.nullability='absent-allowed';}
 return doc;
};
function bundle(doc:any,format:'json'|'yaml'='json'):TableDeploymentBundle{
 const result=compileTableDeployment({text:JSON.stringify(doc),configuration,format});
 if(result.status!=='compiled')throw Error('G03 corpus deployment failed: '+JSON.stringify(result.diagnostics));
 return result.bundle;
}
const transitions=[
 {name:'set-literal',old:undefined,oldPresent:false,next:literal({string:'future value'}),nextPresent:true},
 {name:'replace-literal',old:literal({string:'old value'}),oldPresent:true,next:literal({string:'future value'}),nextPresent:true},
 {name:'drop-literal',old:literal({string:'old value'}),oldPresent:true,next:undefined,nextPresent:false},
 {name:'absent-to-null',old:undefined,oldPresent:false,next:literal(null),nextPresent:true,nullable:true},
];
const discovery:any[]=[],plans:any[]=[];
for(const item of transitions){
 const previous=bundle(source(item.old,item.oldPresent,item.nullable??false));
 const next=bundle(source(item.next,item.nextPresent,item.nullable??false));
 const legacy=discoverTableMigrationChanges(previous,next);
 const selected=discoverTableMigrationChanges(previous,next,selector);
 discovery.push({name:item.name+'-legacy',previous,next,expected:legacy});
 discovery.push({name:item.name+'-selected',previous,next,options:selector,expected:selected});
 const marker=selected.find(candidate=>candidate.kind==='change-default');
 if(!marker)throw Error('Selected discovery omitted G03 candidate: '+item.name);
 const {oldValue:_old,newValue:_new,...reviewed}=marker;
 const request={id:'g03-corpus-'+item.name,predecessor:{id:'g03-corpus-prior',digest:'a'.repeat(64)},previous,next,
  options:{version:'umf.table-migration-options/0.5' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[reviewed]}};
 const result=compileTableMigration(request);
 plans.push({name:item.name,request,expected:result});
}
// Numeric source spellings remain separately source-bound while producing the same typed DDL.
const numeric=(token:string)=>{
 const doc=source(undefined,false) as any,module=doc.modules[0]!,record=module.elements.find((item:any)=>item.id==='Note')!,table=module.extensions['umf.tables'].tables[0]!;
 const field={id:'measure',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'absent-allowed',facets:{precision:8,scale:2},extensions:{}};
 module.elements.push(field);record.members.push({module:'demo',element:'measure'});
 table.columns.push({field:{module:'demo',element:'measure'},name:'measure',nativeType:{kind:'numeric',precision:8,scale:2},default:{kind:'literal',value:{decimalToken:token}}});
 return doc;
};
const numericOld=bundle(numeric('0'));
for(const token of ['1.0','1e0']){
 const next=bundle(numeric(token)),selected=discoverTableMigrationChanges(numericOld,next,selector),marker=selected.find(candidate=>candidate.kind==='change-default');
 if(!marker)throw Error('Numeric source spelling omitted G03 candidate: '+token);
 discovery.push({name:'numeric-'+token+'-selected',previous:numericOld,next,options:selector,expected:selected});
 const {oldValue:_old,newValue:_new,...reviewed}=marker;
 const request={id:'g03-corpus-numeric-'+token,predecessor:{id:'g03-corpus-prior',digest:'b'.repeat(64)},previous:numericOld,next,options:{version:'umf.table-migration-options/0.5' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[reviewed]}};
 plans.push({name:'numeric-'+token,request,expected:compileTableMigration(request)});
}
// Explicit selector errors and selected-profile source refusal are part of the portable refusal corpus.
const reference=plans[0]!;
for(const [name,options] of [['null-options-omission',null],['wrong-selector',{version:'umf.table-migration-discovery/0.1'}],['unknown-selector-member',{version:'umf.table-migration-discovery/0.2',extra:true}]] as const){
 if(options===null){discovery.push({name,previous:reference.request.previous,next:reference.request.next,options:null,expected:discoverTableMigrationChanges(reference.request.previous,reference.request.next)});continue;}
 try {discoverTableMigrationChanges(reference.request.previous,reference.request.next,options as any);throw Error('Selector control unexpectedly accepted: '+name);}
 catch(error){const e=error as Error;if(e.message==='Selector control unexpectedly accepted: '+name)throw e;discovery.push({name,previous:reference.request.previous,next:reference.request.next,options,expectedError:{code:'MIGRATION_CHANGES_FAILED',message:e.message}});}
}
const rawNullRequest={previous:reference.request.previous,next:reference.request.next,options:null};
const rawNullResponse=JSON.parse((globalThis as any).__umf_table_migration_changes(JSON.stringify(rawNullRequest)));
if(rawNullResponse.ok!==false)throw Error('Raw-wire null selector unexpectedly accepted');
discovery.push({name:'raw-wire-null-selector-refuses',rawWireRequest:rawNullRequest,expectedError:rawNullResponse.error});
const yamlPrevious=bundle(source(undefined,false),'yaml');
const yamlNext=bundle(source(literal({string:'future value'}),true),'yaml');
try {
 const yamlSelected=discoverTableMigrationChanges(yamlPrevious,yamlNext,selector);
 throw Error('Selected YAML discovery unexpectedly accepted: '+JSON.stringify(yamlSelected));
}catch(error){
 const e=error as Error&{code?:string;path?:string};
 if(e.message.startsWith('Selected YAML discovery unexpectedly accepted:'))throw e;
 discovery.push({name:'selected-yaml-discovery-refuses',previous:yamlPrevious,next:yamlNext,options:selector,
  expectedError:{code:e.code??'MIGRATION_CHANGES_FAILED',message:e.message,...(e.path?{path:e.path}:{})}});
}
const jsonPrevious=bundle(source(undefined,false));
const nextYaml=bundle(source(literal({string:'future value'}),true),'yaml');
try {
 const value=discoverTableMigrationChanges(jsonPrevious,nextYaml,selector);
 throw Error('Selected next-side YAML discovery unexpectedly accepted: '+JSON.stringify(value));
}catch(error){
 const e=error as Error&{code?:string;path?:string};
 if(e.message.startsWith('Selected next-side YAML discovery unexpectedly accepted:'))throw e;
 discovery.push({name:'selected-next-yaml-discovery-refuses',previous:jsonPrevious,next:nextYaml,options:selector,
  expectedError:{code:e.code??'MIGRATION_CHANGES_FAILED',message:e.message,...(e.path?{path:e.path}:{})}});
}
const yamlRequest={id:'g03-corpus-yaml-refusal',predecessor:{id:'g03-corpus-prior',digest:'c'.repeat(64)},previous:yamlPrevious,next:yamlNext,
 options:{version:'umf.table-migration-options/0.5' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:plans[0]!.request.options.reviewedChanges}};
plans.push({name:'selected-yaml-plan-refuses',request:yamlRequest,expected:compileTableMigration(yamlRequest)});
for(const item of plans){
 const result=item.expected as ReturnType<typeof compileTableMigration>;
 if(result.status!=='compiled')continue;
 const verified=verifyTableMigration(result.plan);
 if(JSON.stringify(verified)!==JSON.stringify(result.plan))throw Error('TypeScript plan verification changed the canonical plan: '+item.name);
 if(item.name!=='set-literal')continue;
 for(const [mutation,change] of [
  ['operation',(plan:any)=>{plan.steps[0].operation='drop-default';}],
  ['phase-target',(plan:any)=>{plan.steps[0].phaseTarget.field.element='id';}],
  ['sql',(plan:any)=>{plan.steps[0].sql+=' /* forged */';}],
 ] as const){
  const tampered=structuredClone(result.plan) as any;change(tampered);delete tampered.digest;tampered.digest=hashCanonical(tampered);
  try{verifyTableMigration(tampered);throw Error('TypeScript verifier unexpectedly accepted tamper: '+mutation);}
  catch(error){const e=error as Error&{code?:string;path?:string};if(e.message==='TypeScript verifier unexpectedly accepted tamper: '+mutation)throw e;
   item.tamper??=[];item.tamper.push({mutation,plan:tampered,expectedError:{code:e.code??'MIGRATION_INVALID',message:e.message,...(e.path?{path:e.path}:{})}});
  }
 }
}
const out={profile:'umf.codegen-g03-migration-corpus/0.1',discovery,plans};
await Bun.write(process.argv[2]??'/private/tmp/umf-g03-migration-corpus.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({discovery:discovery.length,plans:plans.length,refusals:discovery.filter(item=>item.expectedError).length}));
