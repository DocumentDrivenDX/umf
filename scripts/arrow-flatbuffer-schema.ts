// Strict parser for the pinned Arrow .fbs grammar; unconsumed syntax is an error.
import {createHash} from 'node:crypto';
export {};
const base='spec/extensions/arrow/flatbuffers/';const manifest=await Bun.file(base+'manifest.json').json();
type Declaration={kind:string;name:string;base?:string;body:string;file:string};const declarations:Declaration[]=[];
for(const [file,hash] of Object.entries(manifest.files)){
 const bytes=await Bun.file(base+file).arrayBuffer();if(createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==hash)throw Error('Pinned source changed: '+file);
 if(!file.endsWith('.fbs'))continue;
 let source=new TextDecoder().decode(bytes).replace(/\/\/[^\n]*/g,'').trim();
 while(source){let match=/^(?:namespace\s+[\w.]+|include\s+"[\w.]+"|root_type\s+\w+)\s*;/.exec(source);
  if(match){source=source.slice(match[0].length).trim();continue;}
  match=/^(table|struct|enum|union)\s+(\w+)\s*(?::\s*(\w+))?\s*\{([^}]*)\}/.exec(source);
  if(!match)throw Error('Unparsed '+file+': '+source.slice(0,80));
  declarations.push({kind:match[1]!,name:match[2]!,...(match[3]?{base:match[3]}:{}),body:match[4]!,file});source=source.slice(match[0].length).trim();
 }
}
const defs:Record<string,any>={},inventory:any[]=[];
const ref=(name:string)=>({$ref:'#/$defs/'+name});
// Canonical signed 64-bit decimal strings, with bounds expressed without JS numbers.
function atMost(max:string):string{const alternatives=[];for(let i=0;i<max.length;i++){const digit=Number(max[i]);const low=i===0?1:0;if(digit>low)alternatives.push(max.slice(0,i)+(digit-low===1?String(low):'['+low+'-'+(digit-1)+']')+(max.length-i-1?'[0-9]{'+(max.length-i-1)+'}':''));}alternatives.push(max);return alternatives.join('|');}
defs.Int64={type:'string',pattern:'^(?:0|[1-9][0-9]{0,17}|(?:'+atMost('9223372036854775807')+')|-(?:[1-9][0-9]{0,17}|'+atMost('9223372036854775808')+'))$',description:'Canonical decimal spelling of an exact signed 64-bit value; not a JS number.'};
const names=new Map(declarations.map(d=>[d.name,d]));if(names.size!==declarations.length)throw Error('Duplicate declaration');
function type(name:string):any{const vector=/^\[\s*([\w.]+)\s*\]$/.exec(name);if(vector)return {type:'array',items:type(vector[1]!)};name=name.replace('org.apache.arrow.flatbuf.','');if(name==='long')return ref('Int64');if(name==='int')return {type:'integer',minimum:-2147483648,maximum:2147483647};if(name==='bool')return {type:'boolean'};if(name==='string')return {type:'string'};if(!names.has(name))throw Error('Unknown field type '+name);return ref(name);}
for(const d of declarations){
 if(d.kind==='enum'||d.kind==='union'){
  let index=d.kind==='union'?1:0;const members=d.body.split(',').map(x=>x.trim()).filter(Boolean).map(part=>{const m=/^(\w+)(?:\s*=\s*(-?\d+))?$/.exec(part);if(!m)throw Error('Enum member '+part);if(m[2])index=Number(m[2]);return {name:m[1]!,value:index++};});
  if(d.kind==='enum')defs[d.name]={type:'string',enum:members.map(m=>m.name)};
  else defs[d.name]={oneOf:[{type:'object',properties:{type:{const:'NONE'}},required:['type'],additionalProperties:false},...members.map(m=>({type:'object',properties:{type:{const:m.name},value:ref(m.name)},required:['type','value'],additionalProperties:false}))]};
  inventory.push({kind:d.kind,name:d.name,file:d.file,...(d.base?{base:d.base}:{}),members});continue;
 }
 const properties:Record<string,any>={},required:string[]=[],fields:any[]=[];
 for(const part of d.body.split(';').map(x=>x.trim()).filter(Boolean)){
  const m=/^(\w+)\s*:\s*([\w.]+|\[\s*[\w.]+\s*\])(?:\s*=\s*([\w-]+))?\s*(\(required\))?$/.exec(part);if(!m)throw Error('Field syntax '+d.name+': '+part);
  const name=m[1]!,nativeType=m[2]!;const rule=type(nativeType);properties[name]=rule;
  if(m[3]!==undefined){rule.default=nativeType==='long'?m[3]:nativeType==='int'?Number(m[3]):nativeType==='bool'?m[3]==='true':m[3];}
  if(d.kind==='struct'||m[4])required.push(name);
  if(m[4]&&names.get(nativeType)?.kind==='union')rule.not={type:'object',properties:{type:{const:'NONE'}},required:['type']};
  fields.push({name,type:nativeType,...(m[3]!==undefined?{default:m[3]}:{}),required:d.kind==='struct'||!!m[4]});
 }
 defs[d.name]={type:'object',properties,...(required.length?{required}:{}),additionalProperties:true};inventory.push({kind:d.kind,name:d.name,file:d.file,fields});
}
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:arrow:flatbuffer-model:21.0.0',description:'Logical JSON view of all declarations in the five pinned Arrow FlatBuffer files. Int64 values are canonical decimal strings; unions use {type,value}, NONE has only type. Not flatc JSON or a binary codec. Optional fields stay absent; defaults are annotations, never inserted. Unknown table fields are retained, not interpreted.',oneOf:['Schema','Message','Footer','Tensor','SparseTensor'].map(name=>({type:'object',properties:{rootType:{const:name},value:ref(name)},required:['rootType','value'],additionalProperties:false})),$defs:defs};
for(const [name,value] of Object.entries({'flatbuffer-model.schema.json':schema,'flatbuffer-inventory.json':{source:manifest,definitions:inventory}})){
 const path='spec/extensions/arrow/'+name;const output=JSON.stringify(value,null,2)+'\n';if(process.argv.includes('--check')){if(await Bun.file(path).text()!==output)throw Error('Generated drift '+path);}else await Bun.write(path,output);
}
console.log({declarations:declarations.length,fields:inventory.reduce((n,d)=>n+(d.fields?.length??0),0),members:inventory.reduce((n,d)=>n+(d.members?.length??0),0)});

