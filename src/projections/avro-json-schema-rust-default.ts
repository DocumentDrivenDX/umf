// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError, type Document} from "../model/types";
import type {AvroDocumentBindings, AvroDocumentProjection} from "./avro-json-schema";

type NativeErrorGuard = (error: unknown) => boolean;

export interface AvroJsonSchemaProjectionEngine {
  ["avro-json-schema-projection"]: {
    projectAvroToJsonSchema(fields: {
      document: Document;
      bindings: AvroDocumentBindings;
    }): unknown;
  };
}

const CONTROL_CODES = new Set([
  "RESOURCE_LIMIT",
  "CANCELLED",
  "METER_FAILURE",
  "CANCELLATION_CHECK_FAILURE",
  "CLOCK_CAPABILITY_REQUIRED",
  "DEADLINE",
  "DEADLINE_EXCEEDED",
]);

/** Synchronous public projection facade over its closed Rust wire family. */
export function createAvroJsonSchemaRustDefault(
  engine: AvroJsonSchemaProjectionEngine,
  isNativeUmfCoreError: NativeErrorGuard = () => false,
) {
  function call<T>(operation: () => unknown): T {
    try {
      return operation() as T;
    } catch (error) {
      if (!isNativeUmfCoreError(error)) throw error;
      const native = error as {code?: unknown; message?: unknown; path?: unknown};
      if (
        typeof native.code !== "string" ||
        CONTROL_CODES.has(native.code) ||
        (!native.code.startsWith("AVRO_") &&
          native.code !== "REQUEST" &&
          native.code !== "JSON_SCHEMA_SYNTAX" &&
          native.code !== "JSON_SCHEMA_POINTER")
      ) {
        throw error;
      }
      throw new UmfError(
        native.code,
        String(native.message ?? ""),
        typeof native.path === "string" ? native.path : "",
      );
    }
  }

  return Object.freeze({
    projectAvroToJsonSchema(
      source: Document,
      bindings: AvroDocumentBindings,
    ): AvroDocumentProjection {
      return call<AvroDocumentProjection>(() =>
        engine["avro-json-schema-projection"].projectAvroToJsonSchema({
          document: source,
          bindings,
        }),
      );
    },
  });
}
