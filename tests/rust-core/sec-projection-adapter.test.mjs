import {expect, test} from 'bun:test';
import {createSecProjectionRustOperations, utf16LittleEndianBytes} from '../../src/domain-packs/sec-projection-rust.ts';

const wireError=(name,code,path,message)=>JSON.stringify({ok:false,error:{name,code,path,message}});
test('SEC adapter sends exact UTF-16 units and reconstructs ordinary errors',()=>{
  let captured;
  const ops=createSecProjectionRustOperations({
    submissions:(input,source)=>{captured=[...input];expect([...source]).toEqual([0x61,0,0xd800]);return '{"ok":true,"value":{"ok":1}}';},
    companyFacts:()=>wireError('Error',null,null,'bad SEC input'),
  });
  const text='{"x":"\ud800\u0000"}';
  expect(ops.projectSecSubmissions(text,'a\u0000\ud800')).toEqual({ok:1});
  expect(captured).toEqual(Array.from({length:text.length},(_,i)=>text.charCodeAt(i)));
  expect(()=>ops.projectSecCompanyFacts('{}','id')).toThrow(expect.objectContaining({name:'Error',message:'bad SEC input'}));
});
test('SEC adapter preserves provider failures and input admission precedence',()=>{
  const failure=new Error('native failed');
  const ops=createSecProjectionRustOperations({submissions(){throw failure;},companyFacts(){throw failure;}});
  expect(()=>ops.projectSecSubmissions('{}','id')).toThrow(failure);
  expect(()=>ops.projectSecSubmissions(1,'id')).toThrow('source is not a string');
  expect(()=>ops.projectSecSubmissions(null,'id')).toThrow("null is not an object (evaluating 'text.length')");
  expect(()=>ops.projectSecSubmissions([], 'id')).toThrow(expect.objectContaining({code:'JSON_SCHEMA_SYNTAX'}));
  expect(()=>ops.projectSecSubmissions('x'.repeat(4_000_001),null)).toThrow(expect.objectContaining({code:'LIMIT'}));
});
test('SEC wire maps UmfError and UTF-16LE keeps NUL and isolated surrogates',()=>{
  const ops=createSecProjectionRustOperations({submissions:()=>wireError('UmfError','LIMIT','','Native JSON exceeds text limit'),companyFacts:()=>'{"ok":true,"value":[]}'});
  expect(()=>ops.projectSecSubmissions('{}','id')).toThrow(expect.objectContaining({name:'UmfError',code:'LIMIT',path:''}));
  expect([...utf16LittleEndianBytes(new Uint16Array([0,0xd800]))]).toEqual([0,0,0,0xd8]);
});
