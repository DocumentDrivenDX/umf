import {expect,test} from 'bun:test';
import {generateAccessPackage} from '../../src/compilation/index';
import {profile,request,mutateSource} from './access-fixtures';
// @covers US-082-AC1
test('generated updates have explicit keyword parameters checked by every checker',()=>{
 const result=generateAccessPackage(request(),profile());
 const fields=result.files.find(f=>f.path==='shop/fields.py')!.text;
 expect(fields).not.toContain('**values: Unpack[');
 expect(fields).toContain('def update(self, *, amount:');
 expect(fields).toContain(' = MISSING');
});
// @covers US-080-AC1
 test('generation_is_deterministic; exact source and profile identity affect digest',()=>{
 const req=request(),p=profile(),before=JSON.stringify({req,p});const a=generateAccessPackage(req,p),b=generateAccessPackage(req,p);
 expect(a).toEqual(b);expect(a.outcome).toBe('candidate');expect(JSON.stringify({req,p})).toBe(before);
 const q=request();q.sources[0]!.text+='\n';expect(generateAccessPackage(q,p).inputDigest).not.toBe(a.inputDigest);
 const changed=profile();changed.subset+=' changed';expect(generateAccessPackage(req,changed).inputDigest).not.toBe(a.inputDigest);
 changed.codeSha256='b'.repeat(64);expect(generateAccessPackage(req,changed).inputDigest).not.toBe(generateAccessPackage(req,{...changed,codeSha256:'a'.repeat(64)}).inputDigest);
 expect(a.files.map(f=>f.path)).toEqual(a.files.map(f=>f.path).sort());
 expect(JSON.parse(a.files.find(f=>f.path==='shop/_umf/sources.json')!.text)).toEqual(req.sources);
 });
// @covers US-080-AC2
 test('access_views_validated: missing view, coverage gap and conflict retain pointers',()=>{
 for(const change of [
  (d:Parameters<Parameters<typeof mutateSource>[1]>[0])=>{d.modules[0]!.extensions['umf.access'].views=[];},
  (d:Parameters<Parameters<typeof mutateSource>[1]>[0])=>{d.modules[0]!.extensions['umf.access'].views[0]!.fields.pop();},
  (d:Parameters<Parameters<typeof mutateSource>[1]>[0])=>{d.modules[0]!.extensions['umf.access'].views[0]!.fields[0]!.row.null=true;},
 ]){const req=request();mutateSource(req,change);const result=generateAccessPackage(req,profile());expect(result.outcome).toBe('refused');expect(result.files).toEqual([]);expect(result.symbols).toEqual([]);expect(result.diagnostics.some(d=>d.code==='ACCESS'&&d.pointer.startsWith('/modules/'))).toBe(true);}
 });
// @covers US-080-AC3
 test('census_unknown_and_modes: unknown selected meaning refuses in both modes',()=>{
 for(const mode of ['strict','report'] as const){const req=request();req.mode=mode;mutateSource(req,d=>{Object.assign(d.modules[0]!.elements.find(e=>e.id==='Order')!,{'futureMeaning':{retained:'verbatim'}});});const result=generateAccessPackage(req,profile());expect(result.outcome).toBe('refused');expect(result.diagnostics.some(d=>d.code==='UNKNOWN_RELEVANT')).toBe(true);}
 });
// @covers US-080-AC3
 test('unselected unknown content is retained without claiming enforcement',()=>{
 const req=request();mutateSource(req,d=>{d.modules[0]!.elements.push({id:'unselected',kind:'record',members:[],extensions:{'future.extension':{opaque:'\u2028 text'}}} as never);Object.assign(d.vocabularies,{'future.extension':{version:'1.0.0'}});});
 const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('candidate');expect(r.dispositions.some(d=>d.relevance==='unselected'&&d.fidelity==='unknown')).toBe(true);expect(JSON.parse(r.files.find(f=>f.path==='shop/_umf/sources.json')!.text)).toEqual(req.sources);
 });
