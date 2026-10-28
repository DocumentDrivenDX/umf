import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as avro from '../../../src/adapters/avro/index.ts';
import { UmfError } from '../../../src/model/types.ts';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const observed = (run: () => unknown) => {
  try { return { status: 'ok', value: run() }; }
  catch (error) {
    const e = error as Error & { code?: string; path?: string };
    return { status: 'error', name: e.name, code: e.code ?? null, path: e.path ?? null,
      message: e.message, publicUmfError: error instanceof UmfError };
  }
};

const valid = avro.importAvroSchema(
  '{"type":"record","name":"Packet","fields":[{"name":"count","type":"long","default":9223372036854775807},{"name":"label","type":"string","custom.field":{"owner":"future"}}],"custom.root":{"keep":true}}',
  { id: 'avro-r8-packet' },
);
valid.extensions = { 'example.future': { payload: ['retain', 7] } } as never;
valid.vocabularies['example.future'] = { version: '1.0.0' };
const unresolved = avro.importAvroSchema(
  '{"type":"record","name":"Unresolved","fields":[{"name":"value","type":"Missing.Type"}]}',
  { id: 'unresolved' },
);
const unknownRepresentation = structuredClone(valid);
const payload = unknownRepresentation.modules[0]!.elements[0]!.extensions[avro.AVRO_EXTENSION] as any;
payload.futureRepresentation = { kind: 'string', value: 'no native destination' };
const getterDocument: Record<string, unknown> = {};
Object.defineProperty(getterDocument, 'modules', { enumerable: true, get() { throw new Error('modules getter observed'); } });

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
const sourcePaths = [
  'src/adapters/avro/index.ts', 'src/adapters/avro/metadata.ts',
  'src/validation/document.ts', 'src/validation/schema.ts', 'src/model/json.ts',
  'src/model/serialization.ts', 'src/model/types.ts',
];
const sourceHashes = Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(path))]));
const packet = {
  format: 'umf-r8-avro-inspect-edit-typescript-predecessor/1',
  source: 'direct current TypeScript imports from src/adapters/avro/index.ts',
  operations: ['inspectAvro', 'proposeAvroNodeEdit'],
  cases: {
    inspectValidWithUnknownNativeContent: observed(() => avro.inspectAvro(valid)),
    inspectUnresolvedName: observed(() => avro.inspectAvro(unresolved)),
    inspectInvalidUmfDocument: observed(() => avro.inspectAvro({} as never)),
    inspectAccessorDocument: observed(() => avro.inspectAvro(getterDocument as never)),
    proposeKnownFieldTypeChange: observed(() => {
      const proposal = avro.proposeAvroNodeEdit(valid, '/fields/1/type', '"bytes"');
      return {
        status: proposal.status,
        source: proposal.source,
        document: proposal.document,
        validation: proposal.validation,
        edit: proposal.edit,
      };
    }),
    proposeInvalidTarget: observed(() => avro.proposeAvroNodeEdit(valid, '/fields/404/type', '"int"')),
    proposeUnknownRepresentation: observed(() => avro.proposeAvroNodeEdit(unknownRepresentation, '', '"string"')),
    proposeAccessorDocument: observed(() => avro.proposeAvroNodeEdit(getterDocument as never, '', '"string"')),
  },
  hostAndCopy: (() => {
    const proposal = avro.proposeAvroNodeEdit(valid, '/fields/1/type', '"bytes"');
    const edit = proposal.edit.replacement;
    (proposal.document.extensions as any)['example.future'].payload[0] = 'changed';
    return {
      sourceUnaffectedByCandidateMutation: (valid.extensions as any)['example.future'].payload[0] === 'retain',
      proposalSourceDetachedFromInput: proposal.source !== valid,
      replacementExactTaggedValue: edit,
      unknownFieldMetadataRetained: Boolean((proposal.document.modules[0]!.elements[0]!.extensions[avro.AVRO_EXTENSION] as any).root.members.fields.items[1].members['custom.field']),
      unknownRootMetadataRetained: Boolean((proposal.document.modules[0]!.elements[0]!.extensions[avro.AVRO_EXTENSION] as any).root.members['custom.root']),
      unrelatedExtensionRetainedInSource: Boolean((proposal.source.extensions as any)['example.future']),
    };
  })(),
  sourceCohort: {
    gitHead: Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim(),
    bun: Bun.version,
    avsc: packageJson.dependencies.avsc,
    sourceHashes,
  },
};

const target = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-avro-inspect-edit-predecessor/predecessor.json');
const bytes = `${JSON.stringify(packet, null, 2)}\n`;
writeFileSync(target, bytes);
console.log(JSON.stringify({ path: target, sha256: hash(bytes), operations: packet.operations, caseCount: Object.keys(packet.cases).length }));
