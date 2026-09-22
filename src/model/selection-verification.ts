import {copyJson} from './json';
import {type Json,UmfError} from './types';
import {selectCoreElements,type CoreElementSelection} from './selection';
import {Registry} from '../registry/registry';
import {createValidator} from '../validation/schema';
import core from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';
import legacy from '../../spec/core/element-selection.schema.json';import schema from '../../spec/core/field-selection.schema.json';
export {default as coreElementSelectionSchema} from '../../spec/core/element-selection.schema.json';
export {default as coreFieldSelectionSchema} from '../../spec/core/field-selection.schema.json';
const validator=createValidator();validator.addSchema(core);validator.addSchema(fields);const checkLegacy=validator.compile(legacy),checkFields=validator.compile(schema);
/** Verify report consistency with its retained source/query and the caller's registry, not source authenticity. */
export function verifyCoreElementSelection(input:CoreElementSelection,registry=new Registry()):CoreElementSelection {
 const receipt=copyJson(input) as unknown as CoreElementSelection,check=receipt?.source?.umf==='0.2.0'?checkFields:checkLegacy;
 if(!check(receipt))throw new UmfError('CORE_SELECTION_REPORT',JSON.stringify(check.errors));
 const expected=selectCoreElements(receipt.source,receipt.query,registry);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('CORE_SELECTION_REPORT','Selection differs from recomputed source, query, validation or reference boundary');
 return receipt;
}
