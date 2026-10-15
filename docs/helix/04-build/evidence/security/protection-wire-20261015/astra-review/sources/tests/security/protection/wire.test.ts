import {test,expect} from 'bun:test';
import {inspectProtectionCatalog,requireProtectionInterpretation} from '../../../src/extensions/security/protection/catalog';
const field={documentId:'d',moduleId:'m',elementId:'f'};
const transform=():any=>({id:'t',version:'1',kind:'mask',function:'constant',inputDomain:field,outputDomain:field,determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[]});
const catalog=(t=transform()):any=>({vocabulary:'umf.security.protection',version:'0.1.0',id:'c',revision:'r',transforms:[t]});
const inspect=(t:any)=>inspectProtectionCatalog(catalog(t));
test('wire requires known kind, qualified domains and explicit transform declarations',()=>{
 // @covers US-079-AC11
 for(const member of ['kind','inputDomain','outputDomain','determinism','reversibility','disclosureProfile','queryUse','parameters']){const t=transform();delete t[member];expect(inspect(t).valid,member).toBe(false);}
 for(const patch of [{kind:'future'},{inputDomain:{elementId:'f'}},{queryUse:{join:'future'}},{function:'prefix-only'},{algorithm:'not-a-mask-member'}])expect(inspect({...transform(),...patch}).valid).toBe(false);
});
test('typed literal carriers and parameter names are bounded without truncating source',()=>{
 // @covers US-079-AC11
 const parameter={name:'value',field,value:{string:'x'}};
 expect(inspect({...transform(),parameters:[parameter]}).valid).toBe(true);
 expect(inspect({...transform(),parameters:[parameter,parameter]}).valid).toBe(false);
 for(const n of [32,33])expect(inspect({...transform(),parameters:Array.from({length:n},(_,i)=>({...parameter,name:String(i)}))}).valid).toBe(n===32);
 for(const size of [4096,4097]){const value={string:'x'.repeat(size-JSON.stringify({string:''}).length)},source=catalog({...transform(),parameters:[{...parameter,value}]});expect(JSON.stringify(value).length).toBe(size);const result=inspectProtectionCatalog(source);expect(result.valid).toBe(size===4096);expect(result.source).toEqual(source);}
 expect(inspect({...transform(),parameters:[{...parameter,value:{integerToken:'9007199254740993'}}]}).valid).toBe(true);
 expect(inspect({...transform(),parameters:[{...parameter,value:42}]}).valid).toBe(false);
});
test('parameterized disclosure properties have explicit wire shapes and typed bucket bounds',()=>{
 for(const property of ['equality',{kind:'prefix',length:2},{kind:'suffix',length:1},{kind:'range',bucket:{field,value:{integerToken:'10'}}}])expect(inspect({...transform(),disclosureProfile:[property]}).valid).toBe(true);
 for(const property of ['prefix(2)',{kind:'prefix',length:0},{kind:'suffix',length:1.5},{kind:'range',bucket:{value:{integerToken:'1'}}},{kind:'range',bucket:{field,value:{string:'x'.repeat(4097)}}}])expect(inspect({...transform(),disclosureProfile:[property]}).valid).toBe(false);
 expect(inspect({...transform(),disclosureProfile:['equality','equality']}).valid).toBe(false);
});
const custody=()=>({owner:'owner',keyRef:'opaque:key',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'declared',snapshots:'declared',exports:'declared',feeds:'declared',caches:'declared'}});
test('custody, reversal and hash salt have explicit unverified shapes',()=>{
 // @covers US-079-AC15
 const hash={...transform(),kind:'hash',algorithm:'sha256',saltCustody:{kind:'none'}};delete hash.function;expect(inspect(hash).valid).toBe(true);
 expect(inspect({...hash,saltCustody:{kind:'keyed'}}).valid).toBe(false);
 expect(inspect({...hash,saltCustody:{kind:'keyed',owner:'o',keyRef:'k'}}).valid).toBe(true);
 const token={...transform(),kind:'tokenize',custody:custody()};delete token.function;expect(inspect(token).valid).toBe(true);
 for(const name of ['history','snapshots','exports','feeds','caches']){const t=structuredClone(token);delete (t.custody.propagation as any)[name];expect(inspect(t).valid,name).toBe(false);}
 expect(inspect({...token,custody:{...custody(),keyRef:undefined}}).valid).toBe(false);
 expect(inspect({...token,reversibility:'vault',reverseAction:'reverse'}).valid).toBe(false);
 expect(inspect({...token,reversibility:'vault',reverseAction:'reverse',custody:{...custody(),vaultRef:'vault'}}).valid).toBe(true);
 expect(inspect({...token,reversibility:'keyed'}).valid).toBe(false);
});
test('known wire shape never qualifies function/domain/query or native custody',()=>{
 const source=catalog();const oversized={...source,native:{opaque:'x'.repeat(4_000_001)}};const bounded=inspectProtectionCatalog(oversized);expect(bounded.valid).toBe(false);expect(bounded.source).toEqual(oversized);expect(bounded.diagnostics[0]!.code).toBe('PROTECTION_BOUND');const result=inspectProtectionCatalog(source);expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(()=>requireProtectionInterpretation(source)).toThrow();
 const future=catalog({...transform(),future:{enabled:true},inputDomain:{...field,future:'retained'},parameters:[{name:'x',field,value:{string:'v'},future:'retained'}]});future.native={sql:'never executed'};const unknown=inspectProtectionCatalog(future);expect(unknown.source).toEqual(future);expect(unknown.diagnostics.some(d=>d.code==='PROTECTION_UNKNOWN')).toBe(true);expect(unknown.complete).toBe(false);
});
