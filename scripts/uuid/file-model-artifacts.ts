// SPDX-License-Identifier: MIT OR Apache-2.0
import {uuidModel,PARENT,CHILD} from '../../tests/helpers/uuid-model-fixtures';
import {projectBit128Model} from '../../src/projections/bit128-model';
import {encodeBit128FileRecord,decodeBit128FileRecord} from '../../src/projections/bit128-file-values';
import oracle from '../../fixtures/validation/uuid/bit128-oracle.json';
const cases=[];
for(const system of ['avro','parquet','tablespec'])for(const domain of ['uuid','bits128'])for(const kind of system==='tablespec'?[domain==='uuid'?'uuid-text':'hex128-text']:domain==='uuid'?['native-uuid','bytes16','uuid-text','words64']:['bytes16','hex128-text','words64']){
 for(const signed of system==='parquet'&&kind==='words64'?[true,false]:[true]){
 const {binding,logical}=uuidModel(kind,system,domain,signed),report=projectBit128Model(binding,logical,'report');
 const literal=(v:typeof oracle.cases[number])=>domain==='uuid'?{uuid:v.uuid}:{bits128Hex:v.hex};
 const rows=oracle.cases.map((v,i)=>encodeBit128FileRecord(binding,logical,CHILD,[{field:{module:'m',element:'childId'},value:literal(v)},{field:{module:'m',element:'parentRef'},value:literal(oracle.cases[(i+1)%oracle.cases.length]!)}]));
 rows.push(encodeBit128FileRecord(binding,logical,CHILD,[{field:{module:'m',element:'childId'},value:literal(oracle.cases[0]!)},{field:{module:'m',element:'parentRef'},value:null}]));
 for(const row of rows)decodeBit128FileRecord(binding,logical,CHILD,row);
 cases.push({system,domain,kind,signed:kind==='words64'?signed:null,report,rows});
 }
}
await Bun.write('fixtures/validation/uuid/file-model-artifacts.json',JSON.stringify({cases})+'\n');
console.log({cases:cases.length});
