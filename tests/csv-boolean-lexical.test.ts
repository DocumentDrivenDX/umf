import {test,expect} from 'bun:test';
import {boundedJsonBytes} from '../src/model/internal/json-byte-budget';
import {readDocument} from '../src/model/document';
import {validateCsvBooleanLexical,verifyCsvBooleanLexical,csvBooleanLexicalOperationSchema,type CsvBooleanLexicalRequest} from '../src/model/csv-boolean-lexical';
import {validateCoreFieldValue} from '../src/model/schema-properties';
import {validateCoreRecordValues} from '../src/model/record-values';
const source=readDocument(await Bun.file('spec/domain-packs/medical/ontology.json').text(),'json');
const field={module:'domain',element:'patients.active'};
const request=(token:CsvBooleanLexicalRequest['token']):CsvBooleanLexicalRequest=>({profile:'umf.csv-boolean-lexical/1.0.0',field,token,sourceContext:{source:'original.csv',row:1,column:'active',unknown:{retained:['雪',null]}}});
test('four explicit original lexical forms retain typed public validation and immutable original custody',()=>{
 for(const token of ['true','false','True','False'] as const){const input=request(token),before=JSON.stringify({source,input}),result=validateCsvBooleanLexical(source,input);expect(result.value).toEqual({boolean:token==='true'||token==='True'});expect(result.validation).toEqual(validateCoreFieldValue(source,field,result.value));expect(result.request).toEqual(input);expect(result.source).toEqual(source);expect(result.provenance).toBe('unverified');expect(verifyCsvBooleanLexical(result,source,input)).toEqual(result);result.request.sourceContext=null;result.source.id='changed';expect(JSON.stringify({source,input})).toBe(before);}
});
test('closed grammar/version/Field scope refuses whitespace, case, numeric, absent/null and String',()=>{
 for(const token of ['TRUE','FALSE','tRuE',' true','true ','1','0','',null,true,'\\N'])expect(()=>validateCsvBooleanLexical(source,{...request('true'),token} as any)).toThrow();
 for(const changed of [{...request('true'),profile:'future'},{...request('true'),future:true},{...request('true'),field:{...field,future:true}},{...request('true'),field:{module:'domain',element:'patients.birth_date'}},{...request('true'),field:{module:'domain',element:'patients'}}])expect(()=>validateCsvBooleanLexical(source,changed as any)).toThrow();
 const missing:any=request('true');delete missing.token;expect(()=>validateCsvBooleanLexical(source,missing)).toThrow();
 for(const cardinality of ['array','map']){const collection=structuredClone(source);collection.modules[0]!.elements.find(e=>e.id===field.element)!.cardinality=cardinality;expect(()=>validateCsvBooleanLexical(collection,request('true'))).toThrow();}
 const old=structuredClone(source);old.umf='0.7.0';expect(()=>validateCsvBooleanLexical(old,request('true'))).toThrow();
});
test('successful token conversion never changes invalid or unknown public Field verdict',()=>{
 const restricted=structuredClone(source);restricted.modules[0]!.elements.find(e=>e.id===field.element)!.allowedValues=[{boolean:false}];
 const result=validateCsvBooleanLexical(restricted,request('True'));expect(result.value).toEqual({boolean:true});expect(result.validation.valid).toBe(false);expect(result.validation).toEqual(validateCoreFieldValue(restricted,field,{boolean:true}));expect(verifyCsvBooleanLexical(result,restricted,request('True'))).toEqual(result);
 const unknown=structuredClone(source);unknown.modules[0]!.elements.find(e=>e.id===field.element)!.facets={futureBooleanRule:{meaning:'unknown'}} as any;
 const unresolved=validateCsvBooleanLexical(unknown,request('true'));expect(unresolved.validation.complete).toBe(false);expect(unresolved.validation).toEqual(validateCoreFieldValue(unknown,field,{boolean:true}));
});
test('receipt recomputation rejects independently mismatched source/request and every forged surface',()=>{
 const input=request('true'),receipt=validateCsvBooleanLexical(source,input);
 const other=structuredClone(source);other.revision='other';expect(()=>verifyCsvBooleanLexical(receipt,other,input)).toThrow();
 expect(()=>verifyCsvBooleanLexical(receipt,source,request('True'))).toThrow();
 for(const mutate of [(r:any)=>{r.value.boolean=false;},(r:any)=>{r.validation.valid=1;},(r:any)=>{r.validation.diagnostics=[];r.validation.complete=false;},(r:any)=>{r.request.sourceContext.row=2;},(r:any)=>{r.extra=true;},(r:any)=>{delete r.source;},(r:any)=>{r.provenance='verified';}]){const changed=structuredClone(receipt);mutate(changed);expect(()=>verifyCsvBooleanLexical(changed,source,input)).toThrow();}
});
test('bounded copying and private schema snapshot refuse getters and hostile receipt/context shapes',()=>{
 let reads=0;const context=Object.defineProperty({},'token',{get(){reads++;return 'true';}});expect(()=>validateCsvBooleanLexical(source,{...request('true'),sourceContext:context})).toThrow();expect(reads).toBe(0);
 expect(()=>validateCsvBooleanLexical(source,{...request('true'),sourceContext:'x'.repeat(4000001)})).toThrow();
 const cyclic:any={};cyclic.self=cyclic;expect(()=>validateCsvBooleanLexical(source,{...request('true'),sourceContext:cyclic})).toThrow();
 const exported:any=csvBooleanLexicalOperationSchema;const original=exported.additionalProperties;exported.additionalProperties=true;
 try{const result=validateCsvBooleanLexical(source,request('true'));expect(()=>verifyCsvBooleanLexical({...result,extra:true} as any,source,request('true'))).toThrow();}finally{exported.additionalProperties=original;}
});
test('UTF-8 aggregate source/request and full receipt ceilings refuse without truncation',()=>{
 const input=request('true');input.sourceContext='';const base=new TextEncoder().encode(JSON.stringify({source,request:input})).length;
 input.sourceContext='x'.repeat(4_000_000-base);let code='';try{validateCsvBooleanLexical(source,input);}catch(error:any){code=error.code;}expect(code).toBe('LIMIT');
 input.sourceContext='雪'.repeat(1_400_000);code='';try{validateCsvBooleanLexical(source,input);}catch(error:any){code=error.code;}expect(code).toBe('LIMIT');
});
test('early byte traversal matches native JSON escapes/UTF8 and never serializes oversized whole values',()=>{
 for(const value of [null,true,false,0,1e-7,1e21,{'雪🙂\"\\': ['\b\t\n\f\r\u0000', '\ud800','\udc00', '\ud800\udc00', 'é']},['a',{'nested':[]}]] as any[]){const bytes=new TextEncoder().encode(JSON.stringify(value)).length;expect(boundedJsonBytes(value,bytes)).toBe(bytes);expect(()=>boundedJsonBytes(value,bytes-1)).toThrow();}
 const original=JSON.stringify;let fullSerializations=0;
 JSON.stringify=((value:any,...rest:any[])=>{if(value!==null&&typeof value==='object'||typeof value==='string'){fullSerializations++;throw Error('whole-value serialization prohibited');}return original(value,...rest as []);}) as typeof JSON.stringify;
 let code='';try{validateCsvBooleanLexical(source,{...request('true'),sourceContext:'x'.repeat(8_000_000)});}catch(error:any){code=error.code;}finally{JSON.stringify=original;}
 expect(code).toBe('LIMIT');expect(fullSerializations).toBe(0);
});
test('native null and absence remain independent Record states, never converted/defaulted',()=>{
 const values=(source.modules[0]!.elements.find(e=>e.id==='patients')!.members as any[]).map((m:any)=>({field:{module:m.module,element:m.element},state:'present' as const,value:m.element==='patients.active'?null:{string:m.element==='patients.id'?'native-patient':'literal'}}));
 const record=validateCoreRecordValues(source,{module:'domain',element:'patients'},values);expect(record.fields.find(f=>f.field.element===field.element)!.state).toBe('present');expect(record.values.find(v=>v.field.element===field.element)).toEqual({field,state:'present',value:null});
 const absent=validateCoreRecordValues(source,{module:'domain',element:'patients'},values.filter(v=>v.field.element!==field.element));expect(absent.fields.find(f=>f.field.element===field.element)!.state).toBe('absent');
});