// @covers US-080-AC3
 test('unknown document extension and malformed profile digest refuse',()=>{
 const req=request();mutateSource(req,d=>{Object.assign(d.vocabularies,{'future.document':{version:'1.0.0'}});Object.assign(d,{extensions:{'future.document':{appliesTo:'selected-model'}}});});
 expect(generateAccessPackage(req,profile()).diagnostics.some(d=>d.code==='UNKNOWN_RELEVANT'&&d.pointer==='/extensions/future.document')).toBe(true);
 const p=profile();p.codeSha256='prefix'+'a'.repeat(64);expect(generateAccessPackage(request(),p).diagnostics.some(d=>d.code==='PROFILE')).toBe(true);
 });
// @covers US-080-AC4
 test('multiple projections generate typed overloads and honor explicit names',()=>{
 const req=request();req.projections=[{name:'orderSummary',record:req.records[0]!,fields:[{module:'commerce',element:'orderId'}]},{name:'orderDetails',record:req.records[0]!,fields:[{module:'commerce',element:'amount'}]}];
 req.names=[{sourceId:'logical',pointer:'/projections/0',python:'StableSummary'}];
 const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('candidate');const fields=r.files.find(f=>f.path==='shop/fields.py')!.text;
 expect(fields).toContain('@overload');expect(fields).toContain('type[StableSummary]');expect(fields).toContain('type[OrderDetails]');expect(r.files.find(f=>f.path==='shop/models.py')!.text).toContain('class StableSummary');
 });
// @covers US-080-AC3
 test('relationship closure emits dependency Key only and retains relationship identity',()=>{
 const req=request();mutateSource(req,d=>{Object.assign(d.modules[0]!,{relationships:[{id:'customer',name:'Order customer',source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:'Customer',key:'Customer-key'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true}]});});
 const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('candidate');expect(r.files.find(f=>f.path==='shop/keys.py')!.text).toContain('class CustomerKey');expect(r.files.find(f=>f.path==='shop/models.py')!.text).not.toContain('class Customer(');expect(r.files.find(f=>f.path==='shop/fields.py')!.text).toContain('Related[Order, CustomerKey]');expect(r.symbols.some(s=>s.symbol==='CustomerKey')).toBe(true);
 });
// @covers US-080-AC3
 test('selected action emits typed references, inputs, outputs and declared failures',()=>{
 const req=request();req.actions=[{module:'commerce',action:'shipOrder'}];mutateSource(req,d=>{
  Object.assign(d.vocabularies,{'umf.actions':{version:'0.1.0'}});
  Object.assign(d.modules[0]!.extensions,{'umf.actions':{actions:[{id:'shipOrder',name:'Ship order',description:'Typed action fixture; no executor qualification',parameters:[{id:'order',kind:'entity',target:{module:'commerce',element:'Order',key:'order-key'},required:true},{id:'memo',kind:'value',field:{module:'commerce',element:'memo'},required:false}],outputs:[{id:'amount',kind:'value',field:{module:'commerce',element:'amount'},required:true}],preconditions:[],postconditions:[],reads:[],writes:[],binding:{kind:'handler',profile:{id:'test-handler-profile',version:'1'},handler:{id:'test-ship',version:'1'}},failures:[{code:'NOT_READY',message:'Not ready',retryable:false}],authorization:{kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:['shipper']},attribution:{subject:'person-required'},atomicity:'single-store',idempotency:'caller-key-optional',result:{identities:'created-and-changed',version:'store-opaque',receipt:'read-at-least'}}]}});
 });
 const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('candidate');const actions=r.files.find(f=>f.path==='shop/actions.py')!.text;expect(actions).toContain('document_sha256="'+new Bun.CryptoHasher('sha256').update(req.sources[0]!.text).digest('hex')+'"');expect(actions).toContain('invocation_id="umf.actions.tx"');expect(actions).toContain('class Actions:');expect(actions).toContain('ship_order: ActionEndpoint[ShipOrderInput, ShipOrderOutput]');expect(actions).toContain('class ShipOrderInput');expect(actions).toContain('class ShipOrderOutput');expect(actions).toContain('class ShipOrderRejected');expect(actions).toContain('Literal["NOT_READY", "ENTITY_MISSING"]');expect(actions).toContain('order: OrderKey');expect(actions).toContain('memo:');expect(r.obligations.some(o=>o.owner==='engine')).toBe(true);
 });
