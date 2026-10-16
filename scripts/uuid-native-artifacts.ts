import oracle from '../fixtures/validation/uuid/bit128-oracle.json';
import {encodeBit128CarrierValue} from '../src/extensions/binding/bit128';
import {uuidBinding,uuidDocument,FIELD} from '../tests/helpers/uuid-fixtures';
import {projectBit128CarrierSchema} from '../src/projections/bit128';
const rows=[];
for(const [system,version] of [['postgresql','17'],['sqlserver','2022'],['avro','1.12.0'],['parquet','2.11.0'],['tablespec','1.0']] as const){
 for(const kind of ['native-uuid','bytes16','uuid-text','words64']){
  for(const signed of kind==='words64'?[true,false]:[true]){
  const binding=uuidBinding(kind,signed);(binding.extensions!['umf.binding'] as any).target={system,version,subset:'uuid-carrier1'};
  const report=projectBit128CarrierSchema(binding,uuidDocument(),FIELD,{lossPolicy:'strict',obligations:['bits']});
  const values=report.candidate?oracle.cases.map(v=>encodeBit128CarrierValue(binding,uuidDocument(),FIELD,{uuid:v.uuid})):[];
  rows.push({system,version,kind,signed,report,values});
  }
 }
}
await Bun.write('fixtures/validation/uuid/native-artifacts.json',JSON.stringify({scope:'Generated native schema candidates; not execution qualification',cases:rows},null,2)+'\n');
console.log({cases:rows.length,emitted:rows.filter(r=>r.report.candidate).length});
