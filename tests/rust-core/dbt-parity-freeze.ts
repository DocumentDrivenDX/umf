// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze complete predecessor outcomes for the opt-in DBT production wire.
// Run with `bun tests/rust-core/dbt-parity-freeze.ts`; the Rust corpus test
// consumes the resulting packet in the same checkout.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {encodeWire} from '../../bindings/core/node/src/wire.js';
import {
  importDbtManifest, exportDbtManifest, inspectDbtManifest,
  getDbtManifestNode, proposeDbtManifestNodeEdit,
} from '../../src/adapters/dbt/index.ts';
import {
  importDbtArtifact, exportDbtArtifact, inspectDbtArtifact,
  getDbtArtifactNode, proposeDbtArtifactNodeEdit,
} from '../../src/adapters/dbt/artifact.ts';
import {
  importDbtSemanticManifest, exportDbtSemanticManifest, inspectDbtSemanticManifest,
  getDbtSemanticManifestNode, proposeDbtSemanticManifestNodeEdit,
} from '../../src/adapters/dbt/semantic.ts';
import {inspectDbtManifestGraph} from '../../src/adapters/dbt/graph.ts';
import {selectDbtManifestDependencies} from '../../src/adapters/dbt/selection.ts';

const PROFILE = 'umf-r9-dbt-preservation/0.1.0';
const units = (value: string) => Array.from({length: value.length}, (_, index) => value.charCodeAt(index));
const manifestVersion = 'https://schemas.getdbt.com/dbt/manifest/v12.json';
const manifestText = String.raw`{"metadata":{"dbt_schema_version":"${manifestVersion}"},"nodes":{"model.demo.child":{"unique_id":"model.demo.child","depends_on":{"nodes":["seed.demo.base"],"macros":[]}}},"sources":{"seed.demo.base":{"unique_id":"seed.demo.base","depends_on":{"nodes":[],"macros":[]}}},"exposures":{},"metrics":{},"semantic_models":{},"saved_queries":{},"unit_tests":{},"macros":{},"docs":{},"groups":{},"parent_map":{"model.demo.child":["seed.demo.base"],"seed.demo.base":[]},"child_map":{"model.demo.child":[],"seed.demo.base":["model.demo.child"]},"future\ud800":{"large":9007199254740993,"text":"kept\ud800"}}`;
const artifactText = String.raw`{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/run-results/v99.json"},"results":[],"future\ud800":{"large":9007199254740993,"text":"kept\ud800"}}`;
const semanticText = String.raw`{"project_configuration":{"dsi_package_version":{"major_version":"0","minor_version":"8","patch_version":"5"}},"models":{},"future\ud800":{"large":9007199254740993,"text":"kept\ud800"}}`;
const graphConflictText = `{"metadata":{"dbt_schema_version":"${manifestVersion}"},"nodes":{"model.demo.same":{"unique_id":"model.demo.same","depends_on":[]}},"sources":{"model.demo.same":{"unique_id":"model.demo.same","depends_on":{"nodes":[],"macros":[]}}},"exposures":{},"metrics":{},"semantic_models":{},"saved_queries":{},"unit_tests":{},"macros":{},"docs":{},"groups":{},"parent_map":{"model.demo.same":[]},"child_map":{"model.demo.same":[]}}`;

type Request = Record<string, unknown> & {profile: string; op: string};
type FrozenCase = {
  label: string;
  requestWire: string;
  expected: {status: 'ok'; wire: string} | {
    status: 'error'; code: string | null; pathUnits: number[]; messageUnits: number[];
  };
};
const cases: FrozenCase[] = [];
function freeze(label: string, request: Request, run: () => unknown) {
  try {
    cases.push({label, requestWire: encodeWire(request), expected: {status: 'ok', wire: encodeWire(run())}});
  } catch (error) {
    const failure = error as Error & {code?: unknown; path?: unknown};
    const path = typeof failure.path === 'string' ? failure.path : '';
    cases.push({label, requestWire: encodeWire(request), expected: {
      status: 'error',
      code: typeof failure.code === 'string' ? failure.code : null,
      pathUnits: units(path),
      messageUnits: units(String(failure.message)),
    }});
  }
}
const req = (op: string, fields: Record<string, unknown> = {}): Request => ({profile: PROFILE, op, ...fields});

