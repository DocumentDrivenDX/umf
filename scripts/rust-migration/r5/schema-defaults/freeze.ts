import {resolveCoreDefault} from '../../../../src/model/schema-properties';
import {schemaPropertiesFixture} from '../../../core-schema-properties-cases';

const source = schemaPropertiesFixture();
const oldVersion: any = structuredClone(source); oldVersion.umf = '0.7.0';
const invalidSource = structuredClone(source); invalidSource.id = '';
const cases = [
  ['quantity-missing', 'quantity', {state:'missing'}],
  ['quantity-present-null-invalid', 'quantity', {state:'present',value:null}],
  ['quantity-present-token', 'quantity', {state:'present',value:{integerToken:'2'}}],
  ['label-missing-no-default', 'label', {state:'missing'}],
  ['label-present-null-default', 'label', {state:'present',value:null}],
  ['price-present-null-default', 'price', {state:'present',value:null}],
  ['state-unknown-qualifier', 'quantity', {state:'missing',future:'keep-me'} as any],
  ['identity-unknown-qualifier', 'quantity', {state:'missing'}, {module:'m',element:'quantity',future:'keep-me'} as any],
  ['state-error-precedes-identity-error', 'quantity', {state:'missing',future:'keep-me'} as any, {module:'m',element:'quantity',future:'keep-me'} as any],
  ['state-null', 'quantity', null as any],
  ['state-array', 'quantity', [] as any],
  ['state-missing-tag', 'quantity', {} as any],
  ['state-present-without-value', 'quantity', {state:'present'} as any],
  ['state-missing-with-value', 'quantity', {state:'missing',value:null} as any],
  ['state-unknown-tag-with-value', 'quantity', {state:'bogus',value:null} as any],
  ['identity-null', 'quantity', {state:'missing'}, null as any],
  ['identity-missing-element', 'quantity', {state:'missing'}, {module:'m'} as any],
  ['identity-empty-module', 'quantity', {state:'missing'}, {module:'',element:'quantity'} as any],
  ['source-wrong-version', 'quantity', {state:'missing'}, undefined, oldVersion],
  ['source-wrong-version-before-invalid-identity', 'quantity', {state:'missing'}, {module:'',element:'quantity'} as any, oldVersion],
  ['source-wrong-version-before-incomplete-identity', 'quantity', {state:'missing'}, {module:'m'} as any, oldVersion],
  ['identity-element-checked-after-module-lookup', 'quantity', {state:'missing'}, {module:'absent',element:''} as any],
  ['source-invalid-envelope', 'quantity', {state:'missing'}, undefined, invalidSource],
] as const;
const outcomes = cases.map(([id, element, state, fieldInput, sourceInput]) => {
  const identity = fieldInput === undefined ? {module:'m',element} : fieldInput;
  const operationSource = sourceInput ?? source;
  try {
    const result = resolveCoreDefault(operationSource, identity as any, state as any);
    return {id,identity,input:state,source:sourceInput,result};
  } catch (error) {
    return {id,identity,input:state,source:sourceInput,error:{name:(error as Error).name,message:(error as Error).message,
      code:(error as any).code,path:(error as any).path}};
  }
});
const unknownDefault = structuredClone(source);
unknownDefault.modules[0]!.elements[0]!.default!.future = 'keep-me';
try {
  outcomes.push({id:'default-unknown-qualifier',source:unknownDefault,identity:{module:'m',element:'quantity'},input:{state:'missing'},result:resolveCoreDefault(unknownDefault,{module:'m',element:'quantity'},{state:'missing'})} as any);
} catch (error) {
  outcomes.push({id:'default-unknown-qualifier',source:unknownDefault,identity:{module:'m',element:'quantity'},input:{state:'missing'},error:{name:(error as Error).name,message:(error as Error).message,code:(error as any).code,path:(error as any).path}} as any);
}
console.log(JSON.stringify({runtime:Bun.version,source,outcomes}, null, 2));
