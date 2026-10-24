import {describe, expect, test} from 'bun:test';
import {AVRO_INSPECT_PROFILE, createAvroInspector} from '../index.js';

const taggedString = value => ({kind: 'string', value});
const taggedObject = members => ({kind: 'object', members});
const taggedArray = items => ({kind: 'array', items});

describe('opt-in Avro structural inspector', () => {
  test('resolves ordered dependency names and always reports incomplete semantics', () => {
    const inspector = createAvroInspector();
    expect(AVRO_INSPECT_PROFILE).toBe('umf-r5-avro-inspect/0.1.0');
    const result = inspector.inspect(taggedString('sample.Widget'), [{id: 'dep', root: taggedObject({
      type: taggedString('record'), name: taggedString('Widget'),
      namespace: taggedString('sample'), fields: taggedArray([]),
    })}]);
    expect(result.valid).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.diagnostics.map(item => item.code)).toEqual(['AVRO_PROFILE_LIMIT']);
  });

  test('reports unresolved names and forwards host work controls', () => {
    let charged = 0;
    const inspector = createAvroInspector({controls: {work(amount) { charged += amount; }}});
    const result = inspector.inspect(taggedString('missing.Widget'));
    expect(result.valid).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.diagnostics.map(item => item.code)).toEqual(['AVRO_UNRESOLVED_NAME', 'AVRO_PROFILE_LIMIT']);
    expect(charged).toBeGreaterThan(0);
  });

  test('preflights and bounds dependencies before traversal', () => {
    let touched = false;
    const iterable = {[Symbol.iterator]() { touched = true; throw new Error('must not iterate'); }};
    const inspector = createAvroInspector();
    expect(() => inspector.inspect(taggedString('string'), iterable)).toThrow(/must be an array/);
    expect(touched).toBe(false);
    const zeroBudget = createAvroInspector({controls: {maxWork: 0}});
    expect(() => zeroBudget.inspect(taggedString('string'), iterable)).toThrow(/Host work budget exceeded/);
    expect(touched).toBe(false);
    const oversized = new Proxy([], {get(target, key, receiver) {
      return key === 'length' ? 100_001 : Reflect.get(target, key, receiver);
    }});
    expect(() => inspector.inspect(taggedString('string'), oversized)).toThrow(/Too many Avro dependencies/);
  });
});
