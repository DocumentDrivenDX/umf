// SPDX-License-Identifier: MIT OR Apache-2.0
// Independent retained exactCoefficient behavior; no Rust candidate.
import{exactCoefficient}from'../../../../../../src/validation/literal-kernel';import{createHash}from'node:crypto';import{readFileSync,writeFileSync}from'node:fs';
const sha=(x:Uint8Array|string)=>createHash('sha256').update(x).digest('hex');
const recipes:any[]=[
 {id:'zero-long-fraction',prefix:'0.',repeat:'0',count:4_000_000,suffix:'',scale:0},
 {id:'shrink-long-coefficient',prefix:'1',repeat:'0',count:4_000_000,suffix:'e-4000000',scale:0},
];
for(const token of ['0e'+'9'.repeat(40),'-0e-'+'9'.repeat(40),'0.000e+'+'9'.repeat(40),'0e'+'9'.repeat(20),'1e'+'9'.repeat(20),'1e-'+'9'.repeat(20),'1e+'+'9'.repeat(20),'1e9223372036854775808','1e-9223372036854775809','1e'+'0'.repeat(31)+'1','1e'+'0'.repeat(32)+'1','0e'+'0'.repeat(33),'1e','0e','0e+','0.0e-','-0','0e-1','1.00e2','1.00e-2'])recipes.push({id:'literal-'+recipes.length,token,scale:0});
const cases=recipes.map(recipe=>{const token=recipe.token??recipe.prefix+recipe.repeat.repeat(recipe.count)+recipe.suffix;let predecessor:any;try{predecessor={status:'coefficient',decimal:exactCoefficient(token,recipe.scale).toString()}}catch(error:any){predecessor={status:'error',reason:error.reason??null,name:error.name,message:String(error.message)}}return{...recipe,inputUtf16Units:token.length,inputUtf8Sha256:sha(token),predecessor}});
const path=import.meta.dir+'/sol-exact-coefficient-predecessor.json';writeFileSync(path,JSON.stringify({profile:'umf.sol-exact-coefficient-boundaries/1',qualification:'Exact retained TypeScript coefficient algorithm and fault reasons on ordinary owned textual numeric carriers. Input token is not serialized source; coefficient expansion/result bound remains unchanged.',generatorSha256:sha(readFileSync(import.meta.path)),reference:{runtime:'Bun '+Bun.version,literalKernelSha256:sha(readFileSync(import.meta.dir+'/../../../../../../src/validation/literal-kernel.ts'))},cases},null,2)+'\n');console.log(JSON.stringify({path,sha256:sha(readFileSync(path)),cases:cases.length,outcomes:cases.map(c=>[c.id,c.predecessor])}));
