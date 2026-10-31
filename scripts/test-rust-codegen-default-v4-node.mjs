// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {copyFile,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const entry=process.env.UMF_ROOT_V4_NODE_ENTRY;
if(!entry)throw new Error('Set UMF_ROOT_V4_NODE_ENTRY to the built Node root entry');
const source=await readFile(resolve('tests/unified/commerce.json'),'utf8');
const api=await import(pathToFileURL(resolve(entry)).href);
assert.equal(typeof api.generatePythonClient,'function');
const output=api.generatePythonClient({text:source,package:'shop',records:[{module:'commerce',element:'Order'}],actions:[{module:'commerce',action:'shipOrder'}]});
assert.equal(typeof output.then,'undefined','root generator must stay synchronous after import');
assert.equal(output.files.length,7);
assert.equal(typeof output.sourceDigest,'string');

// Prove a missing native asset rejects the root module import instead of
// selecting the TypeScript predecessor. The copied bundle intentionally has
// no adjacent `.node` file.
const failureDir=await mkdtemp(join(tmpdir(),'umf-codegen-default-v4-missing-addon-'));
try{
 const missingEntry=join(failureDir,'root.js');
 await copyFile(resolve(entry),missingEntry);
 await writeFile(join(failureDir,'package.json'),'{"type":"module"}\n');
 const probe=`try { await import(${JSON.stringify(pathToFileURL(missingEntry).href)}); process.exitCode=1; } catch (error) { if (!String(error).includes('umf_core_node.node')) process.exitCode=2; }`;
 const failed=spawnSync(process.execPath,['--input-type=module','-e',probe],{encoding:'utf8'});
 assert.equal(failed.status,0,`missing addon import should fail closed: ${failed.stderr}`);
}finally{await rm(failureDir,{recursive:true,force:true});}

console.log(JSON.stringify({runtime:process.versions.bun?'Bun':process.version,syncAfterImport:true,files:output.files.length,missingAddonImportRejected:true}));
