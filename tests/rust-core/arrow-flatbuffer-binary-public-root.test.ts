// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {decodeArrowFlatbuffer,encodeArrowFlatbuffer,exportArrowFlatbufferModel,exportArrowIpcCapture} from '../../src/index-node-v4';
import {flatbufferBackend} from '../../native/arrow/flatbuffer-runtime';

test('Rust Arrow FlatBuffer byte routes decode and re-encode a public schema while retaining uninterpreted bytes',()=>{
 const path='fixtures/arrow/metadata/int64.stream.arrow.0.bin';
 const bytes=new Uint8Array(readFileSync(path));
 const decoded=decodeArrowFlatbuffer(bytes,{id:'flatbuffer-public',rootType:'Message'});
 expect(decoded.status).toBe('decoded');expect(decoded.complete).toBe(false);expect(exportArrowIpcCapture(decoded.source)).toEqual(bytes);
 const encoded=encodeArrowFlatbuffer(decoded.model!,flatbufferBackend);
 const roundTrip=decodeArrowFlatbuffer(encoded,{id:'flatbuffer-round-trip',rootType:'Message'});
 expect(roundTrip.status).toBe('decoded');expect(JSON.parse(exportArrowFlatbufferModel(roundTrip.model!))).toEqual(JSON.parse(exportArrowFlatbufferModel(decoded.model!)));
 const invalid=decodeArrowFlatbuffer(new Uint8Array(),{id:'flatbuffer-invalid',rootType:'Message'});
 expect(invalid.status).toBe('uninterpreted');expect(invalid.model).toBeUndefined();expect(exportArrowIpcCapture(invalid.source)).toEqual(new Uint8Array());
});
