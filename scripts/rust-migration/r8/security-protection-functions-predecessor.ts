// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze current tagged and raw-host outcomes for the bounded pure reference functions.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateProtectionValue,inspectProtectionFunction} from '../../../src/extensions/security/protection/functions';
import {domainFixture,domainRef} from '../../../tests/security/protection/domain-fixture';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'docs/helix/04-build/evidence/rust-migration/r8-security-protection-functions/predecessor.json');
const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value));
const result=(op:'inspect'|'evaluate',f:any,selection:any)=>op==='inspect'?inspectProtectionFunction(f.policy,f.catalog,f.closure,selection):evaluateProtectionValue(f.policy,f.catalog,f.closure,selection);
const cases:any[]=[];
function add(id:string,op:'inspect'|'evaluate',f:any,selection:any,input:unknown,hostOnly=false,observation?:()=>unknown){
 let outcome:any;
 try{outcome={status:'returned',value:normalize(result(op,f,selection)),...(observation?{observation:observation()}: {})};}
 catch(error){const e=error as Error&{code?:string;path?:string};outcome={status:'threw',name:e.name,code:e.code??null,path:e.path??null,message:e.message,...(observation?{observation:observation()}: {})};}
 cases.push({id,op,input,...(hostOnly?{hostOnly:true}:{sources:{policy:normalize(f.policy),catalog:normalize(f.catalog),closure:normalize(f.closure),selection:normalize(selection)}}),outcome});
}
function fixture(operation:'mask/constant'|'mask/null-out'|'mask/regex-replace'|'mask/partial'|'mask/fixed-length-redact'|'generalize/prefix-only'='mask/constant'):any{
 const f:any=domainFixture(),transform=f.catalog.transforms[0];
 const [kind,fn]=operation.split('/');transform.kind=kind;transform.function=fn;transform.parameters=[];transform.disclosureProfile=[];
 const elements=f.closure.documents[0].document.modules[0].elements;
 elements[0].scalarType='integer';elements[1].scalarType='integer';elements[2].scalarType='integer';
 if(operation==='mask/constant')transform.parameters=[{name:'value',field:domainRef('parameter'),value:{integerToken:'17'}}];
 return f;
}

function stringRecipe(operation:'mask/partial'|'mask/fixed-length-redact'|'generalize/prefix-only',values:Record<string,unknown>,options:{nullable?:boolean}={}):any{
 const f=fixture(operation),transform=f.catalog.transforms[0],elements=f.closure.documents[0].document.modules[0].elements;
 elements.find((x:any)=>x.id==='input').scalarType='string';
 elements.find((x:any)=>x.id==='output').scalarType='string';
 if(options.nullable){elements.find((x:any)=>x.id==='input').nullability='absent-allowed';elements.find((x:any)=>x.id==='output').nullability='absent-allowed';}
 const args=Object.entries(values);
 transform.parameters=args.map(([name,value],i)=>{
  const id=`parameter-${name}`,field={id,kind:'field',scalarType:['prefix','suffix','length'].includes(name)?'integer':'string',cardinality:'one',nullability:'required',extensions:{}};
  elements.push(field);
  const ref=domainRef(id);
  return {name,field:ref,value};
 });
 return f;
}

