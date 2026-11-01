import {expect,test} from 'bun:test';
import {captureArrowIpc,exportArrowIpcCapture,observeArrowIpcCapture} from '../../src/index-node-v4';

test('Node V4 Arrow IPC observation is Rust-composed and retains exact source on success and provider refusal',()=>{
 const bytes=new Uint8Array([0xff,0x00,0x41,0x52,0x52,0x4f,0x57]);
 const source=captureArrowIpc(bytes,{id:'arrow-ipc-observation'});
 const observedBytes:Uint8Array[]=[];
 const observed=observeArrowIpcCapture(source,{identity:'apache-arrow@21.2.0',observe(input){observedBytes.push(input.slice());return {fields:[{name:'value',type:'int64'}]};}});
 expect(observed.status).toBe('observed');
 expect(observed.complete).toBe(false);
 expect(observed.schema).toEqual({fields:[{name:'value',type:'int64'}]});
 expect(observedBytes).toHaveLength(1);expect(observedBytes[0]).toEqual(bytes);
 expect(exportArrowIpcCapture(observed.source)).toEqual(bytes);
 const refused=observeArrowIpcCapture(source,{identity:'apache-arrow@21.2.0',observe(){throw new Error('provider unavailable');}});
 expect(refused.status).toBe('uninterpreted');expect(refused.message).toBe('provider unavailable');
 expect(exportArrowIpcCapture(refused.source)).toEqual(bytes);
});
