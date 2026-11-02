// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {copyJson,readJsonValue,writeJsonValue,readProtectionSource,writeProtectionSource,assertExactJsonNumber,composeSecurityRules,securityRefIdentity,UmfError} from '../../src/index-node-v4';
test('public JSON and Security utilities use existing native owners',()=>{
 const value={opaque:{future:['kept',true]}};
 expect(copyJson(value)).toEqual(value);expect(copyJson(value)).not.toBe(value);
 expect(readJsonValue(writeJsonValue(value))).toEqual(value);
 expect(readProtectionSource(writeProtectionSource(value))).toEqual(value);
 expect(assertExactJsonNumber('0.125')).toBeUndefined();
 expect(()=>assertExactJsonNumber('9007199254740993')).toThrow(UmfError);
 expect(composeSecurityRules([{effect:'permit',truth:'T'}]).decision).toBe('permit');
 expect(securityRefIdentity({documentId:'doc',moduleId:'m',elementId:'field'})).toBe('["doc","m","field"]');
 expect(()=>copyJson({bad:NaN})).toThrow();
});
