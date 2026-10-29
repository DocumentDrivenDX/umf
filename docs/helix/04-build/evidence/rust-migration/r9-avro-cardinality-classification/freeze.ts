import {avroAvailabilitySource} from '../../../../../../scripts/core-ideals/nullability-avro-cases';
import {classifyAvroCardinality,recoverAvroCardinalityBundle} from '../../../../../../src/core-ideals/cardinality-avro';
import fixture from '../../../../../../fixtures/avro/cardinality-cases.json';
const outcomes:any={};
for(const row of fixture.cases){
 const {source,column}=avroAvailabilitySource(row.schema,[],'cardinality.Example');
 for(const profile of ['present-non-null-schema','unresolved'] as const)for(const mode of ['strict','report'] as const){
  const request={column,nativeSource:row.schema,dependencies:[],identity:{module:'logical',element:'value'},profile,mode};
  const result=classifyAvroCardinality(source,request);outcomes[`${row.id}/${profile}/${mode}`]={source,request,result,...(result.target?{recovered:recoverAvroCardinalityBundle(result,result.target)}:{})};
 }
}
console.log(JSON.stringify({core:'0.10.0',avro:'1.12.0',binding:'1.0.0',outcomes}));
