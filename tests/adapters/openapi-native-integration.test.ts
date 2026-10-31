import {expect,test} from 'bun:test';
import {createNativeFamilyDispatcher,isNativeUmfCoreError} from '../../bindings/core/node/index.js';
import {createOpenapiRustDefault} from '../../src/adapters/openapi/rust-default';
import {UmfError} from '../../src/model/errors';

test('OpenAPI public Rust facade imports, reads and exports native content and refuses malformed format',()=>{
 const api=createOpenapiRustDefault(createNativeFamilyDispatcher(),isNativeUmfCoreError);
 const source='{"openapi":"3.1.0","info":{"title":"Wire 🚀","version":"1"},"paths":{}}';
 const document=api.importOpenapiDocument(source,{id:'openapi-native-integration',format:'json'});
 const title=api.getOpenapiNode(document,'/info/title');
 expect(title).toEqual({kind:'string',value:'Wire 🚀'});
 expect(api.exportOpenapiDocument(document)).toBe(source);

 let error:unknown;
 try{api.importOpenapiDocument('{}',{id:'bad-format',format:'toml' as never});}catch(value){error=value;}
 expect(error).toBeInstanceOf(UmfError);
 expect((error as UmfError).code).toBe('REQUEST');
}, 30_000);
