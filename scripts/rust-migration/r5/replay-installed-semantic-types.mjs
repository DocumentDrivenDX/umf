// SPDX-License-Identifier: MIT OR Apache-2.0
// Bounded replay of the three V4 semantic-type exports against frozen R5 cases.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,extname,join,normalize,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
export const frozenPath=resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-semantic-value/frozen-typescript.json');
const ref=term=>({vocabulary:'example.contact',version:'1.0.0',term});
export const capture=run=>{try{return{ok:true,value:run()}}catch(error){return{ok:false,error:{code:error?.code??null,message:String(error?.message??error),path:error?.path??null}}}};
const json=value=>JSON.parse(JSON.stringify(value));

function registrationCases(api){
  const cases={};
  cases.copy_and_lookup=capture(()=>{const source={nested:{term:'before'}};const registry=new api.SemanticTypeRegistry().register(ref('registration-copy'),source);source.nested.term='mutated';const found=registry.lookup(ref('registration-copy'));if(found)found.nested.term='returned-copy-mutated';return registry.lookup(ref('registration-copy'));});
  cases.lookup_missing=capture(()=>{const found=new api.SemanticTypeRegistry().lookup(ref('registration-absent'));return found===undefined?{$undefined:true}:found;});
  cases.duplicate=capture(()=>new api.SemanticTypeRegistry().register(ref('duplicate'),{}).register(ref('duplicate'),{}));
  cases.malformed_empty_term=capture(()=>new api.SemanticTypeRegistry().register({...ref('bad'),term:''},{}));
  cases.malformed_non_string_version=capture(()=>new api.SemanticTypeRegistry().register({...ref('bad'),version:42},{}));
  cases.unknown_identity_qualifier=capture(()=>new api.SemanticTypeRegistry().register({...ref('bad'),future:true},{}));
  cases.non_object_definition=capture(()=>new api.SemanticTypeRegistry().register(ref('bad-definition'),[]));
  cases.non_function_validator=capture(()=>new api.SemanticTypeRegistry().register(ref('bad-validator'),{},42));
  cases.non_function_precedes_duplicate=capture(()=>new api.SemanticTypeRegistry().register(ref('ordered-validator'),{}).register(ref('ordered-validator'),{},42));
  cases.definition_precedes_non_function=capture(()=>new api.SemanticTypeRegistry().register(ref('bad-definition-order'),[],42));
  return cases;
}

function exportTarget(value){
  if(typeof value==='string')return value;
  if(!value||typeof value!=='object')return undefined;
  for(const key of ['browser','import','default']){const target=exportTarget(value[key]);if(target)return target;}
  return undefined;
}

