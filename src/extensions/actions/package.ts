// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/actions/package.json';
import {copyJson} from '../../model/json';
import type {ExtensionPackage} from '../../model/types';

function freeze(value:unknown):void {
 if(value&&typeof value==='object'){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
}

/** Original metadata cannot be widened before a later registry consumer loads. */
const packageValue=copyJson(manifest) as unknown as ExtensionPackage;
freeze(packageValue);
export const actionsPackage=packageValue;
