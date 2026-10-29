// SPDX-License-Identifier: MIT OR Apache-2.0
import {verifyAvroDocumentInspector} from '/avro-document-installed-probe.mjs';
try{
 const wasm=await import('/candidate/pkg/umf_core_wasm.js');
 const wrapper=await import('/candidate/index.js');
 const wire=await import('/candidate/src/wire.js');
 await wasm.default();
 // The generated default initializer returns raw WebAssembly exports; the
 // adapter consumes the generated JS glue namespace whose methods wrap them.
 const module=wasm;
 const api={AVRO_DOCUMENT_INSPECT_PROFILE:wrapper.AVRO_DOCUMENT_INSPECT_PROFILE,
  createAvroDocumentInspector:options=>wrapper.createAvroDocumentInspector(module,options),
  rawNativeRefusal:document=>{let hookCalls=0;const request=wire.encodeRequestWire({op:'avro.document.inspect',document});const response=module.executeAvroDocumentInspectWire(request,()=>{hookCalls++;return wire.encodeRequestWire({ok:false,code:'RESOURCE_LIMIT',message:'intentional wasm hook refusal'});});const envelope=JSON.parse(response);return{status:envelope.status,code:envelope.code??null,hookCalls};}};
 const fixture=await(await fetch('/fixture.json')).json();
 if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw new Error('Node globals leaked into browser surface');
 window.__avroResult=verifyAvroDocumentInspector(api,fixture);
}catch(error){window.__avroFailure=String(error.stack||error);}
