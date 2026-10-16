import assert from 'node:assert/strict';
import {decodeBit128FileRecord} from '../../src/projections/bit128-file-values';
import artifacts from '../../fixtures/validation/uuid/file-model-artifacts.json';
import oracle from '../../fixtures/validation/uuid/bit128-oracle.json';
let checks=0,refusals=0;
for(const path of ['fixtures/validation/uuid/file-model-returned.json','fixtures/validation/uuid/tablespec-model-returned.json']){
 const {cases}=await Bun.file(path).json();
 for(const c of cases){
  const source=artifacts.cases.find(a=>a.system===c.system&&a.domain===c.domain&&a.kind===c.kind&&(a.signed??null)===(c.signed??null))!;assert.ok(source);
  assert.equal(c.rows.length,oracle.cases.length+1);
  for(const [i,row] of c.rows.entries()){
   const decoded=decodeBit128FileRecord(source.report.binding as any,source.report.source as any,{module:'m',element:'child'},row);
   const hex=(value:any)=>c.domain==='uuid'?value.uuid.replaceAll('-',''):value.bits128Hex;
   // Spark collection order is deliberately unspecified; validate multisets below.
   if(c.system!=='tablespec')assert.equal(hex(decoded[0]!.value),oracle.cases[i%oracle.cases.length]!.hex);
   if(c.system!=='tablespec')assert.equal(decoded[1]!.value===null?null:hex(decoded[1]!.value),i===oracle.cases.length?null:oracle.cases[(i+1)%oracle.cases.length]!.hex);checks++;
  }
  const actual=c.rows.map((r:any)=>{const d=decodeBit128FileRecord(source.report.binding as any,source.report.source as any,{module:'m',element:'child'},r);return JSON.stringify(d);}).sort();
  const expected=source.rows.map(r=>JSON.stringify(decodeBit128FileRecord(source.report.binding as any,source.report.source as any,{module:'m',element:'child'},r as any))).sort();
  assert.deepEqual(actual,expected);
  for(const row of c.invalidRows??[]){assert.throws(()=>decodeBit128FileRecord(source.report.binding as any,source.report.source as any,{module:'m',element:'child'},row));refusals++;}
 }
}
await Bun.write('fixtures/validation/uuid/returned-verification.json',JSON.stringify({checks,refusals,portableDecoderRecoveredActualNativeRows:true})+'\n');console.log({checks,refusals});
