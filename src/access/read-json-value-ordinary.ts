// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/errors';
import type {Json} from '../model/types';

/** Narrow N-API entry implemented by the shared Rust core. */
export interface OrdinaryReadJsonValueBinding {
  readJsonValueOrdinaryText(source: string, formatIsJson: boolean): string;
}

type WireValue = null | boolean | number | string | WireValue[] | {[key: string]: WireValue};
type WireOutcome =
  | {ok: true; value: WireValue}
  | {ok: false; code: string; path: string; message: string};

// These intrinsics frame the private addon response. The semantic preflight
// below intentionally performs a live JSON.parse lookup on every invocation.
const parseFrame = JSON.parse.bind(JSON) as (text: string) => WireOutcome;
const NativeArray = Array;
const arrayIsArray = Array.isArray;
const create = Object.create;
const define = Object.defineProperty;
const objectKeys = Object.keys;
const hasOwn = Object.hasOwn;

/**
 * Explicit ordinary-profile opt-in for primitive string inputs. Catalog mode
 * and arbitrary host objects remain on the TypeScript-selected route.
 */
export function readJsonValueOrdinary(binding: OrdinaryReadJsonValueBinding, source: string, format: unknown = 'yaml'): Json {
  if (typeof source !== 'string') throw new TypeError('source must be a primitive string');

  // Keep the source-level order: first text limit, live JSON.parse preflight,
  // parser composition's second length observation, then Rust extraction.
  if (source.length > 4_000_000) throw new UmfError('LIMIT', 'Source text exceeds limit');
  const isJson = format === 'json';
  if (isJson) {
    try {
      JSON.parse(source);
    } catch {
      throw new UmfError('SYNTAX', 'Invalid JSON syntax');
    }
  }
  void source.length;

  const raw = binding.readJsonValueOrdinaryText(source, isJson);
  const outcome = parseFrame(raw);
  if (!outcome || typeof outcome !== 'object' || !hasOwn(outcome, 'ok')) {
    throw new TypeError('Malformed Rust readJsonValue result frame');
  }
  if (!outcome.ok) {
    if (typeof outcome.code !== 'string' || typeof outcome.path !== 'string' || typeof outcome.message !== 'string') {
      throw new TypeError('Malformed Rust readJsonValue error frame');
    }
    throw new UmfError(outcome.code, outcome.message, outcome.path);
  }
  return rebuild(outcome.value) as Json;
}

function rebuild(value: WireValue): Json {
  if (value === null || typeof value !== 'object') return value;
  if (arrayIsArray(value)) {
    const result = new NativeArray(value.length);
    for (let index = 0; index < value.length; index++) {
      define(result, String(index), {
        value: rebuild(value[index]!), writable: true, enumerable: true, configurable: true,
      });
    }
    return result;
  }
  const result = create(null) as Record<string, Json>;
  for (const key of objectKeys(value)) {
    define(result, key, {
      value: rebuild(value[key]!), writable: true, enumerable: true, configurable: true,
    });
  }
  return result;
}
