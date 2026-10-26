// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare the built V4 Node package root with the unchanged TS reference root.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const referenceUrl=process.argv[2]?new URL(process.argv[2]):pathToFileURL(resolve('dist/umf.js'));
const rootUrl=process.argv[3]?new URL(process.argv[3]):pathToFileURL(resolve('dist/umf-node.js'));
const output=process.argv[4]?resolve(process.argv[4]):null;
const reference=await import(referenceUrl.href);const root=await import(rootUrl.href);
assert.equal(typeof reference.securityNot,'function','reference TypeScript root does not export securityNot');
assert.equal(typeof root.securityNot,'function','V4 Node root does not export securityNot');
const names=['T','F','U','null','number','boolean','unknown-string','array','object','null-prototype','accessor','proxy-ownKeys','proxy-getPrototype','proxy-get'];
function input(name,trace){switch(name){case'T':return'T';case'F':return'F';case'U':return'U';case'null':return null;case'number':return 1;case'boolean':return true;case'unknown-string':return'X';case'array':return[];case'object':return{};case'null-prototype':return Object.create(null);case'accessor':return Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter');return'T';}});case'proxy-ownKeys':return new Proxy({}, {ownKeys(){trace.push('ownKeys');throw new Error('ownKeys trap');}});case'proxy-getPrototype':return new Proxy({}, {getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('prototype trap');}});case'proxy-get':return new Proxy({}, {get(){trace.push('get');return'T';}});default:throw new Error(`unknown case: ${name}`);}}
function outcome(fn,value,trace){try{return{kind:'return',value:fn(value),trace};}catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace};}}
const rows=Object.fromEntries(names.map(name=>{const a=[],b=[];const expected=outcome(reference.securityNot,input(name,a),a);const actual=outcome(root.securityNot,input(name,b),b);assert.deepEqual(actual,expected,`V4 Node root mismatch: ${name}`);return[name,{reference:expected,root:actual}];}));
const rootBytes=await readFile(new URL(rootUrl));const referenceBytes=await readFile(new URL(referenceUrl));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const runtime=typeof Bun==='undefined'?process.version:`Bun ${Bun.version}`;
const result={format:'umf-r8-security-not-v4-root-parity/1',status:'pass',runtime,reference:String(referenceUrl),root:String(rootUrl),cases:rows,sourceSha256:{reference:hash(referenceBytes),root:hash(rootBytes)}};
if(output){await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({status:result.status,runtime,cases:names.length,root:String(rootUrl)},null,2));