// @covers US-080-AC1
 test('generated DSL metadata keeps IDs, authored names and Python names separate',()=>{
 const req=request();req.records=[{module:'schemaId',element:'recordId'}];
 mutateSource(req,d=>{
  const walk=(v:unknown)=>{if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v)){if(k==='module'&&x==='commerce')(v as Record<string,unknown>)[k]='schemaId';else if(k==='element'&&x==='Order')(v as Record<string,unknown>)[k]='recordId';else walk(x);}}};walk(d);
  d.modules[0]!.id='schemaId';d.modules[0]!.namespace='logical.ns';Object.assign(d.modules[0]!.elements[0]!,{name:'Key "Shown"'});Object.assign(d.modules[0]!.elements[5]!,{id:'recordId',name:'Order "Ledger"'});
 });
 req.names=[{sourceId:'logical',pointer:'/modules/0/elements/0',python:'python_identity'},{sourceId:'logical',pointer:'/modules/0/elements/5',python:'PythonOrder'}];
 const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('candidate');const fields=r.files.find(f=>f.path==='shop/fields.py')!.text;expect(fields).toContain('logical_namespace="logical.ns"');expect(fields).toContain('logical_name="Order \\"Ledger\\""'.replace(/\\\\/g,'\\'));expect(fields).toContain('field="orderId"');expect(fields).toContain('python_identity: Column[PythonOrder, str]');
 });
// @covers US-080-AC4
 test('keyless Records refuse and explicit selection preserves alternate Key identities',()=>{
 const missing=request();mutateSource(missing,d=>{delete (d.modules[0]!.elements[5]! as {keys?:unknown}).keys;});const a=generateAccessPackage(missing,profile());expect(a.outcome).toBe('refused');expect(a.diagnostics.some(d=>d.code==='LOSS'&&d.pointer.endsWith('/keys'))).toBe(true);
 const multiple=request();mutateSource(multiple,d=>{const r=d.modules[0]!.elements[5]! as unknown as {keys:unknown[]};r.keys.push({id:'revision-key',name:'Revision identity',fields:[{module:'commerce',element:'revision'}],primary:false});});const b=generateAccessPackage(multiple,profile());expect(b.outcome).toBe('candidate');expect(b.files.find(f=>f.path==='shop/keys.py')!.text).toContain('class OrderRevisionKeyKey');
 });
// @covers US-080-AC3
 test('refused missing view retains selected census and unknown fidelity is explicit',()=>{
 const missing=request();mutateSource(missing,d=>{d.modules[0]!.extensions['umf.access'].views=[];});expect(generateAccessPackage(missing,profile()).dispositions.some(d=>d.relevance==='selected'&&d.pointer.endsWith('/kind'))).toBe(true);
 const unknown=request();mutateSource(unknown,d=>Object.assign(d.modules[0]!.elements[5]!,{opaqueSelected:{retained:true}}));const r=generateAccessPackage(unknown,profile());expect(r.dispositions.some(d=>d.pointer.includes('/opaqueSelected')&&d.fidelity==='unknown'&&d.checks.length===0)).toBe(true);
 });
// @covers US-080-AC3
 test('nested item Fields validate containers without becoming row attributes',()=>{
 const req=request();mutateSource(req,d=>{
  const m=d.modules[0]!;m.elements.push({id:'tags',kind:'field',cardinality:'array',itemType:{module:'commerce',element:'tagItem'},nullability:'required',facets:{collectionSize:{min:1,max:3}},extensions:{}} as never,{id:'tagItem',kind:'field',cardinality:'one',scalarType:'string',nullability:'required',extensions:{}} as never);
  (m.elements[5]! as unknown as {members:unknown[]}).members.push({module:'commerce',element:'tags'});
  const fields=m.extensions['umf.access'].views[0]!.fields;fields.push({field:{module:'commerce',element:'tags'},row:{missing:false,null:false},create:{missing:false,null:false},mutable:true,generated:false} as never,{field:{module:'commerce',element:'tagItem'},row:{missing:false,null:false},create:{missing:false,null:false},mutable:false,generated:false} as never);
 });
 const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('candidate');const models=r.files.find(f=>f.path==='shop/models.py')!.text;expect(models).toContain('tags:');expect(models).not.toContain('    tag_item:');expect(models).toContain('list[');expect(models).toContain('minimum=1');
 });
