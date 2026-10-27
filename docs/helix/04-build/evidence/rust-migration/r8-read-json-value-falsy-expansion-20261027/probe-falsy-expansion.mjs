import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readJsonValue as reference } from '/Users/erik/.codex/worktrees/rust-binding-spike/umf/dist/umf.js';
import { readJsonValue as defaultRoute, UmfError } from '/Users/erik/.codex/worktrees/rust-binding-spike/umf/dist/umf-node.js';

const require=createRequire(import.meta.url);
const addon=require('/private/tmp/umf-read-json-value-expanded-20261027/improved/umf_json_value_raw_host_improved_prototype.node');

const sentinel = new Error('coercion sentinel');
function tracked(label, fn) { return function (...args) { trace.push(`${label}(${args.map(String).join(',')})`); return fn(...args); }; }
let trace = [];
function coercible(id, methods) { const x = {}; for (const k of Reflect.ownKeys(methods)) Object.defineProperty(x,k,{value:tracked(`${id}.${String(k)}`,methods[k]), configurable:true}); return x; }
const cases = [
  ['json-toPrimitive-string', ()=>coercible('toPrimitive',{[Symbol.toPrimitive](hint){return hint==='string'?'[1,true,null]':'bad';}}), 'json'],
  ['json-toPrimitive-number', ()=>coercible('toPrimitiveNumber',{[Symbol.toPrimitive](){return 0;}}), 'json'],
  ['json-toString-before-valueOf', ()=>coercible('toString',{toString(){return '{"ok":1}';},valueOf(){return 2;}}), 'json'],
  ['json-valueOf-after-toString-nonprimitive', ()=>coercible('valueOf',{toString(){return {};},valueOf(){return '["fallback"]';}}), 'json'],
  ['json-throwing-toPrimitive', ()=>coercible('throwToPrimitive',{[Symbol.toPrimitive](){throw sentinel;},toString(){return 'null';}}), 'json'],
  ['json-throwing-toString', ()=>coercible('throwToString',{toString(){throw sentinel;},valueOf(){return 'null';}}), 'json'],
  ['json-throwing-valueOf', ()=>coercible('throwValueOf',{toString(){return {};},valueOf(){throw sentinel;}}), 'json'],
  ['json-falsy-0', ()=>0, 'json'], ['json-falsy-false', ()=>false, 'json'], ['json-falsy-empty', ()=>'', 'json'],
  ['json-null', ()=>null, 'json'], ['json-undefined', ()=>undefined, 'json'], ['json-symbol', ()=>Symbol('s'), 'json'],
  ['stateful-length-reads', ()=>new Proxy({toString(){trace.push('toString');return '[7]';}}, {get(t,k,r){if(k==='length'){const n=(t.n??0)+1;t.n=n;trace.push(`get:length:${n}`);return n===1?1:3;}return Reflect.get(t,k,r)}}), 'json'],
  ['json-string-lone-surrogate', ()=> '"\\ud800"', 'json'],
  ['json-key-lone-surrogate', ()=> '{"\\ud800":"x"}', 'json'],
  ['yaml-text-lone-surrogate', ()=> 'x: "\\ud800"\n', 'yaml'],
  ['text-limit-exact', ()=> ' '.repeat(4_000_000), 'json'],
  ['text-limit-plus-one', ()=> ' '.repeat(4_000_001), 'json'],
  ['text-limit-exact-large-string', ()=> '"'+'a'.repeat(3_999_998)+'"', 'json'],
  ['utf16-limit-exact-astral', ()=> '"'+'😀'.repeat(1_999_999)+'"', 'json'],
  ['utf16-limit-plus-one-astral', ()=> '"'+'😀'.repeat(1_999_999)+'a"', 'json'],
  ['falsy-yaml-empty-string', ()=>'', 'yaml'], ['falsy-yaml-zero', ()=>0, 'yaml'], ['falsy-yaml-minus-zero', ()=>-0, 'yaml'],
  ['falsy-yaml-nan', ()=>NaN, 'yaml'], ['falsy-json-nan', ()=>NaN, 'json'],
  ['falsy-yaml-bigint-zero', ()=>0n, 'yaml'], ['falsy-json-bigint-zero', ()=>0n, 'json'],
  ['falsy-yaml-false', ()=>false, 'yaml'],
  ['null-yaml', ()=>null, 'yaml'], ['undefined-yaml', ()=>undefined, 'yaml'], ['symbol-yaml', ()=>Symbol('s'), 'yaml'],
  ['truthy-yaml-one', ()=>1, 'yaml'], ['truthy-json-one', ()=>1, 'json'],
  ['truthy-yaml-true', ()=>true, 'yaml'], ['truthy-json-true', ()=>true, 'json'],
  ['truthy-yaml-bigint-one', ()=>1n, 'yaml'], ['truthy-json-bigint-one', ()=>1n, 'json'],
];
function summarize(value) {
  if (typeof value === 'string') return {type:'string',length:value.length,sha256:createHash('sha256').update(Buffer.from(value,'utf16le')).digest('hex'),prefix:value.slice(0,32),suffix:value.slice(-32)};
  const json=JSON.stringify(value);
  if (json === undefined) return {type:typeof value};
  return {type:Array.isArray(value)?'array':value===null?'null':typeof value,bytes:Buffer.byteLength(json),sha256:createHash('sha256').update(json).digest('hex'), preview:json.length<160?json:json.slice(0,80)+'…'+json.slice(-40)};
}
function observe(run) { try { return {status:'returned',value:summarize(run())}; } catch(e) { return {status:'threw',name:e?.name,code:e?.code,path:e?.path,message:e?.message,identity:e===sentinel}; } }
const rows=[];
for(const [id,makeSource,format] of cases){
 const source=makeSource();
 trace=[]; const expected=observe(()=>reference(source,format)); const expectedTrace=[...trace];
 const defaultSource=makeSource();
 trace=[]; const defaultActual=observe(()=>defaultRoute(defaultSource,format)); const defaultTrace=[...trace];
 const candidateSource=makeSource();
 trace=[]; const candidate=observe(()=>{const out=addon.readJsonValueRawHostImproved(candidateSource,format==='json',text=>text.length>4_000_000,text=>{try{JSON.parse(text);return true;}catch{return false;}},text=>text.length,()=>Object.create(null),text=>!Boolean(text));if(out.ok)return out.value;if(out.name==='UmfError')throw new UmfError(out.code,out.message,out.path);if(out.name==='TypeError')throw new TypeError(out.message);throw new Error(out.message);}); const candidateTrace=[...trace];
 rows.push({id,expected,defaultActual,candidate,expectedTrace,defaultTrace,candidateTrace,defaultMatches:JSON.stringify(expected)===JSON.stringify(defaultActual)&&JSON.stringify(expectedTrace)===JSON.stringify(defaultTrace),candidateMatches:JSON.stringify(expected)===JSON.stringify(candidate)&&JSON.stringify(expectedTrace)===JSON.stringify(candidateTrace)});
}
console.log(JSON.stringify({runtime:{node:process.version,bun:process.versions.bun??null,v8:process.versions.v8},cases:rows.length,rows}));
