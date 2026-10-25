// SPDX-License-Identifier: MIT OR Apache-2.0
export {nativeDate,nativeInstant} from '../extensions/tables/temporal';
import {nativeDate as validateNativeDate,nativeInstant as normalizeNativeInstant} from '../extensions/tables/temporal';
import type {AccountingContext} from '../model/internal/accounting-context';

/** Private R2 entrypoints reserve the bounded parse and normalized output first. */
export function nativeDateCharged(text:string,accounting:AccountingContext,path:string):string{
 accounting.scanUtf8(text,path);accounting.visit('sql-date-validation',path,text.length);
 return validateNativeDate(text);
}
export function nativeInstantCharged(text:string,accounting:AccountingContext,path:string):string{
 accounting.scanUtf8(text,path);accounting.visit('sql-instant-normalization',path,text.length);
 // The exact native formatter emits 27 ASCII bytes for every accepted instant.
 // Reserve that complete output before calling the formatter that allocates it.
 accounting.retainBytes('sql-normalized-instant-output',27,path);
 return normalizeNativeInstant(text);
}
