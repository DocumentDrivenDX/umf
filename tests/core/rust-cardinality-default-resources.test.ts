// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import coreSchema from '../../spec/core/schema.json';
import {CORE_MODEL_RESOURCES} from '../../src/access/core-model-resources';

test('default Rust resources are frozen copies and do not freeze shared schema imports',()=>{
 expect(CORE_MODEL_RESOURCES.coreSchema).not.toBe(coreSchema);
 expect(Object.isFrozen(CORE_MODEL_RESOURCES.coreSchema)).toBe(true);
 expect(Object.isFrozen(coreSchema)).toBe(false);
});
