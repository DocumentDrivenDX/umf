// SPDX-License-Identifier: MIT OR Apache-2.0
import {legalSource,evolvedLegalSource,indexedLegalSource,moduleId} from '../tests/lifecycle/legal-fixture';
import {chromium} from 'playwright';
import {createHash,randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectTableLifecycle} from '../src/extensions/tables';
import {generatePythonClient} from '../src/access';
import {compileTableDeployment} from '../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges} from '../src/table-migration';
import {normalizeRowScope} from '../src/table-authoring/row-scope';
import {appendedTableSource,indexedTableSource} from '../tests/unified/table-migration-fixture';
import {tableOperationSource} from '../tests/unified/table-operation-fixture';
import {temporalSource} from '../tests/unified/table-temporal-fixture';
import {snapshotSource} from '../tests/unified/table-snapshot-fixture';
import {relatedSource} from '../tests/unified/table-related-fixture';
import {domainSource} from '../tests/unified/table-domain-fixture';
import {legalDomainAuthoringSource} from '../tests/unified/legal-domain-authoring-fixture';
import fixture from '../tests/binding/fixtures/table-lifecycle-note.json';
import historicalV02NullBackfill from '../tests/lifecycle/fixtures/g01-historical-v0.2-null-backfill.json';
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',minify:true});
if(!built.success)throw new Error('Table lifecycle browser build failed: '+built.logs.join('\n'));
const bundle=await built.outputs[0]!.text(),expected=JSON.stringify(inspectTableLifecycle(fixture));
const operationSource=tableOperationSource(),operationExpected=JSON.stringify(inspectTableLifecycle(operationSource));
const operationClient=generatePythonClient({text:JSON.stringify(operationSource),package:'operation_demo'});
const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{}};
const temporal=temporalSource();
temporal.modules[0].extensions['umf.tables'].tables[0].columns.find((c:any)=>c.name==='at').default={kind:'literal',value:{timestamp:'2026-01-01T00:30:00.123456000+01:00'}};
const temporalExpected={deployment:compileTableDeployment({text:JSON.stringify(temporal),configuration}),client:generatePythonClient({text:JSON.stringify(temporal),package:'temporal_demo'})};
const domains=domainSource();
const domainExpected={deployment:compileTableDeployment({text:JSON.stringify(domains),configuration}),client:generatePythonClient({text:JSON.stringify(domains),package:'domain_demo'})};
const legalDomains=legalDomainAuthoringSource(),legalDomainConfiguration={...configuration,module:'legal_lifecycle',schema:'legal_domain_demo',groupRoles:{billing_admin:'legal_domain_billing'}};
const legalDomainExpected={deployment:compileTableDeployment({text:JSON.stringify(legalDomains),configuration:legalDomainConfiguration}),client:generatePythonClient({text:JSON.stringify(legalDomains),package:'legal_domain_demo'})};
const deployment=JSON.stringify(compileTableDeployment({text:JSON.stringify(fixture),configuration}));
const migration=JSON.stringify(compileTableMigration({id:'001',predecessor:null,previous:null,next:JSON.parse(deployment).bundle}));
const nextDeployment=compileTableDeployment({text:JSON.stringify(appendedTableSource()),configuration});
if(nextDeployment.status!=='compiled')throw Error(JSON.stringify(nextDeployment));
const forwardRequest={id:'002',predecessor:{id:'001',digest:JSON.parse(migration).plan.digest},previous:JSON.parse(deployment).bundle,next:nextDeployment.bundle};
const forward=JSON.stringify(compileTableMigration(forwardRequest));
function deployed(source:any){const result=compileTableDeployment({text:JSON.stringify(source),configuration});if(result.status!=='compiled')throw Error(JSON.stringify(result));return result.bundle;}
const g01Source=(withFill=true)=>{const doc=structuredClone(fixture) as any,module=doc.modules[0]!,table=module.extensions['umf.tables'].tables[0]!;module.elements.push({id:'summary',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});module.elements.find((element:any)=>element.id==='Note')!.members.push({module:'demo',element:'summary'});table.columns.push({field:{module:'demo',element:'summary'},name:'summary',nativeType:{kind:'text'}});if(withFill)module.extensions['umf.tables'].commands.push({version:'umf.table-operation/0.1',id:'fill_summary',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:{module:'demo',element:'summary'}},values:[{field:{module:'demo',element:'summary'},value:{kind:'literal',value:{string:'filled'}}}],returning:[],maxRows:100}});return doc;};
const g01Previous=deployed(g01Source(false)),g01NextSource=g01Source();g01NextSource.modules[0]!.elements.find((element:any)=>element.id==='summary')!.nullability='required';const g01Next=deployed(g01NextSource),g01Candidate=discoverTableMigrationChanges(g01Previous,g01Next).find(item=>item.kind==='tighten-not-null');
if(!g01Candidate)throw new Error('G01 review marker candidate missing');
const {oldValue:_g01Old,newValue:_g01New,...g01Marker}=g01Candidate;
const g01Request={id:'g01-002',predecessor:{id:'g01-001',digest:'a'.repeat(64)},previous:g01Previous,next:g01Next,options:{version:'umf.table-migration-options/0.3' as const,backfills:[{table:'notes',column:{module:'demo',element:'summary'},operation:'fill_summary',scopedRows:true as const}],concurrentIndexes:[],reviewedChanges:[g01Marker],validations:[]}};
const g01Expected=compileTableMigration(g01Request);
// Reuse the native G01 fixture builder for the future-default transition so
// browser parity exercises the same typed source rather than a second parser.
const g01FixturePath=join(tmpdir(),`umf-g01-browser-fixture-${randomUUID()}.json`);
const g01FixtureBuild=Bun.spawnSync({cmd:['bun','tests/lifecycle/g01-native-fixture.ts',g01FixturePath],stdout:'pipe',stderr:'pipe'});
if(g01FixtureBuild.exitCode!==0)throw new Error('G01 browser fixture build failed: '+g01FixtureBuild.stderr.toString());
const g01Fixture=await Bun.file(g01FixturePath).json() as any;
await Bun.file(g01FixturePath).delete();
const g01FutureDefaultCase=g01Fixture.cases.find((item:any)=>item.id==='future-default-preserved');
if(!g01FutureDefaultCase)throw new Error('G01 future-default fixture case missing');
const g01FutureSource=(source:any)=>JSON.parse(source.utf8);
const g01FutureRequest={id:g01FutureDefaultCase.plan.id,predecessor:g01FutureDefaultCase.plan.predecessor,previous:deployed(g01FutureSource(g01FutureDefaultCase.initialSource)),next:deployed(g01FutureSource(g01FutureDefaultCase.source)),options:g01FutureDefaultCase.plan.options};
const g01FutureExpected=compileTableMigration(g01FutureRequest);
const retiredSource=structuredClone(operationSource);retiredSource.modules[0]!.extensions['umf.tables'].commands=[];
const seedSource:any=structuredClone(fixture);seedSource.modules[0].extensions['umf.tables'].seedSets=[{id:'bootstrap',conflict:'ignore',rows:[{table:'notes',values:[{field:{module:'demo',element:'id'},value:{string:'seed'}},{field:{module:'demo',element:'owner'},value:{string:'seed-person'}}]}]}];
const evolutions=[
 {id:'index-002',predecessor:{id:'001',digest:JSON.parse(migration).plan.digest},previous:JSON.parse(deployment).bundle,next:deployed(indexedTableSource())},
 {id:'commands-002',predecessor:{id:'commands-001',digest:'a'.repeat(64)},previous:deployed(operationSource),next:deployed(retiredSource)},
 {id:'seeds-002',predecessor:{id:'001',digest:JSON.parse(migration).plan.digest},previous:JSON.parse(deployment).bundle,next:deployed(seedSource)},
].map(request=>({request,expected:compileTableMigration(request)}));
const legalConfiguration={module:moduleId,schema:'legal_demo',ownerRole:'legal_owner',personRole:'legal_person',batchRole:'legal_batch',groupRoles:{billing_admin:'legal_billing_admin'}};
const reviewOriginal=legalSource();
const reviewDeployment=(source:any)=>{const result=compileTableDeployment({text:JSON.stringify(source),configuration:legalConfiguration});if(result.status!=='compiled')throw Error(JSON.stringify(result));return result.bundle;};
const reviewDrop=structuredClone(reviewOriginal),reviewDropModule=reviewDrop.modules[0]!,reviewDropPayload=reviewDropModule.extensions['umf.tables'];
reviewDropPayload.tables.find((table:any)=>table.id==='matters')!.columns=reviewDropPayload.tables.find((table:any)=>table.id==='matters')!.columns.filter((column:any)=>column.field.element!=='matters__court');
reviewDropModule.elements.find((element:any)=>element.id==='matters')!.members=reviewDropModule.elements.find((element:any)=>element.id==='matters')!.members.filter((field:any)=>field.element!=='matters__court');
reviewDropPayload.commands.find((command:any)=>command.id==='read_matters')!.body.fields=reviewDropPayload.commands.find((command:any)=>command.id==='read_matters')!.body.fields.filter((field:any)=>field.element!=='matters__court');
for(const set of reviewDropPayload.seedSets)for(const row of set.rows)if(row.table==='matters')row.values=row.values.filter((value:any)=>value.field.element!=='matters__court');
const reviewWiden=structuredClone(reviewOriginal),reviewWidenModule=reviewWiden.modules[0]!,reviewRate=reviewWidenModule.elements.find((element:any)=>element.id==='timekeepers__billing_rate')!;
reviewRate.facets={precision:12,scale:2};reviewWidenModule.extensions['umf.tables'].tables.find((table:any)=>table.id==='timekeepers')!.columns.find((column:any)=>column.field.element==='timekeepers__billing_rate')!.nativeType={kind:'numeric',precision:12,scale:2};
const reviewPolicy=structuredClone(reviewOriginal);reviewPolicy.modules[0]!.extensions['umf.tables'].tables.find((table:any)=>table.id==='clients')!.policy.person.select={kind:'deny'};
const reviewedChangesCases=[
 {name:'drop-column',previous:reviewDeployment(reviewOriginal),next:reviewDeployment(reviewDrop)},
 {name:'numeric-widening',previous:reviewDeployment(reviewOriginal),next:reviewDeployment(reviewWiden)},
 {name:'policy-change',previous:reviewDeployment(reviewOriginal),next:reviewDeployment(reviewPolicy)},
].map(item=>({...item,expected:discoverTableMigrationChanges(item.previous,item.next)}));
const legalDocuments=[legalSource(),evolvedLegalSource().source,indexedLegalSource().source];
const legal=legalDocuments.map((source,i)=>({source,options:i===1?evolvedLegalSource().options:i===2?indexedLegalSource().options:undefined,
 deployment:compileTableDeployment({text:JSON.stringify(source),configuration:legalConfiguration}),client:generatePythonClient({text:JSON.stringify(source),package:'legal_demo'})}));
