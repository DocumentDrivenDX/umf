import {createCoreCardinalityHostInputEngine} from '../../../bindings/core/wasm/index.js';

export function runCardinalityBrowserCases(module: any, payload: any) {
  const engine = createCoreCardinalityHostInputEngine(module, payload.resources);
  const packet = payload.packet;
  const outcomes = {
    missing: engine.inspectCoreCardinality(packet.document, packet.identity),
    known: engine.inspectCoreCardinality(packet.known, packet.identity),
    unknown: engine.inspectCoreCardinality(packet.unknown, packet.identity),
    inapplicable: engine.inspectCoreCardinality(packet.inapplicable, packet.identity),
    declaration: engine.declareCoreCardinality(packet.document, packet.identity, packet.request),
    surrogateItemDeclaration: engine.declareCoreCardinality(packet.surrogateItemDocument, packet.identity, packet.surrogateItemRequest),
    verified: engine.verifyCoreCardinalityDeclaration(packet.verified.value, packet.verified.value.target),
  };
  const events: string[] = [];
  const source = new Proxy(packet.document, {ownKeys(target) { events.push('source'); return Reflect.ownKeys(target); }});
  const identity = new Proxy(packet.identity, {ownKeys(target) { events.push('identity'); return Reflect.ownKeys(target); }});
  engine.inspectCoreCardinality(source, identity);
  const inspectOrder = [...events];

  events.length = 0;
  const invalidRequest = new Proxy({cardinality: 'future'}, {ownKeys(target) { events.push('request'); return Reflect.ownKeys(target); }});
  const sourceProbe = new Proxy(packet.document, {ownKeys(target) { events.push('source'); return Reflect.ownKeys(target); }});
  let requestError: any;
  try { engine.declareCoreCardinality(sourceProbe, packet.identity, invalidRequest); } catch (error) { requestError = error; }

  let currentReads = 0;
  const current = new Proxy(packet.document, {ownKeys(target) { currentReads++; return Reflect.ownKeys(target); }});
  let receiptError: any;
  try { engine.verifyCoreCardinalityDeclaration(packet.malformedSourceReceipt, current); } catch (error) { receiptError = error; }

  const sentinel = {hostFailure: true};
  const throwingSource = new Proxy(packet.document, {ownKeys() { throw sentinel; }});
  let thrownIdentity = false;
  try { engine.inspectCoreCardinality(throwingSource, packet.identity); } catch (error) { thrownIdentity = error === sentinel; }

  return {
    outcomes,
    inspectOrder,
    requestBeforeSource: {events, code: requestError?.code},
    receiptBeforeCurrent: {currentReads, code: receiptError?.code},
    thrownIdentity,
    nodeGlobalsAbsent: typeof process === 'undefined' && typeof Buffer === 'undefined',
  };
}
