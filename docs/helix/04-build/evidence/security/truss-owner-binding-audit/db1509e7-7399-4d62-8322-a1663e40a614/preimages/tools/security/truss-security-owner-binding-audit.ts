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
const oracle=JSON.parse(original),ontologyOracle=JSON.parse(owner.request.ontologyJson);
const originalRecord=(r:any)=>oracle.modules.find((m:any)=>m.id===r.moduleId).elements.find((e:any)=>e.id===r.elementId);
const originalRecords=oracle.modules.flatMap((m:any)=>m.elements.filter((e:any)=>e.kind==='record').map((e:any)=>({moduleId:m.id,elementId:e.id})));
const keysPreserved=(rows:any)=>rows.records.length===originalRecords.length&&rows.records.every((r:any)=>JSON.stringify(r.keys)===JSON.stringify(originalRecord(r).keys));
const fieldsPreserved=(rows:any)=>rows.records.length===originalRecords.length&&rows.records.every((r:any)=>r.fields.length===originalRecord(r).members.length&&r.fields.every((f:any,i:number)=>JSON.stringify(f.reference)===JSON.stringify(originalRecord(r).members[i])&&JSON.stringify(f.declaration)===JSON.stringify(oracle.modules.find((m:any)=>m.id===f.fieldModule).elements.find((e:any)=>e.id===f.fieldId))));
const declarations=collectCatalogDeclarations(doc.id,doc);
const unspecified=declarations.records.flatMap((r:any)=>r.keys.filter((k:any)=>!Object.hasOwn(k,'primary')).map((k:any)=>({documentId:r.documentId,moduleId:r.moduleId,elementId:r.elementId,keyId:k.id})));
const observations=[
 {id:'original-five-records',expected:5,observed:declarations.records.length},
 {id:'original-five-unspecified-primary-roles',expected:['Staff','Project','Resource','Ownership','Assignment'],observed:unspecified.map((k:any)=>k.elementId)},
 {id:'original-core-no-relationships',expected:0,observed:declarations.relationships.length},
 {id:'ontology-associations-retain-endpoints',expected:ontologyOracle.associations.map((a:any)=>[a.type,a.endpoints]),observed:ontology.associations.map((a:any)=>[a.type,a.endpoints])},
 {id:'full-original-salary-field-preserved',expected:{scalarType:'integer',nullability:'required',cardinality:'one',integerWidth:{bits:64,signed:true}},observed:(()=>{const f=declarations.records.find((r:any)=>r.elementId==='Resource').fields.find((f:any)=>f.fieldId==='salary').declaration;return {scalarType:f.scalarType,nullability:f.nullability,cardinality:f.cardinality,integerWidth:f.facets.integerWidth};})()},
 {id:'collector-preserves-original-key-semantics',expected:true,observed:keysPreserved(declarations)},
 {id:'actual-stager-preserves-optional-primary-marker',expected:true,observed:new TextDecoder().decode(frozen.get(stager)!).includes("if(Object.hasOwn(key,'primary')&&typeof key.primary!=='boolean')throw Error('Original primary key marker must be Boolean')")},
 {id:'collector-preserves-complete-field-declarations',expected:true,observed:fieldsPreserved(declarations)},
 {id:'collector-preserves-entire-original-document',expected:oracle,observed:doc}
];
for(const kind of ['composite-key-order','salary-field-facet','unknown-extension']){
 const mutated=JSON.parse(original),borrowed=collectCatalogDeclarations(mutated.id,mutated);
 if(kind==='composite-key-order')borrowed.records.find((r:any)=>r.elementId==='Ownership').keys[0].fields.reverse();
 if(kind==='salary-field-facet')delete borrowed.records.find((r:any)=>r.elementId==='Resource').fields.find((f:any)=>f.fieldId==='salary').declaration.facets.integerWidth;
 if(kind==='unknown-extension')borrowed.records[0].declaration.extensions['audit:unrecognized']={retained:false};
 observations.push({id:'reject-borrowed-mutation-'+kind,expected:false,observed:JSON.stringify(mutated)===JSON.stringify(oracle)&&keysPreserved(borrowed)&&fieldsPreserved(borrowed)});
}
observations.push({id:'reject-incomplete-record-result',expected:false,observed:keysPreserved({...declarations,records:declarations.records.slice(1)})});
observations.push({id:'reject-incomplete-field-result',expected:false,observed:fieldsPreserved({...declarations,records:declarations.records.map((r:any,i:number)=>i===0?{...r,fields:r.fields.slice(1)}:r)})});
if(observations.some(o=>JSON.stringify(o.expected)!==JSON.stringify(o.observed)))throw Error('Owner binding audit mismatch');
for(const [path,bytes]of frozen)if(digest(new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer()))!==digest(bytes))throw Error('Original source drift');
await Bun.write(resolve(out,'audit.json'),JSON.stringify({status:'source-audit-passed',sourceSha256:pins,observations,unspecifiedPrimaryRoles:unspecified,scope:'Actual frozen post-validation declaration collector plus literal source inspection of staging guard. No fresh owner validation, catalog preparation/staging or binding authority.',remaining:['Native non-primary projection preserves absent original marker; no inferred primary rewrite','Owner-issued physical relationship binding for both ontology associations with exact native source provenance','Complete record/property staging includes integer salary and unknown content even where read predicate selects only key fields','Authenticated owner/artifact/current-cut/installed closure and final publication remain separate'],acceptancePromoted:false},null,2)+'\n');
console.log(JSON.stringify({run:out.split('/').at(-1),observations:observations.length,status:'source-audit-passed'}));
