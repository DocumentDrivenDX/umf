// SPDX-License-Identifier: MIT OR Apache-2.0
/** Admit only an inert compiler-provenance slot change against immutable historical bytes. */
import {createHash} from 'node:crypto';
const historicalCompiler='906cd23c97dc5c1f2d63c269999b86a7bb21f348ad6579bd2347218714d796bb';
const prefix='Generated from spec/metamodel/umf.yaml; model 42144576e3b15da4945ca744623a31967e3b29efa54da8ba3961e446b1c0e34b; compiler ';
const counts:Record<string,number>={'src/generated/core-validators.ts':3,'spec/core/schema.json':1,'spec/core/semantic-type-reference.schema.json':1,'spec/core/extension-package.schema.json':1};
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export function admitAccountedInput(path:string,bytes:Uint8Array,historicalSha256:string,historicalBytes:number){
 const actualSha256=sha(bytes);
 const refuse=():never=>{throw Error('METAMODEL_COMPANION_INPUT_DRIFT '+path);};
 if(bytes.byteLength!==historicalBytes||!Object.hasOwn(counts,path))refuse();
 if(actualSha256===historicalSha256)return {sha256:actualSha256,historicalSha256,bytes:bytes.byteLength,provenanceOnly:false};
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),matches=[...text.matchAll(/Generated from spec\/metamodel\/umf\.yaml; model 42144576e3b15da4945ca744623a31967e3b29efa54da8ba3961e446b1c0e34b; compiler ([0-9a-f]{64})/g)];
 if(matches.length!==counts[path]||new Set(matches.map(m=>m[1])).size!==1)refuse();
 const normalized=text.replaceAll(prefix+matches[0]![1],prefix+historicalCompiler);
 if(sha(normalized)!==historicalSha256)refuse();
 return {sha256:actualSha256,historicalSha256,bytes:bytes.byteLength,provenanceOnly:true,normalization:{profile:'umf.compiler-provenance-slot/1',occurrences:matches.length,from:matches[0]![1]!,to:historicalCompiler,normalizedSha256:sha(normalized)}};
}
