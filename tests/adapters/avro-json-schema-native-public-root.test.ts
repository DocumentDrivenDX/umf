// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from "bun:test";
import {
  importAvroSchema,
  projectAvroToJsonSchema,
} from "../../src/index-node-v4";

const bindings = {
  id: "avro-projection-target",
  schemaId: "https://example.test/schemas/avro-projection",
  long: "decimal-string",
  bytes: "hex-string",
  union: "untagged",
  lossPolicy: "allow-reported-loss",
} as const;

test(
  "Node public root projects Avro and reports strict loss refusal",
  () => {
    const source = importAvroSchema(
      JSON.stringify({
        type: "record",
        name: "Thing",
        fields: [{name: "id", type: "long"}],
      }),
      {id: "avro-projection-source"},
    );
    const projected = projectAvroToJsonSchema(source, bindings);
    expect(projected.status).toBe("projected");
    expect(projected.source).toEqual(source);
    expect(projected.target).toBeDefined();
    expect(projected.nativeSchema).toContain('"$defs"');
    expect(projected.issues.some((issue) => issue.code === "LONG_ENCODING")).toBe(true);

    const strict = projectAvroToJsonSchema(source, {
      ...bindings,
      lossPolicy: "strict",
    });
    expect(strict.status).toBe("blocked");
    expect(strict.target).toBeUndefined();
  },
  30_000,
);
