// SPDX-License-Identifier: MIT OR Apache-2.0
/** Public schema load -> CLI generation -> installed Python creation -> codec round trip.
 * @covers US-080-AC1 US-080-AC2 US-080-AC5 US-081-AC1 US-081-AC2 US-081-AC3 US-081-AC5
 */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,mkdir,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {writeAccessPackage,checkAccessPackage} from './umf-access-generate';
import type {AccessResult} from '../src/compilation/ir';
import {readDocument,writeDocument,validateCoreRecordValues} from '../src/index';
import {request,profile} from '../tests/compilation/access-fixtures';
const options=new Map<string,string>();for(let i=2;i<process.argv.length;i+=2)options.set(process.argv[i]!,process.argv[i+1]!);
const python=options.get('--python'),wheel=options.get('--wheel'),report=options.get('--report');
if(!python||!wheel||!report)throw Error('Required: --python <installed pinned environment> --wheel <source-verified wheel> --report <JSON>');
const root=resolve(import.meta.dir,'..'),work=await mkdtemp(join(await realpath(tmpdir()),'umf-access-e2e-'));
const commands:unknown[]=[],outcomes:unknown[]=[];
const rustEntry=options.get('--rust-node-entry');
let rustEngine:{generateAccessPackage(request:unknown,profile:unknown):unknown}|undefined;
if(rustEntry){
 const binding=await import(pathToFileURL(resolve(rustEntry)).href);
 const paths={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json',tablesPackage:'spec/extensions/tables/package.json',actionsPackage:'spec/extensions/actions/package.json',bindingPackage:'spec/extensions/binding/package.json',stableBindingPackage:'spec/extensions/binding-stable/package.json'};
 const resources=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([name,path])=>[name,JSON.parse(await readFile(resolve(root,path),'utf8'))])));
 rustEngine=binding.createCodegenEngine(resources);
}

