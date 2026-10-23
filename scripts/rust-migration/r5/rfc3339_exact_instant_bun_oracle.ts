// SPDX-License-Identifier: MIT OR Apache-2.0
import { parseRfc3339ExactInstant } from '../../../src/adapters/rfc3339-exact-instant';

const decoder = new TextDecoder();
const reader = Bun.stdin.stream().getReader();
let pending = '';
while (true) {
  const { value, done } = await reader.read();
  pending += decoder.decode(value, { stream: !done });
  let newline: number;
  while ((newline = pending.indexOf('\n')) >= 0) {
    const token = pending.slice(0, newline).replace(/\r$/, '');
    pending = pending.slice(newline + 1);
    const parsed = parseRfc3339ExactInstant(token);
    console.log(`OK|${token}|${parsed.utcSeconds}|${parsed.fractionalDigits}|${parsed.originalOffset}|${parsed.localOffsetKnown}`);
  }
  if (done) break;
}
if (pending.length > 0) {
  const token = pending.replace(/\r$/, '');
  const parsed = parseRfc3339ExactInstant(token);
  console.log(`OK|${token}|${parsed.utcSeconds}|${parsed.fractionalDigits}|${parsed.originalOffset}|${parsed.localOffsetKnown}`);
}
