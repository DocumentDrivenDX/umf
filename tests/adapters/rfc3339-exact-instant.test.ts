// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {parseRfc3339ExactInstant as parse, sameRfc3339ExactInstant as same,
 RFC3339_EXACT_INSTANT_MAXIMUM_BYTES as maximum} from '../../src/adapters/rfc3339-exact-instant';

test('offset equivalents preserve source and exact fraction', () => {
 expect(same('2024-01-01T00:00:00.123456789Z', '2023-12-31T19:00:00.1234567890-05:00')).toBe(true);
 expect(same('2024-01-01T00:00:00.1234567Z', '2024-01-01T00:00:00.1234568Z')).toBe(false);
 const token = '1969-12-31t23:59:59.5000z', value = parse(token);
 expect(value.utcSeconds).toBe('-1'); expect(value.fractionalDigits).toBe('5');
 expect(value.originalText).toBe(token); expect(Object.isFrozen(value)).toBe(true);
 expect(JSON.parse(JSON.stringify(value))).toEqual(value);
});
test('unknown local offset does not erase the known instant', () => {
 const value = parse('1970-01-01T00:00:00-00:00');
 expect(value.localOffsetKnown).toBe(false); expect(value.originalOffset).toBe('-00:00');
 expect(same(value.originalText, '1970-01-01T00:00:00+00:00')).toBe(true);
});
test('calendar arithmetic admits crossing authored year boundaries', () => {
 expect(parse('0001-01-01T00:00:00+23:59').utcSeconds).toBe('-62135683140');
 expect(parse('9999-12-31T23:59:59-23:59').utcSeconds).toBe('253402387139');
 expect(parse('2000-02-29T00:00:00Z').utcSeconds).toBe('951782400');
});
test('invalid dates, leap seconds, offsets and syntax refuse', () => {
 for (const token of ['1900-02-29T00:00:00Z', '0000-01-01T00:00:00Z',
  '2016-12-31T23:59:60Z', '2024-01-01T24:00:00Z', '2024-01-01T00:00:00+00:60',
  '2024-01-01T00:00:00+24:00', '2024-01-01T00:00:00', '2024-01-01T00:00:00Z\n'])
  expect(() => parse(token)).toThrow(RangeError);
});
test('fractions remain exact at the shared token bound', () => {
 const token = '1970-01-01T00:00:00.' + '1'.repeat(maximum - 21) + 'Z';
 expect(token.length).toBe(maximum);
 expect(parse(token).fractionalDigits.length).toBe(maximum - 21);
 const zeroRun = '0'.repeat(maximum - 22) + '1';
 expect(parse('1970-01-01T00:00:00.' + zeroRun + 'Z').fractionalDigits).toBe(zeroRun);
 expect(() => parse(token.replace('Z', '1Z'))).toThrow(RangeError);
});
