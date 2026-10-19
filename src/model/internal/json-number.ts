// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../errors';
// Compare decimal values without rounding, without expanding an exponent.
export function decimal(text: string): string {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw new UmfError('NUMBER', 'Unsupported numeric spelling');
  const digits = ((match[2] || '') + (match[3] || '')).replace(/^0+/, '');
  if (!digits) return '0';
  const trimmed = digits.replace(/0+$/, '');
  const exponent = BigInt(match[4] || '0') - BigInt((match[3] || '').length) + BigInt(digits.length - trimmed.length);
  return `${match[1] === '-' ? '-' : ''}${trimmed}e${exponent}`;
}
/** Original interoperable JSON-number profile, reusable by larger framed readers. */
export function assertExactJsonNumber(token:string):void {
 const value=Number(token);
 if(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value)||Object.is(value,-0))throw new UmfError('NUMBER','Noninteroperable JSON number');
 // A nonzero mantissa underflowing to zero cannot preserve its meaning.
 if(value===0&&/[1-9]/.test(token.split(/[eE]/)[0]!))throw new UmfError('NUMBER','Parsing would change the decimal value');
 if(decimal(token)!==decimal(String(value)))throw new UmfError('NUMBER','Parsing would change the decimal value');
}
