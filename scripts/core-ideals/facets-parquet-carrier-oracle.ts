/** Native carrier construction evidence, not complete authored facet projection. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parquetFacetFile,type ParquetFacetCarrier} from '../../src/core-ideals/parquet-facet-carrier';
import {parquetCarriers} from '../../src/core-ideals/parquet-carriers';
import {importParquetSchema,exportParquetCapture,readDocument,writeDocument} from '../../src';
const carriers:ParquetFacetCarrier[]=[
 ...Object.keys(parquetCarriers).map(nativeType=>({kind:'primitive' as const,nativeType:nativeType as keyof typeof parquetCarriers})),
 ...([8,16,32,64] as const).flatMap(bits=>[true,false].map(signed=>({kind:'integer' as const,bits,signed}))),
 {kind:'fixed',bytes:2},
 ...(['int32','int64','bytes','fixed'] as const).map(carrier=>({kind:'decimal' as const,carrier,precision:carrier==='int64'?18:4,scale:2,...(carrier==='fixed'?{bytes:2}:{})})),
 {kind:'decimal',carrier:'fixed',precision:76,scale:0,bytes:32},
 {kind:'decimal',carrier:'bytes',precision:77,scale:0},
];
const rows=[];let recoveries=0;
for(const [i,carrier] of carriers.entries())for(const nullable of [false,true]){
 const request={recordName:'FacetRecord',fieldName:'value',nullable,fieldId:37,carrier,metadata:{'future.meaning':'unclassified','umf.maxLength':'1'}};
 const bytes=parquetFacetFile(request),path=`fixtures/parquet/facets/carrier-${i}-${Number(nullable)}.parquet`;await Bun.write(path,bytes);
 const source=importParquetSchema(bytes,{id:`facet-carrier-${i}-${nullable}`});
 for(const format of ['json','yaml'] as const){assert.deepEqual(exportParquetCapture(readDocument(writeDocument(source,format),format)),bytes);recoveries++;}
 rows.push({path,request,sha256:createHash('sha256').update(bytes).digest('hex'),expectNative:!(carrier.kind==='decimal'&&carrier.precision>76)});
}
const corpus='fixtures/validation/facets-parquet-carrier-corpus.json';
await Bun.write(corpus,JSON.stringify({scope:'Explicit native schema carriers; unknown metadata is not enforcement',rows,serializationRecoveries:recoveries},null,2)+'\n');
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/facets-parquet-carrier-native.py'],{stdout:'inherit',stderr:'inherit'});assert.equal(await child.exited,0);
console.log(JSON.stringify({carriers:rows.length,serializationRecoveries:recoveries}));
