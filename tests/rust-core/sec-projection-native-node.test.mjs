import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const entry=process.env.UMF_NODE_BINDING_DIR?pathToFileURL(resolve(process.env.UMF_NODE_BINDING_DIR,'index.js')).href:new URL('../../bindings/core/node/index.js',import.meta.url).href;
const binding=await import(entry);
const toLe=text=>{const out=Buffer.alloc(text.length*2);for(let i=0;i<text.length;i++)out.writeUInt16LE(text.charCodeAt(i),i*2);return out;};
const decode=wire=>JSON.parse(wire);

test('Node native SEC transport retains UTF-16 units and parse/root precedence',()=>{
  const facts='{"cik":"1","facts":{"t":{"C":{"label":"C","units":{"USD":[{"val":1}]}}}}}';
  const source='node/\u0000\ud800';
  const result=decode(binding.projectSecCompanyFactsUtf16Wire(toLe(facts),toLe(source)));
  assert.equal(result.ok,true);assert.equal(result.value[0].snapshot_id.charCodeAt(5),0);assert.equal(result.value[0].snapshot_id.charCodeAt(6),0xd800);
  const malformed=decode(binding.projectSecCompanyFactsUtf16Wire(toLe('{'),Buffer.alloc(0)));
  assert.deepEqual([malformed.error.name,malformed.error.code],['UmfError','JSON_SCHEMA_SYNTAX']);
  const wrongRoot=decode(binding.projectSecCompanyFactsUtf16Wire(toLe('[]'),Buffer.alloc(0)));
  assert.deepEqual([wrongRoot.error.name,wrongRoot.error.message],['Error','Expected SEC object']);
});

test('Node native SEC transport checks the text cap before invalid source identity',()=>{
  const over=decode(binding.projectSecCompanyFactsUtf16Wire(Buffer.alloc(8_000_002),Buffer.alloc(0)));
  assert.deepEqual([over.error.name,over.error.code,over.error.path,over.error.message],['UmfError','LIMIT','','Native JSON exceeds text limit']);
});
