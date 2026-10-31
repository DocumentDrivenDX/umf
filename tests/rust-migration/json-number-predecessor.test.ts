import {describe, expect, test} from 'bun:test';
import {assertExactJsonNumber} from '../../src/model/internal/json-number';

function refusal(token: string, message: string): void {
  try {
    assertExactJsonNumber(token);
    throw new Error(`Expected ${JSON.stringify(token)} to be refused`);
  } catch (error) {
    const actual = error as {name?: string; code?: string; message?: string};
    expect(actual.name).toBe('UmfError');
    expect(actual.code).toBe('NUMBER');
    expect(actual.message).toBe(message);
  }
}

describe('assertExactJsonNumber TypeScript predecessor boundaries', () => {
  test('accepts exact interoperable values', () => {
    for (const token of ['0', '42', '9007199254740991', '0.1', '1e-7', '100e-2', '+1', '01', '']) {
      expect(() => assertExactJsonNumber(token)).not.toThrow();
    }
  });

  test('preserves distinct refusal classes and exact errors', () => {
    for (const token of ['-0', '9007199254740992', '1e309', 'NaN', 'Infinity'])
      refusal(token, 'Noninteroperable JSON number');
    for (const token of ['0.10000000000000001', '1e-324'])
      refusal(token, 'Parsing would change the decimal value');
    for (const token of [' 1', '0x10']) refusal(token, 'Unsupported numeric spelling');
  });
});

describe('assertExactJsonNumber raw host coercion boundary', () => {
  test('coerces runtime objects before a Rust candidate could receive UTF-16 text', () => {
    const hints: string[] = [];
    const token = {
      [Symbol.toPrimitive](hint: string) {
        hints.push(hint);
        return '1';
      },
    };
    // The declared API accepts strings. This bounded probe records actual JS
    // behavior if an untyped caller passes an object: Number(token) runs before
    // decimal(token) coerces it again for the regular expression.
    assertExactJsonNumber(token as unknown as string);
    expect(hints).toEqual(['number', 'string']);
  });
});

test('keeps a coercion trap from an untyped host value observable', () => {
  const thrown = new Error('host coercion sentinel');
  const token = {
    [Symbol.toPrimitive]() { throw thrown; },
  };
  let caught: unknown;
  try {
    assertExactJsonNumber(token as unknown as string);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(thrown);
});
