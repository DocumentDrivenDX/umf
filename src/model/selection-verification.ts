import relationships from '../../spec/core/relationship-document.schema.json';import relationshipSelection from '../../spec/core/relationship-selection.schema.json';
export {default as coreRelationshipSelectionSchema} from '../../spec/core/relationship-selection.schema.json';
import keys from '../../spec/core/key-document.schema.json';import keySelection from '../../spec/core/key-selection.schema.json';
export {default as coreKeySelectionSchema} from '../../spec/core/key-selection.schema.json';
import {copyJson} from './json';
import {type Json,UmfError} from './types';
import {selectCoreElements,type CoreElementSelection} from './selection';
import {Registry} from '../registry/registry';
import {createValidator} from '../validation/schema';
import core from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';
import legacy from '../../spec/core/element-selection.schema.json';import schema from '../../spec/core/field-selection.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';import availabilitySelection from '../../spec/core/nullability-selection.schema.json';
import containers from '../../spec/core/cardinality-document.schema.json';import containerSelection from '../../spec/core/cardinality-selection.schema.json';
import facets from '../../spec/core/facet-document.schema.json';import facetSelection from '../../spec/core/facet-selection.schema.json';
export {default as coreFacetSelectionSchema} from '../../spec/core/facet-selection.schema.json';
export {default as coreCardinalitySelectionSchema} from '../../spec/core/cardinality-selection.schema.json';
export {default as coreElementSelectionSchema} from '../../spec/core/element-selection.schema.json';
export {default as coreFieldSelectionSchema} from '../../spec/core/field-selection.schema.json';
export {default as coreNullabilitySelectionSchema} from '../../spec/core/nullability-selection.schema.json';
const validator=createValidator();validator.addSchema(core);validator.addSchema(fields);validator.addSchema(availability);validator.addSchema(containers);validator.addSchema(facets);validator.addSchema(keys);validator.addSchema(relationships);const checkLegacy=validator.compile(legacy),checkFields=validator.compile(schema),checkAvailability=validator.compile(availabilitySelection),checkContainers=validator.compile(containerSelection),checkFacets=validator.compile(facetSelection),checkKeys=validator.compile(keySelection),checkRelationships=validator.compile(relationshipSelection);
/** Verify report consistency with its retained source/query and the caller's registry, not source authenticity. */
export function verifyCoreElementSelection(input:CoreElementSelection,registry=new Registry()):CoreElementSelection {
 const receipt=copyJson(input) as unknown as CoreElementSelection,check=receipt?.source?.umf==='0.7.0'?checkRelationships:receipt?.source?.umf==='0.6.0'?checkKeys:receipt?.source?.umf==='0.5.0'?checkFacets:receipt?.source?.umf==='0.4.0'?checkContainers:receipt?.source?.umf==='0.3.0'?checkAvailability:receipt?.source?.umf==='0.2.0'?checkFields:checkLegacy;
 if(!check(receipt))throw new UmfError('CORE_SELECTION_REPORT',JSON.stringify(check.errors));
 const expected=selectCoreElements(receipt.source,receipt.query,registry);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('CORE_SELECTION_REPORT','Selection differs from recomputed source, query, validation or reference boundary');
 return receipt;
}