const constant=fixture();
add('function.inspect-mask-constant','inspect',constant,{ruleIndex:0,disclosureIndex:0},{operation:'mask/constant'});
add('function.evaluate-mask-constant','evaluate',constant,{ruleIndex:0,disclosureIndex:0,value:{integerToken:'5'}},{operation:'mask/constant',input:{integerToken:'5'}});
const nullOut=fixture('mask/null-out');nullOut.closure.documents[0].document.modules[0].elements[1].nullability='absent-allowed';
add('function.inspect-mask-null-out','inspect',nullOut,{ruleIndex:0,disclosureIndex:0},{operation:'mask/null-out'});
add('function.evaluate-mask-null-out','evaluate',nullOut,{ruleIndex:0,disclosureIndex:0,value:{integerToken:'5'}},{operation:'mask/null-out',input:{integerToken:'5'}});
const unsupported=fixture('mask/regex-replace');
add('function.unsupported-regex-recipe','evaluate',unsupported,{ruleIndex:0,disclosureIndex:0,value:{integerToken:'5'}},{operation:'mask/regex-replace'});
const unsupportedDomainMismatch=fixture('mask/regex-replace');
unsupportedDomainMismatch.catalog.transforms[0].inputDomain=domainRef('other');
add('function.unsupported-recipe-after-domain-conflict','inspect',unsupportedDomainMismatch,{ruleIndex:0,disclosureIndex:0},{operation:'mask/regex-replace',inputDomainMismatch:true});
const itemTypeField=fixture();itemTypeField.closure.documents[0].document.modules[0].elements[0].itemType='string';
add('function.itemType-field-refused','inspect',itemTypeField,{ruleIndex:0,disclosureIndex:0},{inputFieldHasItemType:true});
const malformedParameter=fixture();malformedParameter.catalog.transforms[0].parameters[0].value={integerToken:'01'};
add('function.parameter-refusal-before-result','inspect',malformedParameter,{ruleIndex:0,disclosureIndex:0},{operation:'mask/constant',invalidParameter:'01'});
const unknown=fixture();unknown.catalog.transforms[0].futureRecipe={opaque:'kept'};
add('function.unknown-catalog-retained-and-refused','evaluate',unknown,{ruleIndex:0,disclosureIndex:0,value:{integerToken:'5'}},{operation:'mask/constant',unknownMember:'/transforms/0/futureRecipe'});
const bothInvalid=fixture();bothInvalid.policy.version='future';bothInvalid.catalog.version='future';
add('function.policy-and-catalog-refusal-order','inspect',bothInvalid,{ruleIndex:-1,disclosureIndex:0},{policyVersion:'future',catalogVersion:'future',invalidRuleIndex:-1});
const badSelection=fixture();badSelection.catalog.transforms[0].futureRecipe={opaque:'kept'};
add('function.source-refusal-with-invalid-selection','evaluate',badSelection,{ruleIndex:-1,disclosureIndex:0,value:{integerToken:'5'}},{unknownMember:'/transforms/0/futureRecipe',invalidRuleIndex:-1});
const largeInput=fixture('mask/null-out');largeInput.closure.documents[0].document.modules[0].elements[0].scalarType='string';largeInput.closure.documents[0].document.modules[0].elements[1].nullability='absent-allowed';
add('function.input-literal-resource-bound','evaluate',largeInput,{ruleIndex:0,disclosureIndex:0,value:{string:'x'.repeat(4097)}},{inputUtf16Units:4097});
let policyGetterCalls=0;const rawPolicy=fixture();const policyHost:any={...rawPolicy.policy};Object.defineProperty(policyHost,'version',{enumerable:true,get(){policyGetterCalls++;return '0.2.0';}});
add('function.raw-policy-accessor-not-invoked','inspect',{...rawPolicy,policy:policyHost},{ruleIndex:0,disclosureIndex:0},{hostShape:'policy.version accessor'},true,()=>({getterCalls:policyGetterCalls}));
let selectionGetterCalls=0;const rawSelection:any={ruleIndex:0};Object.defineProperty(rawSelection,'disclosureIndex',{enumerable:true,get(){selectionGetterCalls++;return 0;}});
add('function.raw-selection-accessor-not-invoked','inspect',fixture(),rawSelection,{hostShape:'selection.disclosureIndex accessor'},true,()=>({getterCalls:selectionGetterCalls}));

