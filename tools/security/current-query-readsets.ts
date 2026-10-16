/** Fresh Weft-owned read requirements -> supplied-complete-cut logical scan oracle. */
import {createHash} from 'node:crypto';
import source from '../../tests/security/protection/current-query-source.json';
import scenarios from '../../tests/security/protection/current-query-read-scenarios.json';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {inspectCandidateStoredQueryProperties} from '../../src/extensions/security/stored-query-candidate';
import {evaluateCandidateCatalogScan,evaluateCandidateCatalogScanBatch} from '../../src/extensions/security/catalog-runtime-candidate';
const [binary,expectedSha,output]=process.argv.slice(2);if(!binary||!/^[a-f0-9]{64}$/.test(expectedSha??'')||!output)throw Error('Exact producer, SHA256 and output directory required');
const sha=(x:string|Uint8Array)=>createHash('sha256').update(x).digest('hex'),hashBinary=async()=>sha(new Uint8Array(await Bun.file(binary).arrayBuffer()));if(await hashBinary()!==expectedSha)throw Error('Producer mismatch');
const observations:any[]=[],check=(id:string,ok:boolean)=>{if(!ok)throw Error(id);observations.push({id,passed:true});},id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const canonical=(x:any):string=>x&&typeof x==='object'?Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const same=(a:any,b:any)=>canonical(a)===canonical(b),ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId}),identity=(element:string)=>({documentId:'domain',module:'m',element,revision:source.closure.pins[0]!.revision});
const logicalType=(field:string)=>{const definition:any=source.closure.documents[0]!.document.modules[0]!.elements.find(x=>x.id===field);if(!definition||definition.kind!=='field'||definition.nullability!=='required'||definition.cardinality!=='one')throw Error('Original required scalar source changed');return {family:definition.scalarType,facets:definition.facets??{},nullable:false};};
const queryCases:[string,string,string[],string[][],string[]][]=[
 ['projection-read','SELECT r.token FROM Resource r',['s0'],[['s0','outputs/0/expression','token','projection']],[]],
 ['hidden-read-false-zero',"SELECT r.resourceId FROM Resource r WHERE FALSE AND r.token='opaque-token' ORDER BY r.token LIMIT 0",['s0'],[['s0','outputs/0/expression','resourceId','projection'],['s0','filters/1/left','token','predicate'],['s0','order/0','token','order']],['asc']],
 ['hidden-read-desc-false-zero',"SELECT r.resourceId FROM Resource r WHERE FALSE AND r.token='opaque-token' ORDER BY r.token DESC LIMIT 0",['s0'],[['s0','outputs/0/expression','resourceId','projection'],['s0','filters/1/left','token','predicate'],['s0','order/0','token','order']],['desc']],
 ['mixed-order-id-asc-token-desc-zero','SELECT r.resourceId FROM Resource r ORDER BY r.resourceId ASC , r.token DESC LIMIT 0',['s0'],[['s0','outputs/0/expression','resourceId','projection'],['s0','order/0','resourceId','order'],['s0','order/1','token','order']],['asc','desc']],
 ['mixed-order-id-desc-token-asc-zero','SELECT r.resourceId FROM Resource r ORDER BY r.resourceId DESC, r.token ASC  LIMIT 0',['s0'],[['s0','outputs/0/expression','resourceId','projection'],['s0','order/0','resourceId','order'],['s0','order/1','token','order']],['desc','asc']],
 ['distinct-selfjoin-false-zero',"SELECT COUNT(DISTINCT s.token) FROM Resource r JOIN Resource s ON r.token=s.token WHERE FALSE AND r.token='opaque-token' LIMIT 0",['s0','s1'],[['s0','joins/0/on/0/left','token','join'],['s1','joins/0/on/0/right','token','join'],['s0','filters/1/left','token','predicate'],['s1','outputs/0/argument','token','aggregate']],[]],
 ['field-free-false-zero','SELECT COUNT(*) FROM Resource r WHERE TRUE AND FALSE LIMIT 0',['s0'],[],[]],
 ['distinct-required','SELECT COUNT(DISTINCT r.token) AS unique_tokens FROM Resource r',['s0'],[['s0','outputs/0/argument','token','aggregate']],[]],
 ['sum-unsupported','SELECT SUM(r.salary) FROM Resource r LIMIT 0',['s0'],[['s0','outputs/0/argument','salary','aggregate']],[]],
];
const sourceFiles=['tools/security/current-query-readsets.ts','src/extensions/security/catalog-runtime-candidate.ts','src/extensions/security/catalog-program-candidate.ts','src/extensions/security/stored-query-candidate.ts','src/extensions/security/catalog-storage-candidate.ts','tests/security/protection/current-query-source.json','tests/security/protection/current-query-read-scenarios.json','bun.lock','package.json'];
const pins=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async path=>[path,sha(new Uint8Array(await Bun.file(path).arrayBuffer()))]))),before=await pins();
const results:any[]=[];
for(const variant of ['r1-undisclosed','r2-allowed','r2-revoked']){
 const policy:any=structuredClone(variant==='r1-undisclosed'?source.policy:scenarios.policy),owner:any=structuredClone(source.owner),cut:any=structuredClone(scenarios.cut);owner.revision='named-scan-owner-r1';owner.disclosure={readAction:'read'};cut.owner.revision=owner.revision;cut.policy.revision=policy.revision;
 if(variant==='r2-revoked'){cut.generation=cut.expectedGeneration='logical-revoked-cut-r1';cut.facts.find((r:any)=>r.type.elementId==='Assignment').fields.find((f:any)=>f.field.elementId==='active').value={boolean:false};}
 const program=compileCandidateCatalogProgram(policy,source.catalog,source.closure,source.ontology),documentJson=JSON.stringify(source.closure.documents[0]!.document);
 const opaqueSources=[['policy',policy,policy.id,policy.revision],['catalog',source.catalog,source.catalog.id,source.catalog.revision],['ontology',source.ontology,source.ontology.documentId,source.ontology.revision],['owner',owner,owner.id,owner.revision],['logical-cut',cut,'logical-cut-fixture',cut.generation]].map(([role,value,documentId,revision])=>{const utf8=JSON.stringify(value);return {role,identity:{documentId,revision},mediaType:'application/json',utf8,sha256:sha(utf8)};});
 for(const [name,sql,scanIds,expectedFields,expectedDirections]of queryCases){
  const label=variant+':'+name,request={interfaceVersion:'weft-application-lineage/0.2-candidate',modules:[{documentJson,pin:{documentId:'domain',revision:source.closure.pins[0]!.revision,umfVersion:'0.8.0',sha256:sha(documentJson)},selectedModuleIds:['m']}],sql,parameters:{},opaqueSources},raw=JSON.stringify(request);
  const proc=Bun.spawn([binary],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});proc.stdin.write(raw);proc.stdin.end();const [stdout,stderr,exit]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);check(label+':actual-issuer',exit===0&&stderr==='');const report=JSON.parse(stdout);
  check(label+':exact-source',report.sourceRequestJson===raw&&report.sourceRequestSha256===sha(raw)&&report.sqlSha256===sha(sql));check(label+':no-native-authority',report.version==='weft.application.lineage/0.2-candidate'&&report.authority===false&&report.securityReady===false);
  check(label+':original-plan',report.applicationPlanSha256===sha(report.applicationPlanJson));
  check(label+':original-order-directions',same(report.orderDirections,expectedDirections));
  check(label+':opaque-source-custody',same(report.unresolvedSources,opaqueSources.map(({role,identity,mediaType,sha256})=>({role,identity,mediaType,sha256,status:'uninterpreted'}))));
  check(label+':exact-model-pins',same(report.modelPins,request.modules.map(x=>x.pin)));
  const reads=report.readRequirements;
  check(label+':all-occurrence-scans',same(reads.scans,scanIds.map(scan=>({scan,path:scan==='s0'?'source':'joins/0/right',kind:'rowRead',target:ref('Resource'),recordIdentity:identity('Resource')}))));
  const fullFields=expectedFields.map(([scan,path,field,role])=>({scan,path,field:ref(field!),role,target:ref('Resource'),recordIdentity:identity('Resource'),fieldIdentity:identity(field!),descriptor:{availability:'required',identity:identity(field!),kind:'scalar',type:logicalType(field!)},sourceStatus:'derived'}));
  check(label+':all-projected-hidden-fields',same(reads.fields,fullFields));
  check(label+':no-unhandled-relationship',same(reads.relationships,[]));
  check(label+':unsupported-sum-retained',same(reads.unsupportedSources,name==='sum-unsupported'?[{kind:'numericAggregateProperties',path:'outputs/0/argument'}]:[]));
  const expectedUses=expectedFields.filter(([, , ,role])=>role!=='projection').map(([scan,path,field,role])=>{const operation=role==='aggregate'?(name==='sum-unsupported'?'sum':'countDistinct'):role==='order'?'order':'equal';return {scan,path,field:ref(field!),fieldIdentity:identity(field!),type:ref('Resource'),logicalType:logicalType(field!),operator:role,operation,propertyStatus:operation==='sum'?'unsupported':'derived',required:operation==='sum'?null:[operation==='order'?'order':'equality'],...(role==='aggregate'?{outputType:{family:'integer',facets:{},nullable:operation==='sum'}}:{})};});
  check(label+':complete-independent-property-uses',same(report.uses,expectedUses));
  const properties=[];
  for(const use of report.uses){if(use.field.elementId!=='token')continue;
   const property=inspectCandidateStoredQueryProperties(program,owner,{type:use.type,field:use.field,operator:use.operator,required:use.required});
   check(label+':'+use.path+':separate-stored-property-check',property.status==='selected'&&property.report?.status===(use.operator==='order'?'refused':'compatible-properties')&&!property.complete&&!property.authority);properties.push({path:use.path,scan:use.scan,report:property.report});
  }
  const scans=[];
  for(const scan of reads.scans){const fields:any[]=[],seen=new Set<string>();for(const f of reads.fields.filter((x:any)=>x.scan===scan.scan))if(!seen.has(id(f.field))){seen.add(id(f.field));fields.push(f.field);}
   const selection={type:scan.target,fields},logical=evaluateCandidateCatalogScan(program,owner,cut,selection),hasToken=fields.some(f=>f.elementId==='token'),expected=variant==='r1-undisclosed'&&hasToken?'refused':'rendered';
   check(label+':'+scan.scan+':read-decision',logical.status===expected&&!logical.complete&&!logical.authority);
   // Core literal families/values are authored expectations, independent of the emitter.
   const expectedRows=expected==='refused'||variant==='r2-revoked'?[]:[fields.map(field=>({field,disposition:'original',value:field.elementId==='salary'?{integerToken:'100'}:{string:field.elementId==='resourceId'?'r1':'opaque-token'}}))];

   check(label+':'+scan.scan+':complete-source-rows',canonical(logical.rows)===canonical(expectedRows));scans.push({scan:scan.scan,selection,logical});
  }
  const batchRequests=reads.scans.map((scan:any)=>({scan:scan.scan,type:scan.target,fields:[...new Map(reads.fields.filter((field:any)=>field.scan===scan.scan).map((field:any)=>[id(field.field),field.field])).values()]}));
  const scanBatch=evaluateCandidateCatalogScanBatch(program,owner,cut,batchRequests);
  const expectedBatch=scanIds.map(scan=>{const fields=[...new Set(expectedFields.filter(f=>f[0]===scan).map(f=>f[2]!))];return {scan,rows:variant==='r2-revoked'?[]:[fields.map(field=>({field:ref(field),disposition:'original',value:field==='salary'?{integerToken:'100'}:{string:field==='resourceId'?'r1':'opaque-token'}}))],valueProfiles:[]};});
  const batchRefused=variant==='r1-undisclosed'&&expectedFields.some(f=>f[2]==='token');
  check(label+':whole-read-preparation-atomic',same(scanBatch,{status:batchRefused?'refused':'rendered',complete:false,authority:false,scans:batchRefused?[]:expectedBatch}));
  await Bun.write(output+'/'+variant+'-'+name+'.request.json',raw);await Bun.write(output+'/'+variant+'-'+name+'.report.json',stdout);results.push({variant,query:name,scans,scanBatch,properties,unsupportedSources:reads.unsupportedSources});
 }
}
const after=await pins();check('producer-and-selected-sources-unchanged',await hashBinary()===expectedSha&&JSON.stringify(before)===JSON.stringify(after));
await Bun.write(output+'/receipt.json',JSON.stringify({status:'correspondence-passed',acceptanceReceipt:false,casePromoted:null,producerSha256:expectedSha,selectedSourceDigests:after,controls:observations.length,observations,results,scope:'Fresh actual compiler-issued readsets matched to complete supplied logical scans under separately authored r1/r2/changed-assignment source packets. Ordered occurrence reads now compose atomically with shared operation ledgers; property/mode/unsupported-source obligations remain separate and this is not executable whole-query admission. False/zero-limit syntax does not erase pre-query row/Field read duties. This does not execute queries, apply aggregate semantics, infer query-use mode/action grants, authenticate cut completeness or qualify native/backend/P03/B08 authority.'},null,2)+'\n');console.log(JSON.stringify({status:'correspondence-passed',controls:observations.length}));
