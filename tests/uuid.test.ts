// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import * as u from '../src/index';
import oracle from '../fixtures/validation/uuid/bit128-oracle.json';
test('UUID identity preserves every layout and original spelling without generation claims',()=>{
 for(const row of oracle.cases){const uuid=u.parseUuid(row.uuid.toUpperCase());expect(uuid.originalText).toBe(row.uuid.toUpperCase());expect(uuid.canonicalText).toBe(row.uuid);expect(u.uuidToBits128(uuid).hex).toBe(row.hex);expect(u.uuidFromBits128(u.parseBits128(row.hex)).canonicalText).toBe(row.uuid);}
});
test('no implicit syntax, truncation, rewriting or forged UUID snapshot',()=>{
 const text='00112233-4455-6677-8899-aabbccddeeff';
 for(const s of [text+'\n',' '+text,'{'+text+'}',text.replaceAll('-',''),'urn:uuid:'+text,text+'suffix'])expect(()=>u.parseUuid(s)).toThrow();
 expect(()=>u.uuidToBits128({...u.parseUuid(text),canonicalText:text.toUpperCase()})).toThrow();
 expect(()=>u.uuidToBits128({...u.parseUuid(text),profile:'other'} as any)).toThrow();
});