const manifest = importDbtManifest(manifestText, {id: 'dbt-manifest-parity'});
const artifact = importDbtArtifact(artifactText, {id: 'dbt-artifact-parity'});
const semantic = importDbtSemanticManifest(semanticText, {id: 'dbt-semantic-parity'});
const inputs = [
  {label: 'manifest', document: manifest, importText: manifestText,
    importOp: 'dbt.importManifest', exportOp: 'dbt.exportManifest', inspectOp: 'dbt.inspectManifest',
    getOp: 'dbt.getManifestNode', editOp: 'dbt.editManifest', get: getDbtManifestNode,
    edit: proposeDbtManifestNodeEdit, exp: exportDbtManifest, inspect: inspectDbtManifest},
  {label: 'artifact', document: artifact, importText: artifactText,
    importOp: 'dbt.importArtifact', exportOp: 'dbt.exportArtifact', inspectOp: 'dbt.inspectArtifact',
    getOp: 'dbt.getArtifactNode', editOp: 'dbt.editArtifact', get: getDbtArtifactNode,
    edit: proposeDbtArtifactNodeEdit, exp: exportDbtArtifact, inspect: inspectDbtArtifact},
  {label: 'semantic', document: semantic, importText: semanticText,
    importOp: 'dbt.importSemanticManifest', exportOp: 'dbt.exportSemanticManifest', inspectOp: 'dbt.inspectSemanticManifest',
    getOp: 'dbt.getSemanticManifestNode', editOp: 'dbt.editSemanticManifest', get: getDbtSemanticManifestNode,
    edit: proposeDbtSemanticManifestNodeEdit, exp: exportDbtSemanticManifest, inspect: inspectDbtSemanticManifest},
];

// One frozen outcome for each of the 17 public predecessor operations.
for (const item of inputs) {
  freeze(`${item.label}.import`, req(item.importOp, {text: item.importText, options: {id: `dbt-${item.label}-parity`}}),
    () => item.label === 'manifest' ? importDbtManifest(item.importText, {id: `dbt-${item.label}-parity`})
      : item.label === 'artifact' ? importDbtArtifact(item.importText, {id: `dbt-${item.label}-parity`})
        : importDbtSemanticManifest(item.importText, {id: `dbt-${item.label}-parity`}));
  freeze(`${item.label}.export`, req(item.exportOp, {document: item.document}), () => item.exp(item.document));
  freeze(`${item.label}.inspect`, req(item.inspectOp, {document: item.document}), () => item.inspect(item.document));
  const pointer = item.label === 'semantic' ? '/project_configuration/dsi_package_version/major_version' : '/metadata/dbt_schema_version';
  freeze(`${item.label}.get`, req(item.getOp, {document: item.document, path: pointer}), () => item.get(item.document, pointer));
  const replacement = item.label === 'semantic' ? '"0"' : JSON.stringify(manifestVersion);
  freeze(`${item.label}.edit`, req(item.editOp, {document: item.document, path: pointer, text: replacement}),
    () => item.edit(item.document, pointer, replacement));
}
freeze('manifest.graph', req('dbt.inspectManifestGraph', {document: manifest}), () => inspectDbtManifestGraph(manifest));
freeze('manifest.select.defaults', req('dbt.selectManifestDependencies', {
  document: manifest, options: {roots: ['model.demo.child']},
}), () => selectDbtManifestDependencies(manifest, {roots: ['model.demo.child']}));

