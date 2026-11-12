// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {copyFile,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeLoaderContractRuntimeAssets} from '../scripts/loader-contract-assets';

test('loader-contract package assets route Rust operations to the matching V4 root',async()=>{
 const destination=await mkdtemp(join(tmpdir(),'umf-loader-contract-'));
 try{
  await writeLoaderContractRuntimeAssets(destination);
  const browser=await readFile(join(destination,'loader-contract.js'),'utf8'),node=await readFile(join(destination,'loader-contract.node.js'),'utf8'),validator=await readFile(join(destination,'loader-contract-validator.js'),'utf8'),nodeValidator=await readFile(join(destination,'loader-contract-validator.node.js'),'utf8');
  const pkg=JSON.parse(await readFile(resolve('package.json'),'utf8')),route=pkg.exports['./loader-contract'];
  expect(route).toEqual({types:{node:'./dist/src/domain-packs/loader-contract-node.d.ts',default:'./dist/src/domain-packs/loader-contract-browser.d.ts'},browser:'./dist/loader-contract.js',node:'./dist/loader-contract.node.js',import:'./dist/loader-contract.js',default:'./dist/loader-contract.js'});
  expect(browser).toContain("./loader-contract-validator.js");expect(node).toContain("./loader-contract-validator.node.js");
  for(const asset of [validator,nodeValidator]){expect(asset).toContain('createValidator');expect(asset).not.toContain('checkCore');expect(asset).not.toContain('checkPackage');expect(asset).not.toContain('ajv');}
  expect(browser).toContain("from './umf-browser.js'");expect(browser).not.toContain("from './umf-node.js'");
  expect(node).toContain("from './umf-node.js'");expect(node).not.toContain("from './umf-browser.js'");
  for(const name of ['readJsonValue','inspectDomainPackLoader','generateDomainPackLoaderSchema','generateLoaderInventorySchema']){expect(browser).toContain(name);expect(node).toContain(name);}
  expect(browser).not.toContain("domain-packs/loader.ts");expect(node).not.toContain("domain-packs/loader.ts");
  await Bun.write(join(destination,'package.json'),'{"type":"module"}');
  const rustExports=`export const readJsonValue=(text)=>JSON.parse(text);export const inspectDomainPackLoader=(x)=>({valid:x.entrypoint==='run.ts'});export const generateDomainPackLoaderSchema=()=>({$id:'urn:umf:domain-pack-loader:1.0.0'});export const generateLoaderInventorySchema=()=>({$id:'urn:umf:loader-inventory:1.0.0'});`;
  await Bun.write(join(destination,'umf-node.js'),rustExports);await Bun.write(join(destination,'umf-browser.js'),rustExports);
  await copyFile(resolve('bindings/core/node/umf_core_node.node'),join(destination,'umf_core_node.node'));
  const api=await import(pathToFileURL(join(destination,'loader-contract.node.js')).href);
  const validate=api.createValidator().compile({type:'object',required:['ok'],properties:{ok:{type:'boolean'}},additionalProperties:false});
  expect(validate({ok:true})).toBe(true);expect(validate({ok:'true'})).toBe(false);expect(validate.errors?.[0]?.keyword).toBe('type');expect(api.readJsonValue('{"ok":true}','json')).toEqual({ok:true});
  const trueSchema=api.createValidator().compile(true),falseSchema=api.createValidator().compile(false);expect(trueSchema(null)).toBe(true);expect(falseSchema(null)).toBe(false);expect(falseSchema.errors?.[0]?.keyword).toBe('false schema');
  expect(()=>api.createValidator().addSchema({$id:'urn:invalid:loader-schema',type:'nonsense'})).toThrow();
  expect(()=>api.createValidator().compile({$id:'https://json-schema.org/draft/2020-12/schema'})).toThrow();
  const reference=api.createValidator().getSchema('urn:umf:core:semantic-type-reference:1.0.0');
  expect(reference?.({vocabulary:'example',version:'1.0.0',term:'item'})).toBe(true);
  expect(api.inspectDomainPackLoader({entrypoint:'run.ts'}).valid).toBe(true);expect(api.inspectDomainPackLoader({entrypoint:'../run.ts'}).valid).toBe(false);
  const nodeCheck=Bun.spawnSync(['node','--input-type=module','-e',`const api=await import(${JSON.stringify(pathToFileURL(join(destination,'loader-contract.node.js')).href)});const valid=api.createValidator().compile({type:'object',required:['ok'],properties:{ok:{type:'boolean'}},additionalProperties:false});if(!valid({ok:true})||valid({ok:'true'})||valid.errors?.[0]?.keyword!=='type'||api.readJsonValue('{"ok":true}','json').ok!==true||!api.inspectDomainPackLoader({entrypoint:'run.ts'}).valid||api.inspectDomainPackLoader({entrypoint:'../run.ts'}).valid)throw Error('Node loader-contract runtime probe failed');const yes=api.createValidator().compile(true),no=api.createValidator().compile(false);if(!yes(null)||no(null)||no.errors?.[0]?.keyword!=='false schema')throw Error('Boolean schemas bypassed the Rust validator');let rejected=false;try{api.createValidator().addSchema({$id:'urn:invalid:loader-schema',type:'nonsense'});}catch{rejected=true;}if(!rejected)throw Error('Invalid schema was not rejected during addSchema');const first=api.createValidator().compile({type:'string'}),second=api.createValidator().compile({type:'number'});if(!first('x')||first(1)||!second(1)||second('x'))throw Error('Validator instances shared compiled state');`]);
  expect(nodeCheck.exitCode).toBe(0);expect(nodeCheck.stderr.toString()).toBe('');
 }finally{await rm(destination,{recursive:true,force:true});}
},30_000);