// @covers US-080-AC6
 test('generated column attributes document the exact source pointer',()=>{
 const r=generateAccessPackage(request(),profile()),fields=r.files.find(f=>f.path==='shop/fields.py')!.text;
 expect(fields).toContain('UMF source logical#/modules/0/elements/1');expect(r.symbols.some(s=>s.symbol==='Order.c.amount'&&s.pointer==='/modules/0/elements/1')).toBe(true);
 });
// @covers US-080-AC4
 test('mutable Update declarations admit typed Params without admitting MISSING or immutable fields',()=>{
 const r=generateAccessPackage(request(),profile()),fields=r.files.find(f=>f.path==='shop/fields.py')!.text;const update=fields.slice(fields.indexOf('class OrderUpdate'),fields.indexOf('class OrderQuery'));
 expect(update).toContain('memo: str | None | Param[str | None]');expect(update).toContain('amount: Decimal | Param[Decimal]');expect(update).not.toContain('MISSING');expect(update).not.toContain('placed_at');expect(update).not.toContain('revision');
 });
// @covers US-080-AC3
 test('entity action parameters reach an unselected Record Key without generating its row',()=>{
 const req=request();req.sources[0]!.text=JSON.stringify(require('../../fixtures/access/commerce/actions.json'));req.actions=[{module:'commerce',action:'shipOrder'}];
 mutateSource(req,d=>{const payload=d.modules[0]!.extensions as unknown as {'umf.actions':{actions:{parameters:{target?:{module:string;element:string;key:string}}[]}[]}};payload['umf.actions'].actions[0]!.parameters[0]!.target={module:'commerce',element:'Customer',key:'Customer-key'};});
 const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('candidate');expect(r.files.find(f=>f.path==='shop/actions.py')!.text).toContain('order: CustomerKey');expect(r.files.find(f=>f.path==='shop/models.py')!.text).not.toContain('class Customer(');
 });
// @covers US-080-AC4
 test('per-source core resource limit returns a LIMIT report with no files',()=>{
 const req=request();req.sources[0]!.text=' '.repeat(4000001);const r=generateAccessPackage(req,profile());expect(r.outcome).toBe('refused');expect(r.files).toEqual([]);expect(r.diagnostics.some(d=>d.code==='LIMIT')).toBe(true);expect(r.inputDigest).toMatch(/^[a-f0-9]{64}$/);
 });
// @covers US-080-AC1
 test('source maps have deterministic document/pointer order without changing Key order',()=>{
 const req=request();req.records.push({module:'commerce',element:'OrderLine'});const r=generateAccessPackage(req,profile());expect(r.symbols[0]!.symbol).toBe('BUNDLE_INPUT_DIGEST');
 const pointers=[...new Set(r.symbols.map(s=>s.pointer))];expect(pointers.indexOf('/modules/0/elements/0')).toBeLessThan(pointers.indexOf('/modules/0/elements/1'));
 expect(r.files.find(f=>f.path==='shop/keys.py')!.text.indexOf('    line_order_id:')).toBeLessThan(r.files.find(f=>f.path==='shop/keys.py')!.text.indexOf('    line_number:'));
 });

// @covers US-080-AC2
 test('selectedKey is explicit and must identify this Records declared Key',()=>{
 expect(generateAccessPackage(request(),profile()).outcome).toBe('candidate');
 for(const invalid of [undefined,null,{module:'commerce',element:'Customer',key:'order-key'},{module:'foreign',element:'Order',key:'order-key'},{module:'commerce',element:'Order',key:'unknown'},{module:'commerce',element:'Order',key:'order-key',unknown:true}]){
  const req=request();mutateSource(req,d=>{const view=d.modules[0]!.extensions['umf.access'].views[0]! as unknown as Record<string,unknown>;if(invalid===undefined)delete view.selectedKey;else view.selectedKey=invalid;});
  const result=generateAccessPackage(req,profile());expect(result.outcome).toBe('refused');expect(result.files).toEqual([]);
  expect(result.diagnostics.some(d=>d.accessCode==='ACCESS_REFERENCE'&&d.pointer.endsWith('/selectedKey'))).toBe(true);
 }
 });