const partial=stringRecipe('mask/partial',{prefix:{integerToken:'1'},suffix:{integerToken:'1'},padding:{string:'🔒'},unit:{string:'unicode-scalar'}});
add('function.partial-unicode-scalar','evaluate',partial,{ruleIndex:0,disclosureIndex:0,value:{string:'A😀BC'}},{operation:'mask/partial',input:'A😀BC',expected:'A🔒C'});
const partialOverlap=stringRecipe('mask/partial',{prefix:{integerToken:'4'},suffix:{integerToken:'4'},padding:{string:'*'},unit:{string:'unicode-scalar'}});
add('function.partial-overlap-no-middle','evaluate',partialOverlap,{ruleIndex:0,disclosureIndex:0,value:{string:'xy'}},{operation:'mask/partial',overlap:true});
const redact=stringRecipe('mask/fixed-length-redact',{length:{integerToken:'3'},padding:{string:'🧱'},unit:{string:'unicode-scalar'}});
add('function.fixed-redact-scalar-padding','evaluate',redact,{ruleIndex:0,disclosureIndex:0,value:{string:'source'}},{operation:'mask/fixed-length-redact',expected:'🧱🧱🧱'});
const prefix=stringRecipe('generalize/prefix-only',{length:{integerToken:'2'},unit:{string:'unicode-scalar'}});
add('function.prefix-unicode-scalar','evaluate',prefix,{ruleIndex:0,disclosureIndex:0,value:{string:'😀éx'}},{operation:'generalize/prefix-only',expected:'😀é'});
const zero=stringRecipe('mask/fixed-length-redact',{length:{integerToken:'0'},padding:{string:'*'},unit:{string:'unicode-scalar'}});
add('function.fixed-redact-zero','evaluate',zero,{ruleIndex:0,disclosureIndex:0,value:{string:'ignored'}},{count:0});
const limit=stringRecipe('generalize/prefix-only',{length:{integerToken:'4096'},unit:{string:'unicode-scalar'}});
add('function.prefix-count-upper-bound','inspect',limit,{ruleIndex:0,disclosureIndex:0},{count:4096});
const tooMany=stringRecipe('generalize/prefix-only',{length:{integerToken:'4097'},unit:{string:'unicode-scalar'}});
add('function.prefix-count-over-bound-before-input','evaluate',tooMany,{ruleIndex:0,disclosureIndex:0,value:{string:'bad'}},{count:4097,refusalOrder:'parameter-before-input'});
const nullString=stringRecipe('generalize/prefix-only',{length:{integerToken:'2'},unit:{string:'unicode-scalar'}},{nullable:true});
add('function.prefix-null-propagates','evaluate',nullString,{ruleIndex:0,disclosureIndex:0,value:null},{nullInput:true});
const requiredNull=stringRecipe('generalize/prefix-only',{length:{integerToken:'2'},unit:{string:'unicode-scalar'}});
add('function.prefix-required-null-refused','evaluate',requiredNull,{ruleIndex:0,disclosureIndex:0,value:null},{nullInput:true});
const invalidPad=stringRecipe('mask/partial',{prefix:{integerToken:'0'},suffix:{integerToken:'0'},padding:{string:'ab'},unit:{string:'unicode-scalar'}});
add('function.partial-invalid-padding-before-invalid-input','evaluate',invalidPad,{ruleIndex:0,disclosureIndex:0,value:{string:'invalid input literal'}},{invalidPadding:true,invalidInputDomain:true});
const outputTooLarge=stringRecipe('mask/fixed-length-redact',{length:{integerToken:'4096'},padding:{string:'😀'},unit:{string:'unicode-scalar'}});
add('function.fixed-redact-utf16-output-bound','evaluate',outputTooLarge,{ruleIndex:0,disclosureIndex:0,value:{string:''}},{count:4096,paddingUtf16Units:2,expectedBoundRefusal:true});
const isolatedPadding=stringRecipe('mask/fixed-length-redact',{length:{integerToken:'1'},padding:{string:'\ud800'},unit:{string:'unicode-scalar'}});
add('function.fixed-redact-isolated-surrogate-padding','inspect',isolatedPadding,{ruleIndex:0,disclosureIndex:0},{padding:'isolated-high-surrogate'});
const isolatedInput=stringRecipe('generalize/prefix-only',{length:{integerToken:'1'},unit:{string:'unicode-scalar'}});
add('function.prefix-isolated-surrogate-input','evaluate',isolatedInput,{ruleIndex:0,disclosureIndex:0,value:{string:'\ud800'}},{input:'isolated-high-surrogate'});
const wrongParameterFamily=stringRecipe('mask/partial',{prefix:{string:'1'},suffix:{integerToken:'0'},padding:{string:'*'},unit:{string:'unicode-scalar'}});
wrongParameterFamily.closure.documents[0].document.modules[0].elements.find((x:any)=>x.id==='parameter-prefix').scalarType='string';
add('function.partial-wrong-parameter-family','inspect',wrongParameterFamily,{ruleIndex:0,disclosureIndex:0},{parameter:'prefix',family:'string'});
const missingParameterField=stringRecipe('mask/partial',{prefix:{integerToken:'1'},suffix:{integerToken:'0'},padding:{string:'*'},unit:{string:'unicode-scalar'}});
missingParameterField.catalog.transforms[0].parameters[0].field=domainRef('absent-parameter');
add('function.partial-missing-qualified-parameter-field','inspect',missingParameterField,{ruleIndex:0,disclosureIndex:0},{parameter:'prefix',field:'absent-parameter'});

const packet={cases};
const serialized=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==serialized)throw new Error('Frozen security protection functions predecessor changed; review before refresh');}
else{await mkdir(dirname(output),{recursive:true});await writeFile(output,serialized);}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',output,caseCount:cases.length,packetSha256:createHash('sha256').update(serialized).digest('hex')}));
