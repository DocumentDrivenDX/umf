import {expect, test} from 'bun:test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const entry=process.env.UMF_NODE_BINDING_DIR?pathToFileURL(resolve(process.env.UMF_NODE_BINDING_DIR,'index.js')).href:new URL('../../bindings/core/node/index.js',import.meta.url).href;
const binding=await import(entry);
const toLe=text=>{const out=Buffer.alloc(text.length*2);for(let i=0;i<text.length;i++)out.writeUInt16LE(text.charCodeAt(i),i*2);return out;};
const decode=wire=>JSON.parse(wire);

test('native Node/Bun SEC transport preserves UTF-16 and root-before-source errors',()=>{
  const facts='{"cik":"1","facts":{"t":{"C":{"label":"C","units":{"USD":[{"val":1}]}}}}}';
  const source='probe/\u0000\ud800';
  const success=decode(binding.projectSecCompanyFactsUtf16Wire(toLe(facts),toLe(source)));
  expect(success.ok).toBe(true);
  expect(success.value).toHaveLength(1);
  expect(success.value[0].snapshot_id.charCodeAt(6)).toBe(0);
  expect(success.value[0].snapshot_id.charCodeAt(7)).toBe(0xd800);
  const malformed=decode(binding.projectSecCompanyFactsUtf16Wire(toLe('{'),Buffer.alloc(0)));
  expect(malformed.ok).toBe(false);expect(malformed.error.name).toBe('UmfError');expect(malformed.error.code).toBe('JSON_SCHEMA_SYNTAX');
  const wrongRoot=decode(binding.projectSecCompanyFactsUtf16Wire(toLe('[]'),Buffer.alloc(0)));
  expect(wrongRoot.ok).toBe(false);expect(wrongRoot.error.name).toBe('Error');expect(wrongRoot.error.message).toBe('Expected SEC object');
});

test('native Node/Bun admission refuses over-limit text before source identity',()=>{
  const input=Buffer.alloc(8_000_002);
  const result=decode(binding.projectSecCompanyFactsUtf16Wire(input,Buffer.alloc(0)));
  expect(result.ok).toBe(false);expect(result.error.name).toBe('UmfError');expect(result.error.code).toBe('LIMIT');expect(result.error.message).toBe('Native JSON exceeds text limit');
});

test('native Node/Bun source transport refuses overlong or odd buffers after input parsing',()=>{
  const valid=toLe('{"cik":1,"facts":{}}'),overlong=Buffer.alloc(2_050);
  for(const source of [overlong,Buffer.from([0x61])]){
    const malformed=decode(binding.projectSecCompanyFactsUtf16Wire(toLe('{'),source));
    expect(malformed.ok).toBe(false);expect(malformed.error.code).toBe('JSON_SCHEMA_SYNTAX');
    const identity=decode(binding.projectSecCompanyFactsUtf16Wire(valid,source));
    expect(identity.ok).toBe(false);expect(identity.error.name).toBe('Error');
    expect(identity.error.message).toBe('Invalid SEC source identity');
  }
});
