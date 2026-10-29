// SPDX-License-Identifier: MIT OR Apache-2.0
// Assertions shared by Node 26, Bun 1.4, and the installed WASM browser probe.
export const PROFILE='umf-r5-avro-document-inspect/0.1.0';
export function verifyAvroDocumentInspector(api,fixture){
 if(api.AVRO_DOCUMENT_INSPECT_PROFILE!==PROFILE)throw new Error('Avro document profile mismatch');
 const inspect=api.createAvroDocumentInspector;
 if(typeof inspect!=='function')throw new Error('installed Avro document inspector export missing');
 const source=structuredClone(fixture.cases[0].result.source);
 const unknownDocumentExtension=structuredClone(source.extensions['example.future']);
 const unknownVocabulary=structuredClone(source.vocabularies['example.future']);
 const before=structuredClone(source);
 const report=inspect().inspect(source);
 if(report.profile!==PROFILE)throw new Error('report profile mismatch');
 if(!report.admission.valid||!Array.isArray(report.admission.diagnostics))throw new Error('valid UMF admission failed');
 if(report.nativeInspection.status!=='inspected'||report.nativeInspection.complete!==false)throw new Error('native inspection status/scope mismatch');
 if(JSON.stringify(source)!==JSON.stringify(before))throw new Error('inspection mutated source document');
 if(JSON.stringify(source.extensions['example.future'])!==JSON.stringify(unknownDocumentExtension) || JSON.stringify(source.vocabularies['example.future'])!==JSON.stringify(unknownVocabulary))throw new Error('unknown extension content was not retained');
 const invalid=inspect().inspect({});
 if(invalid.admission.valid!==false||invalid.nativeInspection.status!=='not-run')throw new Error('invalid UMF document reached native inspection');
 const nonAvro=structuredClone(source);nonAvro.modules=nonAvro.modules.filter(module=>module.id!=='avro.fields');nonAvro.modules.find(module=>module.id==='schema').elements[0].extensions={};delete nonAvro.vocabularies['umf.avro'];
 const nonAvroReport=inspect().inspect(nonAvro);
 if(nonAvroReport.admission.valid!==true||nonAvroReport.nativeInspection.status!=='not-run')throw new Error('non-Avro document admission/native separation mismatch');
 let charged=0;
 inspect({controls:{meter(amount){charged+=amount;}}}).inspect({});
 if(charged<1)throw new Error('host meter was not called');
 let refused=false;
 try{inspect({controls:{maxWork:0}}).inspect({});}catch(error){refused=error.code==='RESOURCE_LIMIT';}
 if(!refused)throw new Error('maxWork control did not refuse inspection');
 let admittedInputRefused=false;
 try{inspect({controls:{maxWork:256}}).inspect(source);}catch(error){admittedInputRefused=error.code==='RESOURCE_LIMIT';}
 if(!admittedInputRefused)throw new Error('positive resource budget did not refuse the valid admitted Avro input');
 if(typeof api.rawNativeRefusal!=='function')throw new Error('raw native refusal control missing');
 const nativeRefusal=api.rawNativeRefusal(source);
 if(nativeRefusal.status!=='error'||nativeRefusal.code!=='RESOURCE_LIMIT'||nativeRefusal.hookCalls<1)throw new Error('native work refusal control did not reject from a native hook');
 return {profile:PROFILE,valid:{admission:report.admission,nativeInspection:report.nativeInspection},invalid:{admission:invalid.admission,nativeInspection:invalid.nativeInspection},nonAvro:{admission:nonAvroReport.admission,nativeInspection:nonAvroReport.nativeInspection},controls:{meteredWork:charged,maxWorkRefused:refused,positiveBudgetRefusedValidAvro:admittedInputRefused,positiveBudget:256,rawNativeRefusal:nativeRefusal},unknownContentRetained:true,sourceUnchanged:true};
}
