/** Explicit policy-selected optional cells on supplied logical cuts. @covers US-056-AC6 */
import {createHash} from 'node:crypto';
import {resolve,relative,dirname,extname} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogScan} from '../../src/extensions/security/catalog-runtime-candidate';
const root=process.cwd()+'/',output=process.argv[2];if(!output||await Bun.file(output).exists())throw Error('Fresh output directory required');await mkdir(output,{recursive:false});
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const sources=new Map<string,string>();
async function capture(path:string):Promise<void>{
 path=resolve(path);const key=relative(process.cwd(),path);if(key==='..'||key.startsWith('../'))throw Error('Source escaped repository');if(sources.has(key))return;
 const text=await Bun.file(path).text();sources.set(key,text);if(!['.ts','.js'].includes(extname(path)))return;
 for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
  const base=resolve(dirname(path),match[1]);let found:string|undefined;for(const candidate of [base,base+'.ts',base+'.json',resolve(base,'index.ts')])if(await Bun.file(candidate).exists()){found=candidate;break;}
  if(!found)throw Error('Unresolved import '+match[1]);await capture(found);
 }
}
await capture(import.meta.path);for(const p of ['tests/security/protection/current-query-presence-source.json','tests/security/protection/current-query-read-scenarios.json','package.json','bun.lock',Bun.resolveSync('ajv/package.json',process.cwd())])await capture(p);
const controls:any[]=[],check=(id:string,passed:boolean)=>{controls.push({id,passed});if(!passed)throw Error(id);};
const canonical=(x:any):string=>x&&typeof x==='object'?Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const packets:any[]=[];
const source=await Bun.file(root+'tests/security/protection/current-query-presence-source.json').json();
const scenarios=await Bun.file(root+'tests/security/protection/current-query-read-scenarios.json').json();
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const results=[];
for(const variant of ['allowed','undisclosed','revoked','foreign-subject','foreign-assignment-staff','foreign-assignment-project','foreign-ownership-project','no-ownership','no-assignment','incomplete-coverage','stale-generation'])for(const state of ['string','null','absent','unreported']){
 const policy=structuredClone(source.policy);if(variant!=='undisclosed'){policy.revision='query-presence-token-read-policy-r2';policy.rules[0].disclosure.push({field:ref('token'),disposition:{kind:'original'}});}
 const owner=structuredClone(source.owner);owner.revision='query-presence-read-owner-r2';owner.disclosure={readAction:'read'};
 const cut=structuredClone(scenarios.cut);cut.generation=cut.expectedGeneration='query-presence-supplied-cut-r2';cut.policy={id:policy.id,revision:policy.revision};cut.ontology={documentId:source.ontology.documentId,revision:source.ontology.revision};cut.protection={id:source.catalog.id,revision:source.catalog.revision};cut.domains=source.closure.pins;cut.owner={id:owner.id,revision:owner.revision};
 const fact=cut.facts.find((f:any)=>f.type.elementId==='Resource');fact.fields=fact.fields.filter((f:any)=>f.field.elementId!=='token');fact.absent=[];
 if(state==='absent')fact.absent.push(ref('token'));else if(state!=='unreported')fact.fields.push({field:ref('token'),value:state==='null'?null:{string:'opaque-token'}});
 if(variant==='revoked')cut.facts.find((f:any)=>f.type.elementId==='Assignment').fields.find((f:any)=>f.field.elementId==='active').value={boolean:false};
 const addIdentity=(type:string,idField:string,value:string)=>{const f=structuredClone(cut.facts.find((f:any)=>f.type.elementId===type));f.key=[{string:value}];f.fields=[{field:ref(idField),value:{string:value}}];cut.facts.push(f);};
 if(variant==='foreign-subject'||variant==='foreign-assignment-staff')addIdentity('Staff','staffId','bob');
 if(variant==='foreign-subject')cut.subject.key=[{string:'bob'}];
 if(variant==='foreign-assignment-staff')cut.facts.find((f:any)=>f.type.elementId==='Assignment').fields.find((f:any)=>f.field.elementId==='assignmentStaff').value={string:'bob'};
 if(variant==='foreign-assignment-project'||variant==='foreign-ownership-project')addIdentity('Project','projectId','p2');
 if(variant==='foreign-assignment-project')cut.facts.find((f:any)=>f.type.elementId==='Assignment').fields.find((f:any)=>f.field.elementId==='assignmentProject').value={string:'p2'};
 if(variant==='foreign-ownership-project')cut.facts.find((f:any)=>f.type.elementId==='Ownership').fields.find((f:any)=>f.field.elementId==='ownerProject').value={string:'p2'};
 if(variant==='no-ownership')cut.facts=cut.facts.filter((f:any)=>f.type.elementId!=='Ownership');
 if(variant==='no-assignment')cut.facts=cut.facts.filter((f:any)=>f.type.elementId!=='Assignment');
 if(variant==='incomplete-coverage')cut.coverage.find((f:any)=>f.type.elementId==='Resource').fields=cut.coverage.find((f:any)=>f.type.elementId==='Resource').fields.filter((f:any)=>f.elementId!=='token');
 if(variant==='stale-generation')cut.expectedGeneration='other';
 const program=compileCandidateCatalogProgram(policy,source.catalog,source.closure,source.ontology);const scan=evaluateCandidateCatalogScan(program,owner,cut,{type:ref('Resource'),fields:[ref('token')]});
 const validPresence=state!=='unreported',rendered=validPresence&&!['undisclosed','incomplete-coverage','stale-generation'].includes(variant);
 const expectedRows=variant!=='allowed'||!validPresence?[]:[[{field:ref('token'),disposition:state==='absent'?'absent':'original',...(state==='absent'?{}:{value:state==='null'?null:{string:'opaque-token'}})}]];
 const expected={status:rendered?'rendered':'refused',complete:false,authority:false,rows:expectedRows,valueProfiles:[]};
 check(variant+':'+state+':exact-result',canonical(scan)===canonical(expected));
 check(variant+':'+state+':no-authority',!scan.complete&&!scan.authority);
 packets.push({variant,state,policy,owner,cut});results.push({variant,state,expected,scan});
}
for(const [path,text]of sources)check('unchanged:'+path,await Bun.file(path).text()===text);
const snapshot={sources:Object.fromEntries(sources),sourcePins:Object.fromEntries(Array.from(sources,([path,text])=>[path,sha(text)])),externalDependencyAssumptions:{bun:Bun.version,ajvVersion:JSON.parse(sources.get(relative(process.cwd(),Bun.resolveSync('ajv/package.json',process.cwd())))!).version,externalClosureHermetic:false},packets};
const snapshotText=JSON.stringify(snapshot,null,2)+'\n';await Bun.write(output+'/inputs.json',snapshotText);
await Bun.write(output+'/receipt.json',JSON.stringify({status:'passed',controls,results,inputSnapshotSha256:sha(snapshotText),scope:'Actual UMF candidate logical evaluator over an explicitly authored optional queryable model, separate Token-disclosure policy and complete supplied cuts. Exact source and model memberships preserved. Complete/authority remain false: no authenticated native source, actor/current-cut custody, compiler .4 composition, transform execution, operator authorization, P03/B08/backend acceptance or case promotion.'},null,2)+'\n');
console.log(JSON.stringify({status:'passed',scenarios:results.length,controls:controls.length,selectedSources:sources.size}));
