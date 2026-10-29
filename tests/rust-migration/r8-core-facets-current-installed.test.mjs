// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'bun:test';

const repo=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const harness=resolve(repo,'scripts/rust-migration/r8/core-facets-current-installed.mjs');
const replay=resolve(repo,'docs/helix/04-build/evidence/rust-migration/r8-core-facets-installed/replay-installed.mjs');

test('Core Facets current launcher requires explicit immutable pins and reuses the established replay',async()=>{
 const source=await readFile(harness,'utf8');
 const replaySource=await readFile(replay,'utf8');
 assert.match(source,/\^\[a-f0-9\]\{64\}\$/);
 assert.match(source,/\^current-\[a-z0-9-\]\+\$/);
 assert.match(source,/\[replay,resolve\(archiveArg\),replayDir,archiveSha,closureSha,cohort\]/);
 assert.match(replaySource,/assert\.equal\(sha\(archiveBytes\),expectedArchive/);
 assert.match(replaySource,/assert\.equal\(sdk\.sourceClosure\.sha256,expectedClosure/);
 assert.match(source,/current-\$\{cohort\}-\$\{host\}\.json/);
 assert.match(source,/r8-core-facets-installed\/replay-installed\.mjs/);
 assert.match(replaySource,/frozen-typescript\.json/);
 assert.match(replaySource,/meaning-cases\.json/);
 assert.match(replaySource,/regression-cases\.json/);
 assert.match(replaySource,/exact-errors\.json/);
 for(const operation of ['inspectCoreFacets','declareCoreFacets','verifyCoreFacetDeclaration','historicalCoreFacetPatch'])
  assert.ok(replaySource.includes(operation),`replay includes ${operation}`);
 assert.match(replaySource,/requestBeforeSource/);
 assert.match(replaySource,/malformedReceiptBeforeCurrent/);
 assert.match(replaySource,/unknownNestedQualifier/);
 assert.match(replaySource,/nodeGlobalsAbsent/);
});

test('Core Facets current installed replay refuses to run without explicit archive pins',async()=>{
 const child=Bun.spawn(['bun',harness],{cwd:repo,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 assert.notEqual(await child.exited,0);
 assert.match(`${stdout}\n${stderr}`,/Usage: bun scripts\/rust-migration\/r8\/core-facets-current-installed\.mjs/);
});
