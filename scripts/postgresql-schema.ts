import {createHash} from 'node:crypto';
// The descriptor and codec are pinned; this is a development-only generator.
import protobuf from '@launchql/protobufjs';
// @ts-ignore generated native codec
import {pg_query} from '@libpg-query/parser/proto.js';
const source=await Bun.file('native/postgresql/protobuf/pg_query.proto').text();
const manifest=await Bun.file('native/postgresql/protobuf/manifest.json').json();
if(createHash('sha256').update(source).digest('hex')!==manifest.files[0].sha256)throw Error('Descriptor hash mismatch');
const root=protobuf.parse(source,{keepCase:true}).root;root.resolveAll();
const entries=(root.lookup('pg_query') as any).nestedArray;
const defs:Record<string,any>={};let fields=0,vectors=0;
for(const entry of entries){
 if(entry.values){defs[entry.name]={type:'string',enum:Object.keys(entry.values)};for(const [name,value] of Object.entries(entry.values))if(pg_query[entry.name]?.[name]!==value)throw Error('Enum mismatch '+entry.name);continue;}
 if(!entry.fieldsArray)throw Error('Unsupported descriptor '+entry.name);
 const codec=pg_query[entry.name];if(!codec)throw Error('Missing codec '+entry.name);
 const properties:Record<string,any>={};
 const actual=[...new Set([...codec.fromObject.toString().matchAll(/object\.([A-Za-z_0-9]+)/g)].map(m=>m[1]))].sort();
 const expected=entry.fieldsArray.map((f:any)=>f.options?.json_name??f.name).sort();
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Field inventory mismatch '+entry.name+' '+JSON.stringify({actual,expected}));
 for(const f of entry.fieldsArray){
  fields++;const name=f.options?.json_name??f.name;let schema:any;let samples:any[];
  if(f.resolvedType?.values){schema={$ref:'#/$defs/'+f.resolvedType.name};samples=Object.values(f.resolvedType.values);}
  else if(f.resolvedType){schema={$ref:'#/$defs/'+f.resolvedType.name};samples=[Object.create(null)];}
  else if(f.type==='string'){schema={type:'string'};samples=['field-check'];}
  else if(f.type==='bool'){schema={type:'boolean'};samples=[true,false];}
  else if(['int32','sint32','sfixed32','uint32','fixed32','int64','sint64','sfixed64','uint64','fixed64'].includes(f.type)){
   const unsigned=f.type.startsWith('u')||f.type.startsWith('fixed');
   const wide=f.type.endsWith('64');
   schema={type:'integer',minimum:unsigned?0:wide?-Number.MAX_SAFE_INTEGER:-2147483648,maximum:wide?Number.MAX_SAFE_INTEGER:unsigned?4294967295:2147483647};
   samples=unsigned?[0,1,4294967295]:[0,1,-1,2147483647,-2147483648];
  }else if(['float','double'].includes(f.type)){schema={type:'number'};samples=[1.5,-2.25];}
  else throw Error('Unsupported scalar '+f.type);
  properties[name]=f.repeated?{type:'array',items:schema}:schema;
  for(const sample of samples){
   const value=f.repeated?[sample]:sample;
   const native=codec.encode(codec.create(Object.assign(Object.create(null),{[name]:value}))).finish();
   const reflected=entry.encode(entry.create(Object.assign(Object.create(null),{[f.name]:value}))).finish();
   if(Buffer.compare(Buffer.from(native),Buffer.from(reflected)))throw Error('Wire mismatch '+entry.name+'.'+name+' '+JSON.stringify({sample,native:[...native],reflected:[...reflected]}));
   vectors++;
  }
 }
 const unions=(entry.oneofsArray??[]).map((o:any)=>o.oneof.map((n:string)=>entry.fields[n].options?.json_name??n));
 defs[entry.name]={type:'object',properties,additionalProperties:true,...(unions.length?{allOf:unions.map((names:string[])=>({oneOf:[{not:{anyOf:names.map(n=>({required:[n]}))}},...names.map(n=>({required:[n]}))]}))}: {})};
}
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:postgresql:native-ast:0.1.0',description:'PostgreSQL Protobuf AST JSON fields. Unknown fields are retained; native export separately rejects codec loss. Optional fields follow proto3 presence. Integer fields use the exact JavaScript integer subset. This schema does not establish SQL grammar, catalog validity, or server execution semantics.',$ref:'#/$defs/ParseResult',$defs:defs};
await output('spec/extensions/postgresql/native-ast.schema.json',schema);
const report={descriptorTag:manifest.tag,descriptorSha256:manifest.files[0].sha256,codecSha256:createHash('sha256').update(await Bun.file('node_modules/@libpg-query/parser/proto.js').bytes()).digest('hex'),messages:entries.filter((e:any)=>e.fieldsArray).length,enums:entries.filter((e:any)=>e.values).length,fields,wireVectors:vectors,checks:['Exact field inventory','Enum names and numeric values','Individual field wire tags and scalar encodings'],limitations:['Empty nested-message probes do not establish semantic validity','Not an exhaustive native AST corpus','No database execution']};
await output('native/postgresql/protobuf/schema-evidence.json',report);console.log(report);
async function output(path:string,value:unknown){
 const text=JSON.stringify(value,null,2)+'\n';
 if(process.argv.includes('--check')){if(await Bun.file(path).text()!==text)throw Error('Generated artifact is stale: '+path);}
 else await Bun.write(path,text);
}

