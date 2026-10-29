// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {quoteIdentifier,quoteText} from '../../src/table-deployment/sql';
import {canonical,canonicalCharged,hashCanonical,hashCanonicalCharged} from '../../src/compilation/bundle/hash';
import {copyJsonCharged} from '../../src/model/json';
import {R2_CONTEXT_BYTE_LIMIT,R2WorkLimitError,R2WorkMeter} from '../../src/table-migration/inventory-r2-context';

test('R2 SQL quoting reserves each escaped intermediate and final output before allocation',()=>{
 const identifierMeter=new R2WorkMeter();
 expect(quoteIdentifier('x"',identifierMeter,'/sql/identifier')).toBe('"x"""');
 expect(identifierMeter.snapshot().bytes).toBe(8); // 3-byte escaped body plus 5-byte quoted result.

 const textMeter=new R2WorkMeter();
 expect(quoteText("a'\\",textMeter,'/sql/text')).toBe("E'a''\\\\'");
 expect(textMeter.snapshot().bytes).toBe(17); // 4-byte slash-escaped body, 5-byte quote-escaped body, 8-byte E literal.

 const nearLimit=new R2WorkMeter();nearLimit.chargeBytes(R2_CONTEXT_BYTE_LIMIT-7,'/preloaded');
 expect(()=>quoteIdentifier('x"',nearLimit,'/sql/identifier')).toThrow(R2WorkLimitError);
 expect(nearLimit.snapshot().bytes).toBe(R2_CONTEXT_BYTE_LIMIT-4); // Final five bytes are refused before the final quoted string.
});

test('R2 canonical and hash kernels preserve sorted JSON while charging variable object-key carriers',()=>{
 const value={z:{'long-key-name':'λ'},a:[3,'x'],m:true};
 const canonicalMeter=new R2WorkMeter(),hashMeter=new R2WorkMeter();
 expect(canonicalCharged(value,canonicalMeter,'/canonical')).toBe(canonical(value));
 expect(hashCanonicalCharged(value,hashMeter,'/hash')).toBe(hashCanonical(value));
 expect(canonicalMeter.snapshot().work).toBeGreaterThan(10);
 expect(hashMeter.snapshot().work).toBeGreaterThan(10);
 expect(canonicalMeter.snapshot().bytes).toBeGreaterThan(0);
 expect(hashMeter.snapshot().bytes).toBeGreaterThan(0);
});

test('R2 charged JSON copy reserves property descriptors and text before retaining the copy',()=>{
 const events:string[]=[];
 const copied=copyJsonCharged({field:'value'},undefined,{
  beforeProperty:(key,path,isArray)=>events.push(`property:${key}:${path}:${isArray}`),
  retainText:(text,path)=>events.push(`text:${text}:${path}`),
 });
 expect(copied).toEqual({field:'value'});
 expect(events).toEqual(['property:field::false','text:value:/field']);
});
