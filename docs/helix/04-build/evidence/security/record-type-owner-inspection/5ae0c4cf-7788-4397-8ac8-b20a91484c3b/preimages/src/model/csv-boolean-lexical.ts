import {copyJson} from './json';
import {boundedJsonBytes} from './internal/json-byte-budget';
import {type Document,type Json,type Validation,UmfError} from './types';
import {canonicalSchemaJson} from './schema-literals';
import {inspectCoreSchemaProperties,validateCoreFieldValue} from './schema-properties';
import {createValidator} from '../validation/schema';
import {snapshotSchema} from '../validation/internal-schema';
import coreSchema from '../../spec/core/schema-properties-document.schema.json';
import operationSchema from '../../spec/core/csv-boolean-lexical-operation.schema.json';

export {operationSchema as csvBooleanLexicalOperationSchema};
export interface CsvBooleanLexicalRequest {
 profile:'umf.csv-boolean-lexical/1.0.0';field:{module:string;element:string};
 token:'true'|'false'|'True'|'False';sourceContext:Json;
}
export interface CsvBooleanLexicalReceipt {
 operation:'validate-csv-boolean-lexical';version:'1.0.0';source:Document;
 request:CsvBooleanLexicalRequest;value:{boolean:boolean};validation:Validation;provenance:'unverified';
}
const schema=snapshotSchema(operationSchema),validator=createValidator();
validator.addSchema(snapshotSchema(coreSchema));validator.addSchema(schema);
const checkReceipt=validator.getSchema(schema.$id)!;
const checkRequest=validator.compile({$ref:schema.$id+'#/$defs/request'});
const fail=(message:string):never=>{throw new UmfError('CSV_BOOLEAN_LEXICAL',message);};
const budget=(value:unknown):void=>{boundedJsonBytes(value as Json);};
/** Explicit source-token conversion only; public Core Field validation owns validity. */
export function validateCsvBooleanLexical(sourceInput:Document,requestInput:CsvBooleanLexicalRequest):CsvBooleanLexicalReceipt {
 const source=copyJson(sourceInput) as unknown as Document;
 const request=copyJson(requestInput) as unknown as CsvBooleanLexicalRequest;
 budget({source,request});
 if(!checkRequest(request))fail('Expected explicit closed Boolean lexical profile request');
 inspectCoreSchemaProperties(source,{scope:'element',...request.field});
 const field=source.modules.find(m=>m.id===request.field.module)!.elements.find(e=>e.id===request.field.element)!;
 if(field.kind!=='field'||field.scalarType!=='boolean'||field.cardinality==='array'||field.cardinality==='map')fail('Authored core Boolean Field required');
 const value={boolean:request.token==='true'||request.token==='True'};
 const validation=validateCoreFieldValue(source,request.field,value);
 const receipt=copyJson({operation:'validate-csv-boolean-lexical',version:'1.0.0',source,request,value,validation,provenance:'unverified'}) as unknown as CsvBooleanLexicalReceipt;
 budget(receipt);
 if(!checkReceipt(receipt))fail('Boolean lexical receipt violates versioned schema');
 return receipt;
}
/** Independently expected original source/request are mandatory, never receipt-derived. */
export function verifyCsvBooleanLexical(receiptInput:CsvBooleanLexicalReceipt,sourceInput:Document,requestInput:CsvBooleanLexicalRequest):CsvBooleanLexicalReceipt {
 const receipt=copyJson(receiptInput) as unknown as CsvBooleanLexicalReceipt;
 budget(receipt);
 if(!checkReceipt(receipt))fail('Malformed Boolean lexical receipt');
 const expected=validateCsvBooleanLexical(sourceInput,requestInput);
 if(canonicalSchemaJson(receipt)!==canonicalSchemaJson(expected))fail('Stale or forged Boolean lexical receipt');
 return expected;
}
