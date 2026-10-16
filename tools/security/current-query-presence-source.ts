/** Explicit queryable presence source; original membership is never invented. @covers US-056-AC6 */
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,extname} from 'node:path';
import {validateDocument} from '../../src/validation/document';
import {validateCoreRecordValues} from '../../src/model/record-values';
const output=process.argv[2];if(!output||await Bun.file(output).exists())throw Error('Fresh explicit output path required');
const names=['tests/security/protection/current-query-source.json','tests/security/protection/current-query-presence-source.json','tests/security/protection/disclosure-fixtures.json'];
const bytes=await Promise.all(names.map(n=>Bun.file(n).text()));const [old,f,disclosure]=bytes.map(JSON.parse);
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const executionSources=new Map<string,string>();
async function capture(path:string):Promise<void>{
 path=resolve(path);const key=relative(process.cwd(),path);if(key.startsWith('../')||key==='..')throw Error('Source escaped repository');
 if(executionSources.has(key))return;const source=await Bun.file(path).text();executionSources.set(key,source);
 if(!['.ts','.js'].includes(extname(path)))return;
 for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
  const base=resolve(dirname(path),match[1]);let found:string|undefined;
  for(const candidate of [base,base+'.ts',base+'.json',resolve(base,'index.ts')])if(await Bun.file(candidate).exists()){found=candidate;break;}
  if(!found)throw Error('Unresolved source import '+match[1]);await capture(found);
 }
}
await capture(import.meta.path);
const ajvPackage=Bun.resolveSync('ajv/package.json',process.cwd());
for(const path of ['package.json','bun.lock',ajvPackage])await capture(path);
const externalDependencyAssumptions={bun:Bun.version,ajvPackage:relative(process.cwd(),ajvPackage),ajvVersion:JSON.parse(executionSources.get(relative(process.cwd(),ajvPackage))!).version,externalClosureHermetic:false,scope:'Manifest/lock/installed Ajv package metadata captured; complete transitive external executable bytes are not hermetically captured.'};
const doc=f.closure.documents[0].document,oldDoc=old.closure.documents[0].document;
const find=(d:any,id:string)=>d.modules[0].elements.find((e:any)=>e.id===id);
const token=find(doc,'token'),oldToken=find(oldDoc,'token');
if(oldToken.nullability!=='required'||token.nullability!=='absent-allowed')throw Error('Explicit availability delta required');
const restored=structuredClone(doc);find(restored,'token').nullability='required';if(JSON.stringify(restored)!==JSON.stringify(oldDoc))throw Error('Unexpected core source change');
const originalToken=find(disclosure.base.closure.documents[0].document,'token');const withoutName=structuredClone(token);delete withoutName.name;
if(JSON.stringify(withoutName)!==JSON.stringify(originalToken))throw Error('Original optional Token constraint changed');
const membership=doc.modules[0].elements.filter((e:any)=>e.kind==='record').map((e:any)=>({id:e.id,members:e.members}));
const originalMembership=oldDoc.modules[0].elements.filter((e:any)=>e.kind==='record').map((e:any)=>({id:e.id,members:e.members}));
if(JSON.stringify(membership)!==JSON.stringify(originalMembership))throw Error('Record membership changed');
const validation=validateDocument(doc);if(!validation.valid)throw Error(JSON.stringify(validation));
const records=[];
for(const tokenValue of [{field:{module:'m',element:'token'},state:'absent'},{field:{module:'m',element:'token'},state:'present',value:null},{field:{module:'m',element:'token'},state:'present',value:{string:'opaque-token'}}]){
 const values=[{field:{module:'m',element:'resourceId'},state:'present',value:{string:'RA'}},{field:{module:'m',element:'salary'},state:'present',value:{integerToken:'333'}},tokenValue];
 const receipt=validateCoreRecordValues(doc,{module:'m',element:'Resource'},values as any);if(!receipt.documentValidation.valid||!receipt.validation.valid)throw Error(JSON.stringify(receipt));records.push(receipt);
}
function request(source:any){
 const document=source.closure.documents[0].document,documentJson=JSON.stringify(document);
 const opaqueSources=['policy','catalog','ontology','owner'].map(role=>{const s=source[role],utf8=JSON.stringify(s);return {role,identity:{documentId:s.id??s.documentId,revision:s.revision},mediaType:'application/json',utf8,sha256:sha(utf8)};});
 return {interfaceVersion:'weft-application-lineage/0.3-candidate',modules:[{documentJson,pin:{documentId:document.id,revision:source.closure.pins[0].revision,umfVersion:document.umf,sha256:sha(documentJson)},selectedModuleIds:['m']}],sql:'SELECT r.token FROM Resource r',parameters:{},opaqueSources};
}
for(let i=0;i<names.length;i++)if(await Bun.file(names[i]).text()!==bytes[i])throw Error('Source changed during observation');
for(const [path,source]of executionSources)if(await Bun.file(path).text()!==source)throw Error('Execution source changed during observation');
await Bun.write(output,JSON.stringify({version:'umf.security.query-presence-source-observation/0.1',sourcePins:Object.fromEntries([...names.map((n,i)=>[n,sha(bytes[i])]),...Array.from(executionSources,([n,source])=>[n,sha(source)])]),source:f,sourceDocumentValidation:validation,externalDependencyAssumptions,membershipUnchanged:true,coreDelta:{field:'domain/m/token',from:'required',to:'absent-allowed',previousRevision:old.closure.pins[0].revision,newRevision:f.closure.pins[0].revision},originalRequirement:{field:{documentId:'s20-core',revision:'d1',moduleId:'m',elementId:'token'},definition:originalToken,scope:'Same declared constraints after removing the existing authored name; distinct qualified Field identity, never an implicit nominal equivalence.'},recordValueReceipts:records,requiredSourceRequest:request(old),optionalSourceRequest:request(f),scope:'Actual public UMF source/Record observations on an explicit authored successor with unchanged membership. Compiler .3 optional refusal expected; native state treatment is a proposal, not operator/actor/caller/current-cut admission.'},null,2)+'\n');
console.log(JSON.stringify({membershipUnchanged:true,recordStates:records.map(r=>r.fields.find(x=>x.field.element==='token')?.state),sourceValidated:true}));
