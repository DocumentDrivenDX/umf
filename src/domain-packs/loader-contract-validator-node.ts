// SPDX-License-Identifier: MIT OR Apache-2.0
import {createPreparedJsonSchemaEngine} from '../../bindings/core/node/index.js';
import {createValidator as createRustFacade} from './loader-contract-validator';
export function createValidator(strict=true){return createRustFacade(createPreparedJsonSchemaEngine(),strict);}
