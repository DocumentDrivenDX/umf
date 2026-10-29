// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyAvroDocumentInspector} from './avro-document-installed-probe.mjs';
const [entry,fixturePath]=process.argv.slice(2);
if(!entry||!fixturePath)throw new Error('Usage: avro-document-installed-host.mjs <native-package-index.js> <fixture.json>');
const api={...await import(pathToFileURL(entry).href)};
const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
const require=createRequire(pathToFileURL(entry));const addon=require(join(dirname(entry),'umf_core_node.node'));
const {encodeRequestWire}=await import(pathToFileURL(join(dirname(entry),'src/wire.js')).href);
api.rawNativeRefusal=document=>{let hookCalls=0;const wire=encodeRequestWire({op:'avro.document.inspect',document});const response=addon.executeAvroDocumentInspectWire(wire,()=>{hookCalls++;return encodeRequestWire({ok:false,code:'RESOURCE_LIMIT',message:'intentional native-hook refusal'});});const envelope=JSON.parse(response);return{status:envelope.status,code:envelope.code??null,hookCalls};};
console.log(JSON.stringify({runtime:process.versions.bun?`Bun ${process.versions.bun}`:`Node ${process.version}`,result:verifyAvroDocumentInspector(api,fixture)}));
