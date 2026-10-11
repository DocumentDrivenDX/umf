// Retained Astra bounded degree/lifecycle probe. Mock SQL; no native transaction or field-admission claim.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyReferenceGraph} from './graph';
import {encodeReferenceIdentity as enc} from './codec';
const source=JSON.parse(fs.readFileSync('fixtures/actions/approve.json','utf8'));
const record={module:'sales',element:'order'},relationship={module:'sales',relationship:'loop'};
source.modules[0].relationships=[{id:'loop',name:'loop',source:[record],target:[{...record,key:'pk'}],sourceMultiplicity:{min:1,max:1},targetMultiplicity:{min:1,max:1},targetLifecycle:'independent',directed:true}];
const entity=id=>({id,record,fields:{},version:'v0'}),a=entity('1'),b=entity('2'),c=entity('created:0'),ids=[a.id,b.id,c.id],edge=(s,t)=>({relationship,sourceEntity:s,targetEntity:t});
const all=ids.flatMap(s=>ids.map(t=>edge(s,t))),native=all.filter(e=>e.sourceEntity!=='created:0'&&e.targetEntity!=='created:0'),key=e=>e.sourceEntity+'>'+e.targetEntity;
let checked=0,accepted=0,mismatches=[];
for(let beforeBits=0;beforeBits<16;beforeBits++){
 const before=native.filter((_,i)=>beforeBits&(1<<i));
 const tx=async(strings,...values)=>{
  const sql=strings.join('?');if(sql.startsWith('select record'))return [{record:enc(record)}];
  const id=values[values.length-1],incident=before.filter(e=>e.sourceEntity===id||e.targetEntity===id);
  if(sql.startsWith('select relationship'))return incident.map(e=>({relationship:enc(relationship),source_entity:e.sourceEntity,target_entity:e.targetEntity}));
  return incident.map(e=>({source_entity:e.sourceEntity,target_entity:e.targetEntity,source_record:enc(record),target_record:enc(record)}));
 };
 for(let finalBits=0;finalBits<512;finalBits++)for(let deletes=0;deletes<4;deletes++){
  const after=all.filter((_,i)=>finalBits&(1<<i)),beforeKeys=new Set(before.map(key)),afterKeys=new Set(after.map(key));
  const links=[...before.filter(e=>!afterKeys.has(key(e))).map(link=>({kind:'unlinked',link})),...after.filter(e=>!beforeKeys.has(key(e))).map(link=>({kind:'linked',link}))];
  const deleted=new Set([a,b].filter((_,i)=>deletes&(1<<i)).map(e=>e.id)),affected=new Set([c.id,...deleted,...links.flatMap(x=>[x.link.sourceEntity,x.link.targetEntity])]);
  let expected=!after.some(e=>deleted.has(e.sourceEntity)||deleted.has(e.targetEntity));for(const id of affected)if(!deleted.has(id))expected&&=after.filter(e=>e.sourceEntity===id).length===1&&after.filter(e=>e.targetEntity===id).length===1;
  let actual=true,code;try{await verifyReferenceGraph(tx,{id:'store'},source,{entities:[a,b],changes:[{kind:'created',entity:c},...[a,b].filter(e=>deleted.has(e.id)).map(entity=>({kind:'deleted',entity}))],links});}catch(e){actual=false;code=e.code;}
  checked++;if(actual)accepted++;if(actual!==expected)mismatches.push({beforeBits,finalBits,deletes,expected,actual,code});
 }
}
if(checked!==32768||accepted!==202||mismatches.length)throw Error(JSON.stringify({checked,accepted,mismatches}));
const paths=['scripts/actions-reference/graph-oracle.mjs','scripts/actions-reference/graph.ts','scripts/actions-reference/creation-relationships.ts','scripts/actions-reference/codec.ts','src/extensions/actions/known-model.ts','fixtures/actions/approve.json'];
const report={profile:'graph-counts-bounded-1',scope:'Mocked SQL degree/set/deletion algorithm only; two native vertices, one created vertex, one self/cross relationship, exact min=1/max=1 both roles. Excludes native SQL, fields, identity admission, transactions and full profile refinement.',bun:Bun.version,command:'bun scripts/actions-reference/graph-oracle.mjs',checked,accepted,mismatchCount:mismatches.length,sha256:Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]))};
fs.writeFileSync('fixtures/actions/graph-oracle.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({profile:report.profile,checked,accepted,mismatchCount:report.mismatchCount}));
