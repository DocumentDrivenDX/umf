import {semanticTypesCases} from './core-semantic-types-cases';
import {validateDocument} from '../src/validation/document';
import {checkSemanticTypesDocument} from '../src/validation/semantic-types';
const cases=semanticTypesCases().map(row=>({...row,structureValid:!!checkSemanticTypesDocument(row.document),validation:validateDocument(row.document)}));
for(const row of cases)if(row.valid!==row.validation.valid)throw new Error('Wrong authored case '+row.id);
await Bun.write('fixtures/validation/core-semantic-types-oracle-inputs.json',JSON.stringify({scope:'0.9.0 core reference shape; inherited semantic checks recorded separately; no external domain validator parity',cases},null,2)+'\n');