let legalPrev:any=null,legalPred:any=null;
const legalMigrationExpected=legal.map((item,i)=>{
 if(item.deployment.status!=='compiled')throw Error('Legal deployment refused');
 const result=compileTableMigration({id:String(i+1).padStart(3,'0'),previous:legalPrev,predecessor:legalPred,next:item.deployment.bundle,...(item.options?{options:item.options}:{})});
 if(result.status!=='compiled')throw Error(JSON.stringify(result));
 legalPrev=item.deployment.bundle;legalPred={id:result.plan.id,digest:result.plan.digest};return result;
});
const related:any[]=[relatedSource(false),relatedSource(true),snapshotSource()].map(source=>{return {source,inspection:inspectTableLifecycle(source),deployment:deployed(source),client:generatePythonClient({text:JSON.stringify(source),package:'related_demo'})};});
const rowScopeDocument=relatedSource();
const rowScopeInput={row_scope:{owner_column:'owner',commands:['select','insert','update','delete'],via:[{table:'membership',person_column:'memberPerson',key_column:'memberNote'}],batch:['select','insert'],groups:[{name:'reviewers',commands:['select']}]}};
const rowScopeContext:any={record:{module:'demo',element:'Note'},ownerColumns:{owner:{module:'demo',element:'owner'}},via:[{name:'membership',record:{module:'demo',element:'Membership'},personColumnName:'memberPerson',keyColumnName:'memberNote',sourceField:{module:'demo',element:'id'},keyField:{module:'demo',element:'memberNote'},personField:{module:'demo',element:'memberPerson'}}],groups:{reviewers:'reviewers'},lifecycleDocument:rowScopeDocument,tableId:'notes',deploymentConfiguration:{module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{reviewers:'plugin_reviewers'}}};
const admitRowPolicy=(document:any,policy:any)=>{const candidate=structuredClone(document);candidate.modules[0].extensions['umf.tables'].tables[0].policy=policy;const inspection=inspectTableLifecycle(candidate);if(!inspection.valid||!inspection.complete)return inspection.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message}));const result=compileTableDeployment({text:JSON.stringify(candidate),configuration:rowScopeContext.deploymentConfiguration});return result.status==='blocked'?result.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message})):[];};
const rowScopeExpected=normalizeRowScope(rowScopeInput,{...rowScopeContext,admitPolicy:(policy:any)=>admitRowPolicy(rowScopeDocument,policy)});
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(bundle,{headers:{'Content-Type':'text/javascript'}}):new Response('<!doctype html><title>UMF table declaration verification</title>',{headers:{'Content-Type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),origin='http://127.0.0.1:'+server.port,externalRequests:string[]=[];
 page.on('request',r=>{if(!r.url().startsWith(origin+'/'))externalRequests.push(r.url());});await page.goto(origin);
 const result=await (page as any).evaluate(async (args:any)=>{
  const {fixture,expected,configuration,deployment,migration,forwardRequest,forward,operationSource,operationExpected,operationClient,temporal,temporalExpected,domains,domainExpected,legalDomains,legalDomainConfiguration,legalDomainExpected,evolutions,related,legal,legalConfiguration,legalMigrationExpected,reviewedChangesCases,rowScopeInput,rowScopeContext,rowScopeExpected,g01Request,g01Expected,g01FutureRequest,g01FutureExpected,historicalV02NullBackfill}=args;
  const path='/umf.js',u=await import(path);let assertions=0;

  const check=(value:boolean)=>{assertions++;if(!value)throw new Error('Browser table declaration assertion '+assertions);};
  const rowContext={...rowScopeContext,admitPolicy:(policy:any)=>{const candidate=structuredClone(rowScopeContext.lifecycleDocument);candidate.modules[0].extensions['umf.tables'].tables.find((t:any)=>t.id===rowScopeContext.tableId).policy=policy;const inspection=u.inspectTableLifecycle(candidate);if(!inspection.valid||!inspection.complete)return inspection.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message}));const deployed=u.compileTableDeployment({text:JSON.stringify(candidate),configuration:rowScopeContext.deploymentConfiguration});return deployed.status==='blocked'?deployed.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message})):[];}};
  const normalized=u.normalizeRowScope(rowScopeInput,rowContext);check(JSON.stringify(normalized)===JSON.stringify(rowScopeExpected));check(normalized.valid&&normalized.policy.batch.update.kind==='deny'&&normalized.policy.batch.delete.kind==='deny');check(normalized.sourceToOutput['/row_scope/owner_column'][0]==='/policy/person/select/rules/0/rules/0');
  const widened=u.normalizeRowScope({row_scope:{owner_column:'owner',commands:['select'],batch:[],groups:[{name:'reviewers',commands:['delete']}] }},rowContext);check(!widened.valid&&widened.diagnostics.some((d:any)=>d.code==='ROW_SCOPE_GROUP_COMMAND'));
  const rowUnknown=u.normalizeRowScope({row_scope:{commands:['select'],batch:[],future:{kept:true}}},rowContext);check(!rowUnknown.valid&&rowUnknown.source.row_scope.future.kept);

  const clone=()=>structuredClone(fixture) as any;
  const payload=(d:any)=>d.modules[0].extensions['umf.tables'];
  for(const item of reviewedChangesCases)check(JSON.stringify(u.discoverTableMigrationChanges(item.previous,item.next))===JSON.stringify(item.expected));
  check(JSON.stringify(u.compileTableDeployment({text:JSON.stringify(temporal),configuration}))===JSON.stringify(temporalExpected.deployment));
  check(JSON.stringify(u.generatePythonClient({text:JSON.stringify(temporal),package:'temporal_demo'}))===JSON.stringify(temporalExpected.client));
  check(JSON.stringify(u.compileTableDeployment({text:JSON.stringify(domains),configuration}))===JSON.stringify(domainExpected.deployment));
  check(JSON.stringify(u.generatePythonClient({text:JSON.stringify(domains),package:'domain_demo'}))===JSON.stringify(domainExpected.client));
  check(JSON.stringify(u.compileTableDeployment({text:JSON.stringify(legalDomains),configuration:legalDomainConfiguration}))===JSON.stringify(legalDomainExpected.deployment));
  check(JSON.stringify(u.generatePythonClient({text:JSON.stringify(legalDomains),package:'legal_domain_demo'}))===JSON.stringify(legalDomainExpected.client));
  const operations=u.inspectTableLifecycle(operationSource);
  check(JSON.stringify(operations)===operationExpected);check(operations.complete&&!operations.nativeQualified);
  const changedOperation=structuredClone(operationSource) as any;
  changedOperation.modules[0].extensions['umf.tables'].commands[0].body.where.future={kept:true};
  const retainedOperation=u.inspectTableLifecycle(changedOperation);check(retainedOperation.valid&&!retainedOperation.complete);
  check(retainedOperation.source.modules[0].extensions['umf.tables'].commands[0].body.where.future.kept);
  const badConflict=structuredClone(operationSource) as any;
  badConflict.modules[0].extensions['umf.tables'].commands.find((c:any)=>c.id==='put_update').body.updateFields=[{module:'demo',element:'id'}];
  check(u.inspectTableLifecycle(badConflict).diagnostics.some((d:any)=>d.code==='TABLES_OPERATION_CONFLICT'));
  const operationDeployment=u.compileTableDeployment({text:JSON.stringify(operationSource),configuration});
  check(operationDeployment.status==='compiled'&&!operationDeployment.bundle.nativeQualified);
  check(operationDeployment.bundle.source.utf8===JSON.stringify(operationSource));
  const generated=u.generatePythonClient({text:JSON.stringify(operationSource),package:'operation_demo'});
  check(JSON.stringify(generated)===JSON.stringify(operationClient));
  check(generated.description.nativeExecutionQualified===false);
  check(generated.files.find((f:any)=>f.path==='operation_demo/models.py').text.includes('class DemoModule:'));
  check(!generated.files.find((f:any)=>f.path==='operation_demo/models.py').text.includes('class Note:'));
  for(const source of [fixture,changedOperation,badConflict]){
   let refused=false;try{u.generatePythonClient({text:JSON.stringify(source),package:'operation_demo'});}catch{refused=true;}check(refused);
  }
  for(const[index,item]of evolutions.entries()){
   const result=u.compileTableMigration(item.request);
   check(JSON.stringify(result)===JSON.stringify(item.expected));check(result.status==='compiled');
   check(result.plan.steps.length===(index===0?1:0));
   if(index===2)check(JSON.stringify(result.plan.seedExecution)===JSON.stringify({version:'umf.table-seed-execution/0.1',sets:['bootstrap']}));
   check(JSON.stringify(u.verifyTableMigration(result.plan))===JSON.stringify(result.plan));
  }
  for(const item of related){
   check(JSON.stringify(u.inspectTableLifecycle(item.source))===JSON.stringify(item.inspection));
   check(JSON.stringify(u.compileTableDeployment({text:JSON.stringify(item.source),configuration}).bundle)===JSON.stringify(item.deployment));
   check(JSON.stringify(u.generatePythonClient({text:JSON.stringify(item.source),package:'related_demo'}))===JSON.stringify(item.client));
  }
  const inspected=u.inspectTableLifecycle(fixture);check(JSON.stringify(inspected)===expected);check(inspected.complete&&!inspected.nativeQualified);
  for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(fixture,format),format))===JSON.stringify(fixture));
  const future=clone();payload(future).tables[0].policy.person.select.future={source:'kept'};
  const unknown=u.inspectTableLifecycle(future);check(unknown.valid&&!unknown.complete);check(unknown.source.modules[0].extensions['umf.tables'].tables[0].policy.person.select.future.source==='kept');
  const wide=clone();payload(wide).tables[0].columns[0].name='é'.repeat(32);check(u.inspectTableLifecycle(wide).diagnostics.some((d:any)=>d.code==='TABLES_IDENTIFIER'));
  const invalid=clone();payload(invalid).tables[0].policy.person.select.field.module='foreign';check(!u.inspectTableLifecycle(invalid).valid);
  const decimal=clone();decimal.modules[0].elements.push({id:'amount',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'required',facets:{precision:8,scale:3},extensions:{}});decimal.modules[0].elements[2].members.push({module:'demo',element:'amount'});payload(decimal).tables[0].columns.push({field:{module:'demo',element:'amount'},name:'amount',nativeType:{kind:'numeric',precision:5,scale:2},default:{kind:'literal',value:{decimalToken:'12.301'}}});
  check(u.inspectTableLifecycle(decimal).diagnostics.some((d:any)=>d.code==='TABLES_NATIVE_CAPACITY'));
  for(const value of [null,{},[],1])check(!u.inspectTableLifecycle(value).valid);
  check(!('process'in globalThis)&&!('Bun'in globalThis)&&!('Buffer'in globalThis));
  const compiled=u.compileTableDeployment({text:JSON.stringify(fixture),configuration});
  check(JSON.stringify(compiled)===deployment);check(compiled.status==='compiled');
  check(JSON.stringify(u.verifyTableDeployment(compiled.bundle))===JSON.stringify(compiled.bundle));
  const migrated=u.compileTableMigration({id:'001',predecessor:null,previous:null,next:compiled.bundle});
  check(JSON.stringify(migrated)===migration);check(migrated.status==='compiled');
  check(migrated.plan.requiresApproval&&!migrated.plan.nativeQualified);check(JSON.stringify(u.verifyTableMigration(migrated.plan))===JSON.stringify(migrated.plan));
  migrated.plan.steps[0].sql='DROP SCHEMA public CASCADE';let migrationRefused=false;
  try{u.verifyTableMigration(migrated.plan);}catch{migrationRefused=true;}check(migrationRefused);
  const appended=u.compileTableMigration(forwardRequest);check(JSON.stringify(appended)===forward);check(appended.status==='compiled');
  check(appended.plan.steps.every((s:any)=>s.sourcePath.includes('/tables/1')));check(JSON.stringify(u.verifyTableMigration(appended.plan))===JSON.stringify(appended.plan));
  const g01=u.compileTableMigration(g01Request);check(JSON.stringify(g01)===JSON.stringify(g01Expected));check(g01.status==='compiled');check(g01.plan.version==='umf.table-migration/0.3');check(g01.plan.phases[0].kind==='backfill-tighten');check(JSON.stringify(u.verifyTableMigration(g01.plan))===JSON.stringify(g01.plan));
  const g01Future=u.compileTableMigration(g01FutureRequest);check(JSON.stringify(g01Future)===JSON.stringify(g01FutureExpected));check(g01Future.status==='compiled');check(g01Future.plan.next.expectedCatalog.columns.find((column:any)=>column.name==='summary').definitionSql.includes('DEFAULT'));check(JSON.stringify(u.verifyTableMigration(g01Future.plan))===JSON.stringify(g01Future.plan));
  check(JSON.stringify(u.verifyTableMigration(historicalV02NullBackfill))===JSON.stringify(historicalV02NullBackfill));
  compiled.bundle.steps[0].sql='DROP SCHEMA public CASCADE';let refused=false;
  try{u.verifyTableDeployment(compiled.bundle);}catch{refused=true;}check(refused);
  check(u.compileTableDeployment({text:JSON.stringify(fixture),configuration:{...configuration,schema:'public'}}).status==='blocked');
  let legalPrevious:any=null,legalPredecessor:any=null;
  for(const [i,item]of legal.entries()){
   const generated=u.compileTableDeployment({text:JSON.stringify(item.source),configuration:legalConfiguration});
   check(JSON.stringify(generated)===JSON.stringify(item.deployment));
   check(JSON.stringify(u.generatePythonClient({text:JSON.stringify(item.source),package:'legal_demo'}))===JSON.stringify(item.client));
   if(generated.status!=='compiled')throw Error('Legal deployment refused');
   const request={id:String(i+1).padStart(3,'0'),predecessor:legalPredecessor,previous:legalPrevious,next:generated.bundle,...(item.options?{options:item.options}:{})};
   const result=u.compileTableMigration(request);check(JSON.stringify(result)===JSON.stringify(legalMigrationExpected[i]));check(result.status==='compiled');
   if(result.status!=='compiled')throw Error('Legal migration refused');
   check(JSON.stringify(u.verifyTableMigration(result.plan))===JSON.stringify(result.plan));
   legalPrevious=generated.bundle;legalPredecessor={id:result.plan.id,digest:result.plan.digest};
  }
  return {assertions,metadataParity:true,deploymentParity:true,migrationParity:true,nativeQualificationClaimed:false,nodeGlobalsAbsent:true};
 },{fixture,expected,configuration,deployment,migration,forwardRequest,forward,operationSource,operationExpected,operationClient,temporal,temporalExpected,domains,domainExpected,legalDomains,legalDomainConfiguration,legalDomainExpected,evolutions,related,legal,legalConfiguration,legalMigrationExpected,reviewedChangesCases,rowScopeInput,rowScopeContext,rowScopeExpected,g01Request,g01Expected,g01FutureRequest,g01FutureExpected,historicalV02NullBackfill});
 if(externalRequests.length)throw new Error('Table inspection caused an external request');
 const sources=['src/table-authoring/row-scope.ts','src/table-migration/options.ts','src/table-migration/reviewed.ts','src/table-migration/phases.ts','src/table-migration/phases-options.ts','tests/lifecycle/legal-fixture.ts','tests/lifecycle/g01-native-fixture.ts','tests/lifecycle/fixtures/g01-historical-v0.2-null-backfill.json','src/table-deployment/domains.ts','tests/unified/table-domain-fixture.ts','src/extensions/tables/temporal.ts','src/table-deployment/temporal.ts','tests/unified/table-temporal-fixture.ts','src/access/index.ts','src/access/table-client.ts','src/access/table-runtime.ts','src/access/types.ts','src/access/python-runtime.ts','src/index.ts','src/table-migration/index.ts','spec/extensions/tables/migration.schema.json','spec/extensions/tables/migration-0.3.schema.json','scripts/table-lifecycle-browser.ts','tests/unified/table-migration-fixture.ts','tests/binding/fixtures/table-lifecycle-note.json','spec/extensions/tables/schema.json','spec/extensions/tables/operation.schema.json','tests/unified/table-operation-fixture.ts','spec/extensions/tables/package.json','spec/extensions/tables/deployment.schema.json',...['types','context','expressions','columns','policies','seeds','operations','index'].map(n=>'src/extensions/tables/'+n+'.ts'),...['types','configuration','sql','policies','ddl','index'].map(n=>'src/table-deployment/'+n+'.ts')];
 const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 const report={scope:'current-core table inspection, generated module parity, deployment and bounded migration/review-candidate parity; portable browser evidence only',browser:browser.version(),result,externalRequests,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sourceHashes};
 await Bun.write(process.env.UMF_TABLE_BROWSER_EVIDENCE??'/private/tmp/umf-table-lifecycle-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();server.stop(true);}
