// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {readProtectionSource,writeProtectionSource} from '../../../src/extensions/security/protection/source';
import {protectionBoundary} from '../../../tools/security/protection-boundary';

const source={vocabulary:'umf.security.protection',version:'9.0.0',id:'future',revision:'r1',
 transforms:[{id:'future',version:'unknown',kind:'future',nested:[null,false,{text:'\u0000'}]}],
 native:{dialect:'future',sql:'CREATE FUTURE TRANSFORM;\n-- retained\n'},future:{Bun:'data, never executable'}};

test('protection source preserves unknown catalog content in JSON and YAML',()=>{
 // @covers US-079-AC9
 for(const format of ['json','yaml'] as const){
  const encoded=writeProtectionSource(source,format);
  expect(readProtectionSource(encoded,format)).toEqual(source);
 }
 expect(()=>readProtectionSource('{bad')).toThrow();
 expect(()=>writeProtectionSource({execute:()=>1})).toThrow();
});

test('protection boundary refuses host imports/globals and accepts library source',async()=>{
 // @covers US-079-AC10
 for(const injection of ["import fs from 'node:fs';", "import x from '../../../../tools/host';",
  "export * from '../../../../tests/fixture';", "const x=Bun.file('data');",
  "const x=globalThis['process'];", 'const x=import(path);', 'const x=new Function(code);']){
  expect(protectionBoundary(injection).length,injection).toBeGreaterThan(0);
 }
 const files=Array.from(new Bun.Glob('src/extensions/security/protection/**/*.ts').scanSync('.'));
 expect(files.length).toBeGreaterThan(0);
 for(const path of files)expect(protectionBoundary(await Bun.file(path).text(),path),path).toEqual([]);
});
