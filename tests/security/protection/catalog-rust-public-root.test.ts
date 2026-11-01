// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {inspectProtectionCatalog,requireProtectionInterpretation} from '../../../src/index-node-v4';
import {UmfError} from '../../../src/model/errors';

const catalog=()=>({vocabulary:'umf.security.protection',version:'0.1.0',id:'catalog',revision:'r1',transforms:[{id:'mask',version:'1',kind:'mask',function:'constant',inputDomain:{documentId:'d',moduleId:'m',elementId:'in'},outputDomain:{documentId:'d',moduleId:'m',elementId:'out'},determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[],future:{value:'retained'}}],native:{sql:'opaque'}});

test('Node V4 catalog inspection preserves opaque fields and strict interpretation refuses',()=>{
 const source=catalog();
 const result=inspectProtectionCatalog(source);
 expect(result.valid).toBe(true);
 expect(result.complete).toBe(false);
 expect(result.source).toEqual(source);
 expect(result.diagnostics.some(d=>d.code==='PROTECTION_UNKNOWN'&&d.path==='/transforms/0/future')).toBe(true);
 expect(result.diagnostics.some(d=>d.code==='PROTECTION_UNIMPLEMENTED')).toBe(true);
 expect(()=>requireProtectionInterpretation(source)).toThrow(expect.objectContaining({name:UmfError.name,code:'PROTECTION_UNIMPLEMENTED'}));
 const duplicate={...source,transforms:[...source.transforms,{...source.transforms[0]}]};
 expect(inspectProtectionCatalog(duplicate).valid).toBe(false);
 expect(inspectProtectionCatalog(duplicate).diagnostics.some(d=>d.code==='PROTECTION_DUPLICATE')).toBe(true);
});