async function execute(label:string,args:string[],expected=0){
 if(rustEngine&&args[0]==='bun'&&args[1]===root+'/scripts/umf-access-generate.ts'){
  let exit=0,stdout='',stderr='';
  try{
   const flags=new Map<string,string>();for(let i=3;i<args.length;i+=2)flags.set(args[i]!,args[i+1]!);
   const request=JSON.parse(await readFile(flags.get('--request')!,'utf8')),profile=JSON.parse(await readFile(flags.get('--profile')!,'utf8'));
   const candidate=rustEngine.generateAccessPackage(request,profile) as AccessResult;
   if(candidate.outcome!=='candidate')throw Error('GENERATION_REFUSED');
   if(args[2]==='generate')await writeAccessPackage(flags.get('--output')!,candidate);
   else if(args[2]==='check'){const drift=await checkAccessPackage(flags.get('--output')!,candidate);if(drift.length)throw Error('OUTPUT_CHANGED');}
   else throw Error('Unknown qualification writer mode');
  }catch(error){exit=1;stderr=String(error);}
  commands.push({label,args:['RustNode.generateAccessPackage + host writer',...args.slice(2)],exit,expected,stdout,stderr});
  assert.equal(exit,expected,label+': '+stderr);return stdout;
 }
 const child=Bun.spawn(args,{cwd:root,stdout:'pipe',stderr:'pipe'});const [exit,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);commands.push({label,args,exit,expected,stdout,stderr});assert.equal(exit,expected,label+': '+stderr);return stdout;
}
async function inventory(path:string):Promise<Record<string,string>>{const result:Record<string,string>={};async function walk(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())await walk(p);else result[p.slice(path.length+1)]=createHash('sha256').update(await readFile(p)).digest('hex');}}await walk(path);return result;}
try{
 for(const fixture of ['engine-only','containers','alternate-key']){
  const doc=readDocument(await Bun.file(root+'/fixtures/access/commerce/'+(fixture==='alternate-key'?'engine-only':fixture)+'.json').text(),'json');
  // Author a genuinely non-temporal selected schema, retaining the unselected
  // timestamp Field in the original document rather than dropping its meaning.
  const order=doc.modules[0]!.elements.find(e=>e.id==='Order')!;
  if(fixture==='alternate-key')(order.keys as unknown[]).unshift({id:'alternate',name:'Alternate',fields:[{module:'commerce',element:'revision'}],primary:false});
  order.members=(order.members as {module:string;element:string}[]).filter(f=>f.element!=='placedAt');
  const access=doc.modules[0]!.extensions!['umf.access'] as unknown as {views:{record:{element:string};fields:{field:{element:string}}[]}[]};
  const view=access.views.find(v=>v.record.element==='Order')!;view.fields=view.fields.filter(f=>f.field.element!=='placedAt');
  const source=writeDocument(doc,'json');assert.deepEqual(JSON.parse(JSON.stringify(readDocument(writeDocument(doc,'yaml'),'yaml'))),JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(JSON.parse(JSON.stringify(readDocument(source,'json'))),JSON.parse(JSON.stringify(doc)));
  for(const bad of ['{','{"umf":"0.8.0",'+source.trim().slice(1),JSON.stringify({...doc,umf:'future'})])assert.throws(()=>readDocument(bad,'json'));
  const q=request();q.sources[0]!.text=source;q.package='e2e_shop';if(fixture==='alternate-key')q.records.push({module:'commerce',element:'Customer'});q.names=[{sourceId:'logical',pointer:'/modules/0/elements/0',python:'order_id'}];if(fixture==='alternate-key')q.names.push({sourceId:'logical',pointer:'/modules/0/elements/6',python:'order_id'});
  const p=profile();p.python.version='3.11.17';p.dependencies=[{distribution:'umf_access',version:'0.1.0.dev0'},{distribution:'pydantic',version:'2.14.1'}];
  const dir=join(work,fixture);await mkdir(dir);const output=join(dir,'output'),requestPath=join(dir,'request.json'),profilePath=join(dir,'profile.json');await writeFile(requestPath,JSON.stringify(q));await writeFile(profilePath,JSON.stringify(p));
  const args=['bun',root+'/scripts/umf-access-generate.ts'];const flags=['--request',requestPath,'--profile',profilePath,'--output',output];
  await execute(fixture+'-generate',[...args,'generate',...flags]);await execute(fixture+'-check',[...args,'check',...flags]);
  const before=await inventory(output);
  const code=`import sys,json,zipfile,hashlib,importlib.metadata as metadata
from pathlib import Path
from decimal import Decimal
assert sys.version.split()[0] in ('3.11.17','3.14.8')
assert metadata.version('pydantic')=='2.14.1'
import umf_access
site=Path(umf_access.__file__).parent.parent
with zipfile.ZipFile(${JSON.stringify(resolve(wheel))}) as archive:
 for name in archive.namelist():
  if name.startswith('umf_access/') and not name.endswith('/'):
   assert (site/name).read_bytes()==archive.read(name),name
sys.path.insert(0,${JSON.stringify(output)})
import e2e_shop
from e2e_shop import Order,OrderCreate,OrderPatch,OrderKey
from e2e_shop.codecs import encode_Order_create,encode_Order_patch,decode_Order
from pydantic import MISSING
checks=[]
def refuses(label,call):
 try: call()
 except (ValueError,TypeError) as error:
  assert 'private-invalid-value' not in str(error)
  checks.append(label)
 else: raise AssertionError(label+' accepted')
base={'order_id':'o-1','amount':Decimal('1.200')}
containers=${fixture==='containers'?'True':'False'}
if containers: base.update(tags=['a'],labels={'a':'ok'})
created=OrderCreate(**base)
encoded=encode_Order_create(created)
assert encoded['orderId']=='o-1' and encoded['amount'].as_tuple()==Decimal('1.200').as_tuple()
assert 'revision' not in encoded and 'memo' not in encoded
assert encode_Order_patch(OrderPatch())=={}
assert encode_Order_patch(OrderPatch(memo=None))=={'memo':None}
assert encode_Order_patch(OrderPatch(amount=Decimal('1.20')))['amount'].as_tuple()==Decimal('1.20').as_tuple()
checks += ['create','exact-decimal-coefficient','missing-omission','explicit-null','empty-patch','valid-patch']
for label,kwargs in [('missing-key',{'amount':Decimal('1.2')}),('missing-required',{'order_id':'o-1'}),('wrong-decimal',base|{'amount':'private-invalid-value'}),('rounding',base|{'amount':Decimal('1.234')}),('nonfinite',base|{'amount':Decimal('NaN')}),('generated-create',base|{'revision':1}),('unknown-field',base|{'unknown':1})]:
 refuses(label,lambda kwargs=kwargs:OrderCreate(**kwargs))
refuses('null-nonnullable',lambda:OrderPatch(amount=None))
refuses('immutable-key',lambda:OrderPatch(order_id='changed'))
refuses('sealed-generated-class',lambda:type('Bypass',(Order,),{}))
refuses('unhashable-key',lambda:hash(OrderKey(order_id='o-1')))
assert list(OrderKey.model_fields)==['order_id']
if ${fixture==='alternate-key'?'True':'False'}:
 from e2e_shop.keys import OrderAlternateKey,CustomerKey
 from umf_access.types import StrictModel
 from umf_access.codec_support import revalidate_model
 class Holder(StrictModel):
  key:OrderKey
 refuses('wrong-exact-key',lambda:revalidate_model(Holder,Holder.model_construct(key=OrderAlternateKey(revision=1))))
 assert list(CustomerKey.model_fields)==list(OrderKey.model_fields)==['order_id']
 refuses('same-shaped-foreign-generated-key',lambda:revalidate_model(Holder,Holder.model_construct(key=CustomerKey(order_id='o-1'))))
 checks.append('explicit-key-selection-despite-declaration-order')
refuses('construct-bypass',lambda:encode_Order_patch(OrderPatch.model_construct(amount='private-invalid-value')))
refuses('copy-bypass',lambda:encode_Order_patch(OrderPatch().model_copy(update={'amount':'private-invalid-value'})))
row_values=encoded|{'memo':None,'revision':1}
columns=list(reversed(list(row_values)))
row=decode_Order(columns,[row_values[column] for column in columns])
assert row.order_id==created.order_id and row.amount.as_tuple()==created.amount.as_tuple() and row.memo is None
checks.append('decode-reordered-row')
for label,columns,values in [('duplicate-columns',['orderId','orderId'],['a','b']),('missing-columns',[],[]),('extra-column',list(row_values)+['other'],list(row_values.values())+[1]),('row-cardinality',list(row_values),[])]:
 refuses(label,lambda columns=columns,values=values:decode_Order(columns,values))
refuses('invalid-row',lambda:decode_Order(list(row_values),list((row_values|{'amount':'private-invalid-value'}).values())))
if containers:
 refuses('empty-array',lambda:OrderCreate(**(base|{'tags':[]})))
 refuses('null-array-item',lambda:OrderCreate(**(base|{'tags':[None]})))
 refuses('missing-map-value',lambda:OrderCreate(**(base|{'labels':{'a':MISSING}})))
 created.tags.append('private-invalid-value')
 created.tags.append(1)
 refuses('post-creation-nested-mutation',lambda:encode_Order_create(created))
 value=OrderCreate(**(base|{'tags':['a']}))
 copied=encode_Order_create(value)
 assert copied['tags'] is not value.tags and copied['labels'] is not value.labels
 checks.append('nested-container-copy')
print(json.dumps({'checks':checks,'count':len(checks),'python':sys.version.split()[0],'encoded':{'orderId':{'string':'o-1'},'amount':{'decimalToken':str(encoded['amount'])},'revision':{'integerToken':'1'},'memo':None},'loaded':str(Path(e2e_shop.__file__).resolve())}))
`;
  const observed=JSON.parse(await execute(fixture+'-create-decode',[''+python,'-I','-B','-c',code]));
  assert.deepEqual(await inventory(output),before);
  // Cross-check actual created Python scalar values through the public UMF oracle.
  const scalarEntries=Object.entries(observed.encoded).map(([element,value])=>({field:{module:'commerce',element},state:'present' as const,value}));
  // A scalar-only projection retains the source Record/key and core obligations;
  // container values are checked by the actual generated codec above.
  if(fixture==='engine-only'){
   const validated=validateCoreRecordValues(readDocument(source,'json'),{module:'commerce',element:'Order'},scalarEntries as Parameters<typeof validateCoreRecordValues>[2]);
   assert.equal(validated.validation.valid,true);assert.equal(validated.fields.length,4);
  }
  // Invalid schema load through the actual CLI must not change already emitted files.
  await writeFile(requestPath,JSON.stringify({...q,sources:[{...q.sources[0],text:'{'}]}));
  await execute(fixture+'-invalid-schema-refuses',[...args,'generate',...flags],1);assert.deepEqual(await inventory(output),before);
  outcomes.push({fixture,...observed,sourceSha256:createHash('sha256').update(source).digest('hex'),inventory:before});
 }
 await Bun.write(report,JSON.stringify({status:'pass',scope:rustEngine?'public schema load and Rust Node generation plus host writer to installed Python creation/codec round trip; no production CLI cutover, database/native or temporal qualification':'public schema load and CLI generation to real installed Python creation, validation and codec round trip; no database/native or temporal qualification',work,wheelSha256:createHash('sha256').update(new Uint8Array(await Bun.file(wheel).arrayBuffer())).digest('hex'),outcomes,commands},null,2)+'\n');
 console.log(JSON.stringify({status:'pass',cases:outcomes.length,report}));
}catch(error){await Bun.write(report,JSON.stringify({status:'fail',work,outcomes,commands,error:String(error)},null,2)+'\n');throw error;}