// @covers US-081-AC8
test('generated validators and codecs delegate to shared runtime algorithms',()=>{
 const result=generateAccessPackage(request(),profile());
 const models=result.files.find(f=>f.path==='shop/models.py')!.text;
 const codecs=result.files.find(f=>f.path==='shop/codecs.py')!.text;
 expect(models).toContain('FieldValidator(');
 expect(models).not.toContain('def validate_field_');
 expect(models).not.toContain('raise ');
 expect(models).not.toContain('def __init_subclass__');
 expect(codecs).not.toContain('if ');
 expect(codecs).not.toContain('astimezone(');
 expect(codecs).toContain('return encode_model(');
 expect(codecs).toContain('return decode_model(');
});

// @covers US-080-AC2
 test('Field reused as an item must satisfy owned and nested occurrence rules',()=>{
 for(const field of ['memo','amount']){
  const req=request();mutateSource(req,d=>{
   const m=d.modules[0]!;
   m.elements.push({id:'values',kind:'field',cardinality:'array',itemType:{module:'commerce',element:field},nullability:'required',extensions:{}} as never);
   (m.elements[5]! as unknown as {members:unknown[]}).members.push({module:'commerce',element:'values'});
   const fields=m.extensions['umf.access'].views[0]!.fields;
   fields.push({field:{module:'commerce',element:'values'},row:{missing:false,null:false},create:{missing:false,null:false},mutable:true,generated:false} as never);
   if(field==='amount')fields.find(f=>f.field.element==='amount')!.mutable=false;
  });
  const result=generateAccessPackage(req,profile());
  expect(result.outcome).toBe(field==='amount'?'candidate':'refused');
  if(field==='memo')expect(result.diagnostics.some(d=>d.accessCode==='ACCESS_CONFLICT')).toBe(true);
 }
 });

// @covers US-080-AC4
test('nested-only item Fields cannot be selected as row projection columns',()=>{
 const req=request();req.projections=[{name:'itemProjection',record:req.records[0]!,fields:[{module:'commerce',element:'tagItem'}]}];
 mutateSource(req,d=>{
  const m=d.modules[0]!;
  m.elements.push({id:'tags',kind:'field',cardinality:'array',itemType:{module:'commerce',element:'tagItem'},nullability:'required',extensions:{}} as never,{id:'tagItem',kind:'field',cardinality:'one',scalarType:'string',nullability:'required',extensions:{}} as never);
  (m.elements.find(e=>e.id==='Order')! as unknown as {members:unknown[]}).members.push({module:'commerce',element:'tags'});
  m.extensions['umf.access'].views[0]!.fields.push({field:{module:'commerce',element:'tags'},row:{missing:false,null:false},create:{missing:false,null:false},mutable:true,generated:false} as never,{field:{module:'commerce',element:'tagItem'},row:{missing:false,null:false},create:{missing:false,null:false},mutable:false,generated:false} as never);
 });
 const result=generateAccessPackage(req,profile());expect(result.outcome).toBe('refused');expect(result.files).toEqual([]);expect(result.diagnostics.some(d=>d.code==='REFERENCE'&&d.pointer==='/projections')).toBe(true);
});

// @covers US-081-AC8; shared codec calls and generated final metadata.
test('generated codecs delegate to the runtime and update has explicit keywords',()=>{
 const result=generateAccessPackage(request(),profile());
 expect(result.outcome).toBe('candidate');
 const codecs=result.files.find(f=>f.path==='shop/codecs.py')!.text;
 expect(codecs).toContain('return encode_model(OrderPatch, value, _codec_OrderPatch)');
 expect(codecs).toContain('return decode_model(Order, columns, row, _codec_Order)');
 expect(codecs).not.toMatch(/\b(if|raise|for|while|try)\b/);
 const models=result.files.find(f=>f.path==='shop/models.py')!.text;
 expect(models).toContain('UMF_FINAL: ClassVar[bool] = True');
 expect(models).not.toContain('def __init_subclass__');
 const fields=result.files.find(f=>f.path==='shop/fields.py')!.text;
 expect(fields).toContain('def update(self, *,');
 expect(fields).not.toContain('**values');
});
// @covers US-080-AC3; owner-approved initial exact-only policy.
test('both initial modes refuse unsupported selected carriers without partial code',()=>{
 for(const mode of ['strict','report'] as const){
  const input=request();input.mode=mode;
  mutateSource(input,d=>{const f=d.modules[0]!.elements[1]!;Object.assign(f,{scalarType:'float'});delete (f as {facets?:unknown}).facets;});
  const result=generateAccessPackage(input,profile());
  expect(result.outcome).toBe('refused');expect(result.files).toEqual([]);
  expect(result.diagnostics.some(d=>d.code==='LOSS')).toBe(true);
 }
});

