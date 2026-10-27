// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import predecessor from '../../docs/helix/04-build/evidence/rust-migration/r5-actions/evaluate-action-rule/predecessor-results.json';
import predecessorCases from '../../docs/helix/04-build/evidence/rust-migration/r5-actions/evaluate-action-rule/predecessor-cases.json';
import sourceHashes from '../../docs/helix/04-build/evidence/rust-migration/r5-actions/evaluate-action-rule/source-hashes.json';
import currentSourceReviewHashes from '../../docs/helix/04-build/evidence/rust-migration/r5-actions/evaluate-action-rule/current-source-review-hashes.json';
import {capture,cases} from './evaluate-rule-predecessor';

const historicalPacketPath='docs/helix/04-build/evidence/rust-migration/r5-actions/evaluate-action-rule/source-hashes.json';
const historicalPacketSha256='bccb25428b406057e7ec3e26971be34249e02e988b47bb9369b3be9c785f23d5';
const reviewedDriftPaths=new Set([
 'package.json',
 'spec/core/extension-package.schema.json',
 'spec/core/schema.json',
 'spec/core/semantic-type-reference.schema.json',
 'spec/metamodel/generated/core-constraints.json',
 'spec/metamodel/generated/domain-policy.json',
 'src/generated/core-model.ts',
 'src/generated/core-validators.ts',
 'tests/actions/evaluate-rule-gate0.test.ts',
]);

test('R5 Gate0 evaluateActionRule matches the frozen TypeScript predecessor packet',()=>{
 expect(JSON.stringify(predecessorCases.cases)).toBe(JSON.stringify(cases));
 expect(capture()).toEqual(predecessor);
});

test('R5 Gate0 packet verifies every recorded predecessor and fixture source hash',()=>{
 expect(Bun.version).toBe(sourceHashes.runtime.bun);
 expect(sourceHashes.repositoryCommit).toBe('7f9d2710506942b6cddbb2246dc2a4349b34238a');
 expect(createHash('sha256').update(readFileSync(historicalPacketPath)).digest('hex')).toBe(historicalPacketSha256);
 const actualDriftPaths=new Set<string>();
 for(const [path,expected] of Object.entries(sourceHashes.sha256)){
  const actual=createHash('sha256').update(readFileSync(path)).digest('hex');
  if(actual!==expected) actualDriftPaths.add(path);
  const reviewedHash=currentSourceReviewHashes.sha256[path as keyof typeof currentSourceReviewHashes.sha256];
  if(reviewedDriftPaths.has(path)){
   expect(reviewedHash).toBe(actual);
  }else{
   expect(actual).toBe(expected);
  }
 }
 expect([...actualDriftPaths].sort()).toEqual([...reviewedDriftPaths].sort());
});
