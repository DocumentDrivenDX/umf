// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {importArrowFlatbufferModel,inspectArrowFlatbufferModel,exportArrowFlatbufferModel,proposeArrowFlatbufferEdit,type Document} from '../../src/index-node-v4';

test('Rust logical Arrow FlatBuffer model routes preserve JSON, support existing-node edits and refuse omitted wire fields',()=>{
 const text=JSON.stringify({rootType:'Schema',value:{fields:[{name:'id',nullable:false,type:{type:'Int',value:{bitWidth:64,is_signed:true}}}]}});
 const source=importArrowFlatbufferModel(text,{id:'arrow-model'});const checked=inspectArrowFlatbufferModel(source);expect(checked.valid).toBe(true);expect(checked.complete).toBe(false);expect(checked.diagnostics.some(d=>d.code==='ARROW_FLATBUFFER_SEMANTICS')).toBe(true);expect(exportArrowFlatbufferModel(source)).toBe(JSON.stringify(JSON.parse(text),null,2)+'\n');
 const edited=proposeArrowFlatbufferEdit(source,'/value/fields/0/name','renamed');expect(edited.validation.valid).toBe(true);expect(JSON.parse(exportArrowFlatbufferModel(edited.document)).value.fields[0].name).toBe('renamed');expect(JSON.parse(exportArrowFlatbufferModel(source)).value.fields[0].name).toBe('id');
 const retained=structuredClone(source) as Document;const extension=retained.modules[0]!.elements[0]!.extensions['umf.arrow.flatbuffer'] as Record<string,unknown>;extension.wireOmissions=[{path:'/value',message:'not represented'}];expect(()=>exportArrowFlatbufferModel(retained)).toThrow('Unknown wire fields remain in source');
});