// @covers US-080-AC2 US-081-AC4
 test('selectedKey is explicit, resolved and independent of declaration order',()=>{
  for(const selection of [undefined,{module:'commerce',element:'Order',key:'not-declared'},{module:'other',element:'Order',key:'order-key'}]){
   const q=request();mutateSource(q,d=>{const view=d.modules[0]!.extensions['umf.access'].views[0]! as {selectedKey?:unknown};if(selection===undefined)delete view.selectedKey;else view.selectedKey=selection;});
   const result=generateAccessPackage(q,profile());expect(result.outcome).toBe('refused');expect(result.diagnostics.some(d=>d.pointer.endsWith('/selectedKey'))).toBe(true);
  }
  const q=request();mutateSource(q,d=>{
   const record=d.modules[0]!.elements[5]! as unknown as {keys:unknown[]};record.keys.unshift({id:'alternate',name:'Alternate',fields:[{module:'commerce',element:'revision'}],primary:false});
  });
  const result=generateAccessPackage(q,profile());expect(result.outcome).toBe('candidate');
  const keys=result.files.find(f=>f.path==='shop/keys.py')!.text;
  expect(keys).toContain('class OrderAlternateKey');expect(keys).toContain('"key": "order-key"');
 });

// @covers US-080-AC4 -- local codec keys are unqualified Field IDs.
test('cross-module duplicate wire Field IDs refuse instead of overwriting codecs',()=>{
 const q=request();q.projections=[{name:'bothAmounts',record:q.records[0]!,fields:[{module:'commerce',element:'amount'},{module:'other',element:'amount'}]}];q.names=[{sourceId:'logical',pointer:'/modules/1/elements/0',python:'other_amount'}];
 mutateSource(q,d=>{
  d.modules.push({id:'other',namespace:'other',elements:[{id:'amount',kind:'field',cardinality:'one',scalarType:'decimal',nullability:'required',facets:{precision:12,scale:2},extensions:{}}],extensions:{}} as never);
  (d.modules[0]!.elements.find(e=>e.id==='Order')! as unknown as {members:unknown[]}).members.push({module:'other',element:'amount'});
  d.modules[0]!.extensions['umf.access'].views[0]!.fields.push({field:{module:'other',element:'amount'},row:{missing:false,null:false},create:{missing:false,null:false},mutable:true,generated:false} as never);
 });
 const r=generateAccessPackage(q,profile());expect(r.outcome).toBe('refused');expect(r.files).toEqual([]);expect(r.diagnostics.some(d=>d.code==='REFERENCE'&&d.pointer.endsWith('/members'))).toBe(true);expect(r.diagnostics.some(d=>d.code==='REFERENCE'&&d.pointer==='/projections')).toBe(true);
});

// @covers US-080-AC2 -- CONTRACT-070 complete nested null alternatives.
test('nullable item view cannot narrow create null independently of row null',async()=>{
 const q=request();q.sources[0]!.text=await Bun.file(new URL('../../fixtures/access/commerce/containers.json',import.meta.url)).text();
 expect(generateAccessPackage(q,profile()).outcome).toBe('candidate');
 mutateSource(q,d=>{d.modules[0]!.extensions['umf.access'].views[0]!.fields.find(f=>f.field.element==='labelItem')!.create.null=false;});
 const r=generateAccessPackage(q,profile());expect(r.outcome).toBe('refused');expect(r.files).toEqual([]);expect(r.diagnostics.some(d=>d.accessCode==='ACCESS_CONFLICT')).toBe(true);
});
