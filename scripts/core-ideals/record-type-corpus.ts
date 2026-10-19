// SPDX-License-Identifier: MIT OR Apache-2.0
import {recordTypeCases} from './record-type-cases';import {declareCoreRecordType} from '../../src/model/record-type';
const rows=recordTypeCases().map(c=>({...c,result:declareCoreRecordType(c.fieldAuthor,c.recordAuthor)}));await Bun.write('fixtures/validation/record-type-corpus.json',JSON.stringify({rows},null,2)+'\n');
