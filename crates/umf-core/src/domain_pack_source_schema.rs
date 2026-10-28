// SPDX-License-Identifier: MIT OR Apache-2.0
//! Pure ordered composition of the CONTRACT-052 dataset-source schema.
//!
//! This mirrors `generateDatasetSourceSchema()` in the browser-compatible
//! TypeScript source. It does not load the canonical resource from disk; the
//! checked-in JSON schema remains the comparison authority in tests.

use crate::value::{Utf16, Value};

fn text(value: &str) -> Value {
    Value::String(Utf16::from(value))
}

fn object(fields: &[(&str, Value)]) -> Value {
    Value::Object(
        fields
            .iter()
            .map(|(key, value)| (Utf16::from(*key), value.clone()))
            .collect(),
    )
}

fn strings(values: &[&str]) -> Value {
    Value::Array(values.iter().map(|value| text(value)).collect())
}

fn nonempty_string() -> Value {
    object(&[("type", text("string")), ("minLength", Value::Number(1.0))])
}

/// Compose the ordered dataset-source Draft 2020-12 schema from CONTRACT-052.
///
/// Object members retain the same insertion order as the TypeScript generator,
/// so `serialization::stringify_compact` produces byte-stable JSON output.
pub fn generate_dataset_source_schema() -> Value {
    let generator = object(&[
        ("type", text("object")),
        ("required", strings(&["id", "version"])),
        (
            "properties",
            object(&[
                ("id", nonempty_string()),
                (
                    "version",
                    object(&[
                        ("type", text("string")),
                        ("pattern", text("^[0-9]+\\.[0-9]+\\.[0-9]+$")),
                    ]),
                ),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ]);

    let checksum = object(&[
        ("type", text("object")),
        ("required", strings(&["algorithm", "value"])),
        (
            "properties",
            object(&[
                ("algorithm", object(&[("const", text("sha256"))])),
                (
                    "value",
                    object(&[
                        ("type", text("string")),
                        ("pattern", text("^[a-f0-9]{64}$")),
                    ]),
                ),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ]);

    let license = object(&[
        ("type", text("object")),
        (
            "properties",
            object(&[
                ("id", nonempty_string()),
                ("reference", nonempty_string()),
                (
                    "redistribution",
                    object(&[
                        (
                            "enum",
                            strings(&["allowed", "restricted", "unknown"]),
                        ),
                    ]),
                ),
                ("attribution", object(&[("type", text("string"))])),
                (
                    "notices",
                    object(&[
                        ("type", text("array")),
                        ("items", object(&[("type", text("string"))])),
                    ]),
                ),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ]);

    let provenance = object(&[
        ("type", text("object")),
        (
            "properties",
            object(&[
                ("publisher", nonempty_string()),
                ("retrieved_at", nonempty_string()),
                (
                    "source_ids",
                    object(&[("type", text("array")), ("items", nonempty_string())]),
                ),
                (
                    "transformations",
                    object(&[("type", text("array")), ("items", nonempty_string())]),
                ),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ]);

    object(&[
        (
            "$schema",
            text("https://json-schema.org/draft/2020-12/schema"),
        ),
        ("$id", text("urn:umf:dataset-source:1.0.0")),
        ("type", text("object")),
        ("required", strings(&["kind", "data_kind"])),
        (
            "properties",
            object(&[
                (
                    "kind",
                    object(&[("enum", strings(&["synthetic", "external"]))]),
                ),
                (
                    "data_kind",
                    object(&[(
                        "enum",
                        strings(&["fabricated", "observed", "deidentified", "unknown"]),
                    )]),
                ),
                ("description", object(&[("type", text("string"))])),
                ("generator", generator),
                ("reference", nonempty_string()),
                ("format", nonempty_string()),
                ("revision", nonempty_string()),
                ("checksum", checksum),
                ("license", license),
                ("provenance", provenance),
            ]),
        ),
        (
            "allOf",
            Value::Array(vec![
                object(&[
                    (
                        "if",
                        object(&[(
                            "properties",
                            object(&[("kind", object(&[("const", text("external"))]))]),
                        )]),
                    ),
                    (
                        "then",
                        object(&[
                            (
                                "properties",
                                object(&[
                                    ("reference", object(&[])),
                                    ("format", object(&[])),
                                ]),
                            ),
                            ("required", strings(&["reference", "format"])),
                        ]),
                    ),
                ]),
                object(&[
                    (
                        "if",
                        object(&[(
                            "properties",
                            object(&[("kind", object(&[("const", text("synthetic"))]))]),
                        )]),
                    ),
                    (
                        "then",
                        object(&[
                            (
                                "properties",
                                object(&[("generator", object(&[]))]),
                            ),
                            ("required", strings(&["generator"])),
                        ]),
                    ),
                ]),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ])
}

#[cfg(test)]
mod tests {
    use super::generate_dataset_source_schema;
    use crate::{serialization::stringify_compact, value::Value};

    const CANONICAL: &str = include_str!("../../../spec/extensions/dataset-source/schema.json");

    // Drop JSON whitespace outside strings while preserving every source byte
    // inside strings. The canonical resource is ASCII, so this is also its
    // expected compact UTF-8 serialization in authored member order.
    fn compact_canonical(source: &str) -> String {
        let mut result = String::with_capacity(source.len());
        let mut in_string = false;
        let mut escaped = false;
        for ch in source.chars() {
            if in_string {
                result.push(ch);
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == '"' {
                    in_string = false;
                }
            } else if ch == '"' {
                result.push(ch);
                in_string = true;
            } else if !ch.is_whitespace() {
                result.push(ch);
            }
        }
        result
    }

    #[test]
    fn generated_schema_matches_canonical_structure_order_and_compact_bytes() {
        let generated = generate_dataset_source_schema();
        let generated_json = stringify_compact(&generated)
            .unwrap()
            .to_utf8()
            .unwrap();

        let expected: serde_json::Value = serde_json::from_str(CANONICAL).unwrap();
        let actual: serde_json::Value = serde_json::from_str(&generated_json).unwrap();
        assert_eq!(actual, expected, "schema structure differs from canonical JSON");
        assert_eq!(generated_json, compact_canonical(CANONICAL));

        let Value::Object(fields) = generated else {
            panic!("dataset source schema root must be an object");
        };
        let keys: Vec<String> = fields
            .iter()
            .map(|(key, _)| key.to_utf8().unwrap())
            .collect();
        assert_eq!(
            keys,
            ["$schema", "$id", "type", "required", "properties", "allOf", "additionalProperties"]
        );
    }
}
