// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'bun:test';
import {PROFILE,verifyAvroDocumentInspector} from '../../scripts/rust-migration/r8/avro-document-installed-probe.mjs';

const fixture=JSON.parse(await readFile(new URL('../../fixtures/avro/candidate-edits.json',import.meta.url),'utf8'));
test('installed Avro document probe uses a real fixture source and requires lossless inspection controls',()=>{
 assert.equal(PROFILE,'umf-r5-avro-document-inspect/0.1.0');
 assert.ok(Array.isArray(fixture.cases));
 assert.ok(fixture.cases[0]?.result?.source?.vocabularies?.['example.future']);
 assert.deepEqual(fixture.cases[0].result.source.extensions['example.future'],{opaque:['preserve']});
 const api={AVRO_DOCUMENT_INSPECT_PROFILE:PROFILE,rawNativeRefusal:()=>({status:'error',code:'RESOURCE_LIMIT',hookCalls:1}),createAvroDocumentInspector(options={}){return{inspect(document){options.controls?.meter?.(2);if(options.controls?.maxWork!==undefined&&options.controls.maxWork<1024)throw Object.assign(new Error('Host work budget exceeded'),{code:'RESOURCE_LIMIT'});const valid=Boolean(document?.umf&&Array.isArray(document.modules));const avro=Boolean(document?.modules?.[0]?.elements?.[0]?.extensions?.['umf.avro']);return{profile:PROFILE,admission:{valid,complete:valid,diagnostics:[]},nativeInspection:valid&&avro?{status:'inspected',valid:true,complete:false,diagnostics:[]}:{status:'not-run'}}}}}};
 const result=verifyAvroDocumentInspector(api,fixture);
 assert.equal(result.unknownContentRetained,true);assert.equal(result.sourceUnchanged,true);assert.equal(result.controls.maxWorkRefused,true);
});
