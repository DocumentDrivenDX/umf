import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as protobuf from '../../../src/adapters/protobuf/index.ts';
import { UmfError } from '../../../src/model/types.ts';

const fixture = new Uint8Array(await Bun.file('fixtures/protobuf/authored.pb').arrayBuffer());
const unknownWire = new Uint8Array([0x82, 0xb5, 0x18, 0x04, 0x00, 0x01, 0x02, 0xff]);
const malformed = new Uint8Array(11).fill(0x80);
const doc = protobuf.importProtobufDescriptorSet(fixture, { id: 'frozen-packet' });
const unknownDoc = protobuf.importProtobufDescriptorSet(unknownWire, { id: 'unknown-wire' });

function observed(run: () => unknown) {
  try { return { status: 'ok', value: run() }; }
  catch (error) {
    const e = error as Error & { code?: string; path?: string };
    return { status: 'error', name: e.name, code: e.code ?? null, path: e.path ?? null,
      message: e.message, publicUmfError: error instanceof UmfError };
  }
}
function hex(value: Uint8Array) { return Array.from(value, x => x.toString(16).padStart(2, '0')).join(''); }
function hostCase(value: unknown) { return observed(() => protobuf.readDescriptorSet(value as Uint8Array)); }
const overLimit = new Uint8Array(4_000_001);
const emptyDataView = new DataView(new ArrayBuffer(0));
const nonemptyDataView = new DataView(new Uint8Array([0]).buffer);
const packet = {
  format: 'umf-r8-protobuf-descriptor-document-predecessor/1',
  source: 'current TypeScript implementation; direct imports from src/adapters/protobuf/index.ts',
  operations: ['readDescriptorSet','writeDescriptorSet','importProtobufDescriptorSet','exportProtobufDescriptorSet','getProtobufDescriptorSet','inspectProtobuf','exportProtobufBundle'],
  bytes: {
    empty: '', authored: hex(fixture), unknownWire: hex(unknownWire), malformed: hex(malformed),
    authoredSha256: createHash('sha256').update(fixture).digest('hex'),
  },
  vectors: {
    readEmpty: observed(() => protobuf.readDescriptorSet(new Uint8Array())),
    readAuthored: observed(() => protobuf.readDescriptorSet(fixture)),
    readUnknownWire: observed(() => protobuf.readDescriptorSet(unknownWire)),
    readMalformed: observed(() => protobuf.readDescriptorSet(malformed)),
    readOverLimit: observed(() => protobuf.readDescriptorSet(overLimit)),
    writeAuthored: observed(() => hex(protobuf.writeDescriptorSet(protobuf.readDescriptorSet(fixture)))),
    writeUnknownWire: observed(() => hex(protobuf.writeDescriptorSet(protobuf.readDescriptorSet(unknownWire)))),
    importAuthored: observed(() => protobuf.importProtobufDescriptorSet(fixture, { id: 'frozen-packet' })),
    exportAuthored: observed(() => hex(protobuf.exportProtobufDescriptorSet(doc))),
    getAuthored: observed(() => protobuf.getProtobufDescriptorSet(doc)),
    inspectAuthored: observed(() => protobuf.inspectProtobuf(doc)),
    bundleAuthored: observed(() => { const b=protobuf.exportProtobufBundle(doc); return {...b,descriptorSet:hex(b.descriptorSet)}; }),
    exportMalformedDocument: observed(() => protobuf.exportProtobufDescriptorSet({} as never)),
    inspectMalformedDocument: observed(() => protobuf.inspectProtobuf({} as never)),
    exportUnknownWire: observed(() => hex(protobuf.exportProtobufDescriptorSet(unknownDoc))),
    unknownWireTree: observed(() => protobuf.getProtobufDescriptorSet(unknownDoc)),
    writeInvalidUnknownWire: observed(() => protobuf.writeDescriptorSet({type:'google.protobuf.FileDescriptorSet',fields:{},unknown:[{number:50000,wireType:2,data:'00'}]})),
    writeUnknownRepresentation: observed(() => protobuf.writeDescriptorSet({type:'google.protobuf.FileDescriptorSet',fields:{},unknown:[],extra:true} as never)),
  },
  rawHostAdmission: {
    uint8: hostCase(new Uint8Array([0])),
    buffer: hostCase(Buffer.from([0])),
    offsetView: hostCase(new Uint8Array([0xaa, ...unknownWire, 0xbb]).subarray(1, 1 + unknownWire.length)),
    emptyDataView: hostCase(emptyDataView), nonemptyDataView: hostCase(nonemptyDataView),
    uint16: hostCase(new Uint16Array([10])), int16Zero: hostCase(new Int16Array([0])),
    float32Zero: hostCase(new Float32Array([0])), arrayLike: hostCase({length: 0}),
    null: hostCase(null),
  },
  copyAndMutation: (() => {
    const input = new Uint8Array(unknownWire);
    const read = protobuf.readDescriptorSet(input); input[0] = 0;
    const doc = protobuf.importProtobufDescriptorSet(unknownWire, {id:'copy'});
    const returned = protobuf.getProtobufDescriptorSet(doc);
    returned.unknown[0]!.data = '00';
    const first = protobuf.exportProtobufDescriptorSet(doc); first[0] = 0;
    return { readUnaffectedByInputMutation: read.unknown[0]?.data === '04000102ff',
      getReturnsCopy: protobuf.getProtobufDescriptorSet(doc).unknown[0]?.data === '04000102ff',
      exportReturnsCopy: hex(protobuf.exportProtobufDescriptorSet(doc)) === hex(unknownWire) };
  })(),
  errorOrdering: (() => {
    const options = {};
    Object.defineProperty(options, 'id', {enumerable:true, get(){ throw new Error('id getter observed'); }});
    return {
      oversizedBeforeIdGetter: observed(() => protobuf.importProtobufDescriptorSet(overLimit, options as never)),
      malformedBeforeDocumentValidation: observed(() => protobuf.importProtobufDescriptorSet(malformed, {id:'ordered'})),
      writeCopyBeforeGuard: observed(() => protobuf.writeDescriptorSet(null as never)),
    };
  })(),
};
const target = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-protobuf-descriptor-predecessor/predecessor.json');
writeFileSync(target, `${JSON.stringify(packet, null, 2)}\n`);
console.log(JSON.stringify({path:target, sha256:createHash('sha256').update(JSON.stringify(packet, null, 2)+'\n').digest('hex'), operationCount:packet.operations.length, vectorGroups:Object.keys(packet.vectors).length}));
