/** Executable draft selection analysis; not public ontology admission. */
import {resolveCandidateRelationship,requireCandidateWitnessTerm} from '../../src/extensions/security/relationship-candidate';
import Ajv2020 from 'ajv/dist/2020';
import {createHash} from 'node:crypto';
const paths=['src/extensions/security/relationship-candidate.ts','src/model/json.ts','src/model/types.ts','docs/helix/02-design/spikes/security/relationship-selector.schema.json','tools/security/relationship-selector-spike.ts','docs/helix/04-build/evidence/security/truss-graph-native-stage.json'];
const digest=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
const pins=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
const schema=await Bun.file(paths[3]!).json(),foundation=await Bun.file(paths[5]!).json();
for(const [p,h] of Object.entries(foundation.sourceDigests)){if(await digest(p)!==h)throw Error('Stale graph foundation');pins[p]=h as string;}
const validate=new Ajv2020({strict:true}).compile<any>(schema),model=foundation.originalModel;
const ref=(elementId:string)=>({documentId:model.id,moduleId:'m',elementId});
const original={kind:'core-relationship',relationship:{documentId:model.id,moduleId:'m',relationshipId:'WorksOn'},witness:{kind:'record-key',type:ref('Assignment'),keyId:'code-key'},endpoints:[{role:'staff',side:'source',target:ref('Employee'),keyId:'code-key'},{role:'project',side:'target',target:ref('Project'),keyId:'code-key'}]};
const entities=['Employee','Project'].map(elementId=>({type:ref(elementId),keyId:'code-key'}));
function admits(packet:any):boolean{if(!validate(packet))return false;try{resolveCandidateRelationship(packet,model,entities);return true;}catch{return false;}}
const observations:{id:string;expected:boolean;observed:boolean}[]=[];
const check=(id:string,expected:boolean,packet:any)=>observations.push({id,expected,observed:admits(packet)});
check('original-record-key-selection',true,original);
const bare=structuredClone(original);bare.relationship.relationshipId='BareWorksOn';(bare as any).witness={kind:'opaque-existential'};check('bare-opaque-witness-selection',true,bare);
const mutations:Record<string,(p:any)=>void>={
 'foreign-document':p=>p.relationship.documentId='other',
 'missing-relationship':p=>p.relationship.relationshipId='missing',
 'duplicate-side':p=>p.endpoints[1].side='source',
 'duplicate-role':p=>p.endpoints[1].role='staff',
 'wrong-target':p=>p.endpoints[1].target=ref('Employee'),
 'missing-endpoint-key':p=>p.endpoints[0].keyId='missing',
 'wrong-association-record':p=>p.witness.type=ref('Employee'),
 'missing-association-key':p=>p.witness.keyId='missing',
 'opaque-discards-record-identity':p=>p.witness={kind:'opaque-existential'},
 'unknown-selector':p=>p.future=true,
 'fields-invent-endpoint':p=>p.endpoints[0].fields=[ref('Assignment-code')],
 'bare-invents-record':p=>p.relationship.relationshipId='BareWorksOn'
};
for(const [id,mutate] of Object.entries(mutations)){const packet=structuredClone(original);mutate(packet);check(id,false,packet);}
const plans={original:resolveCandidateRelationship(original,model,entities),bare:resolveCandidateRelationship(bare,model,entities)};
if(observations.some(o=>o.expected!==o.observed))throw Error('Draft selector analysis mismatch');
for(const [p,h] of Object.entries(pins))if(await digest(p)!==h)throw Error('Selection source changed');
await Bun.write('docs/helix/04-build/evidence/security/relationship-selector-spike.json',JSON.stringify({status:'draft-selector-analysis-passed',nativeImplementationQualified:false,sourceDigests:pins,original,bare,entities,model,plans,observations,scope:'Draft directed singular-endpoint source resolution over retained original graph model. No public ontology version, policy typing, evaluator/compiler migration, scalar/Key domain equivalence, source authentication, bare witness issuance, physical mapping or backend acceptance.'},null,2)+'\n');
console.log(JSON.stringify({status:'draft-selector-analysis-passed',checks:observations.length}));
