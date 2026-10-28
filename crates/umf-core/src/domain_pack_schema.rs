//! CONTRACT-052 domain-pack schema resources and pure schema composition.

use crate::{
    context::Context,
    error::EngineError,
    serialization::{write_json_value, Format},
    value::{Utf16, Value},
};
pub use crate::domain_pack_source_schema::generate_dataset_source_schema;

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

fn array(values: Vec<Value>) -> Value {
    Value::Array(values)
}

fn strings(values: &[&str]) -> Value {
    array(values.iter().map(|value| text(value)).collect())
}

fn number(value: usize) -> Value {
    Value::Number(value as f64)
}

fn nonempty_text() -> Value {
    object(&[("type", text("string")), ("minLength", number(1))])
}

fn version() -> Value {
    object(&[
        ("type", text("string")),
        ("pattern", text("^[0-9]+\\.[0-9]+\\.[0-9]+$")),
    ])
}

fn sha256_checksum() -> Value {
    object(&[
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
    ])
}

fn artifact_collection_schema() -> Value {
    let text_schema = nonempty_text();
    let references = object(&[
        ("type", text("array")),
        ("maxItems", number(10_000)),
        ("uniqueItems", Value::Bool(true)),
        ("items", text_schema.clone()),
    ]);
    let assertion = object(&[
        ("type", text("object")),
        ("required", strings(&["description"])),
        (
            "properties",
            object(&[
                ("description", text_schema.clone()),
                ("fields", references.clone()),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ]);
    object(&[
        ("type", text("object")),
        (
            "required",
            strings(&[
                "version",
                "id",
                "title",
                "view",
                "semantic_kinds",
                "source_ids",
            ]),
        ),
        (
            "properties",
            object(&[
                ("version", object(&[("const", text("1.0.0"))])),
                (
                    "id",
                    object(&[
                        ("type", text("string")),
                        ("pattern", text("^[A-Za-z][A-Za-z0-9_-]*$")),
                    ]),
                ),
                ("title", text_schema.clone()),
                ("description", object(&[("type", text("string"))])),
                (
                    "view",
                    object(&[("enum", strings(&["documents", "imaging", "other"]))]),
                ),
                (
                    "semantic_kinds",
                    object(&[
                        ("type", text("array")),
                        ("maxItems", number(10_000)),
                        ("uniqueItems", Value::Bool(true)),
                        ("items", text_schema.clone()),
                        ("minItems", number(1)),
                    ]),
                ),
                ("source_ids", references.clone()),
                ("media_types", references.clone()),
                ("metadata_schema_ids", references.clone()),
                ("derived_schema_ids", references.clone()),
                ("ontology_schema_ids", references),
                ("loader_inventory_source_id", text_schema),
                ("identity", assertion.clone()),
                ("grouping", assertion),
            ]),
        ),
        (
            "anyOf",
            array(vec![
                object(&[(
                    "properties",
                    object(&[(
                        "source_ids",
                        object(&[("type", text("array")), ("minItems", number(1))]),
                    )]),
                )]),
                object(&[
                    ("required", strings(&["loader_inventory_source_id"])),
                    (
                        "properties",
                        object(&[(
                            "loader_inventory_source_id",
                            nonempty_text(),
                        )]),
                    ),
                ]),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ])
}

fn preservation_schema() -> Value {
    let nonempty = nonempty_text();
    object(&[
        ("type", text("object")),
        (
            "required",
            strings(&[
                "version",
                "handoff",
                "fixity",
                "events",
                "provenance",
                "originals",
                "primary_runtime",
            ]),
        ),
        (
            "properties",
            object(&[
                ("version", object(&[("const", text("1.0.0"))])),
                ("handoff", object(&[("const", text("BagIt-1.0"))])),
                ("fixity", object(&[("const", text("sha256"))])),
                (
                    "events",
                    object(&[("const", text("PREMIS-3.0-semantic-mapping"))]),
                ),
                (
                    "provenance",
                    object(&[("const", text("PROV-O-JSON-LD"))]),
                ),
                (
                    "originals",
                    object(&[("const", text("authoritative-immutable-bytes"))]),
                ),
                (
                    "primary_runtime",
                    object(&[("const", text("tablespec-python"))]),
                ),
                ("qualification", nonempty.clone()),
                (
                    "derivations",
                    object(&[
                        ("type", text("array")),
                        (
                            "items",
                            object(&[
                                ("type", text("object")),
                                (
                                    "required",
                                    strings(&["schema_id", "source_identity"]),
                                ),
                                (
                                    "properties",
                                    object(&[
                                        ("schema_id", nonempty.clone()),
                                        ("source_identity", nonempty),
                                        (
                                            "qualification",
                                            nonempty_text(),
                                        ),
                                    ]),
                                ),
                                ("additionalProperties", Value::Bool(true)),
                            ]),
                        ),
                    ]),
                ),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ])
}

/// Compose the ordered, browser-portable CONTRACT-052 domain-pack schema.
/// This mirrors `generateDomainPackSchema()` without host input or I/O.
pub fn generate_domain_pack_schema() -> Value {
    let text_schema = nonempty_text();
    let schema_reference = object(&[
        ("type", text("object")),
        ("required", strings(&["id", "format", "reference"])),
        (
            "properties",
            object(&[
                ("id", text_schema.clone()),
                ("format", text_schema.clone()),
                ("reference", text_schema.clone()),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ]);
    let domain_type = object(&[
        ("type", text("object")),
        (
            "properties",
            object(&[
                ("description", object(&[("type", text("string"))])),
                (
                    "sample_generation",
                    object(&[
                        ("type", text("object")),
                        ("required", strings(&["method"])),
                        (
                            "properties",
                            object(&[(
                                "method",
                                object(&[
                                    ("type", text("string")),
                                    ("pattern", text("^generate_[A-Za-z0-9_]+$")),
                                ]),
                            )]),
                        ),
                        ("additionalProperties", Value::Bool(true)),
                    ]),
                ),
                ("detection", object(&[("type", text("object"))])),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ]);
    let child_scale = object(&[
        ("type", text("object")),
        ("required", strings(&["parent", "per_parent"])),
        (
            "properties",
            object(&[
                ("parent", text_schema.clone()),
                (
                    "per_parent",
                    object(&[("type", text("number")), ("minimum", number(0))]),
                ),
                (
                    "distribution",
                    object(&[("enum", strings(&["uniform", "skewed"]))]),
                ),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ]);
    let scale_presets = object(&[
        ("type", text("object")),
        (
            "additionalProperties",
            object(&[
                ("type", text("object")),
                ("required", strings(&["roots", "children"])),
                (
                    "properties",
                    object(&[
                        (
                            "roots",
                            object(&[
                                ("type", text("object")),
                                (
                                    "additionalProperties",
                                    object(&[
                                        ("type", text("integer")),
                                        ("minimum", number(0)),
                                    ]),
                                ),
                            ]),
                        ),
                        (
                            "children",
                            object(&[
                                ("type", text("object")),
                                (
                                    "additionalProperties",
                                    child_scale,
                                ),
                            ]),
                        ),
                    ]),
                ),
                ("additionalProperties", Value::Bool(true)),
            ]),
        ),
    ]);
    let source_bindings = object(&[
        ("type", text("array")),
        (
            "items",
            object(&[
                ("type", text("object")),
                ("required", strings(&["schema_id", "source_id", "role"])),
                (
                    "properties",
                    object(&[
                        ("schema_id", text_schema.clone()),
                        ("source_id", text_schema.clone()),
                        (
                            "role",
                            object(&[(
                                "enum",
                                strings(&["rows", "reference", "terminology"]),
                            )]),
                        ),
                    ]),
                ),
                ("additionalProperties", Value::Bool(true)),
            ]),
        ),
    ]);
    let composition_component = object(&[
        ("type", text("object")),
        (
            "required",
            strings(&["id", "version", "label", "checksum"]),
        ),
        (
            "properties",
            object(&[
                (
                    "id",
                    object(&[
                        ("type", text("string")),
                        ("pattern", text("^[a-z][a-z0-9-]*$")),
                    ]),
                ),
                ("version", version()),
                ("label", text_schema.clone()),
                ("checksum", sha256_checksum()),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ]);
    let composition = object(&[
        ("type", text("object")),
        ("required", strings(&["version", "components"])),
        (
            "properties",
            object(&[
                ("version", object(&[("const", text("1.0.0"))])),
                (
                    "components",
                    object(&[
                        ("type", text("array")),
                        ("minItems", number(1)),
                        ("maxItems", number(32)),
                        ("items", composition_component),
                    ]),
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
        ("$id", text("urn:umf:domain-pack:1.0.0")),
        ("type", text("object")),
        (
            "required",
            strings(&["id", "version", "domain_types"]),
        ),
        (
            "anyOf",
            array(vec![
                object(&[
                    ("properties", object(&[("generator", object(&[]))])),
                    ("required", strings(&["generator"])),
                ]),
                object(&[
                    ("properties", object(&[("sources", object(&[]))])),
                    ("required", strings(&["sources"])),
                ]),
            ]),
        ),
        (
            "properties",
            object(&[
                (
                    "artifact_collections",
                    object(&[
                        ("type", text("array")),
                        ("maxItems", number(64)),
                        ("items", artifact_collection_schema()),
                    ]),
                ),
                ("preservation", preservation_schema()),
                ("id", text_schema.clone()),
                ("version", version()),
                ("description", object(&[("type", text("string"))])),
                (
                    "family",
                    object(&[
                        ("type", text("object")),
                        ("required", strings(&["id", "version", "label"])),
                        (
                            "properties",
                            object(&[
                                ("id", text_schema.clone()),
                                ("version", version()),
                                ("label", text_schema.clone()),
                            ]),
                        ),
                        ("additionalProperties", Value::Bool(true)),
                    ]),
                ),
                ("composition", composition),
                (
                    "generator",
                    object(&[
                        ("type", text("object")),
                        ("required", strings(&["id", "version"])),
                        (
                            "properties",
                            object(&[
                                ("id", text_schema.clone()),
                                ("version", version()),
                            ]),
                        ),
                        ("additionalProperties", Value::Bool(true)),
                    ]),
                ),
                (
                    "domain_types",
                    object(&[
                        ("type", text("object")),
                        ("minProperties", number(1)),
                        (
                            "propertyNames",
                            object(&[
                                ("type", text("string")),
                                ("pattern", text("^[A-Za-z_][A-Za-z0-9_]*$")),
                            ]),
                        ),
                        ("additionalProperties", domain_type),
                    ]),
                ),
                ("scale_presets", scale_presets),
                (
                    "sources",
                    object(&[
                        ("type", text("object")),
                        ("minProperties", number(1)),
                        (
                            "additionalProperties",
                            generate_dataset_source_schema(),
                        ),
                    ]),
                ),
                ("source_bindings", source_bindings),
                (
                    "schemas",
                    object(&[
                        ("type", text("array")),
                        ("items", schema_reference),
                    ]),
                ),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ])
}

/// Generate the isolated schema value for a supported domain-pack schema version.
pub fn domain_pack_schema(version: &str) -> Result<Value, EngineError> {
    match version {
        "1.0.0" => Ok(generate_domain_pack_schema()),
        _ => Err(EngineError::new(
            "DOMAIN_PACK_SCHEMA_VERSION",
            Utf16::from("/version"),
            "Unsupported domain-pack schema version",
        )),
    }
}

/// Serialize a versioned schema with the canonical pretty JSON profile.
/// Binding string APIs retain the checked-in resource's exact layout and LF.
pub fn domain_pack_schema_json(version: &str) -> Result<String, EngineError> {
    let schema = domain_pack_schema(version)?;
    let text = write_json_value(&schema, Format::Json, &mut Context::ordinary())?;
    text.to_utf8().map_err(|_| {
        EngineError::new(
            "DOMAIN_PACK_SCHEMA_ENCODING",
            Utf16::default(),
            "Generated domain-pack schema is not valid UTF-8",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::serialization::stringify_compact;

    const DOMAIN_PACK_SCHEMA_1_0_0: &str =
        include_str!("../../../spec/extensions/domain-pack/schema.json");

    fn compact_preserving_source_whitespace(source: &str) -> String {
        let mut compact = String::with_capacity(source.len());
        let mut in_string = false;
        let mut escaped = false;
        for ch in source.chars() {
            if in_string {
                compact.push(ch);
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == '"' {
                    in_string = false;
                }
            } else if ch == '"' {
                in_string = true;
                compact.push(ch);
            } else if !ch.is_whitespace() {
                compact.push(ch);
            }
        }
        compact
    }

    fn pretty_two_space(compact: &str) -> String {
        let chars = compact.chars().collect::<Vec<_>>();
        let mut result = String::with_capacity(compact.len() + 128);
        let mut depth = 0usize;
        let mut in_string = false;
        let mut escaped = false;
        for (index, ch) in chars.iter().copied().enumerate() {
            if in_string {
                result.push(ch);
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == '"' {
                    in_string = false;
                }
                continue;
            }
            match ch {
                '"' => {
                    in_string = true;
                    result.push(ch);
                }
                '{' | '[' => {
                    result.push(ch);
                    if chars.get(index + 1) != Some(&if ch == '{' { '}' } else { ']' }) {
                        depth += 1;
                        result.push('\n');
                        result.push_str(&"  ".repeat(depth));
                    }
                }
                '}' | ']' => {
                    if chars.get(index.wrapping_sub(1)) != Some(&if ch == '}' { '{' } else { '[' }) {
                        depth -= 1;
                        result.push('\n');
                        result.push_str(&"  ".repeat(depth));
                    }
                    result.push(ch);
                }
                ',' => {
                    result.push(ch);
                    result.push('\n');
                    result.push_str(&"  ".repeat(depth));
                }
                ':' => result.push_str(": "),
                _ => result.push(ch),
            }
        }
        result.push('\n');
        result
    }

    #[test]
    fn generated_schema_matches_canonical_ordered_structure_and_compact_bytes() {
        let generated = generate_domain_pack_schema();
        let generated_compact = stringify_compact(&generated).unwrap().to_utf8().unwrap();
        let canonical = DOMAIN_PACK_SCHEMA_1_0_0;
        let canonical_compact = compact_preserving_source_whitespace(canonical);
        assert_eq!(generated_compact, canonical_compact);
        let generated_parsed: serde_json::Value =
            serde_json::from_str(&generated_compact).unwrap();
        let canonical_parsed: serde_json::Value = serde_json::from_str(canonical).unwrap();
        assert_eq!(generated_parsed, canonical_parsed);
        assert_eq!(pretty_two_space(&generated_compact), canonical);
    }

    #[test]
    fn v1_resource_is_standalone_draft_2020_12_schema() {
        let resource: serde_json::Value = serde_json::from_str(&domain_pack_schema_json("1.0.0").unwrap()).unwrap();
        assert_eq!(resource["$schema"], "https://json-schema.org/draft/2020-12/schema");
        assert_eq!(resource["$id"], "urn:umf:domain-pack:1.0.0");
        assert_eq!(resource["required"][0], "id");
        assert_eq!(resource["required"][1], "version");
        assert_eq!(resource["required"][2], "domain_types");
    }

    #[test]
    fn unknown_versions_refuse() {
        let error = domain_pack_schema("2.0.0").unwrap_err();
        assert_eq!(error.code, "DOMAIN_PACK_SCHEMA_VERSION");
    }

    #[test]
    fn generated_versioned_resource_preserves_canonical_pretty_bytes_and_lf() {
        let output = domain_pack_schema_json("1.0.0").unwrap();
        assert_eq!(output.as_bytes(), DOMAIN_PACK_SCHEMA_1_0_0.as_bytes());
        assert!(output.ends_with('\n'));
        assert!(!output.ends_with("\r\n"));
    }
}