// Controls cover unknown versions, exact native number tokens and isolated UTF-16
// surrogates in future source keys/values, plus tagged representation loss refusal.
for (const item of inputs) {
  const payload = item.document.modules[0]!.elements[0]!.extensions[
    item.label === 'manifest' ? 'umf.dbt.manifest' : item.label === 'artifact' ? 'umf.dbt.artifact' : 'umf.dbt.semantic'
  ] as unknown as Record<string, unknown>;
  const withUnknownRepresentation = structuredClone(item.document);
  const clonedPayload = withUnknownRepresentation.modules[0]!.elements[0]!.extensions[
    item.label === 'manifest' ? 'umf.dbt.manifest' : item.label === 'artifact' ? 'umf.dbt.artifact' : 'umf.dbt.semantic'
  ] as unknown as Record<string, unknown>;
  Object.defineProperty(clonedPayload, 'future\ud800', {value: {kind: 'string', value: 'retained\ud800'}, enumerable: true});
  freeze(`${item.label}.tagged-extra.inspect`, req(item.inspectOp, {document: withUnknownRepresentation}), () => item.inspect(withUnknownRepresentation));
  freeze(`${item.label}.tagged-extra.export-refusal`, req(item.exportOp, {document: withUnknownRepresentation}), () => item.exp(withUnknownRepresentation));
  // Ensure source extras really are present in the fixture without expanding the packet.
  if (!payload.root) throw new Error(`Missing ${item.label} native root`);
}

// JSON.parse overflows valid native numeric tokens without changing their
// lossless representation. Include both signs and a typed grammar member.
const overflowText = manifestText.replace('"large":9007199254740993', '"large":1e400,"negative":-1e400')
  .replace('"metadata":{', '"metadata":{"generated_at":-1e400,');
const overflowDocument = importDbtManifest(overflowText, {id: 'dbt-overflow-native'});
freeze('manifest.native-number-overflow.import', req('dbt.importManifest', {text: overflowText, options: {id: 'dbt-overflow-native'}}),
  () => importDbtManifest(overflowText, {id: 'dbt-overflow-native'}));
freeze('manifest.native-number-overflow.inspect', req('dbt.inspectManifest', {document: overflowDocument}),
  () => inspectDbtManifest(overflowDocument));
freeze('manifest.native-number-overflow.export', req('dbt.exportManifest', {document: overflowDocument}),
  () => exportDbtManifest(overflowDocument));

const conflict = importDbtManifest(graphConflictText, {id: 'dbt-graph-priority'});
freeze('manifest.graph.duplicate-malformed-priority', req('dbt.inspectManifestGraph', {document: conflict}),
  () => inspectDbtManifestGraph(conflict));
freeze('selection.null-options', req('dbt.selectManifestDependencies', {document: manifest, options: null}),
  () => selectDbtManifestDependencies(manifest, null as never));
freeze('selection.null-setting', req('dbt.selectManifestDependencies', {
  document: manifest, options: {roots: ['model.demo.child'], includeMacros: null},
}), () => selectDbtManifestDependencies(manifest, {roots: ['model.demo.child'], includeMacros: null} as never));
freeze('selection.unknown-root', req('dbt.selectManifestDependencies', {
  document: manifest, options: {roots: ['model.demo.missing']},
}), () => selectDbtManifestDependencies(manifest, {roots: ['model.demo.missing']}));
freeze('manifest.get-empty-pointer', req('dbt.getManifestNode', {document: manifest, path: ''}),
  () => getDbtManifestNode(manifest, ''));
freeze('artifact.empty-unknown-data', req('dbt.inspectArtifact', {document: artifact}), () => inspectDbtArtifact(artifact));

const packet = {format: 'umf-r9-dbt-predecessor/1', profile: PROFILE, cases};
const output = resolve(process.env.DBT_PARITY_PACKET ?? 'tests/rust-core/dbt-parity-freeze.json');
writeFileSync(output, `${JSON.stringify(packet)}\n`, 'utf8');
console.log(`frozen ${cases.length} DBT outcomes to ${output}`);
