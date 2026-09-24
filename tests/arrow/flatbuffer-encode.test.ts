import {test,expect} from 'bun:test';
import {decodeArrowFlatbuffer,encodeArrowFlatbuffer,importArrowFlatbufferModel,exportArrowFlatbufferModel,proposeArrowFlatbufferEdit,type ArrowFlatbufferRoot} from '../../src';
import {flatbufferBackend} from '../../native/arrow/flatbuffer-runtime';
const base='fixtures/arrow/metadata/';const manifest=await Bun.file(base+'manifest.json').json();
test('US-016-AC8: every decoded native metadata model re-encodes with exact logical content',async()=>{
 expect(manifest.cases.length).toBe(70);
 for(const c of manifest.cases){const decoded=decodeArrowFlatbuffer(new Uint8Array(await Bun.file(base+c.file).arrayBuffer()),{id:c.file,rootType:c.rootType as ArrowFlatbufferRoot});const original=exportArrowFlatbufferModel(decoded.model!);const bytes=encodeArrowFlatbuffer(decoded.model!,flatbufferBackend);const again=decodeArrowFlatbuffer(bytes,{id:c.file,rootType:c.rootType as ArrowFlatbufferRoot});expect(JSON.parse(exportArrowFlatbufferModel(again.model!))).toEqual(JSON.parse(original));expect(exportArrowFlatbufferModel(decoded.model!)).toBe(original);}
},20000);
test('US-016-AC8: explicit zero defaults, empty vectors and absent fields remain distinct',()=>{
 const model={rootType:'Message',value:{version:'V1',bodyLength:'0',header:{type:'Schema',value:{endianness:'Little',fields:[],custom_metadata:[{key:'x',value:''},{key:'x',value:'again'}]}}}};
 const doc=importArrowFlatbufferModel(JSON.stringify(model),{id:'defaults'});const decoded=decodeArrowFlatbuffer(encodeArrowFlatbuffer(doc,flatbufferBackend),{id:'back',rootType:'Message'});expect(JSON.parse(exportArrowFlatbufferModel(decoded.model!))).toEqual(model);
});
test('US-016-AC8: edits propagate and semantic drift or unknown fields block encoding',async()=>{
 const source=await Bun.file(base+'schema-exact.bin.umf.json').text();const doc=importArrowFlatbufferModel(source,{id:'edit'});
 const edited=proposeArrowFlatbufferEdit(doc,'/value/fields/0/dictionary/id','-9223372036854775808');expect(edited.validation.complete).toBe(false);
 const decoded=decodeArrowFlatbuffer(encodeArrowFlatbuffer(edited.document,flatbufferBackend),{id:'back',rootType:'Schema'});expect(JSON.parse(exportArrowFlatbufferModel(decoded.model!)).value.fields[0].dictionary.id).toBe('-9223372036854775808');expect(JSON.parse(exportArrowFlatbufferModel(doc)).value.fields[0].dictionary.id).toBe('9223372036854775807');
 expect(()=>proposeArrowFlatbufferEdit(doc,'/value/fields/0/dictionary/id','9223372036854775808')).toThrow();expect(()=>proposeArrowFlatbufferEdit(doc,'/value/fields/length',0)).toThrow();
 const unknown=importArrowFlatbufferModel('{"rootType":"Schema","value":{"future":true}}',{id:'unknown'});expect(()=>encodeArrowFlatbuffer(unknown,flatbufferBackend)).toThrow('Unknown metadata property');
 expect(()=>encodeArrowFlatbuffer(doc,{identity:'flatbuffers@25.9.23',encode(model:any){model.value.fields[0].name='lost';return flatbufferBackend.encode(model);}})).toThrow('changed values');
 const loneSurrogate=importArrowFlatbufferModel(JSON.stringify({rootType:'Schema',value:{custom_metadata:[{key:'x',value:'\ud800'}]}}),{id:'utf8'});expect(()=>encodeArrowFlatbuffer(loneSurrogate,flatbufferBackend)).toThrow('changed values');
});
