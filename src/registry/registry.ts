// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ValidateFunction} from 'ajv';
import {createValidator,checkPackage} from '../validation/schema';
import {UmfError} from '../model/types';
import {RegistryBase,type Registration,type SemanticValidator,type StructureValidator} from './base';

export type {Registration,SemanticValidator} from './base';

/** Source-only registry with the legacy AJV admission and validation profile. */
export class Registry extends RegistryBase {
  constructor(kindRuntime?:ConstructorParameters<typeof RegistryBase>[0]) {
    super(kindRuntime,manifest=>createValidator().compile(manifest.schema) as ValidateFunction,manifest=>{
      if(!checkPackage(manifest))throw new UmfError('PACKAGE_STRUCTURE',JSON.stringify(checkPackage.errors));
    });
  }
}
