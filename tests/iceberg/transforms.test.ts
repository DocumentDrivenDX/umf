import {test,expect} from 'bun:test';
import {inspectIcebergTransformType as inspect} from '../../src';
import {createValidator} from '../../src/validation/schema';
import grammar from '../../spec/extensions/iceberg/transform-type-schema.json';
const native=await Bun.file('fixtures/iceberg/transforms/java-results.json').json(),valid=createValidator().compile(grammar);
test('US-021-AC5: native transform type matrix agrees for 136 source/transform combinations',()=>{
 expect(native).toHaveLength(136);
 for(const c of native){const r=inspect(c.sourceType,c.transform);expect(valid(r)).toBe(true);expect(r.complete).toBe(false);expect(r.status==='compatible').toBe(c.nativeCompatible);if(c.nativeCompatible){expect(r.resultType).toBe(c.transform==='day'?'int':c.nativeResultType);if(c.transform==='day')expect(c.nativeResultType).toBe('date');};}
});
test('US-021-AC5: unknown syntax stays uninterpreted and bounded parameters reject invalid widths',()=>{
 for(const t of ['bucket[0]','truncate[0]','bucket[2147483648]'])expect(inspect('long',t).status).toBe('incompatible');
 for(const t of ['future[2]','bucket[-1]','bucket[1.2]'])expect(inspect('long',t).status).toBe('uninterpreted');
 for(const type of ['geometry','geography','future','unknown'])expect(inspect(type,'identity').status).toBe('uninterpreted');
 for(const type of ['decimal(39, 1)','decimal(2, 3)','fixed[0]'])expect(inspect(type,'identity').status).toBe('incompatible');
 expect(inspect('fixed[8]','truncate[4]').status).toBe('incompatible');expect(inspect('decimal(12,2)','truncate[4]').resultType).toBe('decimal(12,2)');
});
