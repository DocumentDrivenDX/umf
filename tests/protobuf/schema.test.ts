// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {file_google_protobuf_descriptor} from '@bufbuild/protobuf/wkt';
import schema from '../../spec/extensions/protobuf/schema.json';

function messages(input:typeof file_google_protobuf_descriptor.messages):string[] {
 return input.flatMap(message=>[message.typeName,...messages(message.nestedMessages)]);
}

const expectedRuntimeMessages=[
 'google.protobuf.DescriptorProto','google.protobuf.DescriptorProto.ExtensionRange','google.protobuf.DescriptorProto.ReservedRange',
 'google.protobuf.EnumDescriptorProto','google.protobuf.EnumDescriptorProto.EnumReservedRange','google.protobuf.EnumOptions',
 'google.protobuf.EnumValueDescriptorProto','google.protobuf.EnumValueOptions','google.protobuf.ExtensionRangeOptions','google.protobuf.ExtensionRangeOptions.Declaration',
 'google.protobuf.FeatureSet','google.protobuf.FeatureSetDefaults',
 'google.protobuf.FeatureSetDefaults.FeatureSetEditionDefault','google.protobuf.FeatureSet.VisibilityFeature',
 'google.protobuf.FieldDescriptorProto','google.protobuf.FieldOptions','google.protobuf.FieldOptions.EditionDefault',
 'google.protobuf.FieldOptions.FeatureSupport','google.protobuf.FileDescriptorProto','google.protobuf.FileDescriptorSet',
 'google.protobuf.FileOptions','google.protobuf.GeneratedCodeInfo','google.protobuf.GeneratedCodeInfo.Annotation',
 'google.protobuf.MessageOptions','google.protobuf.MethodDescriptorProto','google.protobuf.MethodOptions',
 'google.protobuf.OneofDescriptorProto','google.protobuf.OneofOptions','google.protobuf.ServiceDescriptorProto',
 'google.protobuf.ServiceOptions','google.protobuf.SourceCodeInfo','google.protobuf.SourceCodeInfo.Location',
 'google.protobuf.UninterpretedOption','google.protobuf.UninterpretedOption.NamePart'
].sort();

test('protobuf JSON Schema definitions exactly close the pinned runtime message graph',()=>{
 const runtime=messages(file_google_protobuf_descriptor.messages).sort();
 const schemaTypes=Object.keys(schema.$defs).filter(name=>name.startsWith('google.protobuf.')).sort();
 expect(runtime).toEqual(expectedRuntimeMessages);
 expect(schemaTypes).toEqual(runtime);
 expect(Object.keys(schema.$defs).sort().at(-1)).toBe('unknown');
 for(const type of runtime){
  const definition=schema.$defs[type as keyof typeof schema.$defs] as any;
  expect(definition.properties.type.const).toBe(type);
  expect(definition.required).toEqual(['type','fields','unknown']);
  expect(definition.properties.unknown.items.$ref).toBe('#/$defs/unknown');
 }
});

test('every generated definition contains the exact native field-name closure',()=>{
 let fieldCount=0;
 let messageFieldCount=0;
 const visit=(descriptors:typeof file_google_protobuf_descriptor.messages):void=>{
  for(const descriptor of descriptors){
   const definition=schema.$defs[descriptor.typeName as keyof typeof schema.$defs] as any;
   expect(Object.keys(definition.properties.fields.properties).sort()).toEqual(descriptor.fields.map(field=>field.name).sort());
   for(const field of descriptor.fields){
    fieldCount++;
    const property=definition.properties.fields.properties[field.name];
    if(field.fieldKind==='message'){
     messageFieldCount++;
     expect(property.$ref).toBe(`#/$defs/${field.message.typeName}`);
    }else if(field.fieldKind==='list'&&field.listKind==='message'){
     messageFieldCount++;
     expect(property.type).toBe('array');
     expect(property.items.$ref).toBe(`#/$defs/${field.message.typeName}`);
    }else{
     expect(property.$ref).toBeUndefined();
     expect(property.items?.$ref).toBeUndefined();
    }
   }
   visit(descriptor.nestedMessages);
  }
 };
 visit(file_google_protobuf_descriptor.messages);
 expect(fieldCount).toBe(176);
 expect(messageFieldCount).toBe(53);
});
