export const ACCESS_RRF_PROFILE = 'umf-r8-access-rrf/0.1.0';
export const ACCESS_RRF_MAX_CONSTANT_DIGITS = 4096;
export const ACCESS_RRF_MAX_IDENTITIES = 10_000;
export const ACCESS_RRF_MAX_OBSERVATIONS = 10_000;

/** Build the opt-in public facade for pure reciprocal-rank scoring. keyOrder lists identity indexes in complete-key sort order. */
export function createAccessRrfOperations(call, createContext = () => ({charge() {}, control: undefined})) {
  return Object.freeze({
    profile: ACCESS_RRF_PROFILE,
    score(request) {
      if (!request || typeof request !== 'object') throw new TypeError('RRF request must be an object');
      const {constant, topK, keyCount, keyOrder, legs} = request;
      if (typeof constant !== 'string' || constant.length > ACCESS_RRF_MAX_CONSTANT_DIGITS || !/^[1-9][0-9]*$/.test(constant)) throw new TypeError('RRF constant must be a positive decimal string of at most 4096 digits');
      if (!Number.isSafeInteger(topK) || topK < 0 || topK > ACCESS_RRF_MAX_IDENTITIES) throw new TypeError('RRF topK must be between 0 and 10000');
      if (!Number.isSafeInteger(keyCount) || keyCount < 0 || keyCount > ACCESS_RRF_MAX_IDENTITIES) throw new TypeError('RRF keyCount must be between 0 and 10000');
      if (!Array.isArray(keyOrder) || keyOrder.length !== keyCount) {
        throw new TypeError('RRF keyOrder must be a permutation of 0..keyCount-1');
      }
      if (!Array.isArray(legs)) {
        throw new TypeError('RRF legs must be dense arrays of unique in-range identities');
      }
      if (legs.length > ACCESS_RRF_MAX_OBSERVATIONS) throw new RangeError('RRF leg limit exceeded (10000)');
      const context = createContext();
      const charge = context.charge;
      const orderedKeys = new Set();
      const copiedKeyOrder = new Array(keyCount);
      for (let i = 0; i < keyCount; i++) {
        charge(1);
        const identity = keyOrder[i];
        if (!Number.isSafeInteger(identity) || identity < 0 || identity >= keyCount || orderedKeys.has(identity)) throw new TypeError('RRF keyOrder must be a permutation of 0..keyCount-1');
        orderedKeys.add(identity);
        copiedKeyOrder[i] = identity;
      }
      let observationCount = 0;
      for (const leg of legs) {
        charge(1);
        if (!Array.isArray(leg)) throw new TypeError('RRF legs must be dense arrays of unique in-range identities');
        observationCount += leg.length;
        if (observationCount > ACCESS_RRF_MAX_OBSERVATIONS) throw new RangeError('RRF observation limit exceeded (10000)');
      }
      const copiedLegs = new Array(legs.length);
      for (let legIndex = 0; legIndex < legs.length; legIndex++) {
        const leg = legs[legIndex];
        const seenInLeg = new Set();
        const copiedLeg = new Array(leg.length);
        for (let i = 0; i < leg.length; i++) {
          charge(1);
          const identity = leg[i];
          if (!Number.isSafeInteger(identity) || identity < 0 || identity >= keyCount || seenInLeg.has(identity)) throw new TypeError('RRF legs must be dense arrays of unique in-range identities');
          seenInLeg.add(identity);
          copiedLeg[i] = identity;
        }
        copiedLegs[legIndex] = copiedLeg;
      }
      const requestWire = {profile: ACCESS_RRF_PROFILE, op: 'access.rrf.score', constant, topK, keyCount, keyOrder: copiedKeyOrder, legs: copiedLegs};
      const result = call(requestWire, context);
      if (!result || !Array.isArray(result.ordered) || result.ordered.length > topK) throw new TypeError('Rust RRF scorer returned a malformed result');
      const seen = new Set();
      for (const row of result.ordered) {
        if (!row || !Number.isSafeInteger(row.identity) || row.identity < 0 || row.identity >= keyCount || seen.has(row.identity) || typeof row.score !== 'number' || !Number.isFinite(row.score)) {
          throw new TypeError('Rust RRF scorer returned a malformed result');
        }
        seen.add(row.identity);
      }
      return result;
    },
  });
}
