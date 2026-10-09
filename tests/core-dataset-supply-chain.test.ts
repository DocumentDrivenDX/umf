import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {readDocument,validateCoreDatasetValues,verifyCoreDatasetValues,validateCoreRecordValues} from '../src/index';
import {supplyChainDataset} from './helpers/supply-chain-dataset';
const source=readDocument(readFileSync('spec/domain-packs/supply-chain/ontology.json','utf8'),'json');
const graph=JSON.parse(readFileSync('spec/domain-packs/supply-chain/graph/fixture.json','utf8'));
const input=supplyChainDataset(source,graph);
const count=(v:any):number=>1+(Array.isArray(v)?v.reduce((n,x)=>n+count(x),0):v!==null&&typeof v==='object'?Object.values(v).reduce<number>((n,x)=>n+count(x),0):0);
test('original finite supply-chain graph preserves complete source receipts and present-null parents',()=>{
 const before=JSON.stringify({source,input});const result=validateCoreDatasetValues(source,input);
 expect(result.datasetValidation).toEqual({valid:true,complete:true,diagnostics:[]});
 expect(result.records.length).toBe(20);expect(result.keys.length).toBe(20);expect(result.relationships.length).toBe(23);
 expect(count(result)).toBeLessThanOrEqual(100000);expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThanOrEqual(4000000);
 expect(result.source).toEqual(source);expect(result.input).toEqual(input);
 for(let n=0;n<input.records.length;n++){const record=input.records[n]!;expect(result.records[n]!.result).toEqual(validateCoreRecordValues(source,record.identity,record.values));}
 const nullable=result.records.flatMap(r=>r.result.values.filter(v=>v.state==='present'&&v.value===null));
 expect(nullable.length).toBe(2);expect(nullable.every(v=>v.field.element==='containers.parent_id')).toBe(true);
 for(const edge of graph.edges){const actual=result.relationships.find(r=>r.instanceId===edge.key)!;expect([actual.sourceInstanceId,actual.targetInstanceId]).toEqual([edge.source,edge.target]);}
 expect(verifyCoreDatasetValues(result,source,input)).toEqual(result);expect(JSON.stringify({source,input})).toBe(before);
});
test('tighter retained-copy estimate preserves oversized aggregate and exact receipt refusal',()=>{
 const oversized=structuredClone(input);oversized.records=Array(1000).fill(input.records[0]!);
 try{validateCoreDatasetValues(source,oversized);throw Error('Oversized dataset admitted');}catch(error:any){expect(error.code).toBe('LIMIT');}

 const large=structuredClone(input);large.context={retained:'x'.repeat(600000)};
 expect(()=>validateCoreDatasetValues(source,large)).toThrow('budget');
});
