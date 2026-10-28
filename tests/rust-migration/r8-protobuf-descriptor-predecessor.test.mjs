import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { UmfError } from '../../src/model/types.ts';
import * as protobuf from '../../src/adapters/protobuf/index.ts';

const packetPath = new URL('../../docs/helix/04-build/evidence/rust-migration/r8-protobuf-descriptor-predecessor/predecessor.json', import.meta.url);
const packetBytes = readFileSync(packetPath);
const packet = JSON.parse(packetBytes.toString('utf8'));
const fixture = new Uint8Array(readFileSync(new URL('../../fixtures/protobuf/authored.pb', import.meta.url)));
const unknown = new Uint8Array([0x82, 0xb5, 0x18, 0x04, 0x00, 0x01, 0x02, 0xff]);

test('frozen packet is intact and covers exactly the seven assigned pure operations', () => {
  expect(createHash('sha256').update(packetBytes).digest('hex')).toBe('226eb9fb46781b45e82789e5efaf80a2d22c298c5fa0893a81d7a91cd5852f41');
  expect(packet.operations).toEqual(['readDescriptorSet','writeDescriptorSet','importProtobufDescriptorSet','exportProtobufDescriptorSet','getProtobufDescriptorSet','inspectProtobuf','exportProtobufBundle']);
  expect(packet.bytes.authoredSha256).toBe(createHash('sha256').update(fixture).digest('hex'));
  expect(packet.bytes.unknownWire).toBe('82b51804000102ff');
  expect(packet.copyAndMutation).toEqual({readUnaffectedByInputMutation:true,getReturnsCopy:true,exportReturnsCopy:true});
});

test('predecessor preserves unknown wire bytes and owns returned copies', () => {
  const document = protobuf.importProtobufDescriptorSet(unknown, {id:'packet'});
  expect(protobuf.getProtobufDescriptorSet(document).unknown).toEqual([{number:50000,wireType:2,data:'04000102ff'}]);
  const tree = protobuf.getProtobufDescriptorSet(document);
  tree.unknown[0].data = '00';
  expect([...protobuf.exportProtobufDescriptorSet(document)]).toEqual([...unknown]);
  const bytes = protobuf.exportProtobufDescriptorSet(document);
  bytes[0] = 0;
  expect([...protobuf.exportProtobufDescriptorSet(document)]).toEqual([...unknown]);
});

test('raw host admission and failure order are pinned as predecessor behavior', () => {
  expect(packet.rawHostAdmission.emptyDataView.status).toBe('ok');
  for (const key of ['nonemptyDataView','uint16','int16Zero','float32Zero','arrayLike']) {
    const value = packet.rawHostAdmission[key];
    expect(value.status).toBe('error');
    expect(value.name).toBe('UmfError');
    expect(value.publicUmfError).toBe(true);
  }
  expect(packet.rawHostAdmission.nonemptyDataView.code).toBe('PROTOBUF_BINARY');
  const malformed = new Uint8Array(11).fill(0x80);
  expect(() => protobuf.readDescriptorSet(malformed)).toThrow(UmfError);
  expect(packet.vectors.readMalformed.name).toBe('UmfError');
  expect(packet.vectors.readMalformed.code).toBe('PROTOBUF_BINARY');
  expect(packet.errorOrdering.oversizedBeforeIdGetter.message).toBe('id getter observed');
  expect(packet.errorOrdering.writeCopyBeforeGuard.name).toBe('UmfError');
});

test('operation vectors retain current predecessor diagnostics and results', () => {
  const authored = protobuf.importProtobufDescriptorSet(fixture, {id:'frozen-packet'});
  expect(protobuf.readDescriptorSet(fixture)).toEqual(packet.vectors.readAuthored.value);
  expect(protobuf.inspectProtobuf(authored)).toEqual(packet.vectors.inspectAuthored.value);
  expect([...protobuf.exportProtobufDescriptorSet(authored)].map(x=>x.toString(16).padStart(2,'0')).join('')).toBe(packet.vectors.exportAuthored.value);
  expect(packet.vectors.readOverLimit).toMatchObject({status:'error',name:'UmfError',code:'LIMIT',publicUmfError:true});
});
