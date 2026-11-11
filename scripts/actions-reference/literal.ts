// SPDX-License-Identifier: MIT OR Apache-2.0
/** Structural check for detached literal values at the host boundary. */
export function isCoreLiteralShape(input:unknown):boolean {
 const pending=[input],number=/^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
 while(pending.length){const value=pending.pop();if(value===null)continue;if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const keys=Object.keys(value);if(keys.length!==1)return false;const key=keys[0]!,item=(value as Record<string,unknown>)[key];
  if(key==='array'){if(!Array.isArray(item))return false;pending.push(...item);continue;}
  if(key==='map'){if(!item||typeof item!=='object'||Array.isArray(item))return false;pending.push(...Object.values(item));continue;}
  if(key==='boolean'){if(typeof item!=='boolean')return false;continue;}
  if(key==='integerToken'||key==='decimalToken'||key==='floatToken'){if(typeof item!=='string'||!number.test(item))return false;continue;}
  if(typeof item!=='string')return false;
  if(key==='binaryHex'&&!/^(?:[0-9a-fA-F]{2})*$/.test(item))return false;
  if(key==='bits128Hex'&&!/^[0-9a-fA-F]{32}$/.test(item))return false;
  if(key==='uuid'&&!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(item))return false;
  if(!['string','binaryHex','floatToken','date','time','timestamp','bits128Hex','uuid'].includes(key))return false;
 }
 return true;
}
