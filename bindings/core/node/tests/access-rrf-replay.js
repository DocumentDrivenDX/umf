export function prepareRrfReplayCases(packet) {
  return packet.cases
    .filter(row => row.input.fusion === 'rrf' && row.outcomeKind === 'result')
    .map(row => {
      const keyId = key => JSON.stringify(key);
      const keys = new Map();
      for (const leg of row.input.legs) for (const candidate of leg) {
        const id = keyId(candidate.keyComponents);
        if (!keys.has(id)) keys.set(id, {components: candidate.keyComponents, item: candidate.itemLabel});
      }
      const orderedKeys = [...keys.entries()].sort((left, right) => compareComponents(left[1].components, right[1].components));
      const identityByKey = new Map(orderedKeys.map(([id], identity) => [id, identity]));
      const expectedIdentity = new Map(row.result.items.map(item => [item.item, identityByKey.get([...keys].find(([, value]) => value.item === item.item)?.[0])]));
      const expected = row.result.items.map(item => ({identity: expectedIdentity.get(item.item), score: item.score.value}));
      return {
        name: row.name,
        request: {
          constant: String(row.input.constant),
          topK: row.input.topK,
          keyCount: orderedKeys.length,
          keyOrder: orderedKeys.map((_, identity) => identity),
          legs: row.input.legs.map(leg => leg.map(candidate => identityByKey.get(keyId(candidate.keyComponents)))),
        },
        expected,
      };
    }).concat([{
      name: 'non-involutive-key-order-permutation',
      request: {constant: '1', topK: 3, keyCount: 3, keyOrder: [2, 0, 1], legs: [[0, 1, 2], [2, 1, 0]]},
      expected: [{identity: 2, score: 0.75}, {identity: 0, score: 0.75}, {identity: 1, score: 2 / 3}],
    }]);
}

export function compareRrfReplay(engine, cases) {
  const mismatches = [];
  for (const row of cases) {
    const actual = engine.score(row.request).ordered;
    if (actual.length !== row.expected.length) {
      mismatches.push({name: row.name, expected: row.expected, actual});
      continue;
    }
    for (let index = 0; index < actual.length; index++) {
      if (actual[index].identity !== row.expected[index].identity || floatBits(actual[index].score) !== floatBits(row.expected[index].score)) {
        mismatches.push({name: row.name, index, expected: row.expected[index], actual: actual[index], expectedBits: floatBits(row.expected[index].score), actualBits: floatBits(actual[index].score)});
        break;
      }
    }
  }
  return {cases: cases.length, mismatches};
}

function compareComponents(left, right) {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] === right[index]) continue;
    return left[index] < right[index] ? -1 : 1;
  }
  return left.length - right.length;
}

function floatBits(value) {
  const bytes = new ArrayBuffer(8);
  new DataView(bytes).setFloat64(0, value, false);
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
