import {aggregate,type Evidence,type Outcome} from '../../../docs/helix/05-deploy/reference/model';
import {source,read,text,paths,root} from '../io';
import {resolve} from 'node:path';
export function normalize(reader:string,d:any):Outcome {
 if(reader==='json-schema-upstream'){if(!Array.isArray(d.records))throw Error('REFERENCE_STRUCTURE upstream records');const pass=d.records.every((r:any)=>r.preservation==='passed'&&r.oracle==='passed'&&!r.mismatches?.length&&!r.parityMismatches?.length);return pass?'passed':'mixed';}
 if(reader==='json-schema-python'){if(!d.outcomes||!Array.isArray(d.records))throw Error('REFERENCE_STRUCTURE python outcomes');return d.outcomes.failed?d.outcomes.passed?'mixed':'failed':'passed';}
 if(reader==='protobuf-descriptor'){if(typeof d.nativeDescriptorTextEquality!=='boolean')throw Error('REFERENCE_STRUCTURE descriptor equality');return d.nativeDescriptorTextEquality?'passed':'failed';}
 if(reader==='protobuf-emission'){if(typeof d.editedNativeDescriptorEquality!=='boolean')throw Error('REFERENCE_STRUCTURE emission equality');return d.editedNativeDescriptorEquality?'passed':'failed';}
 if(reader==='core-gate'){if(!d.idealAdmission&&!d.admission&&typeof d.idealAdmitted!=='boolean')throw Error('REFERENCE_STRUCTURE core gate');if(d.admission?.idealAdmitted===false||d.idealAdmitted===false||d.idealAdmission?.outcome==='failed')return 'failed';if(d.idealAdmission&&!d.idealAdmission.systems?.length)throw Error('REFERENCE_STRUCTURE core binding systems');return 'passed';}
 if(reader==='acceptance'){if(!d.results||typeof d.results.failures!=='number')throw Error('REFERENCE_STRUCTURE acceptance counters');return d.results.failures?'failed':'passed';}
 if(reader==='certificate'){if(typeof d.certified!=='boolean')throw Error('REFERENCE_STRUCTURE certificate');return d.certified?'passed':'failed';}
 if(reader==='protobuf-corpus'){if(d.beforeAndAfter==='passed'&&typeof d.cases==='number'&&d.checks&&d.negativeControls)return 'passed';if(d.compiled===true&&typeof d.nativeDescriptorAgreement==='boolean')return d.nativeDescriptorAgreement?'passed':'failed';if(!Array.isArray(d.records)&&!Array.isArray(d.results))return 'unassessed';const records=d.records??d.results;const outcomes=records.map((r:any)=>r.outcome??r.status);return outcomes.some((v:any)=>v==='failed'||v==='unsupported')?'mixed':outcomes.every((v:any)=>v==='passed')?'passed':'unassessed';}
 if(reader==='source-only')return 'unassessed';throw Error('REFERENCE_LINK unknown reader '+reader);
}
export function correspondence(required:string[],hashes:{path:string;sha256:string}[],actual:Record<string,string>):Evidence['correspondence'] {
 if(hashes.some(h=>actual[h.path]&&actual[h.path]!==h.sha256))return 'historical';
 return required.length&&required.every(p=>hashes.some(h=>h.path===p)&&actual[p])?'matching':'unknown';
}
export async function evidence(allocation:any,operation:any):Promise<Evidence>{
 const recordSource=await source(allocation.recordPath);let d:any;
 if(allocation.recordPath.endsWith('.json')){d=await read(allocation.recordPath);for(const segment of allocation.selector.split('/').slice(1)){const key=segment.replaceAll('~1','/').replaceAll('~0','~');if(!d||!Object.hasOwn(d,key))throw Error('REFERENCE_LINK missing selector '+allocation.id);d=d[key];}}
 else {const raw=await text(allocation.recordPath);if(allocation.selector&&!raw.toLowerCase().includes(allocation.selector.toLowerCase()))throw Error('REFERENCE_LINK missing prose selector');d={};}
 const outcome=normalize(allocation.readerId,d);const versions:Record<string,string>={};for(const k of ['compiler','runtime','oracle','nativeOracle','nativeVersion','versions','pydantic','dialect','serverVersion','parserVersion','printer'])if(d[k]!==undefined)versions[k]=typeof d[k]==='string'?d[k]:JSON.stringify(d[k]);
 if(d.systems&&typeof d.systems==='object'&&!Array.isArray(d.systems)&&operation.sourceSystem in d.systems){const native=d.systems[operation.sourceSystem];for(const [k,v]of Object.entries(native))if(/version|oracle|runtime/i.test(k))versions[operation.sourceSystem+'.'+k]=typeof v==='string'?v:JSON.stringify(v);}
 const hashes:{path:string;sha256:string}[]=[];const scan=(v:any)=>{if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)&&k.includes('/'))hashes.push({path:k,sha256:x});else if(x&&typeof x==='object')scan(x);}};scan(d);
 const actual:Record<string,string>={};for(const h of hashes){if(h.path.includes('..')||h.path.startsWith('/'))continue;if(await Bun.file(resolve(root,h.path)).exists())actual[h.path]=(await source(h.path,false)).sha256;}
 const required=allocation.closureProfile==='full-operation-v1'?['package.json','bun.lock',...operation.fixturePaths,...await paths('src/**/*.ts'),...await paths('spec/**/*.json'),...await paths('docs/helix/02-design/contracts/CONTRACT-*.md')]:[];
 for(const path of required)if(!actual[path])actual[path]=(await source(path,false)).sha256;
 const current=outcome==='unassessed'?'unassessed':correspondence(required,hashes,actual);
 const recordedLimits=[d.limitations,d.limits,d.systems?.[operation.sourceSystem]?.limits].flatMap(v=>Array.isArray(v)?v.filter((x:any)=>typeof x==='string'):[]);
 return {id:allocation.id,source:recordSource,readerId:allocation.readerId,selector:allocation.selector,outcome,correspondence:current,scope:typeof d.scope==='string'?d.scope:d.scope?JSON.stringify(d.scope):operation.subset,versions,limitations:[...operation.limitations,...recordedLimits,...(required.length?[]:['Complete tested dependency closure is not recorded; current-source qualification is unknown.'])],commands:Array.isArray(d.commands)?d.commands.filter((x:any)=>typeof x==='string'):[],inputHashes:hashes,closureComplete:current==='matching',supersedes:allocation.supersedes};
}
export {aggregate};
