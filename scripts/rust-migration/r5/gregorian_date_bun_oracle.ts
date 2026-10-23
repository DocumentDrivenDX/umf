// SPDX-License-Identifier: MIT OR Apache-2.0
import { parseGregorianDate } from '../../../src/adapters/gregorian-date';

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
    const date = parseGregorianDate(token);
    console.log(`OK|${token}|${date.year}|${date.month}|${date.day}`);
  }
  if (done) break;
}
if (pending.length > 0) {
  const token = pending.replace(/\r$/, '');
  const date = parseGregorianDate(token);
  console.log(`OK|${token}|${date.year}|${date.month}|${date.day}`);
}
