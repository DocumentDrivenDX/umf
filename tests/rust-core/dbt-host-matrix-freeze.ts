// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze observable host admission/prototype behavior for the opt-in DBT Rust
// facade. Run with `bun tests/rust-core/dbt-host-matrix-freeze.ts`.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {importDbtManifest, inspectDbtManifest} from '../../src/adapters/dbt/index.ts';
import {importDbtArtifact, inspectDbtArtifact} from '../../src/adapters/dbt/artifact.ts';
import {importDbtSemanticManifest, inspectDbtSemanticManifest} from '../../src/adapters/dbt/semantic.ts';
import {selectDbtManifestDependencies} from '../../src/adapters/dbt/selection.ts';

type Outcome = {kind: 'return'; value: unknown; prototypes?: unknown} | {kind: 'throw'; name: string; code: unknown; path: unknown; message: string};
const outcomes: {label: string; outcome: Outcome; trace?: string[]}[] = [];
function summarize(label: string, run: () => unknown, trace?: string[]) {
  try {
    const value = run();
    outcomes.push({label, outcome: {kind: 'return', value, prototypes: summarizePrototypes(value)}, ...(trace ? {trace} : {})});
  } catch (error) {
    const item = error as Error & {code?: unknown; path?: unknown};
    outcomes.push({label, outcome: {kind: 'throw', name: item.name, code: item.code ?? null, path: item.path ?? '', message: item.message}, ...(trace ? {trace} : {})});
  }
}
function summarizePrototypes(value: unknown): unknown {
  if (Array.isArray(value)) return {kind: 'array', items: value.map(summarizePrototypes)};
  if (value === null || typeof value !== 'object') return null;
  const proto = Object.getPrototypeOf(value) === null ? 'null' : 'ordinary';
  return {kind: 'object', proto, members: Object.fromEntries(Object.keys(value).map(key => [key, summarizePrototypes((value as any)[key])]))};
}

const manifestText = '{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/manifest/v12.json"},"nodes":{},"sources":{},"exposures":{},"metrics":{},"semantic_models":{},"saved_queries":{},"unit_tests":{},"macros":{},"docs":{},"groups":{},"parent_map":{},"child_map":{}}';
const artifactText = '{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/run-results/v99.json"},"results":[]}';
const semanticText = '{"project_configuration":{"dsi_package_version":{"major_version":"0","minor_version":"8","patch_version":"5"}},"models":{}}';

for (const [label, invoke, validText] of [
  ['manifest', importDbtManifest, manifestText],
  ['artifact', importDbtArtifact, artifactText],
  ['semantic', importDbtSemanticManifest, semanticText],
] as const) {
  const trace: string[] = [];
  const options = Object.defineProperties({}, {
    id: {enumerable: true, get() { trace.push('id'); return `id-${label}`; }},
    ignored: {enumerable: true, get() { trace.push('ignored'); throw new Error('ignored getter read'); }},
  });
  summarize(`${label}.import-options`, () => invoke(validText, options as {id: string}), trace);
  summarize(`${label}.import-null-options`, () => invoke(validText, null as never));
  summarize(`${label}.import-null-id`, () => invoke(validText, {id: null as never}));
  summarize(`${label}.import-invalid-id`, () => invoke(validText, {id: 7 as never}));
  summarize(`${label}.import-undefined-id`, () => invoke(validText, {id: undefined as never}));
  summarize(`${label}.import-missing-id`, () => invoke(validText, {} as never));
  summarize(`${label}.import-invalid-source-and-id`, () => invoke('{', {id: 7 as never}));
  summarize(`${label}.import-invalid-source-null-id`, () => invoke('{', {id: null as never}));
  summarize(`${label}.import-invalid-source-missing-id`, () => invoke('{', {} as never));
}

const manifest = importDbtManifest(manifestText, {id: 'dbt-host-matrix'});
const artifact = importDbtArtifact(artifactText, {id: 'dbt-host-matrix'});
const semantic = importDbtSemanticManifest(semanticText, {id: 'dbt-host-matrix'});
for (const [label, inspect, document] of [
  ['manifest', inspectDbtManifest, manifest],
  ['artifact', inspectDbtArtifact, artifact],
  ['semantic', inspectDbtSemanticManifest, semantic],
] as const) {
  const functionDocument = structuredClone(document) as any;
  functionDocument.future = () => 1;
  summarize(`${label}.inspect-function`, () => inspect(functionDocument));
  const cycleDocument = structuredClone(document) as any;
  cycleDocument.future = cycleDocument;
  summarize(`${label}.inspect-cycle`, () => inspect(cycleDocument));
  const accessorDocument = structuredClone(document) as any;
  Object.defineProperty(accessorDocument, 'future', {enumerable: true, get() { throw new Error('source accessor'); }});
  summarize(`${label}.inspect-accessor`, () => inspect(accessorDocument));
}

const selectionTrace: string[] = [];
const selectionOptions = Object.defineProperties({}, {
  roots: {enumerable: true, get() { selectionTrace.push('roots'); return ['model.absent']; }},
  includeMacros: {enumerable: true, get() { selectionTrace.push('includeMacros'); return false; }},
  maxDepth: {enumerable: true, get() { selectionTrace.push('maxDepth'); return 16; }},
  maxNodes: {enumerable: true, get() { selectionTrace.push('maxNodes'); return 256; }},
  ignored: {enumerable: true, get() { selectionTrace.push('ignored'); throw new Error('ignored getter read'); }},
});
summarize('selection.known-option-order', () => selectDbtManifestDependencies(manifest, selectionOptions as never), selectionTrace);
const invalidRootsTrace: string[] = [];
const invalidRoots = Object.defineProperties({}, {
  roots: {enumerable: true, get() { invalidRootsTrace.push('roots'); return []; }},
  includeMacros: {enumerable: true, get() { invalidRootsTrace.push('includeMacros'); return false; }},
});
summarize('selection.invalid-roots-stop', () => selectDbtManifestDependencies(manifest, invalidRoots as never), invalidRootsTrace);
summarize('selection.null-options', () => selectDbtManifestDependencies(manifest, null as never));

writeFileSync(resolve('tests/rust-core/dbt-host-matrix-freeze.json'), JSON.stringify({profile: 'umf-r9-dbt-preservation/0.1.0', outcomes}, null, 2) + '\n');
