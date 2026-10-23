// SPDX-License-Identifier: MIT OR Apache-2.0
/** Run the installed native package under either Node or Bun. */
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const [packageRoot,resourceRoot,corpusPath]=process.argv.slice(2);
const {createEngine}=await import(pathToFileURL(packageRoot+'/index.js').href);
const read=async p=>JSON.parse(await readFile(resourceRoot+'/'+p,'utf8'));
const engine=createEngine({coreSchema:await read('spec/core/schema.json'),referenceSchema:await read('spec/core/semantic-type-reference.schema.json'),packageSchema:await read('spec/core/extension-package.schema.json'),constraints:await read('spec/metamodel/generated/core-constraints.json'),domainPolicy:await read('spec/metamodel/generated/domain-policy.json')});
const cases=JSON.parse(await readFile(corpusPath,'utf8'));
console.log(JSON.stringify(cases.map(c=>({name:c.name,listing:engine.listKinds(c.registrations),inspection:engine.inspectExtensionKinds(c.document,c.registrations)}))));
