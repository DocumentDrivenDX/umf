// SPDX-License-Identifier: MIT OR Apache-2.0
/** Explicit instant comparison profile; no implicit core timestamp semantics. */
export const RFC3339_EXACT_INSTANT_PROFILE = 'umf-rfc3339-exact-instant/1.0.0' as const;
export const RFC3339_EXACT_INSTANT_MAXIMUM_BYTES = 1048576;

export interface Rfc3339ExactInstant {
 readonly profile: typeof RFC3339_EXACT_INSTANT_PROFILE;
 readonly originalText: string;
 /** Whole seconds since 1970-01-01T00:00:00Z, rounded toward negative infinity. */
 readonly utcSeconds: string;
 /** Nonnegative fractional second digits, with trailing zeros removed. */
 readonly fractionalDigits: string;
 readonly originalOffset: string;
 readonly localOffsetKnown: boolean;
}

const grammar = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[Tt]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?([Zz]|[+-][0-9]{2}:[0-9]{2})$/;
const leap = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const priorYearDays = (year: number) => {
 const prior = year - 1;
 return prior * 365 + Math.floor(prior / 4) - Math.floor(prior / 100) + Math.floor(prior / 400);
};

export function parseRfc3339ExactInstant(token: string): Rfc3339ExactInstant {
 if (typeof token !== 'string') throw new TypeError('RFC3339 exact instant requires text');
 if (token.length > RFC3339_EXACT_INSTANT_MAXIMUM_BYTES) throw new RangeError('RFC3339 exact instant token limit');
 const match = grammar.exec(token);
 // JavaScript $ can match before a final line terminator; require exact coverage.
 if (!match || match[0].length !== token.length) throw new RangeError('RFC3339 exact instant syntax');
 const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
 const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
 const lengths = [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
 if (year < 1 || month < 1 || month > 12 || day < 1 || day > lengths[month - 1]!
  || hour > 23 || minute > 59 || second > 59) throw new RangeError('RFC3339 exact instant calendar');
 const originalOffset = match[8]!;
 let offsetMinutes = 0;
 if (originalOffset !== 'Z' && originalOffset !== 'z') {
  const hours = Number(originalOffset.slice(1, 3)), minutes = Number(originalOffset.slice(4, 6));
  if (hours > 23 || minutes > 59) throw new RangeError('RFC3339 exact instant offset');
  offsetMinutes = (hours * 60 + minutes) * (originalOffset[0] === '-' ? -1 : 1);
 }
 let days = priorYearDays(year) - priorYearDays(1970) + day - 1;
 for (let index = 0; index < month - 1; index++) days += lengths[index]!;
 // All operands/results are bounded exact integers (< 3.2e11), within 2^53.
 // The fraction never passes through a JavaScript number, Date or host clock.
 const seconds = days * 86400 + hour * 3600 + minute * 60 + second - offsetMinutes * 60;
 const fraction = match[7] ?? '';
 let fractionEnd = fraction.length;
 while (fractionEnd > 0 && fraction[fractionEnd - 1] === '0') fractionEnd--;
 return Object.freeze({profile: RFC3339_EXACT_INSTANT_PROFILE, originalText: token,
  utcSeconds: String(seconds), fractionalDigits: fraction.slice(0, fractionEnd),
  originalOffset, localOffsetKnown: originalOffset !== '-00:00'});
}

export function sameRfc3339ExactInstant(left: string, right: string): boolean {
 const a = parseRfc3339ExactInstant(left), b = parseRfc3339ExactInstant(right);
 return a.utcSeconds === b.utcSeconds && a.fractionalDigits === b.fractionalDigits;
}
