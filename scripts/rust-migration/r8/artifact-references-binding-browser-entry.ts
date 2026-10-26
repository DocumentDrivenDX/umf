// SPDX-License-Identifier: MIT OR Apache-2.0
import {inspectArtifactReferences} from '../../../src/domain-packs/artifacts';
import {executeArtifactReferencesBindingWire} from '../../../bindings/core/wasm/index.js';
import {fromWire, resultError} from '../../../bindings/core/wasm/src/wire.js';

function diagnosticUnits(values: string[]) {
  return values.map(value => Array.from({length: value.length}, (_, index) => value.charCodeAt(index)));
}

function runWire(wire: string, control?: (amount: number) => string) {
  const module = (globalThis as any).artifactReferenceWasmModule;
  const envelope = JSON.parse(executeArtifactReferencesBindingWire(module, wire, control));
  const failure = resultError(envelope);
  if (failure) return {status: 'error', code: failure.code, messageUnits: diagnosticUnits([failure.message])[0]};
  const value = fromWire(JSON.parse(envelope.wire));
  return {status: 'ok', diagnosticUnits: diagnosticUnits(value as string[])};
}

const input = (globalThis as any).artifactReferenceInputs;
const referenceRequest = fromWire(JSON.parse(input.referenceWire)) as any;
const reference = inspectArtifactReferences(referenceRequest.pack);
const results = {
  reference: {typescriptDiagnosticUnits: diagnosticUnits(reference), rust: runWire(input.referenceWire)},
  hostRefusal: runWire(input.referenceWire, () => input.deniedControlWire),
  capRefusal: runWire(input.capWire),
  missingPackRefusal: runWire(input.missingPackWire),
};
(globalThis as any).artifactReferenceResults = results;
