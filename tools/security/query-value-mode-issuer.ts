import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
/** Actual source issuer correspondence for an explicit new fixture; no native admission. */
import {createHash} from 'node:crypto';
import {createValidator} from '../../src/validation/schema';
import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
const [binary,expectedSha,output]=process.argv.slice(2);if(!binary||!expectedSha||!output)throw Error('Pinned producer and output required');
const sha=(x:string|Uint8Array)=>createHash('sha256').update(x).digest('hex');
const fixturePath='tests/security/protection/query-value-modes-source.json',scriptPath='tools/security/query-value-mode-issuer.ts',schemaPath='docs/helix/04-build/evidence/security/query-value-sources-20261015/weft-original-report.schema.json';
const sourcePaths=[binary,fixturePath,scriptPath,schemaPath,'src/validation/schema.ts','bun.lock','package.json'];
const captured=await Promise.all(sourcePaths.map(async path=>({path,bytes:await Bun.file(path).bytes()})));
const beforePins=Object.fromEntries(captured.map(({path,bytes})=>[path,sha(bytes)])),before=beforePins[binary];if(before!==expectedSha)throw Error('Producer pin mismatch');
const decode=(path:string)=>new TextDecoder('utf-8',{fatal:true}).decode(captured.find(x=>x.path===path)!.bytes);
const source: typeof import('../../tests/security/protection/query-value-modes-source.json')=JSON.parse(decode(fixturePath)),schemaBytes=decode(schemaPath);
if(sha(schemaBytes)!=='86a7ab3adcc9502e2eda242f934a4cdcff7fd14039e55e771a60c9301c58a397')throw Error('Original owner schema mismatch');
await mkdir(dirname(output),{recursive:true});await mkdir(output);
// The original peer schema declares conditional required members in an ancestor.
// Disable only contextual Ajv authoring lints; actual type/required checks remain active.
const validator=createValidator();validator.opts.strictRequired=false;validator.opts.strictTypes=false;
const validate=validator.compile(JSON.parse(schemaBytes)),ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId}),identity=(element:string)=>({documentId:'domain',module:'m',element,revision:'query-value-core-r1'});
const canonical=(x:any):string=>x&&typeof x==='object'?Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x),same=(a:any,b:any)=>canonical(a)===canonical(b);
const logical=(field:string)=>{const e:any=source.closure.documents[0]!.document.modules[0]!.elements.find(e=>e.id===field);if(e.kind!=='field'||e.cardinality!=='one'||e.nullability!=='required')throw Error('Original scalar required descriptor');return {family:e.scalarType,facets:e.facets??{},nullable:false};};
// Independent path/occurrence inventory for the seven authored SQL requests.
const expected:[string,string[][],string[]][]=[
 ['disclosed-token-equality',[['s0','outputs/0/expression','token','projection'],['s0','filters/0/left','token','predicate']],[]],
 ['disclosed-token-selfjoin',[['s0','joins/0/on/0/left','token','join'],['s1','joins/0/on/0/right','token','join'],['s1','outputs/0/argument','token','aggregate']],[]],
 ['original-token-order',[['s0','outputs/0/expression','token','projection'],['s0','order/0','token','order']],['desc']],
 ['read-dto-hidden-original',[['s0','outputs/0/expression','salary','projection'],['s0','filters/0/left','salary','predicate']],[]],
 ['mixed-original-uses',[['s0','outputs/0/expression','salary','projection'],['s0','outputs/1/expression','token','projection'],['s0','filters/0/left','salary','predicate'],['s0','order/0','token','order']],['desc']],
 ['prohibited-salary-order-empty',[['s0','outputs/0/expression','salary','projection'],['s0','order/0','salary','order']],['asc']],
 ['unsupported-salary-sum',[['s0','outputs/0/argument','salary','aggregate']],[]],
];
const documentJson=JSON.stringify(source.closure.documents[0]!.document),observations:any[]=[],check=(id:string,ok:boolean)=>{if(!ok)throw Error(id);observations.push({id,passed:true});};
const opaqueSources=[['policy',source.policy,source.policy.id,source.policy.revision],['catalog',source.catalog,source.catalog.id,source.catalog.revision],['ontology',source.ontology,source.ontology.documentId,source.ontology.revision],['owner',source.owner,source.owner.id,source.owner.revision],['designation-intents',source.intendedOriginalActions,'query-value-intents','query-value-intents-r1']].map(([role,data,documentId,revision])=>{const utf8=JSON.stringify(data);return {role,identity:{documentId,revision},mediaType:'application/json',utf8,sha256:sha(utf8)};});
check('runtime-cut-is-not-a-program-credential',!opaqueSources.some(s=>s.role==='logical-cut'));
for(const [name,fields,directions] of expected){
 const sql=source.queries.find(q=>q.id===name)!.sql,request={interfaceVersion:'weft-application-lineage/0.2-candidate',modules:[{documentJson,pin:{documentId:'domain',revision:'query-value-core-r1',umfVersion:CURRENT_CORE_VERSION,sha256:sha(documentJson)},selectedModuleIds:['m']}],sql,parameters:{},opaqueSources},raw=JSON.stringify(request);
 const proc=Bun.spawn([binary],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});proc.stdin.write(raw);proc.stdin.end();const [stdout,stderr,exit]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);check(name+':actual-original-issuer',exit===0&&stderr==='');const report=JSON.parse(stdout);
 check(name+':exact-owner-schema',validate(report));check(name+':no-authority',report.authority===false&&report.securityReady===false);
 const forged=structuredClone(report);forged.readRequirements.scans[0].action='read';check(name+':schema-refuses-caller-action',!validate(forged));
 const wrongType=structuredClone(report);wrongType.readRequirements.scans[0].target.documentId=7;check(name+':type-keyword-still-active',!validate(wrongType));
 if(report.uses.some((use:any)=>use.operator==='aggregate')){const omitted=structuredClone(report);delete omitted.uses.find((use:any)=>use.operator==='aggregate').outputType;check(name+':required-keyword-still-active',!validate(omitted));}
 check(name+':original-request',report.sourceRequestJson===raw&&report.sourceRequestSha256===sha(raw)&&report.sqlSha256===sha(sql));check(name+':original-plan',report.applicationPlanSha256===sha(report.applicationPlanJson));
 check(name+':exact-model-pins',same(report.modelPins,request.modules.map(m=>m.pin)));check(name+':exact-source-custody',same(report.unresolvedSources,opaqueSources.map(({role,identity,mediaType,sha256})=>({role,identity,mediaType,sha256,status:'uninterpreted'}))));
 const scanIds=name==='disclosed-token-selfjoin'?['s0','s1']:['s0'];check(name+':all-row-occurrences',same(report.readRequirements.scans,scanIds.map(scan=>({scan,path:scan==='s0'?'source':'joins/0/right',kind:'rowRead',target:ref('Resource'),recordIdentity:identity('Resource')}))));
 check(name+':all-original-field-descriptors',same(report.readRequirements.fields,fields.map(([scan,path,field,role])=>({scan,path,field:ref(field!),fieldIdentity:identity(field!),target:ref('Resource'),recordIdentity:identity('Resource'),role,sourceStatus:'derived',descriptor:{availability:'required',identity:identity(field!),kind:'scalar',type:logical(field!)}}))));
 const uses=fields.filter(([, , ,role])=>role!=='projection').map(([scan,path,field,role])=>{const op=role==='aggregate'?(name==='unsupported-salary-sum'?'sum':'countDistinct'):role==='order'?'order':'equal';return {scan,path,field:ref(field!),fieldIdentity:identity(field!),type:ref('Resource'),logicalType:logical(field!),operator:role,operation:op,propertyStatus:op==='sum'?'unsupported':'derived',required:op==='sum'?null:[op==='order'?'order':'equality'],...(role==='aggregate'?{outputType:{family:'integer',facets:{},nullable:op==='sum'}}:{})};});
 check(name+':all-original-operation-uses',same(report.uses,uses));check(name+':exact-order-directions',same(report.orderDirections,directions));check(name+':no-unhandled-relationship',same(report.readRequirements.relationships,[]));
 check(name+':unsupported-remains-explicit',same(report.readRequirements.unsupportedSources,name==='unsupported-salary-sum'?[{kind:'numericAggregateProperties',path:'outputs/0/argument'}]:[]));
 await Bun.write(output+'/'+name+'.request.json',raw);await Bun.write(output+'/'+name+'.report.json',stdout);
}
const afterPins=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,sha(await Bun.file(path).bytes())])));
check('producer-unchanged',same(beforePins,afterPins));
await Bun.write(output+'/receipt.json',JSON.stringify({status:'explicit-source-issuer-correspondence-passed',controls:observations.length,observations,queries:expected.length,producerSha256:before,sourceFixtureSha256:beforePins[fixturePath],beforePins,afterPins,sourcesUnchanged:true,schemaSha256:sha(schemaBytes),schemaOptions:{strictRequired:false,strictTypes:false,requiredKeywordActive:true,typeKeywordActive:true},scriptSha256:beforePins[scriptPath],scope:'Actual original compiler/core0.8 descriptors and source packets for new explicit canonical policy/catalog query-mode fixture. Read DTOs are not promoted into original live Fields; exact occurrence paths and typed directions retained. Opaque designation intents are not a Weft-issued profile; no SQL lowerer/native authority/program registration/current-auth/query admission is qualified.',acceptanceCasesPromoted:[]},null,2)+'\n');console.log(JSON.stringify({controls:observations.length,queries:expected.length,status:'passed'}));
