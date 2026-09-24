import keys from '../../spec/core/key-document.schema.json';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import nullability from '../../spec/core/nullability-document.schema.json';
import cardinality from '../../spec/core/cardinality-document.schema.json';
import facets from '../../spec/core/facet-document.schema.json';
import manifest from '../../spec/core/extension-package.schema.json';
// JSON equality must not inspect prototypes or invoke valueOf/toString. Checked
// values deliberately use null-prototype dictionaries, including reference arrays.
function canonical(value: unknown): string {
 if(Array.isArray(value))return 'a['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return 'o{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
export function createValidator(strict=true) {
 const validator=new Ajv2020({allErrors:true,strict,allowUnionTypes:true,ownProperties:true,validateFormats:false});
 installJsonEquality(validator);
 return validator;
}
export function installJsonEquality(validator:Pick<Ajv2020,'removeKeyword'|'addKeyword'>) {
 validator.removeKeyword('uniqueItems').addKeyword({keyword:'uniqueItems',type:'array',schemaType:'boolean',errors:false,validate:(unique:boolean,data:unknown[])=>!unique||new Set(data.map(canonical)).size===data.length});
 validator.removeKeyword('const').addKeyword({keyword:'const',errors:false,validate:(expected:unknown,data:unknown)=>canonical(expected)===canonical(data)});
 validator.removeKeyword('enum').addKeyword({keyword:'enum',schemaType:'array',errors:false,validate:(expected:unknown[],data:unknown)=>expected.some(value=>canonical(value)===canonical(data))});
}
const ajv = createValidator();
export const checkCore = ajv.compile(core);
export const checkCoreFields = ajv.compile(fields);
export const checkCoreNullability = ajv.compile(nullability);
export const checkCoreCardinality = ajv.compile(cardinality);
export const checkCoreFacets = ajv.compile(facets);
export const checkPackage = ajv.compile(manifest);

export const checkCoreKeys = ajv.compile(keys);
