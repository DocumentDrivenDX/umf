// SPDX-License-Identifier: MIT OR Apache-2.0
// Small serializable hooks for the two native model dispatch entrypoints.
export function installCoreFacetsDispatchObserver(addon, decodeOperation, onOperation) {
  const targets = [
    [addon, 'executeRequestWire'],
    [addon?.CoreKindNullabilityRuntime?.prototype, 'executeModelRequestWire'],
  ];
  const originals = [];
  for (const [owner, key] of targets) {
    if (!owner) throw new TypeError(`Missing required dispatch owner for ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (!descriptor || typeof descriptor.value !== 'function' || !descriptor.writable)
      throw new TypeError(`Required dispatch entrypoint is absent or immutable: ${key}`);
    originals.push({ owner, key, descriptor });
  }
  const wrappers = originals.map(({ owner, key, descriptor }) => function (...args) {
    const op = decodeOperation(args[0]);
    if (typeof op === 'string' && op.startsWith('model/')) onOperation(op);
    return Reflect.apply(descriptor.value, this, args);
  });
  let installed = 0;
  try {
    for (let i = 0; i < originals.length; i++) {
      const item = originals[i];
      Object.defineProperty(item.owner, item.key, { ...item.descriptor, value: wrappers[i] });
      installed++;
    }
  } catch (error) {
    for (let i = installed - 1; i >= 0; i--) Object.defineProperty(originals[i].owner, originals[i].key, originals[i].descriptor);
    throw error;
  }
  let restored = false;
  return () => {
    if (restored) return;
    for (let i = originals.length - 1; i >= 0; i--) Object.defineProperty(originals[i].owner, originals[i].key, originals[i].descriptor);
    restored = true;
  };
}

export function findUniqueDispatchLines(source, markers) {
  return markers.map(marker => {
    let offset = -1, count = 0;
    while ((offset = source.indexOf(marker, offset + 1)) !== -1) count++;
    if (count !== 1) throw new Error(`Expected exactly one browser dispatch marker (${marker}); found ${count}`);
    offset = source.indexOf(marker);
    return source.slice(0, offset).split('\n').length - 1;
  });
}

export async function installCoreFacetsBrowserDispatchBreakpoints(cdp, url, source) {
  const markers = [
    'function executeRequestWire(wire_json, profile, dispatcher, control_dispatcher) {',
    'executeModelRequestWire(wire_json, profile, dispatcher, control_dispatcher) {',
  ];
  const lines = findUniqueDispatchLines(source, markers);
  const installed = [];
  const restore = async () => {
    const pending = installed.splice(0);
    const results = await Promise.allSettled(pending.map(breakpointId => cdp.send('Debugger.removeBreakpoint', {breakpointId})));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Could not remove browser dispatch breakpoints');
  };
  try {
    for (const lineNumber of lines) {
      const result = await cdp.send('Debugger.setBreakpointByUrl', {url, lineNumber});
      if (typeof result.breakpointId !== 'string' || !result.breakpointId)
        throw new Error('Browser dispatch breakpoint has no identity');
      installed.push(result.breakpointId);
    }
  } catch (error) {
    try { await restore(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Browser dispatch setup and cleanup failed');
    }
    throw error;
  }
  return restore;
}
