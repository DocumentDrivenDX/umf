// SPDX-License-Identifier: MIT OR Apache-2.0
import type {
 JavascriptNumericContext,
 JavascriptNumericLiteral,
} from '../adapters/javascript-numeric';
import {copyJson} from '../model/json';
import {UmfError} from '../model/errors';

export interface JavascriptNumericRustEngine {
 exactDecimal(token:string,context?:JavascriptNumericContext):{decimalToken:string};
 integerFromBigInt(value:bigint,context?:JavascriptNumericContext):{integerToken:string};
 integerToBigInt(input:{integerToken:string},context?:JavascriptNumericContext):bigint;
 admitJavascriptNumber(value:number,scalarType:'integer'|'decimal',context?:JavascriptNumericContext):JavascriptNumericLiteral;
 numericToNumberLossless(input:JavascriptNumericLiteral,context?:JavascriptNumericContext):number;
}

/** Bind the five CONTRACT-049 scalar operations to the Rust numeric engine. */
export function bindJavascriptNumericRust(initialize:()=>JavascriptNumericRustEngine):JavascriptNumericRustEngine {
 let engine:JavascriptNumericRustEngine|undefined;
 const getEngine=()=>engine??(engine=initialize());
 const copyLiteral=(input:unknown):JavascriptNumericLiteral=>{
  const copied=copyJson(input);
  if(!copied||typeof copied!=='object'||Array.isArray(copied))throw new UmfError('JAVASCRIPT_NUMERIC','Expected one numeric carrier');
  return copied as unknown as JavascriptNumericLiteral;
 };
 return Object.freeze({
  exactDecimal:(token:string,context?:JavascriptNumericContext)=>getEngine().exactDecimal(token,context),
  integerFromBigInt:(value:bigint,context?:JavascriptNumericContext)=>getEngine().integerFromBigInt(value,context),
  integerToBigInt:(input:{integerToken:string},context?:JavascriptNumericContext)=>getEngine().integerToBigInt(copyLiteral(input) as {integerToken:string},context),
  admitJavascriptNumber:(value:number,scalarType:'integer'|'decimal',context?:JavascriptNumericContext)=>getEngine().admitJavascriptNumber(value,scalarType,context),
  numericToNumberLossless:(input:JavascriptNumericLiteral,context?:JavascriptNumericContext)=>getEngine().numericToNumberLossless(copyLiteral(input),context),
 });
}
