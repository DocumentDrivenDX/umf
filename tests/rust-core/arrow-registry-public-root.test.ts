import {expect,test} from 'bun:test';
import {arrowFlatbufferRegistry,arrowIpcRegistry,arrowPackage,arrowRegistry,captureArrowIpc,importArrowFlatbufferModel,importArrowSchema,validateDocument} from '../../src/index-node-v4';
import {Registry as LegacyRegistry} from '../../src/registry/registry';

test('Node V4 Arrow registries use Rust validation while retaining caller semantic callbacks',()=>{
 const schema=importArrowSchema('{"fields":[{"name":"id","nullable":false,"type":{"name":"int","bitWidth":64,"isSigned":true}}]}',{id:'arrow-registry'});
 const checked=validateDocument(schema,arrowRegistry());
 expect(checked.valid).toBe(true);
 expect(checked.diagnostics.some(item=>item.code==='ARROW_NATIVE_UNVERIFIED')).toBe(true);

 let callerCalls=0;
 const caller=new LegacyRegistry().register(arrowPackage,()=>{callerCalls++;return [{code:'CALLER_SEMANTICS_RETAINED',path:'',severity:'warning',message:'caller callback retained'}];});
 const withCaller=validateDocument(schema,caller);
 expect(callerCalls).toBe(1);
 expect(withCaller.diagnostics.some(item=>item.code==='CALLER_SEMANTICS_RETAINED')).toBe(true);

 const capture=captureArrowIpc(new Uint8Array([1,2,3]),{id:'arrow-ipc-registry'});
 expect(validateDocument(capture,arrowIpcRegistry()).valid).toBe(true);
 const flatbuffer=importArrowFlatbufferModel('{"rootType":"Schema","value":{"fields":[]}}',{id:'arrow-flatbuffer-registry'});
 expect(validateDocument(flatbuffer,arrowFlatbufferRegistry()).valid).toBe(true);
});
