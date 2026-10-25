import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {inspectSecurityPolicy} from '../../../../../../src/extensions/security/policy';

const packetPath='docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/expression-bounds-cases.json';
const packet=JSON.parse(readFileSync(packetPath,'utf8')) as any;
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
for(const [file,digest] of [[packet.predecessor.source,packet.predecessor.sourceSha256],[packet.predecessor.testSource,packet.predecessor.testSourceSha256],[packet.predecessor.contract,packet.predecessor.contractSha256]]) {
  assert.equal(hash(file),digest,`source changed: ${file}`);
}
const literal=()=>({op:'literal',value:true});
const chain=(depth:number)=>{let expression=literal();for(let i=1;i<depth;i++)expression={op:'not',arg:expression};return expression;};
const tree=(nodes:number)=>{
  const branches:unknown[]=[];let remaining=nodes-1;
  while(remaining>0){const branchNodes=Math.min(remaining,64);branches.push({op:'and',args:Array.from({length:branchNodes-1},literal)});remaining-=branchNodes;}
  return {op:'or',args:branches};
};
const expression=(builder:any)=>{
  if(builder.depth!==undefined)return chain(builder.depth);
  if(builder.nodes!==undefined)return tree(builder.nodes);
  if(builder.depthFirstDepth!==undefined)return {op:'and',args:[chain(builder.depthFirstDepth),literal()]};
  throw new Error('unknown builder');
};
for(const row of packet.cases){
  const policy={vocabulary:'umf.security',version:'0.1.0',id:'p',revision:'r',ontology:{documentId:'d',revision:'r'},rules:[{id:'rule',effect:'permit',actions:['read'],target:[{documentId:'d',moduleId:'m',elementId:'R'}],condition:expression(row.builder)}]};
  const inspection=inspectSecurityPolicy(policy);
  const actual=inspection.diagnostics.find((diagnostic:any)=>diagnostic.code==='SECURITY_BOUND');
  if(row.expected)assert.deepEqual(actual&&{code:actual.code,path:actual.path,message:actual.message},row.expected,row.name);
  else assert.equal(actual,undefined,`${row.name}: ${JSON.stringify(inspection.diagnostics)}`);
}
console.log(JSON.stringify({runtime:process.versions.bun,cases:packet.cases.length,boundCases:packet.cases.filter((row:any)=>row.expected).length,sourceHashes:'matched'}));
