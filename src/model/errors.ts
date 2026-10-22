// SPDX-License-Identifier: MIT OR Apache-2.0
/** Generic errors have no generated/core-language dependency. */
export class UmfError extends Error {constructor(readonly code:string,message:string,readonly path=''){super(message);this.name='UmfError';}}

export const pointer=(key:string)=>key.replace(/~/g,'~0').replace(/\//g,'~1');
