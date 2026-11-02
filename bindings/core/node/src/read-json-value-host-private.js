// SPDX-License-Identifier: MIT OR Apache-2.0
// Private test dispatcher. This module is intentionally absent from package roots.
const parseFrame = JSON.parse;
const fromCharCode = String.fromCharCode;
const charCodeAt = Function.call.bind(String.prototype.charCodeAt);
const startsWith = Function.call.bind(String.prototype.startsWith);
const split = Function.call.bind(String.prototype.split);
const objectCreate = Object.create;
const hasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const NativeTypeError = TypeError;
const MAX_ERROR_UNITS = 4_000_000;
const ERROR_CHUNK_UNITS = 4096;

function decodeUnits(wire) {
  if (wire === '') return '';
  const buffer = new Uint16Array(ERROR_CHUNK_UNITS);
  let output = '';
  let count = 0;
  let value = 0;
  let digits = 0;
  for (let i = 0; i <= wire.length; i++) {
    const ch = i === wire.length ? 44 : charCodeAt(wire, i);
    if (ch === 44) {
      if (digits === 0 || value > 65535 || count >= MAX_ERROR_UNITS) throw new TypeError('Invalid host error frame');
      buffer[count % ERROR_CHUNK_UNITS] = value;
      count++;
      value = 0;
      digits = 0;
      if (count % ERROR_CHUNK_UNITS === 0) output += fromCharCode(...buffer);
    } else {
      if (ch < 48 || ch > 57 || digits >= 5) throw new TypeError('Invalid host error frame');
      value = value * 10 + ch - 48;
      digits++;
    }
  }
  const remainder = count % ERROR_CHUNK_UNITS;
  if (remainder) output += fromCharCode(...buffer.subarray(0, remainder));
  return output;
}

export function invokeReadJsonValueHostPrivate(addon, source, format, ErrorType = Error) {
  const handles = objectCreate(null);
  handles[1] = source;
  handles[2] = format;
  const thrown = objectCreate(null);
  let nextThrown = 0;
  const dispatch = (requestText) => {
    const request = parseFrame(requestText);
    const raw = handles[request.raw];
    try {
      switch (request.op) {
        case 'limit': return raw.length > request.count ? 'true' : 'false';
        case 'format': return format === 'json' ? 'json' : 'yaml';
        case 'preflight':
          try { JSON.parse(raw); return 'ok'; }
          catch { return 'throw:0'; }
        case 'length': void raw.length; return 'ok';
        case 'kind':
          if (typeof raw === 'string') return `string:${raw.length}`;
          return raw ? 'truthy' : 'falsy';
        case 'chunk': {
          const requestedEnd = request.offset + request.count;
          const end = raw.length < requestedEnd ? raw.length : requestedEnd;
          let reply = '';
          for (let i = request.offset; i < end; i++) reply += `${i === request.offset ? '' : ','}${charCodeAt(raw, i)}`;
          return reply;
        }
        default: return 'throw:0';
      }
    } catch (error) {
      const token = nextThrown++;
      thrown[token] = error;
      return `throw:${token}`;
    }
  };
  let frame;
  try {
    frame = addon.executeReadJsonValueRawHostPrivate(1, 2, dispatch);
    if (startsWith(frame, 'throw:')) {
      const tokenText = frame.slice(6);
      const token = Number(tokenText);
      if (!Number.isSafeInteger(token) || !hasOwn(thrown, token)) throw new NativeTypeError('Invalid host throw token');
      throw thrown[token];
    }
    if (frame === 'typeerror') throw new NativeTypeError('source is not a string');
    if (startsWith(frame, 'error:')) {
      const fields = split(frame, ':');
      if (fields.length !== 5 || !/^[A-Z][A-Z0-9_]*$/.test(fields[1])) throw new NativeTypeError('Invalid host error frame');
      const code = fields[1];
      if (decodeUnits(fields[2]) !== code) throw new NativeTypeError('Invalid host error frame');
      const path = decodeUnits(fields[3]);
      const message = decodeUnits(fields[4]);
      const err = new ErrorType(message);
      err.code = code; err.path = path;
      throw err;
    }
    return frame;
  } finally {
    delete handles[1];
    delete handles[2];
    for (let token = 0; token < nextThrown; token++) delete thrown[token];
  }
}
