// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {rustReferenceSelfModel} from './metamodel/rust';
const source=await readFile(new URL('../spec/metamodel/umf.yaml',import.meta.url),'utf8');
const manifest=JSON.parse(await readFile(new URL('../spec/metamodel/generated/manifest.json',import.meta.url),'utf8'));
rustReferenceSelfModel(source,manifest);
console.log('Authored model validates against generated current enforcement');
