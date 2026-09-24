import {decodeArrowFlatbuffer,encodeArrowFlatbuffer,importArrowFlatbufferModel,exportArrowFlatbufferModel,proposeArrowFlatbufferEdit,type ArrowFlatbufferRoot} from '../src';
import {flatbufferBackend} from '../native/arrow/flatbuffer-runtime';
const base='fixtures/arrow/metadata/';const manifest=await Bun.file(base+'manifest.json').json();
for(const c of manifest.cases){const result=decodeArrowFlatbuffer(new Uint8Array(await Bun.file(base+c.file).arrayBuffer()),{id:c.file,rootType:c.rootType as ArrowFlatbufferRoot});if(!result.model)throw Error('Decode failed');
 try{await Bun.write(base+c.file+'.encoded.bin',encodeArrowFlatbuffer(result.model,flatbufferBackend));}catch(error){throw Error(c.file+': '+error);}
}
console.log({encodedMetadataRoots:manifest.cases.length});

const original=importArrowFlatbufferModel(await Bun.file(base+'schema-exact.bin.umf.json').text(),{id:'edited'});
const edited=proposeArrowFlatbufferEdit(original,'/value/fields/0/dictionary/id','-9223372036854775808').document;
const defaults=importArrowFlatbufferModel(JSON.stringify({rootType:'Message',value:{version:'V1',bodyLength:'0',header:{type:'Schema',value:{endianness:'Little',fields:[],custom_metadata:[{key:'x',value:''},{key:'x',value:'again'}]}}}}),{id:'defaults'});
for(const [name,doc] of [['edited-schema',edited],['explicit-defaults',defaults]] as const){await Bun.write(base+name+'.bin.umf.json',exportArrowFlatbufferModel(doc));await Bun.write(base+name+'.bin.encoded.bin',encodeArrowFlatbuffer(doc,flatbufferBackend));}
