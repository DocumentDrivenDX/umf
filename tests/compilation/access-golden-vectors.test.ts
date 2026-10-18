import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
import {describe, expect, test} from 'bun:test';
import corpus from '../../fixtures/access/golden-vectors/core-carriers.json';
import {validateCoreFieldValue} from '../../src/model/schema-properties';
import {validateCoreRecordValues} from '../../src/model/record-values';
import {validateDocument} from '../../src/validation/document';
import type {Document} from '../../src/model/types';
import type {CoreLiteral} from '../../src/model/schema-literals';

// @covers US-081-AC2 -- core oracle only; generated Python agreement is separate.
describe('core 0.8 golden oracle: field and record APIs', () => {
  for (const vector of corpus.vectors) test(vector.id, () => {
    const source = {
      umf:CURRENT_CORE_VERSION, id:'access-golden', vocabularies:{},
      modules:[{id:'golden', namespace:'golden', elements:[vector.field, ...('extraFields' in vector ? vector.extraFields : []),
        {id:'row',kind:'record',members:[{module:'golden',element:'value'}],extensions:{}}]}],
    } as unknown as Document;
    expect(validateDocument(source).valid).toBe(true);
    const field = {module:'golden',element:'value'};
    const literal = vector.literal as CoreLiteral;
    const fieldVerdict = validateCoreFieldValue(source,field,literal);
    const recordVerdict = validateCoreRecordValues(source,{module:'golden',element:'row'},
      [{field,state:'present',value:literal}]);
    expect(fieldVerdict.valid).toBe(vector.expected);
    expect(recordVerdict.validation.valid).toBe(vector.expected);
  });
});
