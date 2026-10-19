// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {parseModel,compileModel} from './metamodel/compile';
import {validateDocument} from '../src/validation/document';
import {Registry} from '../src/registry/registry';
const model=parseModel(await readFile(new URL('../spec/metamodel/umf.yaml',import.meta.url),'utf8'));
const registry=new Registry().register(JSON.parse(await readFile(new URL('../spec/metamodel/package.json',import.meta.url),'utf8')));
const result=validateDocument(model,registry);if(!result.valid)throw Error('METAMODEL_SELF_VALIDATION '+JSON.stringify(result.diagnostics));
compileModel(model);console.log('Authored model validates against generated current enforcement');
