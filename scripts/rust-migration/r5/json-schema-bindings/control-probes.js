const baseUri = 'https://schemas.example.test/controls.json';
const source = '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"x":{"type":"number"}},"$defs":{"nested":{"type":"string"}}}';
function capture(fn) {
  try { return {status: 'returned', value: JSON.parse(JSON.stringify(fn()))}; }
  catch (error) { return {status: 'threw', name: error?.name ?? 'Error', code: error?.code ?? null, message: error?.message ?? String(error), path: error?.path ?? ''}; }
}

export function runControlProbes(makeEngine) {
  const document = makeEngine().importJsonSchema(source, {id: 'urn:umf:r5:control-probe', baseUri});
  const cases = [];
  const run = (id, controls, operation = 'walkJsonSchema') => {
    let meterCalls = 0;
    const observed = controls ? {...controls, ...(controls.meter ? {meter: (amount) => { meterCalls++; controls.meter(amount); }} : {})} : undefined;
    const configured = makeEngine(observed ? {controls: observed} : {});
    const actual = capture(() => configured[operation](document));
    cases.push({id, operation, meterCalls, actual});
  };
  run('controls.max-work-preflight', {maxWork: 0});
  run('controls.cancelled-preflight', {isCancelled: () => true});
  run('controls.deadline-preflight', {deadlineMs: 10, now: () => 11});
  run('controls.meter-first-hook-failure', {meter: () => { throw new Error('r5-meter-first-hook'); }});
  let lateMeterCalls = 0;
  run('controls.meter-late-hook-failure', {meter: () => { lateMeterCalls++; if (lateMeterCalls === 4) throw new Error('r5-meter-late-hook'); }}, 'exportJsonSchemaBundle');
  cases[cases.length - 1].userMeterCalls = lateMeterCalls;
  return cases;
}
