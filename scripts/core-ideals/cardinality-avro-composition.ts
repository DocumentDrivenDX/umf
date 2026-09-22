import assert from 'node:assert/strict';
import type {Element} from '../../src/model/types';
import {avroAvailabilitySource} from './nullability-avro-cases';
import {upgradeCardinalityEnvelope} from '../../src/model/cardinality-transition';
import {classifyAvroCardinality,recoverAvroCardinalityBundle} from '../../src/core-ideals/cardinality-avro';
import {recoverCardinalityFromAvro,type CardinalityAvroProjection} from '../../src/core-ideals/cardinality-avro-projection';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
/** Fresh native import is independent of the retained author receipt. */
export function verifyAvroCardinalityComposition(projection:CardinalityAvroProjection){
 assert.ok(projection.nativeBundle);const bundle=projection.nativeBundle,request=projection.request;
 const full=request.namespace?request.namespace+'.'+request.recordName:request.recordName;
 const initial=avroAvailabilitySource(bundle.schema,bundle.dependencies,full,request.fieldName);
 const source=upgradeCardinalityEnvelope(initial.source).target;
 const classified=classifyAvroCardinality(source,{column:initial.column,nativeSource:bundle.schema,dependencies:bundle.dependencies,identity:{module:'logical',element:'value'},profile:'present-non-null-schema',mode:'report'});
 assert.ok(classified.target);
 if(projection.mapping.outcome==='exact')for(const pair of projection.mapping.items){
  const parts=/^\/modules\/(\d+)\/elements\/(\d+)$/.exec(pair.idealPath);assert.ok(parts);
  const ideal=projection.source.modules[Number(parts[1])]!.elements[Number(parts[2])]!;
  const node=classified.mapping.nodes.find(n=>n.location.path===pair.nativeLocation.path&&n.location.dependencyId===pair.nativeLocation.dependencyId);assert.ok(node);
  assert.equal(node.cardinality,ideal.cardinality);
  const field:Element=classified.target.modules.find(m=>m.id===node.identity.module)!.elements.find(e=>e.id===node.identity.element)!;
  if(ideal.scalarType!==undefined)assert.equal(field.scalarType,ideal.scalarType);
  if(ideal.nullability==='required'||ideal.nullability==='absent-allowed')assert.equal(node.nativeAllowsNull,ideal.nullability==='absent-allowed');
 }
 let nativeRecoveries=0,idealRecoveries=0;
 for(const format of ['json','yaml'] as const){
  const nativeReceipt=readJsonValue(writeJsonValue(classified,format),format) as unknown as typeof classified;
  assert.deepEqual(recoverAvroCardinalityBundle(nativeReceipt,nativeReceipt.target!),bundle);nativeRecoveries++;
  const idealReceipt=readJsonValue(writeJsonValue(projection,format),format) as unknown as typeof projection;
  assert.deepEqual(recoverCardinalityFromAvro(idealReceipt,bundle),projection.author.target);idealRecoveries++;
 }
 return {nativeRecoveries,idealRecoveries,nativeCardinality:classified.mapping.cardinality,authoredCardinality:projection.mapping.cardinality,nativeNodes:classified.mapping.nodes.length};
}
