import {type DescMessage,ScalarType} from '@bufbuild/protobuf';
import {descriptorRoot} from '../src/adapters/protobuf/descriptor';
const defs:Record<string,any>={};
function scalar(type:ScalarType|undefined):any {
 if(type===undefined)return {type:'integer',minimum:-2147483648,maximum:2147483647};
 if(type===ScalarType.STRING)return {type:'string'};
 if(type===ScalarType.BOOL)return {type:'boolean'};
 if(type===ScalarType.BYTES)return {type:'string',pattern:'^(?:[0-9a-f]{2})*$'};
 if([ScalarType.INT64,ScalarType.UINT64,ScalarType.SINT64,ScalarType.FIXED64,ScalarType.SFIXED64].includes(type))return {type:'string',pattern:'^(?:0|-?[1-9][0-9]*)$'};
 if(type===ScalarType.FLOAT||type===ScalarType.DOUBLE)return {anyOf:[{type:'number'},{enum:['NaN','Infinity','-Infinity','-0']}]};
 const unsigned=type===ScalarType.UINT32||type===ScalarType.FIXED32;
 return {type:'integer',minimum:unsigned?0:-2147483648,maximum:unsigned?4294967295:2147483647};
}
function visit(desc:DescMessage):any {
 const ref={$ref:'#/$defs/'+desc.typeName};if(defs[desc.typeName])return ref;
 const properties:Record<string,any>={};
 defs[desc.typeName]={type:'object',required:['type','fields','unknown'],properties:{type:{const:desc.typeName},fields:{type:'object',properties},unknown:{type:'array',items:{$ref:'#/$defs/unknown'}}}};
 for(const f of desc.fields){
  if(f.fieldKind==='map')throw new Error('Unexpected descriptor map');
  properties[f.name]=f.fieldKind==='message'?visit(f.message):f.fieldKind==='list'?{type:'array',items:f.listKind==='message'?visit(f.message):scalar(f.listKind==='scalar'?f.scalar:undefined)}:scalar(f.fieldKind==='scalar'?f.scalar:undefined);
 }
 return ref;
}
const root=visit(descriptorRoot);
defs.unknown={type:'object',required:['number','wireType','data'],properties:{number:{type:'integer',minimum:1,maximum:536870911},wireType:{enum:[0,1,2,3,5]},data:{type:'string',pattern:'^(?:[0-9a-f]{2})*$'}}};
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:protobuf:0.1.0',title:'UMF Protobuf descriptor representation',type:'object',required:['descriptorProfile','descriptorSet'],properties:{descriptorProfile:{const:'protobuf-es-2.15.0'},descriptorSet:root,sourceArchive:{type:'object',required:['role','compiler','files','roots'],properties:{role:{const:'original'},compiler:{type:'string',minLength:1},files:{type:'object',additionalProperties:{type:'string'}},roots:{type:'array',minItems:1,uniqueItems:true,items:{type:'string',minLength:1}}}}},$defs:defs};
await Bun.write('spec/extensions/protobuf/schema.json',JSON.stringify(schema,null,2)+'\n');
await Bun.write('spec/extensions/protobuf/package.json',JSON.stringify({id:'umf.protobuf',version:'0.1.0',coreVersion:'0.1.0',description:'Native Protobuf descriptors with explicit presence and retained unknown wire fields',schema,semantics:'CONTRACT-003. Descriptor fields retain native types and presence; unknown fields/options are preserved without interpretation. Browser checks are not a native compiler certificate. Source compilation is available through an explicit compiler; source emission recompiles and compares descriptor semantics before returning.',scopes:['element'],capabilities:{validation:'semantic',directions:['import','export'],native:{system:'Protocol Buffers .proto and FileDescriptorSet',version:'descriptor profile @bufbuild/protobuf 2.15.0; source compiler protocompile 0.14.1; printer protoprint 1.18.1; native oracle protoc 36.2',subset:'Complete pinned descriptor message graph; proto2/proto3/Editions descriptor representation. Optional WASM source compilation has authored proto2, proto3 and Edition 2023 evidence; newer Editions are not claimed. Source emission has native compiler evidence for 15 standard roots and authored proto2/proto3/Edition 2023 cases; four Edition 2024 standard roots are explicitly unsupported.'},evidence:['tests/protobuf/descriptor.test.ts','tests/protobuf/source.test.ts','tests/protobuf/emission.test.ts','tests/protobuf/behavior.test.ts','scripts/browser.ts']}},null,2)+'\n');
console.log('Generated '+Object.keys(defs).length+' descriptor definitions');
