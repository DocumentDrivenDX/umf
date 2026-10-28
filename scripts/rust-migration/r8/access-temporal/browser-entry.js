// SPDX-License-Identifier: MIT OR Apache-2.0
import {initializeAccessTemporalWasm} from './index.js';

const api = await initializeAccessTemporalWasm();
const packet = await (await fetch('/packet.json')).json();
const canonical = value => JSON.stringify(value);
const rows = [];
for (const candidate of packet.cases) {
  let actual;
  try { actual = {status: 'ok', value: api.parseAccessTemporal(candidate.input.kind, candidate.input.token)}; }
  catch (error) { actual = {status: 'error', name: error.name, message: error.message}; }
  if (canonical(actual) !== canonical(candidate.outcome)) throw new Error('tagged case mismatch ' + candidate.id);
  rows.push(candidate.id);
}

let traps = 0, getters = 0;
for (const token of [null, 42, {}, [], new Date(0), new String('2024-01-01')]) {
  let refused = false;
  try { api.parseAccessTemporal('instant', token); }
  catch (error) { refused = error instanceof TypeError && error.message === 'Access temporal requires text'; }
  if (!refused) throw new Error('host token did not refuse as TypeError');
}
const proxyToken = new Proxy({}, {getPrototypeOf() { traps++; throw Error('trap'); }, ownKeys() { traps++; throw Error('trap'); }});
let proxyRefused = false;
try { api.parseAccessTemporal('date', proxyToken); }
catch (error) { proxyRefused = error instanceof TypeError && error.message === 'Access temporal requires text'; }
if (!proxyRefused) throw new Error('proxy token did not refuse as TypeError');
const accessorToken = Object.defineProperty({}, 'value', {enumerable: true, get() { getters++; throw Error('getter'); }});
let accessorRefused = false;
try { api.parseAccessTemporal('date', accessorToken); }
catch (error) { accessorRefused = error instanceof TypeError && error.message === 'Access temporal requires text'; }
if (!accessorRefused) throw new Error('accessor token did not refuse as TypeError');

try { api.parseAccessTemporal('invalid', 'x'.repeat(33)); throw new Error('wrong precedence'); }
catch (error) { if (!(error instanceof RangeError) || error.message !== 'Access temporal kind') throw error; }
try { api.parseAccessTemporal('invalid', null); throw new Error('wrong token precedence'); }
catch (error) { if (!(error instanceof TypeError) || error.message !== 'Access temporal requires text') throw error; }
try { api.parseAccessTemporal('date', '\ud800'); throw new Error('surrogate accepted'); }
catch (error) { if (!(error instanceof RangeError) || error.message !== 'Gregorian date requires ten ASCII characters') throw error; }
if (traps || getters || 'process' in globalThis || 'Buffer' in globalThis) throw new Error('host boundary violation');
window.accessTemporalResult = {tagged: rows.length, traps, getters, nodeGlobalsAbsent: true};
