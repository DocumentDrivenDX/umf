import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/linkml/slot-values-schema.json';
import {importLinkmlDocument,inspectLinkmlSlotValues,exportLinkmlDocument,readDocument,writeDocument,LINKML_SCALAR_SLOT_FIELDS} from '../../src';
import {parseNativeJson} from '../../src/model/native-json';
const base='fixtures/linkml/slot-values/',fixture=await Bun.file(base+'results.json').json(),raw=await Bun.file(fixture.path).text();
const document=()=>importLinkmlDocument(raw,{id:fixture.path,format:'json'});
test('US-024-AC7: scalar effective values match native induction across both UMF formats',async()=>{
 const oracle=await Bun.file(base+'oracle-results.json').json(),check=new Ajv2020({strict:false,validateFormats:false}).addSchema(core).compile(schema),d=document();
 expect(Object.keys(LINKML_SCALAR_SLOT_FIELDS)).toEqual(oracle.scalarFields);expect(oracle.results).toHaveLength(54);
 for(const row of fixture.reports){const r=inspectLinkmlSlotValues(readDocument(writeDocument(d,row.format),row.format),row.report.className,row.report.slotName),{source,...report}=r,native=oracle.results.find((n:any)=>n.className===r.className&&n.slotName===r.slotName&&n.format===row.format);expect(report).toEqual(row.report);expect(check(r)).toBe(true);expect(r.status).toBe('resolved');expect(r.fields).toEqual(Object.fromEntries(Object.entries(native.encodedFields).map(([k,v])=>[k,parseNativeJson(v as string)])));expect(exportLinkmlDocument(source)).toBe(raw);}
},30000);
test('US-024-AC7: false/zero inheritance, usage, attributes, defaults and derived flags',()=>{
 const d=document(),plain=inspectLinkmlSlotValues(d,'Plain','child'),child=inspectLinkmlSlotValues(d,'Child','child');
 expect(plain.fields.required).toEqual({kind:'boolean',value:true});expect(plain.fields.minimum_value).toEqual({kind:'number',value:'-10'});expect(child.fields.required).toEqual({kind:'boolean',value:false});
 const age=inspectLinkmlSlotValues(d,'Child','age');expect(age.fields.minimum_value).toEqual({kind:'number',value:'21'});expect(age.fields.maximum_value).toEqual({kind:'number',value:'80'});
 expect(inspectLinkmlSlotValues(d,'Child','id').fields.required).toEqual({kind:'boolean',value:true});expect(inspectLinkmlSlotValues(d,'Child','defaulted').fields.range).toEqual({kind:'string',value:'string'});expect(inspectLinkmlSlotValues(d,'AttributeChild','child').fields.range).toEqual({kind:'string',value:'decimal'});
 const large=inspectLinkmlSlotValues(d,'AllFields','large');expect(large.fields.minimum_value).toEqual({kind:'number',value:'9007199254740995'});expect(large.fields.maximum_value).toEqual({kind:'number',value:'18446744073709551614'});
 expect(large.derivations.some(d=>d.rule==='slot-usage')).toBe(true);(large.fields.minimum_value as any).value='0';expect(exportLinkmlDocument(large.source)).toBe(raw);expect(exportLinkmlDocument(d)).toBe(raw);
});
test('US-024-AC7: malformed/coercing fields or missing slots block effective values',()=>{
 for(const slot of [{required:'false'},{readonly:true},{exact_cardinality:1.5},{minimum_value:'10'},{is_a:'missing'}]){const text=JSON.stringify({id:'https://example.org/x',name:'x',classes:{C:{slots:['s']}},slots:{s:slot}}),d=importLinkmlDocument(text,{id:'x',format:'json'}),r=inspectLinkmlSlotValues(d,'C','s');expect(r.status).toBe('blocked');expect(r.fields).toEqual({});expect(exportLinkmlDocument(r.source)).toBe(text);}
 expect(inspectLinkmlSlotValues(document(),'Child','absent').status).toBe('blocked');
});
test('US-024-AC7: decimal comparisons retain source tokens at extreme exponents',()=>{
 for(const [baseValue,usage,expected] of [['1e1000','2e999','1e1000'],['-1e1000','-2e999','-2e999'],['1e-1000','2e-1000','2e-1000'],['1.200','1.2','1.200']] as const){
  const text='{"id":"https://example.org/x","name":"x","classes":{"C":{"slots":["s"],"slot_usage":{"s":{"minimum_value":'+usage+'}}}},"slots":{"s":{"minimum_value":'+baseValue+'}}}',r=inspectLinkmlSlotValues(importLinkmlDocument(text,{id:'x',format:'json'}),'C','s');expect(r.fields.minimum_value).toEqual({kind:'number',value:expected});expect(exportLinkmlDocument(r.source)).toBe(text);
 }
});

test('US-024-AC7: integer exponent spellings stay exact without native coercion',()=>{
 for(const value of ['1200e-2','1.20e1','0e-999','-1200e-2']){const raw='{"id":"https://example.org/x","name":"x","classes":{"C":{"slots":["s"]}},"slots":{"s":{"equals_number":'+value+'}}}',r=inspectLinkmlSlotValues(importLinkmlDocument(raw,{id:'x',format:'json'}),'C','s');expect(r.status).toBe('resolved');expect(r.fields.equals_number).toEqual({kind:'number',value});}
});