const payload={$schema:schema.$schema,$id:'urn:umf:arrow-flatbuffer:0.1.0',type:'object',properties:{profile:{const:'arrow-flatbuffer-model'},model:{oneOf:schema.oneOf},wireOmissions:{type:'array',minItems:1,items:{type:'object',properties:{path:{type:'string'},message:{type:'string'}},required:['path','message'],additionalProperties:true}}},required:['profile','model'],additionalProperties:true,$defs:defs};
const pkg={id:'umf.arrow.flatbuffer',version:'0.1.0',coreVersion:'0.1.0',description:'Logical JSON model of pinned Arrow FlatBuffer metadata declarations',schema:payload,semantics:'CONTRACT-016. This is the UMF logical metadata representation, not flatc JSON or a binary codec. Exact int64 strings and tagged unions preserve distinctions; structural validation does not establish Arrow semantics.',scopes:['element'],capabilities:{validation:'structural',directions:['import','export'],native:{system:'UMF logical Arrow FlatBuffer JSON profile',version:'0.1.0, Arrow apache-arrow-21.0.0 definitions',subset:'All 59 metadata declarations, 85 fields and 64 explicit enum/union members. Raw metadata decoding and guarded encoding preserve known values and physical field presence; unknown wire slots stay in source. No complete IPC dataset rewriting, full semantic validation or unknown enum interpretation.'},evidence:['tests/arrow/flatbuffer-schema.test.ts','fixtures/arrow/flatbuffer-inventory-oracle.json','tests/arrow/flatbuffer-decode.test.ts','fixtures/arrow/metadata/oracle-results.json','tests/arrow/flatbuffer-encode.test.ts','fixtures/arrow/metadata/encoded-oracle-results.json']}};
for(const [name,value] of Object.entries({'schema.json':payload,'package.json':pkg})){
 const path='spec/extensions/arrow-flatbuffer/'+name,output=JSON.stringify(value,null,2)+'\n';if(process.argv.includes('--check')){if(await Bun.file(path).text()!==output)throw Error('Generated drift '+path);}else await Bun.write(path,output);
}
