import {parseAccessTemporal,ACCESS_TEMPORAL_PROFILE} from '../../../../../../src/adapters/access-temporal';
import vectors from '../../../../../../fixtures/access/golden-vectors/temporal-profile.json';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const cases:any[]=[];
function outcome(kind:any,token:any){try{return {status:'ok',value:parseAccessTemporal(kind,token)};}catch(e:any){return {status:'error',name:e?.name,message:e?.message};}}
for(const v of vectors.cases) cases.push({id:v.id,input:{kind:v.kind,token:v.token},outcome:outcome(v.kind,v.token)});
for(const [id,kind,token] of [
 ['offset-minute-60-positive','instant','2024-01-01T00:00:00+23:60'],
 ['offset-minute-60-negative','instant','2024-01-01T00:00:00-23:60'],
 ['negative-23-59-offset','instant','2024-06-15T12:34:56.123456-23:59'],
 ['underflow-max-positive-offset','instant','0001-01-01T00:00:00+23:59'],
 ['overflow-max-negative-offset','instant','9999-12-31T23:59:59.999999-23:59'],
 ['zero-six-fraction-digits','instant','2024-01-01T00:00:00.000000Z'],
] as const) cases.push({id,input:{kind,token},outcome:outcome(kind,token)});
for(const [id,token] of [['raw-null',null],['raw-number',42],['raw-object',{}],['raw-array',[]],['raw-date',new Date(0)],['raw-boxed-string',new String('2024-01-01')]] as const){cases.push({id,hostOnly:true,input:{kind:'instant',tokenType:Object.prototype.toString.call(token),tokenPreview:String(token)},outcome:outcome('instant',token)});}
let trace:string[]=[];const proxy=new Proxy({}, {getPrototypeOf(){trace.push('getPrototypeOf');return Object.prototype;},get(){trace.push('get');return '2024-01-01';}});
cases.push({id:'raw-proxy-token',hostOnly:true,input:{kind:'date',tokenType:'proxy-object'},outcome:{...outcome('date',proxy),trace}});
let getterCalls=0;const accessor={get value(){getterCalls++;return '2024-01-01';}};
cases.push({id:'raw-accessor-object-token',hostOnly:true,input:{kind:'date',tokenType:'accessor-object'},outcome:{...outcome('date',accessor),getterCalls}});
for(const [id,kind,token] of [['kind-before-length','other','x'.repeat(33)],['token-type-before-kind','other',null],['utf16-length-limit','instant','😀'.repeat(17)],['ascii-limit-before-syntax','date','x'.repeat(33)]] as const)
 cases.push({id,input:{kind,token},outcome:outcome(kind,token)});
const sourcePaths=['src/adapters/access-temporal.ts','src/adapters/gregorian-date.ts','src/adapters/rfc3339-exact-instant.ts','fixtures/access/golden-vectors/temporal-profile.json','tests/access-temporal-profile.test.ts','docs/helix/02-design/contracts/CONTRACT-075-access-temporal-profile.md'];
const sourceHashes=Object.fromEntries(sourcePaths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const captureScriptSha256=createHash('sha256').update(readFileSync('docs/helix/04-build/evidence/rust-migration/r5-access-temporal/capture.ts')).digest('hex');
const packet={format:'umf-r5-access-temporal-typescript-predecessor/1',runtime:{bun:Bun.version},profile:ACCESS_TEMPORAL_PROFILE,caseCount:cases.length,captureScriptSha256,sourceHashes,cases};
writeFileSync('docs/helix/04-build/evidence/rust-migration/r5-access-temporal/predecessor.json',JSON.stringify(packet,null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,hostOnly:cases.filter(c=>c.hostOnly).length,sourceHashes}));
