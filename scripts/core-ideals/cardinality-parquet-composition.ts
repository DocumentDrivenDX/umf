import assert from 'node:assert/strict';
import type {Element} from '../../src/model/types';
import {importParquetSchema,exportParquetCapture,upgradeFieldEnvelope,upgradeNullabilityEnvelope,upgradeCardinalityEnvelope,classifyParquetCardinality,recoverParquetCardinalityBytes,readJsonValue,writeJsonValue} from '../../src';
import {recoverCardinalityFromParquet,type CardinalityParquetProjection} from '../../src/core-ideals/cardinality-parquet-projection';
/** Fresh ingestion uses only native bytes, never retained author metadata. */
export function verifyParquetCardinalityComposition(projection:CardinalityParquetProjection){
 assert.ok(projection.target);const bytes=exportParquetCapture(projection.target);
 const source=upgradeCardinalityEnvelope(upgradeNullabilityEnvelope(upgradeFieldEnvelope(importParquetSchema(bytes,{id:'fresh-native'})).target).target).target;
 const classified=classifyParquetCardinality(source,{index:1,identity:{module:'logical',element:'value'},profile:'present-value-schema',mode:'report'});
 assert.ok(classified.target);
 if(projection.mapping.outcome==='exact')for(const pair of projection.mapping.items){
  const parts=/^\/modules\/(\d+)\/elements\/(\d+)$/.exec(pair.idealPath);assert.ok(parts);
  const ideal=projection.source.modules[Number(parts[1])]!.elements[Number(parts[2])]!;
  const node=classified.mapping.nodes.find(n=>n.index===pair.nativeIndex);assert.ok(node);
  assert.equal(node.shape,ideal.cardinality);
  const field:Element=classified.target.modules.find(m=>m.id===node.identity.module)!.elements.find(e=>e.id===node.identity.element)!;
  if(ideal.scalarType!==undefined)assert.equal(field.scalarType,ideal.scalarType);
  if(ideal.nullability==='required'||ideal.nullability==='absent-allowed')assert.equal(node.nativeNullable,ideal.nullability==='absent-allowed');
 }
 let nativeRecoveries=0,idealRecoveries=0;
 for(const format of ['json','yaml'] as const){
  const nativeReceipt=readJsonValue(writeJsonValue(classified,format),format) as unknown as typeof classified;
  assert.deepEqual(recoverParquetCardinalityBytes(nativeReceipt,nativeReceipt.target!),bytes);nativeRecoveries++;
  const idealReceipt=readJsonValue(writeJsonValue(projection,format),format) as unknown as typeof projection;
  assert.deepEqual(recoverCardinalityFromParquet(idealReceipt,bytes),projection.author.target);idealRecoveries++;
 }
 return {nativeRecoveries,idealRecoveries,nativeCardinality:classified.mapping.cardinality,authoredCardinality:projection.mapping.cardinality,nativeNodes:classified.mapping.nodes.length};
}
