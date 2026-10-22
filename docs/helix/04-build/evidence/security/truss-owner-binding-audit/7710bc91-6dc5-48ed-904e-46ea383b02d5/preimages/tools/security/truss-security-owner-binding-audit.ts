/** Read-only source/declaration audit; no validation, native staging or authority. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dir,'../..'),self='tools/security/truss-security-owner-binding-audit.ts';
if(process.cwd()!==root||resolve(process.argv[1]!)!==resolve(root,self)||process.argv.length!==2)throw Error('Exact root invocation required');
const ir='docs/helix/04-build/evidence/security/weft-handoff.json';
const collector='/private/tmp/truss-security-main-integration/packages/umf-bun/src/catalog-declarations.ts';
const stager='/private/tmp/truss-security-main-integration/packages/umf-bun/src/catalog-new-stage.ts';
const native='docs/helix/04-build/evidence/security/truss-graph-capture-candidate/f4186d8d-38ff-461d-9f0c-deefd7b8969f/native.json';
const digest=(bytes:Uint8Array)=>new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
const paths=[self,ir,collector,stager,native];
const frozen=new Map<string,Uint8Array>();for(const path of paths)frozen.set(path,new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer()));
const pins=Object.fromEntries([...frozen].map(([path,bytes])=>[path,digest(bytes)]));
const prior=JSON.parse(new TextDecoder().decode(frozen.get(native)!));if(prior.sourceSha256[ir]!==pins[ir])throw Error('Original IR source differs');
const owner=JSON.parse(new TextDecoder().decode(frozen.get(ir)!)).artifacts.find((a:any)=>a.id==='natural-count-self-join');
const original=owner.request.modules[0].documentJson,doc=JSON.parse(original),ontology=JSON.parse(owner.request.ontologyJson);
const out=resolve(root,'docs/helix/04-build/evidence/security/truss-owner-binding-audit',crypto.randomUUID());
for(const [path,bytes]of frozen)await Bun.write(resolve(out,'preimages',path.startsWith('/')?path.slice(1):path),bytes);
await Bun.write(resolve(out,'start.json'),JSON.stringify({sourceSha256:pins},null,2)+'\n');
const frozenCollector=resolve(out,'frozen-owner/catalog-declarations.ts');await Bun.write(frozenCollector,frozen.get(collector)!);
const {collectCatalogDeclarations}=await import(pathToFileURL(frozenCollector).href);
const declarations=collectCatalogDeclarations(doc.id,doc);
const unspecified=declarations.records.flatMap((r:any)=>r.keys.filter((k:any)=>!Object.hasOwn(k,'primary')).map((k:any)=>({documentId:r.documentId,moduleId:r.moduleId,elementId:r.elementId,keyId:k.id})));
const observations=[
 {id:'original-five-records',expected:5,observed:declarations.records.length},
 {id:'original-five-unspecified-primary-roles',expected:['Staff','Project','Resource','Ownership','Assignment'],observed:unspecified.map((k:any)=>k.elementId)},
 {id:'original-core-no-relationships',expected:0,observed:declarations.relationships.length},
 {id:'ontology-associations-retain-endpoints',expected:[['Ownership',2],['Assignment',2]],observed:ontology.associations.map((a:any)=>[a.type.elementId,a.endpoints.length])},
 {id:'full-original-salary-field-preserved',expected:{scalarType:'integer',nullability:'required',cardinality:'one',integerWidth:{bits:64,signed:true}},observed:(()=>{const f=declarations.records.find((r:any)=>r.elementId==='Resource').fields.find((f:any)=>f.fieldId==='salary').declaration;return {scalarType:f.scalarType,nullability:f.nullability,cardinality:f.cardinality,integerWidth:f.facets.integerWidth};})()},
 {id:'collector-preserves-original-key-semantics',expected:true,observed:declarations.records.every((r:any)=>JSON.stringify(r.keys)===JSON.stringify(doc.modules.find((m:any)=>m.id===r.moduleId).elements.find((e:any)=>e.id===r.elementId).keys))},
 {id:'actual-stager-requires-explicit-primary-boolean',expected:true,observed:new TextDecoder().decode(frozen.get(stager)!).includes("if(typeof key.primary!=='boolean')throw Error('Original primary key selection required')")},
 {id:'original-owner-document-remains-exact',expected:original,observed:owner.request.modules[0].documentJson}
];
if(observations.some(o=>JSON.stringify(o.expected)!==JSON.stringify(o.observed)))throw Error('Owner binding audit mismatch');
for(const [path,bytes]of frozen)if(digest(new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer()))!==digest(bytes))throw Error('Original source drift');
await Bun.write(resolve(out,'audit.json'),JSON.stringify({status:'source-audit-passed',sourceSha256:pins,observations,unspecifiedPrimaryRoles:unspecified,scope:'Actual frozen post-validation declaration collector plus literal source inspection of staging guard. No fresh owner validation, catalog preparation/staging or binding authority.',remaining:['Owner-issued native key-role selections must preserve unspecified core primary meaning; no inferred primary rewrite','Owner-issued physical relationship binding for both ontology associations with exact native source provenance','Complete record/property staging includes integer salary and unknown content even where read predicate selects only key fields','Authenticated owner/artifact/current-cut/installed closure and final publication remain separate'],acceptancePromoted:false},null,2)+'\n');
console.log(JSON.stringify({run:out.split('/').at(-1),observations:observations.length,status:'source-audit-passed'}));
