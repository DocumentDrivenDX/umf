/** Original compiler-source bridge to backend-owned native key correspondence. */
import {lowerSecurityRowPredicate} from '/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts';
import {securityNativeKeysCorrespond} from '/Users/erik/Projects/truss/packages/postgresql/src/security-native-key.ts';
const packet=JSON.parse(await Bun.stdin.text());
const {artifact,inventory,types,catalog}=packet;
const isTyped=types.some((t:any)=>t.discriminator!==undefined);
// The native runner separately replays the actual compiler binary and checks
// exact source/handoff hashes. This bridge cannot authenticate caller packets.
const declarations=artifact.handoff.scans.flatMap((scan:any)=>scan.actions.flatMap((action:any)=>action.keys.map((key:any)=>{
 const original=artifact.request.modules.find((m:any)=>m.pin.documentId===key.target.documentId);
 const document=JSON.parse(original.documentJson),module=document.modules.find((m:any)=>m.id===key.target.moduleId);
 const record=module.elements.find((e:any)=>e.id===key.target.elementId),selected=record.keys.find((k:any)=>k.id===key.keyId);
 if(JSON.stringify(selected.fields.map((f:any)=>f.element))!==JSON.stringify(key.fields.map((f:any)=>f.elementId)))throw Error('Original key order differs');
 return {target:key.target,keyId:key.keyId,fields:key.fields.map((ref:any)=>{
  const field=module.elements.find((e:any)=>e.id===ref.elementId);
  if(ref.documentId!==key.target.documentId||ref.moduleId!==key.target.moduleId||!field||field.kind!=='field'||Object.keys(field.extensions??{}).length)throw Error('Source subset unsupported');
  return {ref,domain:{scalarType:field.scalarType,nullability:field.nullability,cardinality:field.cardinality,facets:field.facets??{},allowedValues:null}};
 })};
})));
const input={declarations,types,catalog,modelPins:artifact.handoff.modelPins,inventory};
const accepted=securityNativeKeysCorrespond(input);
const refusals:Record<string,boolean>={};
function staffTable(v:any){const type=v.types.find((t:any)=>t.type.elementId==='Staff');return v.inventory.tables.find((t:any)=>t.home.schema===type.home.schema&&t.home.table===type.home.table);}
function reject(id:string,change:(v:any)=>void){const variant=structuredClone(input);change(variant);refusals[id]=!securityNativeKeysCorrespond(variant);}
if(isTyped){
reject('missing-type-source',v=>delete v.inventory.tables[0].typeSources);
reject('duplicate-type-source',v=>v.inventory.tables[0].typeSources.push(structuredClone(v.inventory.tables[0].typeSources[0])));
reject('changed-source-pin',v=>v.inventory.tables[0].typeSources[0].sourcePin.sha256='0'.repeat(64));
reject('swapped-type-tags',v=>{const a=v.types.find((t:any)=>t.type.elementId==='Staff'),b=v.types.find((t:any)=>t.type.elementId==='Project');[a.discriminator.value,b.discriminator.value]=[b.discriminator.value,a.discriminator.value];});
}
reject('reversed-key-components',v=>v.types.find((t:any)=>t.type.elementId==='Assignment').keyFields.reverse());
reject('predicate-key-column-mismatch',v=>v.types.find((t:any)=>t.type.elementId==='Staff').fields[0].column='wrong');
if(isTyped){
reject('extra-primary-key-column',v=>v.inventory.tables[0].keys.find((k:any)=>k.primary).columns.push('extra'));
reject('missing-primary-type-prefix',v=>v.inventory.tables[0].keys.find((k:any)=>k.primary).columns.shift());
reject('nullable-type-column',v=>v.inventory.tables[0].columns.find((c:any)=>c.name==='type_id').notNull=false);
reject('text-encoded-type-column',v=>v.inventory.tables[0].columns.find((c:any)=>c.name==='type_id').type='text');
}
reject('nullable-key',v=>staffTable(v).columns.find((c:any)=>c.name==='id').notNull=false);
reject('nondeterministic-key',v=>staffTable(v).columns.find((c:any)=>c.name==='id').deterministic=false);
reject('malformed-logical-facets',v=>v.declarations[0].fields[0].domain.facets=[]);
reject('malformed-native-primary-flag',v=>staffTable(v).keys.find((k:any)=>k.primary).primary='true');
reject('logical-key-domain-mismatch',v=>v.declarations[0].fields[0].domain.scalarType='integer');
reject('incomplete-source-key-set',v=>v.declarations=v.declarations.filter((d:any)=>d.target.elementId!=='Staff'));
reject('wrong-catalog',v=>v.catalog='other');
reject('unqualified-engine',v=>v.inventory.engine='170008');
const resolved={declarations,types,catalog,modelPins:artifact.handoff.modelPins,inventory};
const predicate=accepted?lowerSecurityRowPredicate({logicalPlan:artifact.handoff.securityLogicalPlan,action:'read',target:{documentId:'domain',moduleId:'m',elementId:'Resource'},subject:JSON.parse(artifact.request.ontologyJson).subject,subjectLoginColumn:'native_login',types,resourceDiscriminatorParameter:isTyped?2:undefined}):undefined;
process.stdout.write(JSON.stringify({accepted,refusals,resolved,predicate})+'\n');
