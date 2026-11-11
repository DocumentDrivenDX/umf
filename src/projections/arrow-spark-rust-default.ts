// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError, type Document} from '../model/types';
import type {ArrowSparkPolicy, ArrowSparkProjection} from './arrow-spark-types';
import type {SparkArrowPolicy, SparkArrowProjection} from './spark-arrow-types';

type NativeErrorGuard = (error: unknown) => boolean;

export interface ArrowSparkNativeFamily {
  ['arrow-spark-projection']: {
    projectArrowToSpark(fields: {document: Document; policy: ArrowSparkPolicy}): unknown;
    projectSparkToArrow(fields: {document: Document; policy: SparkArrowPolicy}): unknown;
  };
}

const CONTROL_CODES = new Set([
  'RESOURCE_LIMIT',
  'CANCELLED',
  'METER_FAILURE',
  'CANCELLATION_CHECK_FAILURE',
  'CLOCK_CAPABILITY_REQUIRED',
  'DEADLINE',
  'DEADLINE_EXCEEDED',
]);

/** Synchronous public projection facade over the closed Rust wire family. */
export function createArrowSparkRustDefault(
  engine: ArrowSparkNativeFamily,
  isNativeError: NativeErrorGuard = () => false,
) {
  function call<T>(operation: () => unknown): T {
    try {
      return operation() as T;
    } catch (error) {
      if (!isNativeError(error)) throw error;
      const native = error as {code?: unknown; message?: unknown; path?: unknown};
      if (
        typeof native.code !== 'string' ||
        CONTROL_CODES.has(native.code) ||
        (!native.code.startsWith('ARROW_') &&
          !native.code.startsWith('SPARK_') &&
          native.code !== 'REQUEST')
      ) {
        throw error;
      }
      throw new UmfError(
        native.code,
        String(native.message ?? ''),
        typeof native.path === 'string' ? native.path : '',
      );
    }
  }

  return Object.freeze({
    projectArrowToSpark(source: Document, policy: ArrowSparkPolicy): ArrowSparkProjection {
      return call(() =>
        engine['arrow-spark-projection'].projectArrowToSpark({document: source, policy}),
      ) as ArrowSparkProjection;
    },
    projectSparkToArrow(source: Document, policy: SparkArrowPolicy): SparkArrowProjection {
      return call(() =>
        engine['arrow-spark-projection'].projectSparkToArrow({document: source, policy}),
      ) as SparkArrowProjection;
    },
  });
}
