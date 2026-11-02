// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dir,'../..');
const frozenPath=resolve(root,'tests/rust-core/fixtures/parquet-relationship-predecessor.json');
const capturePath=resolve(root,'scripts/rust-migration/capture-parquet-relationship-predecessor.ts');

test('direct TypeScript Parquet relationship predecessor reproduces frozen corpus',()=>{
 const frozenText=readFileSync(frozenPath,'utf8');
 const result=Bun.spawnSync(['bun',capturePath],{cwd:root,stdout:'pipe',stderr:'pipe'});
 expect(result.exitCode).toBe(0);
 expect(result.stderr.toString()).toBe('');
 expect(result.stdout.toString()).toBe(frozenText);
 const frozen=JSON.parse(frozenText);
 expect(frozen.sha256).toBe('c5e7a3475512bd9eb1b1323b4a367aa76c983b843ebe661686b77fc492583fae');
 expect(frozen.cases.report.status).toBe('classified');
 expect(frozen.cases.report.observations).toHaveLength(11);
 expect(frozen.cases.report.residuals).toHaveLength(1);
 expect(frozen.cases.strict.status).toBe('blocked');
 expect(frozen.cases.unsupportedVocabularyReport.status).toBe('blocked');
});
