/** Pure reference functions over pinned domains; never an authorization decision. */
import {copyJson} from '../../../model/json';
import {canonicalSchemaJson,type CoreLiteral} from '../../../model/schema-literals';
import {SCALAR_TYPES,UmfError,type Json,type Diagnostic,type Element} from '../../../model/types';
import {GREGORIAN_DATE_PROFILE,parseGregorianDate,truncateGregorianDate} from '../../../adapters/gregorian-date';
import {checkProtectionParametersWithinBudget,protectionFieldIndex,type ProtectionParameterValidation} from './parameters';
import {ProtectionLiteralBudget} from './literals';
import type {ProtectionFieldLocation} from './core-fields';

type FunctionStatus='reference-ready'|'transformed'|'refused';
export interface ProtectionFunctionResult extends Omit<ProtectionParameterValidation,'status'|'validated'> {
 status:FunctionStatus;selection:Json;input:Json;value:Json;
 inputDomain:Json;outputDomain:Json;valueProfile:string|null;
}
const signatures:Record<string,readonly string[]>={
 'mask/constant':['value'],'mask/null-out':[],
 'mask/partial':['prefix','suffix','padding','unit'],
 'mask/fixed-length-redact':['length','padding','unit'],
 'generalize/prefix-only':['length','unit'],
 'generalize/range-bucket':['width','origin'],
 'generalize/truncate-date':['calendar','unit'],
};
function freeze<T>(value:T):T {
 if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
}
function fail(message:string):never{throw new UmfError('PROTECTION_FUNCTION',message);}
function scalar(field:Element):void {
 if(field.kind!=='field'||field.cardinality!=='one'||!SCALAR_TYPES.includes(field.scalarType as any)
  ||!['required','absent-allowed'].includes(field.nullability as string)
  ||field.itemType!==undefined||(field.references as unknown[]|undefined)?.length)fail('Explicit scalar-one Field with known value/nullability semantics required');
 if(field.scalarType==='decimal'){const facets=field.facets as any;if(!Number.isSafeInteger(facets?.precision)||!Number.isSafeInteger(facets?.scale)||facets.precision<1||facets.scale<0||facets.scale>facets.precision)fail('Decimal value domain requires explicit precision/scale');}
}
function dateField(field:Element):void {
 scalar(field);
 if(field.scalarType!=='date'||Object.keys((field.facets??{}) as object).length
  ||Object.hasOwn(field,'allowedValues')||Object.hasOwn(field,'default'))fail('Exact Gregorian date profile Field required; no refinements/defaults');
}
function boundedLiteral(value:Json,budget:ProtectionLiteralBudget):void {
 // Check text before canonical encoding. The preceding core snapshot retains
 // its independent structural limits; this is not a total heap/CPU theorem.
 let text=0;const pending=[value];
 while(pending.length){const v=pending.pop()!;budget.step();if(typeof v==='string')text+=v.length;
  else if(v!==null&&typeof v==='object')for(const [key,child] of Object.entries(v)){text+=key.length;pending.push(child);}
  if(text>4096)throw new UmfError('PROTECTION_FUNCTION_BOUND','resource-exhausted: literal text exceeds4096 units');
 }
 if(canonicalSchemaJson(value).length>4096)throw new UmfError('PROTECTION_FUNCTION_BOUND','resource-exhausted: canonical literal exceeds4096 UTF-16 units');
}
function checkedValue(location:ProtectionFieldLocation,value:Json,budget:ProtectionLiteralBudget,date=false):void {
 boundedLiteral(value,budget);
 if(!date){budget.check(location.doc,location.field,value as CoreLiteral);return;}
 // Separate explicit operation profile, never catch-and-ignore a core failure.
 dateField(location.field);
 if(value===null){if(location.field.nullability!=='absent-allowed')fail('Null is outside required Gregorian date domain');return;}
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||typeof value.date!=='string')fail('Exact date literal required');
 parseGregorianDate((value as {date:string}).date);
}
interface Parameter {field:Json;value:Json;location:ProtectionFieldLocation}
function inspect(policy:unknown,catalog:unknown,closure:unknown,requestInput:unknown,evaluate:boolean):ProtectionFunctionResult {
 const budget=new ProtectionLiteralBudget();
 const parameters=checkProtectionParametersWithinBudget(policy,catalog,closure,budget),diagnostics:Diagnostic[]=[...parameters.diagnostics];
 let selection:Json=null,input:Json=null,value:Json=null,inputDomain:Json=null,outputDomain:Json=null,valueProfile:string|null=null;
 const finish=(status:FunctionStatus)=>{if(status==='refused')value=null;return freeze<ProtectionFunctionResult>({status,complete:false,authority:false,policy:parameters.policy,catalog:parameters.catalog,closure:parameters.closure,selection,input,value,inputDomain,outputDomain,valueProfile,diagnostics});};
 try{
  selection=copyJson(requestInput);
  if(selection===null||typeof selection!=='object'||Array.isArray(selection))fail('Exact selection object required');
  const request=selection as Record<string,Json>,names=evaluate?['ruleIndex','disclosureIndex','value']:['ruleIndex','disclosureIndex'];
  if(Object.keys(request).length!==names.length||Object.keys(request).some(key=>!names.includes(key))||names.some(key=>!Object.hasOwn(request,key))
   ||![request.ruleIndex,request.disclosureIndex].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0))fail('Closed selection with nonnegative safe indices and explicit present value required');
  if(evaluate)input=request.value!;
  if(parameters.status==='refused')return finish('refused');
  const p=parameters.policy as any,c=parameters.catalog as any;
  const disposition=p.rules[request.ruleIndex as number]?.disclosure?.[request.disclosureIndex as number]?.disposition;
  if(disposition?.kind!=='transformed'||disposition.vocabulary!=='umf.security.protection')fail('Actual selected catalog disposition required');
  const transform=c.transforms.find((t:any)=>t.id===disposition.transform&&t.version===disposition.version);
  if(!transform)fail('Exact selected transform missing');
  const selectedDisclosure=p.rules[request.ruleIndex as number].disclosure[request.disclosureIndex as number];
  const sameRef=(a:any,b:any)=>['documentId','moduleId','elementId'].every(key=>a?.[key]===b?.[key]);
  if(!sameRef(selectedDisclosure.field,transform.inputDomain)||!sameRef(disposition.field,transform.outputDomain))fail('Selected policy input/output Fields must equal the exact transform domains; no inferred domain inclusion');
  const operation=transform.kind+'/'+transform.function,expected=signatures[operation],isDate=operation==='generalize/truncate-date';
  if(!expected)fail('Transform has no qualified pure reference recipe; native/keyed/vault code is never executed');
  if(transform.determinism!=='deterministic'||transform.reversibility!=='none')fail('Pure reference function requires deterministic/non-reversing declaration');
  const fields=protectionFieldIndex(parameters.closure),resolve=(ref:any)=>{const result=fields.get(ref);if(!result)fail('Exact qualified Field missing');scalar(result.field);return result;};
  const from=resolve(transform.inputDomain),to=resolve(transform.outputDomain);
  const coreValueFamilies=['boolean','integer','decimal','string','binary'];
  if(!isDate&&(!coreValueFamilies.includes(from.field.scalarType!)||!coreValueFamilies.includes(to.field.scalarType!)))fail('No selected value profile for temporal/float input or output');
  inputDomain=transform.inputDomain;outputDomain=transform.outputDomain;
  const args=new Map<string,Parameter>();
  for(const parameter of transform.parameters){const location=resolve(parameter.field);if(!coreValueFamilies.includes(location.field.scalarType!))fail('No selected core value semantics for parameter');args.set(parameter.name,{...parameter,location});}
  if(args.size!==expected.length||expected.some(name=>!args.has(name)))fail('Exact function-specific parameter-name set required');
  const argument=(name:string,family:string)=>{const a=args.get(name)!;if(a.location.field.scalarType!==family)fail('Parameter '+name+' requires '+family+' domain');return a;};
  const text=(name:string)=>{const a=argument(name,'string');if(a.value===null||typeof a.value!=='object'||Array.isArray(a.value)||typeof a.value.string!=='string')fail('String parameter '+name+' required');return (a.value as {string:string}).string;};
  const coefficient=(location:ProtectionFieldLocation,v:Json)=>{
   const identity=budget.identity(location.doc,location.field,v as CoreLiteral),token=identity.slice(identity.indexOf(':')+1);budget.step(token.length);return BigInt(token);
  };
  const count=(name:string)=>{const a=argument(name,'integer'),n=coefficient(a.location,a.value);if(n<0n||n>4096n)fail('Count '+name+' outside0..4096');return Number(n);};
  let prefix=0,suffix=0,length=0,padding='',unit='',width=0n,origin=0n;
  if(operation==='mask/constant')checkedValue(to,args.get('value')!.value,budget);
  else if(operation==='mask/null-out')checkedValue(to,null,budget);
  else if(isDate){
   dateField(from.field);dateField(to.field);
   if(text('calendar')!==GREGORIAN_DATE_PROFILE)fail('Exact Gregorian date operation profile must be explicitly selected');
   unit=text('unit');if(!['year','quarter','month','day'].includes(unit))fail('Unsupported Gregorian date truncation unit');valueProfile=GREGORIAN_DATE_PROFILE;
  }else if(operation==='generalize/range-bucket'){
   if(!['integer','decimal'].includes(from.field.scalarType!)||to.field.scalarType!==from.field.scalarType)fail('Bucket input/output must share exact numeric family');
   for(const name of ['width','origin']){
    const a=argument(name,from.field.scalarType!);
    if(from.field.scalarType==='decimal'&&((a.location.field.facets as any)?.scale!==(from.field.facets as any)?.scale||(to.field.facets as any)?.scale!==(from.field.facets as any)?.scale))fail('Bucket operands/output must share input decimal scale');
   }
   width=coefficient(args.get('width')!.location,args.get('width')!.value);origin=coefficient(args.get('origin')!.location,args.get('origin')!.value);if(width<=0n)fail('Bucket width must be positive');
  }else{
   if(from.field.scalarType!=='string'||to.field.scalarType!=='string')fail('String reference function requires string input/output');
   if(text('unit')!=='unicode-scalar')fail('Explicit unicode-scalar unit required');
   if(operation==='mask/partial'){prefix=count('prefix');suffix=count('suffix');}else length=count('length');
   if(operation!=='generalize/prefix-only'){padding=text('padding');if(Array.from(padding).length!==1)fail('Padding must be exactly one Unicode scalar');}
  }
  diagnostics.push({code:'PROTECTION_REFERENCE_ONLY',path:'',severity:'warning',message:'Pure reference recipe only; no policy decision, property-fact proof, actual compiler lineage or native authority'});
  if(!evaluate)return finish('reference-ready');
  checkedValue(from,input,budget,isDate);
  if(operation==='mask/constant')value=args.get('value')!.value;
  else if(operation==='mask/null-out')value=null;
  else if(input===null){checkedValue(to,null,budget,isDate);value=null;}
  else if(isDate)value={date:truncateGregorianDate((input as {date:string}).date,unit)};
  else if(operation==='generalize/range-bucket'){
   const x=coefficient(from,input);const textCost=x.toString().length+origin.toString().length+width.toString().length;budget.step(textCost*4);
   const delta=x-origin;let q=delta/width;if(delta%width<0n)q-=1n;
   const result=origin+q*width,token=result.toString(),scale=(from.field.facets as any)?.scale??0;
   value=from.field.scalarType==='integer'?{integerToken:token}:{decimalToken:token+(scale?'e-'+scale:'')};
  }else{
   const scalars=Array.from((input as {string:string}).string);budget.step(scalars.length);
   if(operation==='generalize/prefix-only')value={string:scalars.slice(0,length).join('')};
   else{
    const start=operation==='mask/partial'?scalars.slice(0,prefix).join(''):'',endCount=operation==='mask/partial'?Math.min(suffix,Math.max(0,scalars.length-prefix)):0;
    const end=endCount?scalars.slice(-endCount).join(''):'',middle=operation==='mask/partial'?Math.max(0,scalars.length-Math.min(prefix,scalars.length)-endCount):length;
    const encoded=13+(JSON.stringify(start).length-2)+(JSON.stringify(end).length-2)+(JSON.stringify(padding).length-2)*middle;
    if(encoded>4096)throw new UmfError('PROTECTION_FUNCTION_BOUND','resource-exhausted: string output exceeds4096 canonical UTF-16 units');
    budget.step(encoded);value={string:start+padding.repeat(middle)+end};
   }
  }
  checkedValue(to,value,budget,isDate);return finish('transformed');
 }catch(error){
  if(!(error instanceof UmfError)&&!(error instanceof RangeError)&&!(error instanceof TypeError))throw error;
  diagnostics.push({code:error instanceof UmfError?error.code:'PROTECTION_FUNCTION_VALUE',path:error instanceof UmfError?error.path:'/selection',message:error.message,severity:'error'});return finish('refused');
 }
}
/** Signature/domain applicability only; output validity may still depend on input. */
export function inspectProtectionFunction(policy:unknown,catalog:unknown,closure:unknown,selection:unknown):ProtectionFunctionResult{return inspect(policy,catalog,closure,selection,false);}
/** Present typed input only; no row authorization or canonical mutation. */
export function evaluateProtectionValue(policy:unknown,catalog:unknown,closure:unknown,selection:unknown):ProtectionFunctionResult{return inspect(policy,catalog,closure,selection,true);}
