/** Fresh original Weft Application AST -> current UMF source-owner correspondence. */
import {createHash} from 'node:crypto';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {inspectCandidateStoredQueryProperties} from '../../src/extensions/security/stored-query-candidate';
const [binary,expectedBinarySha256,output]=process.argv.slice(2);if(!binary||!/^[a-f0-9]{64}$/.test(expectedBinarySha256??'')||!output)throw Error('Exact binary, SHA256 and output directory required');
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const binaryHash=async()=>sha(new Uint8Array(await Bun.file(binary).arrayBuffer()));if(await binaryHash()!==expectedBinarySha256)throw Error('Producer binary mismatch');
const selectedFiles=['tools/security/current-query-lineage.ts','tests/security/protection/current-query-source.json','src/extensions/security/catalog-program-candidate.ts','src/extensions/security/stored-query-candidate.ts','src/extensions/security/catalog-storage-candidate.ts','bun.lock','package.json'];
const sourcePins=async()=>Object.fromEntries(await Promise.all(selectedFiles.map(async path=>[path,sha(new Uint8Array(await Bun.file(path).arrayBuffer()))])));
const before=await sourcePins();
const fixturePath='tests/security/protection/current-query-source.json',raw=await Bun.file(fixturePath).text(),f=JSON.parse(raw),document=f.closure.documents[0].document,documentJson=JSON.stringify(document),observations:any[]=[];
function check(id:string,value:boolean){if(!value)throw Error(id);observations.push({id,passed:true});}
const canonical=(v:any):string=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const opaqueSources=['policy','catalog','ontology','owner'].map(role=>{const source=f[role],utf8=JSON.stringify(source);return {role,identity:{documentId:source.id??source.documentId,revision:source.revision},mediaType:'application/json',utf8,sha256:sha(utf8)};});
opaqueSources.push({role:'fixture',identity:{documentId:f.id,revision:'source-profile-r1'},mediaType:'application/json',utf8:raw,sha256:sha(raw)});
const base={interfaceVersion:'weft-application-lineage/0.1-candidate',modules:[{documentJson,pin:{documentId:document.id,revision:f.closure.pins[0].revision,umfVersion:document.umf,sha256:sha(documentJson)},selectedModuleIds:['m']}],parameters:{},opaqueSources};
const program=compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology);
async function invoke(request:unknown){const text=JSON.stringify(request),p=Bun.spawn([binary],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});p.stdin.write(text);p.stdin.end();const [stdout,stderr,exit]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);return {text,stdout,stderr,exit};}
for(const query of f.queries){
 const run=await invoke({...base,sql:query.sql});check(query.id+':actual-producer-success',run.exit===0&&run.stderr==='');const report=JSON.parse(run.stdout);
 check(query.id+':no-authority',report.version==='weft.application.lineage/0.1-candidate'&&report.authority===false&&report.securityReady===false);
 check(query.id+':exact-source-custody',report.sourceRequestJson===run.text&&report.sourceRequestSha256===sha(run.text)&&report.sqlSha256===sha(query.sql));
 check(query.id+':exact-model-pins',same(report.modelPins,base.modules.map(m=>m.pin)));
 const plan=JSON.parse(report.applicationPlanJson);check(query.id+':actual-plan-hash',report.applicationPlanSha256===sha(report.applicationPlanJson));
 check(query.id+':all-opaque-sources-uninterpreted',same(report.unresolvedSources,opaqueSources.map(({role,identity,mediaType,sha256})=>({role,identity,mediaType,sha256,status:'uninterpreted'}))));
 check(query.id+':scan-population',Object.keys(report.scans).length===(query.id==='token-self-join'?2:1)&&Object.values(report.scans).every((s:any)=>s.documentId===document.id&&s.revision===f.closure.pins[0].revision&&s.module==='m'&&s.element==='Resource'));
 check(query.id+':no-mode-action-invention',report.uses.every((u:any)=>!Object.hasOwn(u,'mode')&&!Object.hasOwn(u,'originalAction')&&!Object.hasOwn(u,'modeSource')));
 const expected=query.expectedStoredUses,selected=report.uses.filter((u:any)=>u.field.elementId==='token');
 check(query.id+':all-stored-occurrences',selected.length===expected.length);
 check(query.id+':complete-use-population',report.uses.length===(query.id==='numeric-sum-unsupported'?1:expected.length)&&new Set(report.uses.map((u:any)=>u.path)).size===report.uses.length);
 for(const use of report.uses){
  check(query.id+':'+use.path+':exact-field-revision',use.fieldIdentity.documentId===use.field.documentId&&use.fieldIdentity.module===use.field.moduleId&&use.fieldIdentity.element===use.field.elementId&&use.fieldIdentity.revision===f.closure.pins[0].revision);
  if(use.field.elementId==='token'){
   const e=expected.find((e:any)=>e.path===use.path);check(query.id+':'+use.path+':independent-expectation',Boolean(e)&&use.scan===e.scan&&use.operator===e.operator&&same(use.required,e.required));
   const result=inspectCandidateStoredQueryProperties(program,f.owner,{type:use.type,field:use.field,operator:use.operator,required:use.required});
   check(query.id+':'+use.path+':current-owner-correspondence',result.status==='selected'&&result.report?.status===e.status&&!result.authority&&!result.complete);
  }
 }
 if(query.id==='numeric-sum-unsupported')check('numeric-sum-no-fake-property',report.uses.length===1&&report.uses[0].operation==='sum'&&report.uses[0].field.elementId==='salary'&&report.uses[0].required===null&&report.uses[0].propertyStatus==='unsupported'&&report.uses[0].outputType.family==='integer'&&report.uses[0].outputType.nullable===true);
 if(query.id==='field-free-count')check('count-star-no-invented-field',report.uses.length===0&&plan.source.occurrence==='s0'&&plan.source.record.element==='Resource'&&plan.outputs[0].expression.op==='count');
 await Bun.write(output+'/'+query.id+'.request.json',run.text);await Bun.write(output+'/'+query.id+'.report.json',run.stdout);
}
for(const [id,mutate] of [
 ['required-override',(x:any)=>{x.required=['equality'];}],['mode-override',(x:any)=>{x.mode='disclosed';}],['authority-override',(x:any)=>{x.authority=true;}],
 ['changed-opaque-source',(x:any)=>{x.opaqueSources[0].utf8+=' ';}],['changed-model-digest',(x:any)=>{x.modules[0].pin.sha256='0'.repeat(64);}]
] as [string,(x:any)=>void][]){const request=structuredClone({...base,sql:f.queries[0].sql});mutate(request);const r=await invoke(request);check(id+':refused-before-partial-report',r.exit!==0&&r.stdout===''&&r.stderr.includes('WFT-'));}
check('fixture-and-producer-unchanged',(await Bun.file(fixturePath).text())===raw&&await binaryHash()===expectedBinarySha256);
const after=await sourcePins();check('selected-sources-unchanged',same(before,after));
await Bun.write(output+'/lineage.json',JSON.stringify({status:'passed',producer:{binarySha256:expectedBinarySha256},fixtureSha256:sha(raw),selectedSourceDigests:after,controls:observations.length,observations,scope:'Fresh original Weft parser/resolver lineage matched to the exact new current UMF fixture and existing storage owner. Reports remain non-authoritative; no numeric aggregate admission, current read/action permission, mixed-mode native compilation or P03/B08 qualification.'},null,2)+'\n');console.log(JSON.stringify({status:'passed',controls:observations.length}));
