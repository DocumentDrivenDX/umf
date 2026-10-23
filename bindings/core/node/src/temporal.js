export const GREGORIAN_DATE_PROFILE = 'umf-gregorian-date/1.0.0';
export const RFC3339_EXACT_INSTANT_PROFILE = 'umf-rfc3339-exact-instant/1.0.0';
export const RFC3339_EXACT_INSTANT_MAXIMUM_BYTES = 1_048_576;

function decoded(wire) {
  if (wire === 'TypeError') throw new TypeError('Temporal token requires text');
  if (wire === 'RangeError') throw new RangeError('Temporal token is outside the selected profile');
  return wire.split('|');
}

export function createTemporalEngine(module) {
  const parseGregorianDate = (token) => {
    const fields = decoded(module.temporalParseGregorianDateWire(token));
    const [_, year, month, day] = fields;
    return Object.freeze({profile: GREGORIAN_DATE_PROFILE, originalText: token, year: Number(year), month: Number(month), day: Number(day)});
  };
  const parseRfc3339ExactInstant = (token) => {
    const fields = decoded(module.temporalParseRfc3339ExactInstantWire(token));
    const [_, utcSeconds, fractionalDigits, originalOffset, localOffsetKnown] = fields;
    return Object.freeze({profile: RFC3339_EXACT_INSTANT_PROFILE, originalText: token, utcSeconds,
      fractionalDigits, originalOffset, localOffsetKnown: localOffsetKnown === 'true'});
  };
  return Object.freeze({
    parseGregorianDate,
    truncateGregorianDate(token, unit) {
      const fields = decoded(module.temporalTruncateGregorianDateWire(token, unit));
      return fields[1];
    },
    parseRfc3339ExactInstant,
    sameRfc3339ExactInstant(left, right) {
      const fields = decoded(module.temporalSameRfc3339ExactInstantWire(left, right));
      return fields[1] === 'true';
    },
  });
}
