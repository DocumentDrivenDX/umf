// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host custody of compiler-issued private catalog recipes. */
import {copyJson} from '../../../model/json';
import {UmfError,type Json,type Diagnostic} from '../../../model/types';
import {catalogRecipe} from '#security-candidate-condition';
import {checkProtectionParametersWithinBudget,type ProtectionParameterValidation} from './parameters';
import {ProtectionLiteralBudget} from './literals';

type FunctionStatus='reference-ready'|'transformed'|'refused';
export interface ProtectionFunctionResult extends Omit<ProtectionParameterValidation,'status'|'validated'> {
 status:FunctionStatus;selection:Json;input:Json;value:Json;
 inputDomain:Json;outputDomain:Json;valueProfile:string|null;
}
export type ProtectionFunctionInspector=(policy:unknown,catalog:unknown,closure:unknown,selection:unknown)=>ProtectionFunctionResult;
export type ProtectionValueEvaluator=ProtectionFunctionInspector;

type RecipeProfile={inputDomain:Json;outputDomain:Json;valueProfile:string|null};
type RecipeReceipt=RecipeProfile&{value:Json;workUnits:number;textUnits:number};
type DefinitionContext={parameters:ProtectionParameterValidation;transforms:readonly Json[]};
const issuedDefinitions=new WeakMap<object,DefinitionContext>();

function freeze<T>(value:T):T {
 if(value!==null&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
}

function recipe(context:DefinitionContext, transformIndex:number,budget:ProtectionLiteralBudget,request?:{value:Json}):RecipeReceipt {
 const transform=context.transforms[transformIndex];
 if(!transform)throw new UmfError('PROTECTION_FUNCTION','Exact transform definition missing');
 const receipt=catalogRecipe({
  closure:context.parameters.closure,transform,workLimit:budget.remainingWork,textLimit:budget.remainingText,...request,
 }) as RecipeReceipt;
 budget.step(receipt.workUnits);
 budget.reserveText(receipt.textUnits);
 return receipt;
}

function asDiagnostic(error:unknown,path=''):Diagnostic {
 if(!(error instanceof Error)||!('code' in error)||typeof error.code!=='string')throw error;
 return {code:error.code,path:path+('path' in error&&typeof error.path==='string'?error.path:''),message:error.message,severity:'error'};
}

export function checkProtectionFunctionDefinitions(policy:unknown,catalog:unknown,closure:unknown):ProtectionParameterValidation & {definitions:readonly ({transformIndex:number}&RecipeProfile)[]}{
 const budget=new ProtectionLiteralBudget(),parameters=checkProtectionParametersWithinBudget(policy,catalog,closure,budget);
 const definitions:({transformIndex:number}&RecipeProfile)[]=[],diagnostics=[...parameters.diagnostics];
 let refused=parameters.status==='refused';
 const context:DefinitionContext={parameters,transforms:refused?[]:(parameters.catalog as {transforms:Json[]}).transforms};
 for(const [transformIndex,transform] of context.transforms.entries()){
  if(!['mask','generalize'].includes((transform as {kind:string}).kind))continue;
  try{
   const {inputDomain,outputDomain,valueProfile}=recipe(context,transformIndex,budget);
   definitions.push({transformIndex,inputDomain,outputDomain,valueProfile});
  }catch(error){
   refused=true;
   diagnostics.push(asDiagnostic(error,'/transforms/'+transformIndex));
   break;
  }
 }
 const result=freeze({...parameters,status:refused?'refused' as const:'validated-parameters' as const,validated:refused?[]:parameters.validated,definitions:refused?[]:definitions,diagnostics});
 if(!refused)issuedDefinitions.set(result,context);
 return result;
}

export function evaluateIssuedProtectionDefinition(issued:unknown,transformIndex:number,value:unknown,budget:ProtectionLiteralBudget):ProtectionFunctionResult {
 const context=issued&&typeof issued==='object'?issuedDefinitions.get(issued):undefined;
 if(!context)throw new UmfError('PROTECTION_FUNCTION','Original issued definition context required');
 const {policy,catalog,closure}=context.parameters,diagnostics=[...context.parameters.diagnostics];
 let selection:Json=null,input:Json=null;
 const finish=(status:FunctionStatus,fields:RecipeProfile&{value:Json}):ProtectionFunctionResult=>
  freeze({status,complete:false,authority:false,policy,catalog,closure,selection,input,diagnostics,...fields});
 try{
  selection=copyJson({transformIndex,value});
  input=(selection as {value:Json}).value;
  const {inputDomain,outputDomain,valueProfile,value:output}=recipe(context,transformIndex,budget,{value:input});
  diagnostics.push({code:'PROTECTION_REFERENCE_ONLY',path:'',severity:'warning',message:'Pure reference recipe only; no policy decision, property-fact proof, actual compiler lineage or native authority'});
  return finish('transformed',{inputDomain,outputDomain,valueProfile,value:output});
 }catch(error){
  diagnostics.push(asDiagnostic(error));
  return finish('refused',{inputDomain:null,outputDomain:null,valueProfile:null,value:null});
 }
}
