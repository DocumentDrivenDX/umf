// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const api=await import(pathToFileURL(resolve(process.argv[2])).href);
let publicErrorIdentity=false;
try{api.inspectCoreSemanticTypes({umf:'bad'},{module:'',element:'e'});}
catch(error){publicErrorIdentity=error instanceof api.UmfError;}
assert.equal(publicErrorIdentity,true,'native refusal must use the public UmfError class');
console.log(JSON.stringify({status:'pass',publicErrorIdentity}));
