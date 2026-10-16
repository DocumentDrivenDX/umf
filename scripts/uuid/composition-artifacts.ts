import {mixedModel,compositeModel,associationModel,associationData,polymorphicModel,polymorphicData,values,compositeValues} from '../../tests/helpers/uuid-composition-fixtures';
import {projectBit128Model,recoverBit128ModelProjection} from '../../src/projections/bit128-model';
import {encodeBit128Record,decodeBit128Record} from '../../src/extensions/binding/bit128-record';
import {encodeBit128FileRecord,decodeBit128FileRecord} from '../../src/projections/bit128-file-values';
import {validateBit128Dataset} from '../../src/extensions/binding/model-dataset';
import type {Bit128DatasetRecord} from '../../src/extensions/binding/model-dataset';
const cases=[];
for(const system of ['postgresql','sqlserver','avro','parquet','tablespec'])for(const stage of ['mixed','containers','associations','associations-polymorphic']){
 const model=(stage==='mixed'?mixedModel:stage==='containers'?compositeModel:stage==='associations'?associationModel:polymorphicModel)(system),report=projectBit128Model(model.binding,model.logical,'report');
 const data=stage==='associations-polymorphic'?polymorphicData():stage==='associations'?associationData():[{record:{module:'m',element:'parent'},rows:[[{field:{module:'m',element:'parentId'},value:{uuid:'00000000-0000-0000-0000-000000000000'}}]]},{record:{module:'m',element:'child'},rows:[stage==='mixed'?values:compositeValues]}];
 const canonical=validateBit128Dataset(model.binding,model.logical,data as Bit128DatasetRecord[]),file=!['postgresql','sqlserver'].includes(system);
 const records=canonical.map(r=>({record:r.record,rows:r.rows.map(row=>file?encodeBit128FileRecord(model.binding,model.logical,r.record,row):encodeBit128Record(model.binding,model.logical,r.record,row))}));
 for(const r of records)for(const row of r.rows)file?decodeBit128FileRecord(model.binding,model.logical,r.record,row):decodeBit128Record(model.binding,model.logical,r.record,row as Record<string,string|null>);
 recoverBit128ModelProjection(report,report.candidate!.text);
 cases.push({system,stage,...model,report,records});
}
await Bun.write('fixtures/validation/uuid/composition-artifacts.json',JSON.stringify({profile:'uuid-model2',cases})+'\n');console.log({cases:cases.length});