async function browserReplay(packagePath,metadata,packet){
  const rootTarget=exportTarget(metadata.exports?.['.']);
  const referenceTarget=exportTarget(metadata.exports?.['./reference']);
  if(!rootTarget||!referenceTarget)throw new Error('Archive must expose browser/import targets for both "." and "./reference"');
  const contentType=path=>({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css'}[extname(path)]??'application/octet-stream');
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage();
    await page.route('http://umf-r5.local/**',async route=>{
      try{
        const url=new URL(route.request().url());
        if(url.pathname==='/'){
          await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><script type="importmap">{"imports":{"@umf/core":"/package/'+rootTarget.replace(/^\.\//,'')+'","@umf/core/reference":"/package/'+referenceTarget.replace(/^\.\//,'')+'"}}</script>'});return;
        }
        if(url.pathname==='/frozen.json'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(packet)});return;}
        const relative=decodeURIComponent(url.pathname.replace(/^\/package\//,''));
        const path=normalize(join(packagePath,relative));
        if(!path.startsWith(packagePath+'/'))throw new Error('path');
        await route.fulfill({status:200,contentType:contentType(path),body:await readFile(path)});
      }catch{await route.fulfill({status:404,body:'not found'});}
    });
    await page.goto('http://umf-r5.local/');
    const actual=await page.evaluate(async()=>{
      const packet=await(await fetch('/frozen.json')).json();
      const [api,referenceApi]=await Promise.all([import('@umf/core'),import('@umf/core/reference')]);
      const capture=run=>{try{return{ok:true,value:run()}}catch(error){return{ok:false,error:{code:error?.code??null,message:String(error?.message??error),path:error?.path??null}}}};
      const ref=term=>({vocabulary:'example.contact',version:'1.0.0',term});
      const registrations=target=>{
        const cases={};
        cases.copy_and_lookup=capture(()=>{const source={nested:{term:'before'}};const registry=new target.SemanticTypeRegistry().register(ref('registration-copy'),source);source.nested.term='mutated';const found=registry.lookup(ref('registration-copy'));if(found)found.nested.term='returned-copy-mutated';return registry.lookup(ref('registration-copy'));});
        cases.lookup_missing=capture(()=>{const value=new target.SemanticTypeRegistry().lookup(ref('registration-absent'));return value===undefined?{$undefined:true}:value;});
        cases.duplicate=capture(()=>new target.SemanticTypeRegistry().register(ref('duplicate'),{}).register(ref('duplicate'),{}));
        cases.malformed_empty_term=capture(()=>new target.SemanticTypeRegistry().register({...ref('bad'),term:''},{}));
        cases.malformed_non_string_version=capture(()=>new target.SemanticTypeRegistry().register({...ref('bad'),version:42},{}));
        cases.unknown_identity_qualifier=capture(()=>new target.SemanticTypeRegistry().register({...ref('bad'),future:true},{}));
        cases.non_object_definition=capture(()=>new target.SemanticTypeRegistry().register(ref('bad-definition'),[]));
        cases.non_function_validator=capture(()=>new target.SemanticTypeRegistry().register(ref('bad-validator'),{},42));
        cases.non_function_precedes_duplicate=capture(()=>new target.SemanticTypeRegistry().register(ref('ordered-validator'),{}).register(ref('ordered-validator'),{},42));
        cases.definition_precedes_non_function=capture(()=>new target.SemanticTypeRegistry().register(ref('bad-definition-order'),[],42));
        return cases;
      };
      const reference=ref('callback-contract'),receivers=[],calls=[];
      const validator=function(value,definition){receivers.push(this);calls.push({arity:arguments.length,keys:Object.keys(this??{})});if(calls.length===1&&this?.definition)this.definition.nested.value='mutated-via-receiver';return{status:'valid',complete:true,issues:[]};};
      const registry=new api.SemanticTypeRegistry();const fluent=registry.register(reference,{nested:{value:'initial'}},validator)===registry;
      const direct=api.validateSemanticTypeValue(reference,null,registry),method=registry.check(reference,null);
      const aggregate=packet.cases.aggregate.order_and_invalid_dominates.value;
      const aggregateRegistry=new api.SemanticTypeRegistry().register(ref('one'),{n:1},()=>({status:'valid',complete:true,issues:['one-valid']})).register(ref('two'),{n:2},()=>({status:'invalid',complete:true,issues:['two-invalid']})).register(ref('three'),{n:3},()=>({status:'unknown',complete:false,issues:['three-unknown']}));
      const malformed=structuredClone(aggregate.source);malformed.modules[0].elements[0].semanticTypes=[];let refusalCalls=0;
      const refusal=capture(()=>api.validateCoreSemanticTypeValue(malformed,aggregate.identity,'x',new api.SemanticTypeRegistry().register(ref('one'),{},()=>{refusalCalls++;return{status:'valid',complete:true,issues:[]};})));
      return{defaultRegistration:registrations(api),referenceRegistration:registrations(referenceApi),callback:{arity:calls.map(call=>call.arity),keys:calls.map(call=>call.keys),sameReceiver:receivers[0]===receivers[1],registeredValidator:receivers[0]?.validator===validator,receiverDefinition:registry.lookup(reference),fluent,direct,method},aggregate:api.validateCoreSemanticTypeValue(aggregate.source,aggregate.identity,null,aggregateRegistry),refusal,refusalCalls};
    });
    assert.deepEqual(json(actual.defaultRegistration),packet.cases.registration,'Chromium default route registration differs from frozen R5');
    assert.deepEqual(json(actual.referenceRegistration),packet.cases.registration,'Chromium ./reference control differs from frozen R5');
    assert.deepEqual(actual.callback.arity,[2,2]);assert.deepEqual(actual.callback.keys,[['definition','validator'],['definition','validator']]);assert.equal(actual.callback.sameReceiver,true);assert.equal(actual.callback.registeredValidator,true);assert.deepEqual(json(actual.callback.receiverDefinition),{nested:{value:'mutated-via-receiver'}});assert.equal(actual.callback.fluent,true);assert.deepEqual(json(actual.callback.direct),json(actual.callback.method));
    assert.deepEqual(json(actual.aggregate),packet.cases.aggregate.order_and_invalid_dominates.value);assert.deepEqual(json(actual.refusal),packet.cases.aggregate.document_refusal_precedes_callback);assert.equal(actual.refusalCalls,0);
    return{status:'pass',browser:browser.version(),defaultAndReferenceRegistrationCases:Object.keys(actual.defaultRegistration).length,callbackArity:actual.callback.arity,receiverPreserved:actual.callback.sameReceiver,registeredValidatorOnReceiver:actual.callback.registeredValidator,fluentIdentity:actual.callback.fluent,aggregateRustDispatch:'matches frozen predecessor'};
  }finally{await browser?.close();}
}

export async function replayApis(api,referenceApi,packet){
  for(const name of ['SemanticTypeRegistry','validateSemanticTypeValue','validateCoreSemanticTypeValue'])assert.equal(typeof api[name],'function',`V4 default route is missing ${name}`);
  assert.equal(typeof referenceApi.SemanticTypeRegistry,'function','./reference control is missing predecessor class');
  assert.equal(typeof referenceApi.validateSemanticTypeValue,'function','./reference control is missing predecessor validator');
  assert.equal(typeof referenceApi.validateCoreSemanticTypeValue,'function','./reference control is missing predecessor aggregate validator');

  const actualRegistration=registrationCases(api);
  assert.deepEqual(json(actualRegistration),packet.cases.registration,'default route registration/admission diverges from frozen R5 predecessor');
  const referenceRegistration=registrationCases(referenceApi);
  assert.deepEqual(json(referenceRegistration),packet.cases.registration,'./reference route registration/admission diverges from frozen R5 predecessor');

  const reference=ref('callback-contract');
  const receivers=[];const calls=[];
  const validator=function(value,definition){
    receivers.push(this);
    calls.push({arity:arguments.length,keys:Object.keys(this??{}),value,definition:json(definition)});
    if(calls.length===1&&this?.definition)this.definition.nested.value='mutated-via-receiver';
    return{status:'valid',complete:true,issues:[]};
  };
  const registry=new api.SemanticTypeRegistry();
  assert.equal(registry.register(reference,{nested:{value:'initial'}},validator),registry,'register must return the same registry');
  assert.equal(registry.register({...reference,version:'2.0.0'},{}),registry,'validator-free registration must return the same registry');
  const direct=api.validateSemanticTypeValue(reference,null,registry);
  const method=registry.check(reference,null);
  assert.deepEqual(json(direct),json(method));
  assert.deepEqual(calls.map(call=>call.arity),[2,2]);
  assert.deepEqual(calls.map(call=>call.keys),[['definition','validator'],['definition','validator']]);
  assert.equal(receivers[0],receivers[1],'the default route must retain the callback receiver');
  assert.equal(receivers[0]?.validator,validator,'callback receiver must expose its registered validator');
  assert.deepEqual(json(registry.lookup(reference)),{nested:{value:'mutated-via-receiver'}});

  const aggregate=packet.cases.aggregate.order_and_invalid_dominates.value;
  const aggregateRegistry=new api.SemanticTypeRegistry()
    .register(ref('one'),{n:1},()=>({status:'valid',complete:true,issues:['one-valid']}))
    .register(ref('two'),{n:2},()=>({status:'invalid',complete:true,issues:['two-invalid']}))
    .register(ref('three'),{n:3},()=>({status:'unknown',complete:false,issues:['three-unknown']}));
  const aggregateResult=api.validateCoreSemanticTypeValue(aggregate.source,aggregate.identity,null,aggregateRegistry);
  assert.deepEqual(json(aggregateResult),aggregate,'aggregate Rust dispatch differs from frozen R5 behavior');

  const malformed=structuredClone(aggregate.source);malformed.modules[0].elements[0].semanticTypes=[];
  let refusalCalls=0;
  const refusalRegistry=new api.SemanticTypeRegistry().register(ref('one'),{},()=>{refusalCalls++;return{status:'valid',complete:true,issues:[]};});
  const refusal=capture(()=>api.validateCoreSemanticTypeValue(malformed,aggregate.identity,'x',refusalRegistry));
  assert.deepEqual(json(refusal),packet.cases.aggregate.document_refusal_precedes_callback);
  assert.equal(refusalCalls,0,'malformed document admission must precede callback dispatch');

  return{
    status:'pass',
    defaultRoute:{exports:['SemanticTypeRegistry','validateSemanticTypeValue','validateCoreSemanticTypeValue'],registrationCases:Object.keys(actualRegistration).length,callbackArity:[2,2],receiverKeys:['definition','validator'],fluentIdentity:true,aggregate:'Rust dispatcher result matches frozen predecessor'},
    referenceControl:{exports:['SemanticTypeRegistry','validateSemanticTypeValue','validateCoreSemanticTypeValue'],registrationCases:Object.keys(referenceRegistration).length},
    admissionOrder:{nonFunctionValidatorPrecedesDuplicate:actualRegistration.non_function_precedes_duplicate.error.code,malformedDocumentBeforeCallback:refusal.error.code,callbacksAfterDocumentRefusal:refusalCalls},
  };
}

async function sourceReplay(){
  const [api,referenceApi,packet]=await Promise.all([
    import(pathToFileURL(resolve(root,'src/index-node-v4.ts')).href),
    import(pathToFileURL(resolve(root,'src/index.ts')).href),
    readFile(frozenPath,'utf8').then(JSON.parse),
  ]);
  return replayApis(api,referenceApi,packet);
}

async function archiveReplay(archive){
  const archivePath=resolve(archive);
  const prefix=await mkdtemp(join(tmpdir(),'umf-r5-semantic-archive-'));
  try{
    const archiveSha256=createHash('sha256').update(await readFile(archivePath)).digest('hex');
    const expectedSha256=process.env.UMF_R5_SEMANTIC_TYPES_EXPECTED_SHA256;
    if(expectedSha256&&archiveSha256!==expectedSha256)throw new Error(`Archive SHA-256 mismatch: expected ${expectedSha256}, received ${archiveSha256}`);
    const pack=spawnSync('tar',['-xOf',archivePath,'package/package.json'],{encoding:'utf8'});
    if(pack.status!==0)throw new Error(`Cannot read package metadata from archive: ${pack.stderr||pack.stdout}`);
    const packedMetadata=JSON.parse(pack.stdout);
    const rootModules=join(root,'node_modules'),installModules=join(prefix,'node_modules');
    for(const dependency of Object.keys({...packedMetadata.dependencies,...packedMetadata.optionalDependencies,...packedMetadata.peerDependencies})){
      const source=resolve(rootModules,dependency),target=resolve(installModules,dependency);
      if(!source.startsWith(rootModules+'/')||!target.startsWith(installModules+'/'))throw new Error(`Unsafe dependency path: ${dependency}`);
      try{await readFile(join(source,'package.json'));}catch{continue;}
      await mkdir(dirname(target),{recursive:true});
      try{await symlink(source,target,'dir');}catch(error){if(error.code!=='EEXIST')throw error;}
    }
    const packagePath=join(installModules,'@umf','core');
    await mkdir(packagePath,{recursive:true});
    const extract=spawnSync('tar',['-xzf',archivePath,'-C',packagePath,'--strip-components=1'],{encoding:'utf8'});
    if(extract.status!==0)throw new Error(`Archive extraction failed (${extract.status}):\n${extract.stderr||extract.stdout}`);
    const metadata=JSON.parse(await readFile(join(packagePath,'package.json'),'utf8'));
    if(metadata.name!=='@umf/core')throw new Error(`Expected @umf/core archive, received ${metadata.name}`);
    const worker=join(prefix,'replay-worker.mjs');
    await writeFile(worker,`import {readFile} from 'node:fs/promises';\nimport {replayApis} from ${JSON.stringify(pathToFileURL(fileURLToPath(import.meta.url)).href)};\nconst pkg=${JSON.stringify(metadata.name)};\nconst [api,referenceApi,packet]=await Promise.all([import(pkg),import(pkg+'/reference'),readFile(process.env.UMF_R5_FROZEN_PACKET,'utf8').then(JSON.parse)]);\nconsole.log(JSON.stringify(await replayApis(api,referenceApi,packet)));\n`);
    const run=spawnSync(process.execPath,[worker],{encoding:'utf8',env:{...process.env,UMF_R5_FROZEN_PACKET:frozenPath}});
    if(run.status!==0)throw new Error(`Installed archive replay failed (${run.status}):\n${run.stderr||run.stdout}`);
    const node=JSON.parse(run.stdout.trim().split('\n').at(-1));
    const browser=await browserReplay(packagePath,metadata,JSON.parse(await readFile(frozenPath,'utf8')));
    const runtime=process.versions.bun?{host:'Bun',version:Bun.version,nodeCompatibilityVersion:process.version}:{host:'Node',version:process.version};
    return{...node,installedArchive:archivePath,archiveSha256,packageVersion:metadata.version,installation:'archive unpacked into temporary node_modules; dependencies linked from repository-pinned node_modules',runtime,browser};
  }finally{await rm(prefix,{recursive:true,force:true});}
}

export async function run({source=false,archive=process.env.UMF_R5_SEMANTIC_TYPES_ARCHIVE}={}){
  if(source)return sourceReplay();
  if(!archive)throw new Error('Set UMF_R5_SEMANTIC_TYPES_ARCHIVE to an independent @umf/core .tgz, or pass --source for the provisional Bun source control');
  return archiveReplay(archive);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const source=process.argv.includes('--source');
  try{console.log(JSON.stringify(await run({source,archive:process.env.UMF_R5_SEMANTIC_TYPES_ARCHIVE})));}
  catch(error){console.error(error);process.exitCode=1;}
}
