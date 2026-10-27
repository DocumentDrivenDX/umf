import {describe,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {createSemanticTypeRegistry,UmfCoreError} from '../index.js';
import {createDefaultSemanticTypeRegistry} from '../index.js';
import {frameWork} from '../src/semantic-value.js';

const ref=term=>({vocabulary:'example.test',version:'1.0.0',term});

describe('opt-in Rust semantic value registry',()=>{
  test('admits before retaining, copies definitions and callback inputs, and checks exact terms',()=>{
    const definition={nested:{value:'before'}};
    let seen;
    const registry=createSemanticTypeRegistry().register(ref('x'),definition,(value,def)=>{
      seen=[structuredClone(value),structuredClone(def)]; value.changed=true; def.nested.value='callback';
      return {status:'valid',complete:true,issues:[]};
    });
    definition.nested.value='caller-mutated';
    const input={nested:{value:'input'}};
    expect(registry.check(ref('x'),input).status).toBe('valid');
    expect(input).toEqual({nested:{value:'input'}});
    expect(seen[1]).toEqual({nested:{value:'before'}});
    expect(registry.lookup(ref('x'))).toEqual({nested:{value:'before'}});
    expect(registry.lookup(ref('absent'))).toBeUndefined();
    expect(()=>registry.register(ref('x'),{})).toThrow(/Exact semantic term already registered/);
    expect(()=>registry.register(ref('x'),{},42)).toThrow(/Expected explicit validator function/);
    expect(()=>createSemanticTypeRegistry().register(ref('bad-definition'),[],42)).toThrow(/Expected JSON object definition/);
  });

  test('preserves unknown and malformed callback mappings and thrown non-Error behavior',()=>{
    const registry=createSemanticTypeRegistry()
      .register(ref('throw'),{},()=>{throw {message:'ignored'}})
      .register(ref('utf16-throw'),{},()=>{throw new Error('bad \ud800')})
      .register(ref('malformed'),{},()=>({status:'unknown',complete:true,issues:[]}));
    expect(registry.check({...ref('throw'),future:true},null).issues[0]).toBe('Unknown semantic reference qualifiers retained without interpretation');
    expect(registry.check(ref('throw'),null).issues[0]).toBe('Value validator failed; no validation conclusion available');
    expect(registry.check(ref('utf16-throw'),null).issues[0]).toBe('Value validator failed; no validation conclusion available: bad \ud800');
    expect(registry.check(ref('malformed'),null).issues[0]).toBe('Malformed validator result');
  });

  test('caller-thrown engine-like codes cannot impersonate host control failures',()=>{
    for(const code of ['HOST_CONTROL','RESOURCE_LIMIT','CANCELLED','DEADLINE']) {
      const registry=createSemanticTypeRegistry().register(ref(code),{},()=>{throw Object.assign(new Error(`spoof-${code}`),{code});});
      const result=registry.check(ref(code),null);
      expect(result.status).toBe('unknown');
      expect(result.issues[0]).toBe(`Value validator failed; no validation conclusion available: spoof-${code}`);
    }
    const caught=createSemanticTypeRegistry().register(ref('caught-report'),{},(_value,_definition,{reportWork})=>{
      try { reportWork(-1); } catch {}
      return {status:'valid',complete:true,issues:[]};
    });
    try { caught.check(ref('caught-report'),null); throw new Error('expected internal report refusal'); }
    catch(error) { expect(error).toBeInstanceOf(UmfCoreError); expect(error.code).toBe('HOST_CONTROL'); }
    const proxy=createSemanticTypeRegistry().register(ref('proxy'),{},()=>new Proxy({},
      {getPrototypeOf(){throw Object.assign(new Error('spoofed during result admission'),{code:'RESOURCE_LIMIT'});}}));
    expect(proxy.check(ref('proxy'),null).status).toBe('unknown');
  });

  test('charges cooperative callback work cumulatively and preserves operation controls',()=>{
    const registry=createSemanticTypeRegistry({controls:{maxWork:1_000_000}})
      .register(ref('work'),{},(_v,_d,{reportWork})=>{reportWork(2);reportWork(3);return {status:'valid',complete:true,issues:[]};});
    expect(registry.check(ref('work'),null).status).toBe('valid');
    for(const [term,amount] of [['negative',-1],['fractional',1.5],['unsafe',Number.MAX_SAFE_INTEGER+1]]) {
      const invalid=createSemanticTypeRegistry().register(ref(`bad-work-${term}`),{},(_v,_d,{reportWork})=>{reportWork(amount);return {status:'valid',complete:true,issues:[]};});
      try { invalid.check(ref(`bad-work-${term}`),null); throw new Error('expected invalid work refusal'); }
      catch(error) { expect(error).toBeInstanceOf(UmfCoreError); expect(error.code).toBe('HOST_CONTROL'); }
    }
    let cancelledNow=false;
    const cancelled=createSemanticTypeRegistry({controls:{isCancelled:()=>cancelledNow}}).register(ref('cancel'),{},(_v,_d,{reportWork})=>{cancelledNow=true;reportWork(1);return {status:'valid',complete:true,issues:[]};});
    expect(()=>cancelled.check(ref('cancel'),null)).toThrow(UmfCoreError);
    const thrown=createSemanticTypeRegistry({controls:{maxWork:1_000}}).register(ref('reported-then-threw'),{},(_v,_d,{reportWork})=>{reportWork(1_001);throw new Error('after report');});
    try { thrown.check(ref('reported-then-threw'),null); throw new Error('expected reported-work refusal'); }
    catch(error) { expect(error).toBeInstanceOf(UmfCoreError); expect(error.code).toBe('RESOURCE_LIMIT'); }
  });

  test('bounds oversized callback output before the native response frame',()=>{
    const registry=createSemanticTypeRegistry().register(ref('large'),{},()=>({status:'valid',complete:true,issues:['x'.repeat(4_000_100)]}));
    try { registry.check(ref('large'),null); throw new Error('expected size refusal'); }
    catch(error) { expect(error).toBeInstanceOf(UmfCoreError); expect(error.code).toBe('RESOURCE_LIMIT'); }
  });

  test('shares the exact callback output work boundary across result and envelope stages',()=>{
    const work=frameWork();
    work(1_000_000); // callback result copy/admission
    work(48_576); // decode and response envelope
    expect(()=>work(1)).toThrow(/host frame limit/);
  });

  test('orders reference admission before definition and resolves unknown checks before value admission',()=>{
    const registry=createSemanticTypeRegistry();
    const circular={}; circular.self=circular;
    expect(()=>registry.register({vocabulary:'',version:'1.0.0',term:'x'},circular,42)).toThrow(UmfCoreError);
    const unknown=registry.check(ref('absent'),circular);
    expect(unknown.status).toBe('unknown');
    expect(unknown.issues[0]).toBe('Exact semantic term is unavailable');
  });

  test('ordering preflights are control-free and the final operation retains host controls',()=>{
    let controlCalls=0;
    const registry=createSemanticTypeRegistry({controls:{isCancelled:()=>{controlCalls++;return false;}}});
    const circular={}; circular.self=circular;
    expect(registry.check(ref('unknown'),circular).status).toBe('unknown');
    expect(controlCalls).toBe(0);
    registry.register(ref('known'),{},()=>({status:'valid',complete:true,issues:[]}));
    controlCalls=0;
    expect(controlCalls).toBe(0);
    expect(registry.check(ref('known'),null).status).toBe('valid');
    expect(controlCalls).toBeGreaterThan(0);
    const many=createSemanticTypeRegistry();
    for(let index=0;index<12;index++)many.register(ref(`term-${index}`),{index});
    expect(many.check(ref('term-11'),null).issues[0]).toBe('No value validator supplied for the exact semantic term');
    expect(many.check(ref('not-registered'),circular).issues[0]).toBe('Exact semantic term is unavailable');
  });

  test('aggregates current core declarations using the same invocation registry',()=>{
    const packet=JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r5-core-semantic-types/frozen-typescript.json','utf8'));
    const source=structuredClone(packet.cases.inspect.value.source);
    delete source.modules[0].elements[0].semanticTypes[0].qualifier;
    const resources={
      coreSchema:JSON.parse(readFileSync('spec/core/schema.json','utf8')),
      referenceSchema:JSON.parse(readFileSync('spec/core/semantic-type-reference.schema.json','utf8')),
      packageSchema:JSON.parse(readFileSync('spec/core/extension-package.schema.json','utf8')),
      constraints:JSON.parse(readFileSync('spec/metamodel/generated/core-constraints.json','utf8')),
      domainPolicy:JSON.parse(readFileSync('spec/metamodel/generated/domain-policy.json','utf8')),
    };
    let calls=0;
    const emailRef={vocabulary:'example.contact',version:'1.0.0',term:'email'};
    const registry=createSemanticTypeRegistry().register(emailRef,{format:'email'},()=>{calls++;return {status:'valid',complete:true,issues:[]};});
    expect(registry.check(emailRef,'x').status).toBe('valid');
    expect(registry.lookup(emailRef)).toEqual({format:'email'});
    calls=0;
    const result=registry.validateCoreSemanticTypeValue(resources,source,{module:'m',element:'e'},'person@example.test');
    expect({calls,result}).toEqual({calls:1,result:expect.anything()});
    expect(result.status).toBe('valid');
    expect(result.checks).toHaveLength(1);
    const circular={}; circular.self=circular;
    try { registry.validateCoreSemanticTypeValue(resources,source,{module:'absent',element:'e'},circular); throw new Error('expected identity refusal'); }
    catch(error) { expect(error).toBeInstanceOf(UmfCoreError); expect(error.code).toBe('SEMANTIC_TYPE_MISSING'); }
  },20_000);
});

test('default-profile binder preserves the TypeScript class and callback receiver contract',async()=>{
  const {bindSemanticTypesRust}=await import('../../../../src/access/rust-semantic-types-default.ts');
  const {SemanticTypeRegistry,validateSemanticTypeValue}=bindSemanticTypesRust(()=>createDefaultSemanticTypeRegistry(),{});
  const reference=ref('default-contract');
  const receiverSnapshots=[];
  const receivers=[];
  const validator=function(value,definition) {
    receivers.push(this);
    receiverSnapshots.push({arity:arguments.length,keys:Object.keys(this),definition:structuredClone(definition)});
    if(receiverSnapshots.length===1)this.definition.nested.value='changed-through-this';
    return {status:'valid',complete:true,issues:[]};
  };
  const registry=new SemanticTypeRegistry();
  expect(registry).toBeInstanceOf(SemanticTypeRegistry);
  expect(registry.constructor.name).toBe('SemanticTypeRegistry');
  expect(Object.getPrototypeOf(registry)).toBe(SemanticTypeRegistry.prototype);
  expect(registry.register(reference,{nested:{value:'initial'}},validator)).toBe(registry);
  expect(registry.register({...reference,version:'2.0.0'},{})).toBe(registry);
  expect(validateSemanticTypeValue(reference,null,registry).status).toBe('valid');
  expect(registry.check(reference,null).status).toBe('valid');
  expect(receiverSnapshots.map(row=>row.arity)).toEqual([2,2]);
  expect(receiverSnapshots[0]).toEqual({arity:2,keys:['definition','validator'],definition:{nested:{value:'initial'}}});
  expect(receiverSnapshots[1].definition).toEqual({nested:{value:'changed-through-this'}});
  expect(receivers[0]).toBe(receivers[1]);
  expect(receivers[0]).toMatchObject({definition:{nested:{value:'changed-through-this'}},validator});
  expect(registry.lookup(reference)).toEqual({nested:{value:'changed-through-this'}});
  const {UmfError}=await import('../../../../src/model/errors.ts');
  try {registry.register({...reference,term:''},{});throw new Error('expected bad identity refusal');}
  catch(error) {expect(error).toBeInstanceOf(UmfError);expect({name:error.name,code:error.code,message:error.message,path:error.path}).toEqual({name:'UmfError',code:'SEMANTIC_TYPE_STRUCTURE',message:'Expected vocabulary, exact version and term strings',path:''});}
  try {registry.register(reference,{});throw new Error('expected duplicate refusal');}
  catch(error) {expect(error).toBeInstanceOf(UmfError);expect({name:error.name,code:error.code,message:error.message,path:error.path}).toEqual({name:'UmfError',code:'SEMANTIC_TYPE_DUPLICATE',message:'Exact semantic term already registered',path:''});}
});
