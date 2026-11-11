// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import '../../src/index-node-v4';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {referenceLiteral} from '../../scripts/actions-reference/literal';

test('actions-reference preserves ordinary core string limits above the Protection candidate budget',()=>{
 const source=structuredClone(fixture) as unknown as Document;
 const identity=referenceLiteral(source,{module:'sales',element:'status'},{string:'x'.repeat(60_000)},true);
 expect(typeof identity).toBe('string');
 expect(identity!.length).toBeGreaterThan(50_000);
});
