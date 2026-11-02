// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {relationshipExtraCases} from '../../scripts/core-ideals/relationship-extras-cases';
import {projectRelationshipToExtra,classifyRelationshipExtra,verifyRelationshipExtra,recoverRelationshipExtraIdeal,recoverRelationshipExtraNative} from '../../src/index-node-v4';

for(const system of ['graphql','rdf','linkml'] as const){
 const c=relationshipExtraCases().find(x=>x.request.system===system&&x.expected==='projected');
 if(!c)throw new Error(`Expected an ordinary ${system} authored relationship fixture`);
 test(`Rust default authored Relationship projection and recovery for ${system}`,()=>{
  const result=projectRelationshipToExtra(c.source,c.author,c.request);
  expect(result.status).toBe('projected');expect(result.target).toBeDefined();expect(result.nativeArchive).toBeDefined();
  if(result.status!=='projected'||!result.target||!result.nativeArchive)throw new Error('Expected projected target and archive');
  const target=result.target,archive=result.nativeArchive;
  expect(result.source).toEqual(c.source);expect(result.mappings.length).toBeGreaterThan(0);
  expect(verifyRelationshipExtra(result,target)).toEqual(result);
  expect(recoverRelationshipExtraIdeal(result,target)).toEqual(c.source);
  const native=recoverRelationshipExtraNative(result,target);expect(native.document).toEqual(result.target);expect(native.archive).toEqual(result.nativeArchive);
  const classified=classifyRelationshipExtra(target,{system,mode:'report',archive:archive});
  expect(classified.status).toBe('classified');expect(classified.target).toEqual(target);
  if(classified.status!=='classified'||!classified.target)throw new Error('Expected classified target');
  expect(verifyRelationshipExtra(classified)).toEqual(classified);
  const classifiedNative=recoverRelationshipExtraNative(classified,classified.target);
  expect(classifiedNative.document).toEqual(classified.source);expect(classifiedNative.archive).toEqual(result.nativeArchive);
  const strict=projectRelationshipToExtra(c.source,c.author,{...c.request,mode:'strict'});
  expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();expect(strict.nativeArchive).toBeUndefined();expect(strict.mappings).toEqual([]);
 });
}
