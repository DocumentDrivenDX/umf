import {expect,test} from 'bun:test';
import {backend,observationBackend} from '../../native/arrow/runtime';
import {importArrowSchema,exportArrowSchemaIpc} from '../../src/index-node-v4';

test('Node V4 Arrow schema IPC supports the Rust FlatBuffer encoder and explicit Arrow backend',()=>{
 const source=importArrowSchema('{"fields":[{"name":"id","nullable":false,"type":{"name":"int","bitWidth":64,"isSigned":true}}]}',{id:'arrow-schema-ipc-root'});
 const nativeBytes=exportArrowSchemaIpc(source);
 expect(nativeBytes).toBeInstanceOf(Uint8Array);expect(nativeBytes.byteLength).toBeGreaterThan(0);
 expect(observationBackend.observe(nativeBytes)).toMatchObject({fields:[{name:'id',nullable:false,type:{name:'int',bitWidth:64,isSigned:true}}]});
 const bytes=exportArrowSchemaIpc(source,backend);
 expect(bytes).toBeInstanceOf(Uint8Array);expect(bytes.byteLength).toBeGreaterThan(0);
 const refused=importArrowSchema('{"fields":[],"future":true}',{id:'arrow-schema-ipc-refusal'});
 expect(()=>exportArrowSchemaIpc(refused)).toThrow();
});
