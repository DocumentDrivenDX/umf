export function makeRawHostCases() {
  const throwing = new Error('raw-number-host-sentinel');
  const result = [];
  const add = (id, token, events = [], thrown = throwing) => ({id, token, events, thrown});
  result.push(add('undefined', undefined));
  result.push(add('null', null));
  result.push(add('boolean-true', true));
  result.push(add('number-one', 1));
  result.push(add('number-zero', 0));
  result.push(add('symbol', Symbol('number')));
  const primitiveEvents = [];
  result.push(add('symbol-to-primitive-number-then-string', {
    [Symbol.toPrimitive](hint) { primitiveEvents.push(hint); return '1'; },
  }, primitiveEvents));
  const fallbackEvents = [];
  result.push(add('valueof-then-string-coercion', {
    valueOf() { fallbackEvents.push('valueOf'); return {}; },
    toString() { fallbackEvents.push('toString'); return '1'; },
  }, fallbackEvents));
  const throwEvents = [];
  const sentinel = new Error('host coercion sentinel');
  result.push(add('throwing-number-coercion', {
    [Symbol.toPrimitive](hint) { throwEvents.push(hint); throw sentinel; },
  }, throwEvents, sentinel));
  const badPrimitiveEvents = [];
  result.push(add('nonprimitive-to-primitive-result', {
    [Symbol.toPrimitive](hint) { badPrimitiveEvents.push(hint); return {}; },
  }, badPrimitiveEvents));
  return result;
}

export function captureOutcome(operation, item) {
  item.events.length = 0;
  try {
    const value = operation(item.token);
    return {id: item.id, outcome: value === undefined ? 'undefined' : {type: typeof value, value}, events: [...item.events]};
  } catch (error) {
    return {
      id: item.id,
      error: {name: error?.name ?? null, code: error?.code ?? null, message: error?.message ?? null, sameSentinel: error === item.thrown},
      events: [...item.events],
    };
  }
}
