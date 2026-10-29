// SPDX-License-Identifier: MIT OR Apache-2.0
/** @covers US-089-AC19 @covers US-089-AC20 @covers US-089-AC24 */
import {afterAll,beforeAll,describe,test,expect} from 'bun:test';
import {nativeMetamodelExecutable} from '../../scripts/metamodel/rust';
import {readFile,mkdtemp,mkdir,writeFile,copyFile,symlink,readdir,stat,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {compileModel,parseModel} from '../../scripts/metamodel/compile';
import {checkShape,emitShape} from '../../scripts/metamodel/grammar';
import {checkConstraintProgram,executeConstraints} from '../../src/validation/constraint-kernel';
import Ajv from 'ajv/dist/2020';
import coreInput from '../../spec/core/schema.json';
import referenceInput from '../../spec/core/semantic-type-reference.schema.json';
import {createValidator,installJsonEquality} from '../../src/validation/schema';
import {validateDocument} from '../../src/validation/document';
import {domainPolicy} from '../../src/generated/core-model';
import {literalErrors,prepareLiteralPolicy} from '../../src/validation/literal-kernel';
import {Registry} from '../../src/registry/registry';
import {rustCompilePackages,rustCompileResources} from '../../scripts/metamodel/source-closure';
const root=resolve(import.meta.dir,'../..'),authored=await Bun.file(join(root,'spec/metamodel/umf.yaml')).text(),model=()=>parseModel(authored);
async function packageSources(directory:string):Promise<string[]>{
 const files:string[]=[];
 async function visit(path:string):Promise<void>{for(const entry of await readdir(join(root,path),{withFileTypes:true})){if(['target','node_modules','.git','__pycache__'].includes(entry.name))continue;const child=path+'/'+entry.name;if(entry.isDirectory())await visit(child);else if(entry.isFile())files.push(child);}}
 await visit(directory);return files;
}
const doc:any={umf:'0.10.0',id:'x',vocabularies:{},modules:[]};
const expr=(op:string,...args:any[])=>({op,args}),v=(name:string)=>({var:name});
const program=(steps:any[])=>({profile:'umf.constraints/1',steps});
const diagnostic={code:'PROBE',path:'',message:'probe',severity:'warning' as const};
describe('closed authored compiler vocabulary',()=>{
 // Qualify one immutable native compiler from this source cohort, then use it
 // for value-level assertions. Repeated source discovery is build work, not a
 // semantic assertion. The separate clean-room test explicitly removes this
 // override and still builds/attests its own compiler from the copied sources.
 const previousCompiler=process.env.UMF_METAMODEL_CLI;
 beforeAll(()=>{process.env.UMF_METAMODEL_CLI=nativeMetamodelExecutable();},120_000);
 afterAll(()=>{
  if(previousCompiler===undefined)delete process.env.UMF_METAMODEL_CLI;
  else process.env.UMF_METAMODEL_CLI=previousCompiler;
 });
 test('preserves exact numeric admission independently of generated files',()=>{for(const source of ['x: 0.10000000000000001','x: 9007199254740992','x: -0','x: &a [1]\ny: *a','x: 1\nx: 2','x: !!str 1'])expect(()=>parseModel(source)).toThrow();expect(parseModel('x: 0.1').x).toBe(.1);});
 test('rejects malformed shapes and unknown/dangling declarations',()=>{for(const shape of [{tag:'unknown'},{tag:'link'},{tag:'choice'},{tag:'conditional',condition:true},{tag:'text',rawSchema:{type:'string'}}])expect(()=>checkShape(shape)).toThrow();expect(()=>emitShape({tag:'link',target:'urn:unregistered'},new Set())).toThrow();});
 test('rejects malformed or unknown instructions in untaken and empty branches',()=>{for(const op of ['callValidator','constructor','toString','__proto__']){expect(()=>checkConstraintProgram(program([{op:'if',test:false,then:[{op:'let',name:'x',value:{op,args:[]}}]}]))).toThrow();expect(()=>checkConstraintProgram(program([{op:'for',each:[],as:'x',body:[{op}]}]))).toThrow();}for(const value of [{op:'get',args:[]},{op:'eq',args:[1],surprise:true},{op:'map',args:[[]],as:'x'}])expect(()=>checkConstraintProgram(program([{op:'let',name:'x',value}]))).toThrow();const cycle:any={};cycle.self=cycle;for(const value of [()=>1,Symbol(),undefined,cycle])expect(()=>checkConstraintProgram(program([{op:'let',name:'x',value}]))).toThrow();});
 test('hostile own names remain data and inherited paths are invisible',()=>{const hostile=program([{op:'let',name:'__proto__',value:'own'},{op:'let',name:'constructor',value:'safe'},{op:'emit',when:expr('and',expr('eq',v('__proto__'),'own'),expr('eq',v('constructor'),'safe'),expr('not',expr('has',{},['__proto__','toString']))),diagnostic}]);expect(executeConstraints(doc,hostile,domainPolicy)).toEqual([diagnostic]);expect(({} as any).safe).toBeUndefined();});
 test('admission reuse only accepts an immutable owned policy snapshot',()=>{const raw:any=structuredClone(domainPolicy.literal),prepared=prepareLiteralPolicy(raw),field:any={id:'u',kind:'field',scalarType:'uuid',extensions:{}},value={uuid:'00000000-0000-0000-0000-000000000000'};expect(literalErrors(doc,field,value,true,raw)).toEqual([]);raw.families.uuid.mechanic='callValidator';expect(()=>literalErrors(doc,field,value,true,raw)).toThrow();expect(literalErrors(doc,field,value,true,prepared)).toEqual([]);expect(Object.isFrozen(prepared.families.uuid)).toBe(true);expect(()=>{prepared.families.uuid.mechanic='callValidator';}).toThrow();});
 test('inherited policy map names never acquire literal or container meaning',()=>{
  for(const key of ['toString','constructor','__proto__']){
   const family:any={id:'f',kind:'field',scalarType:key,extensions:{}};
   expect(literalErrors(doc,family,{undefined:'x'},true,domainPolicy.literal)[0]!.message).toBe(domainPolicy.literal.errors.family.message);
   const container:any={id:'f',kind:'field',scalarType:'string',cardinality:key,extensions:{}};
   expect(literalErrors(doc,container,{string:'x'},true,domainPolicy.literal)[0]!.message).toBe(domainPolicy.literal.errors.cardinality.message);
  }
 });
 test('mutable public programs are readmitted after a previous successful execution',()=>{const input=program([]);expect(executeConstraints(doc,input,{})).toEqual([]);input.steps.push({op:'callValidator'});expect(()=>executeConstraints(doc,input,{})).toThrow();});
 test('resource IDs and caller aliases share one immutable schema snapshot',()=>{const validator=createValidator(),core=structuredClone(coreInput),ref=structuredClone(referenceInput);validator.addSchema(ref,'caller/reference');validator.addSchema(core,'caller/core');const first=validator.getSchema(core.$id)!;expect(first(doc)).toBe(true);validator.addSchema(structuredClone(core),'caller/second');expect(validator.getSchema('caller/second')).toBe(first);(core.properties.id as any).const='mutated';expect(first(doc)).toBe(true);expect(()=>validator.addSchema(core,'caller/third')).toThrow('Conflicting schema identity');expect(()=>validator.addSchema({...ref,title:'conflict'},'caller/reference')).toThrow('Conflicting schema identity');});
 test('a conflicting current reference resource refuses on every attempt',()=>{const validator=createValidator();validator.addSchema({...referenceInput,title:'conflicting caller resource'},'caller/conflict');for(let i=0;i<2;i++)expect(()=>validator.getSchema('unknown-resource')).toThrow('Conflicting schema identity');});
 test('cycles/accessors never invoke hidden host behavior',()=>{let called=false;const bad:any={};Object.defineProperty(bad,'op',{enumerable:true,get(){called=true;return 'set';}});expect(()=>checkConstraintProgram(program([{op:'let',name:'x',value:bad}]))).toThrow();expect(called).toBe(false);});
 test('authored presence mutation changes generated schema acceptance',()=>{const before=compileModel(model()),mutated=model(),id=mutated.modules[0].elements.find((e:any)=>e.extensions['umf.metamodel']?.definition==='id');id.extensions['umf.metamodel'].shape.min=2;const after=compileModel(mutated);const make=(r:any)=>{const validator=new Ajv({strict:true,allErrors:true,allowUnionTypes:true,ownProperties:true,validateFormats:false});installJsonEquality(validator);validator.addSchema(r.reference);return validator.compile(r.core);};expect(make(before)(doc)).toBe(true);expect(make(after)(doc)).toBe(false);});
 test('new authored member automatically changes known-property interpretation',()=>{const m=model(),before=compileModel(m),record=m.modules[0].elements.find((e:any)=>e.extensions['umf.metamodel']?.definition==='document');record.members.push({module:'umf',element:'document.reviewTag'});m.modules[0].elements.push({id:'document.reviewTag',name:'reviewTag',kind:'field',scalarType:'boolean',extensions:{'umf.metamodel':{presence:'optional'}}});const after=compileModel(m),source:any={...doc,reviewTag:true};expect(executeConstraints(source,before.constraints,before.domains).map(d=>d.code)).toEqual(['UNKNOWN_CORE_FIELD']);expect(executeConstraints(source,after.constraints,after.domains)).toEqual([]);expect(after.core.properties.reviewTag).toEqual({type:'boolean'});});
 test('authored rule diagnostics and eligibility change runtime behavior',()=>{const m=model(),before=compileModel(m);const bare:any={...doc,modules:[{id:'m',namespace:'',elements:[{id:'r',kind:'record',extensions:{},members:[{module:'m',element:'f'}],keys:[{id:'k',name:'k',fields:[{module:'m',element:'f'}]}]},{id:'f',kind:'field',scalarType:'boolean',nullability:'required',cardinality:'one',extensions:{}}]}]};expect(executeConstraints(bare,before.constraints,before.domains)).toEqual([]);m.extensions['umf.metamodel'].domains.keys.equalityFamilies=m.extensions['umf.metamodel'].domains.keys.equalityFamilies.filter((x:string)=>x!=='boolean');const after=compileModel(m);expect(executeConstraints(bare,after.constraints,after.domains).map(x=>x.code)).toEqual(['KEY_EQUALITY']);});
 test('model-declared refinement removal changes direct literals and default validation',()=>{
  for(const [selector,field,value]of [
   ['length',{scalarType:'string',facets:{length:{max:1,unit:'unicode-scalar'}}},{string:'xx'}],
   ['range',{scalarType:'integer',facets:{range:{min:{integerToken:'0'},max:{integerToken:'1'}}}},{integerToken:'2'}],
   ['allowedValues',{scalarType:'string',allowedValues:[{string:'a'}]},{string:'b'}],
  ] as any[]){const m=model(),before=compileModel(m),node:any={id:'f',kind:'field',extensions:{},...field},document:any={...doc,modules:[{id:'m',namespace:'',elements:[{...node,default:{on:'missing',value}}]}]};expect(literalErrors(document,node,value,true,before.domains.literal)).toHaveLength(1);expect(executeConstraints(document,before.constraints,before.domains).some(d=>d.severity==='error')).toBe(true);m.extensions['umf.metamodel'].domains.literal.refinements=m.extensions['umf.metamodel'].domains.literal.refinements.filter((r:any)=>!r.selector.includes(selector));const after=compileModel(m);expect(literalErrors(document,node,value,true,after.domains.literal)).toEqual([]);expect(executeConstraints(document,after.constraints,after.domains)).toEqual([]);}
 });
 test('unknown or malformed unused literal descriptors reject at compilation',()=>{for(const value of [{mechanic:'callValidator',enabled:false},{mechanic:'count-bounds',selector:[],applies:'scalar',mode:'always',phase:'before'}]){const m=model();m.extensions['umf.metamodel'].domains.literal.refinements.push(value);expect(()=>compileModel(m)).toThrow();}});
 test('every literal policy declaration is required and nested mechanics are closed',()=>{
  const literal=compileModel(model()).domains.literal;
  for(const key of Object.keys(literal)){const m=model();delete m.extensions['umf.metamodel'].domains.literal[key];expect(()=>compileModel(m)).toThrow();}
  const mutations=[
   (p:any)=>p.facetKeys=null,(p:any)=>p.itemReferenceKeys='itemType',(p:any)=>p.singular=[1],
   (p:any)=>p.facetGroups.length=null,(p:any)=>p.fields.role='',(p:any)=>delete p.itemLookup.moduleId,
   (p:any)=>p.containers.array.mechanic='callValidator',(p:any)=>delete p.containers.array.carrier,
   (p:any)=>p.families.boolean.equality='true',(p:any)=>delete p.families.string.refinements,
   (p:any)=>p.families.string.lengthUnit=1,(p:any)=>p.errors.object.severity='fatal',
   (p:any)=>p.errors.object.severity='info',
   (p:any)=>delete p.errors['numeric-token'],(p:any)=>p.errors.object.hostHandler='literal',
   (p:any)=>delete p.interval.qualifierKeys,(p:any)=>p.interval.omit='default',
   (p:any)=>p.interval.qualifierKeys.integerWidth=[false],(p:any)=>delete p.refinements[1].unitError,
  ];
  for(const mutate of mutations){const m=model();mutate(m.extensions['umf.metamodel'].domains.literal);expect(()=>compileModel(m)).toThrow();}
 },30_000);
 test('public metadata mutation cannot change default active validation',()=>{const before=validateDocument(doc),exposed=domainPolicy as any,saved=exposed.literal.refinements;try{exposed.literal.refinements=[];exposed.structuralDiagnostic.code='TAMPERED';expect(validateDocument(doc)).toEqual(before);expect(validateDocument({...doc,umf:'retired'}).diagnostics[0]!.code).toBe('SEMANTIC_TYPE_STRUCTURE');}finally{exposed.literal.refinements=saved;exposed.structuralDiagnostic.code='SEMANTIC_TYPE_STRUCTURE';}});
 test('current self-model validates with declared vocabulary and old markers reject',async()=>{const registry=new Registry().register(await Bun.file(join(root,'spec/metamodel/package.json')).json());expect(validateDocument(model(),registry).valid).toBe(true);for(const version of ['0.1.0','0.8.0','0.9.0'])expect(validateDocument({...doc,umf:version}).valid).toBe(false);expect(validateDocument(doc).complete).toBe(true);});
});
describe('clean source generation',()=>{
 let dir:string,manifest:any,initialStatus:number|null;
 const run=async(check=false)=>{
  const cleanEnv:Record<string,string|undefined>={...process.env,UMF_METAMODEL_CACHE_DIR:join(dir,'.compiler-cache')};delete cleanEnv.UMF_METAMODEL_CLI;
  const child=Bun.spawn([process.execPath,join(dir,'scripts/metamodel/build.ts'),...(check?['--check']:[]),'--output-root',dir],{cwd:dir,env:cleanEnv,stdout:'pipe',stderr:'pipe'});
  const [status,,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
  return {status,stderr};
 };
 // A cold Rust build is preparation. Its separate bound does not consume the
 // fixed-point/no-write assertions' existing 120-second execution budget.
 beforeAll(async()=>{
  dir=await mkdtemp(join(tmpdir(),'umf-metamodel-clean-'));
  manifest=await Bun.file(join(root,'spec/metamodel/generated/manifest.json')).json();
  const outputPaths=[...Object.keys(manifest.outputs),'spec/metamodel/generated/manifest.json'];
  const packageFiles=(await Promise.all(rustCompilePackages.map(packageSources))).flat();
  // A previously generated manifest can still list an output as a source.
  // Never copy such overlap into the clean fixture: generated outputs must be
  // rebuilt from authored inputs, and the newly emitted manifest must retire it.
  const declaredSources=new Set(Object.keys(manifest.sources).filter((path:string)=>!outputPaths.includes(path)));
  expect(packageFiles.filter((path:string)=>!declaredSources.has(path))).toEqual([]);
  const sourcePaths=[...new Set([...declaredSources,...rustCompileResources])];
  expect(sourcePaths.filter((path:string)=>outputPaths.includes(path))).toEqual([]);
  for(const path of outputPaths)expect(await Bun.file(join(dir,path)).exists()).toBe(false);
  await Promise.all([...new Set(sourcePaths.map(path=>dirname(join(dir,path))))].map(path=>mkdir(path,{recursive:true})));
  let next=0;
  await Promise.all(Array.from({length:Math.min(16,sourcePaths.length)},async()=>{
   while(next<sourcePaths.length){const path=sourcePaths[next++]!;await copyFile(join(root,path),join(dir,path));}
  }));
  await symlink(join(root,'node_modules'),join(dir,'node_modules'),'dir');
  const initial=await run();if(initial.status!==0)throw Error(initial.stderr);initialStatus=initial.status;
 },180_000);
 afterAll(async()=>{if(dir)await rm(dir,{recursive:true,force:true});},120_000);
 test('clean generation has no derived dependency; fixed point and no-write check enforce inventory',async()=>{
  expect(initialStatus).toBe(0);
  const generatedManifest=await Bun.file(join(dir,'spec/metamodel/generated/manifest.json')).json();
  const outputPaths=[...Object.keys(generatedManifest.outputs),'spec/metamodel/generated/manifest.json'];
  expect(Object.keys(generatedManifest.sources).filter((path:string)=>outputPaths.includes(path))).toEqual([]);
  const derivedResource='spec/core/cardinality-operation-v4.schema.json';
  expect(Object.hasOwn(generatedManifest.sources,derivedResource)).toBe(false);
  expect(await readFile(join(dir,derivedResource),'utf8')).toBe(await readFile(join(root,derivedResource),'utf8'));
  for(const path of rustCompileResources){const bytes=await readFile(join(root,path));expect(generatedManifest.sources[path]).toBe(createHash('sha256').update(bytes).digest('hex'));}
  const files=[...Object.keys(manifest.outputs),'spec/metamodel/generated/manifest.json'];
  const snapshots=await Promise.all(files.map(async path=>({path,text:await readFile(join(dir,path),'utf8'),mtime:(await stat(join(dir,path))).mtimeMs})));
  expect((await run(true)).status).toBe(0);
  for(const file of snapshots){expect(await readFile(join(dir,file.path),'utf8')).toBe(file.text);expect((await stat(join(dir,file.path))).mtimeMs).toBe(file.mtime);}
  const first=snapshots[0]!;
  await writeFile(join(dir,first.path),first.text+'\n');expect((await run(true)).status).toBe(1);
  await writeFile(join(dir,first.path),first.text);
  await rm(join(dir,first.path));expect((await run(true)).status).toBe(1);
  await writeFile(join(dir,first.path),first.text);
  const companion=generatedManifest.separatelyOwned.accountedCompanion;
  const companionBytes=await readFile(join(dir,companion.path));
  await writeFile(join(dir,companion.path),Buffer.concat([companionBytes,Buffer.from('\n')]));
  expect((await run(true)).status).toBe(1);
  await writeFile(join(dir,companion.path),companionBytes);
  expect((await run(true)).status).toBe(0);
  await writeFile(join(dir,'src/generated/unexpected.ts'),'export const surprise=true;');expect((await run(true)).status).toBe(1);
 },120_000);
});
