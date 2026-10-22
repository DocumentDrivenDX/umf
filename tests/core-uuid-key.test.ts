// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import * as u from '../src/index';
import oracle from '../fixtures/validation/uuid/bit128-oracle.json';
import {uuidDocument,UUID,HEX,KEY} from './helpers/uuid-fixtures';
test('versioned tuples match independent oracle and reject old codec, stale or forged framing',()=>{
 const d=uuidDocument();
 for(const row of oracle.cases){const result=u.encodeCoreKeyTuple(d,KEY,[{uuid:row.uuid}],{profile:'umf-key-tuple-v2'});expect(result.bytesHex).toBe(row.uuidKey);}
 const r=u.encodeCoreKeyTuple(d,KEY,[{uuid:UUID.toUpperCase()}],{profile:'umf-key-tuple-v2'});
 expect(u.verifyCoreKeyTuple(r,d)).toEqual(r);expect(u.readCoreKeyTupleBytes(r,d).length).toBe(24);
 expect(()=>u.encodeCoreKeyTuple(d,KEY,[{uuid:UUID}])).toThrow();expect(()=>u.encodeCoreKeyTuple(d,KEY,[{uuid:UUID}],{profile:'umf-key-tuple-v1'})).toThrow();
 expect(()=>u.verifyCoreKeyTuple({...r,bytesHex:r.bytesHex.slice(0,-2)},d)).toThrow();expect(()=>u.verifyCoreKeyTuple({...r,profile:'umf-key-tuple-v1'},d)).toThrow();
 const changed=structuredClone(d);changed.id='other';expect(()=>u.verifyCoreKeyTuple(r,changed)).toThrow();
 const b=u.encodeCoreKeyTuple(uuidDocument('bits128'),KEY,[{bits128Hex:HEX}],{profile:'umf-key-tuple-v2'});expect(b.bytesHex).toBe(r.bytesHex.replace('010710','010610'));
});
