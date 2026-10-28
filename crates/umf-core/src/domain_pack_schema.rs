//! CONTRACT-052 domain-pack schema resources and pure schema composition.

pub use crate::domain_pack_source_schema::generate_dataset_source_schema;
use crate::{
    context::Context,
    error::EngineError,
    serialization::{write_json_value, Format},
    value::{Utf16, Value},
};

/// A generated schema tree plus Rust-owned JSON Pointer identity classes.
/// JSON cannot encode object identity, so default JavaScript bindings apply
/// these generic classes after parsing the computed schema.
#[derive(Clone, Debug, PartialEq)]
pub struct GeneratedSchemaGraph {
    pub schema: Value,
    pub alias_groups: Vec<Vec<String>>,
}

fn pointer_group(paths: &[&str]) -> Vec<String> {
    paths.iter().map(|path| (*path).to_owned()).collect()
}

fn prefix_alias_groups(prefix: &str, groups: Vec<Vec<String>>) -> Vec<Vec<String>> {
    groups
        .into_iter()
        .map(|group| {
            group
                .into_iter()
                .map(|path| format!("{prefix}{path}"))
                .collect()
        })
        .collect()
}

/// Intra-result aliases present in `generateArtifactCollectionSchema()`.
fn artifact_collection_alias_groups() -> Vec<Vec<String>> {
    let prefix = "/properties/";
    let text_paths = [
        "title",
        "semantic_kinds/items",
        "source_ids/items",
        "media_types/items",
        "metadata_schema_ids/items",
        "derived_schema_ids/items",
        "ontology_schema_ids/items",
        "loader_inventory_source_id",
        "identity/properties/description",
        "grouping/properties/description",
        "identity/properties/fields/items",
        "grouping/properties/fields/items",
    ];
    let references_paths = [
        "source_ids",
        "media_types",
        "metadata_schema_ids",
        "derived_schema_ids",
        "ontology_schema_ids",
        "identity/properties/fields",
        "grouping/properties/fields",
    ];
    let mut text_group = text_paths
        .iter()
        .map(|path| format!("{prefix}{path}"))
        .collect::<Vec<_>>();
    text_group.push("/anyOf/1/properties/loader_inventory_source_id".to_owned());
    vec![
        text_group,
        references_paths
            .iter()
            .map(|path| format!("{prefix}{path}"))
            .collect(),
        pointer_group(&["/properties/identity", "/properties/grouping"]),
        pointer_group(&[
            "/properties/identity/properties",
            "/properties/grouping/properties",
        ]),
        pointer_group(&[
            "/properties/identity/required",
            "/properties/grouping/required",
        ]),
    ]
}

/// Return the TypeScript predecessor's within-result object aliases for the
/// standalone dataset-source schema.
pub fn generate_dataset_source_schema_graph() -> GeneratedSchemaGraph {
    GeneratedSchemaGraph {
        schema: generate_dataset_source_schema(),
        alias_groups: crate::domain_pack_source_schema::dataset_source_schema_alias_groups(),
    }
}

/// Return the standalone CONTRACT-061 schema with the TypeScript predecessor's
/// within-result object identity classes.
pub fn generate_artifact_collection_schema_graph() -> GeneratedSchemaGraph {
    GeneratedSchemaGraph {
        schema: artifact_collection_schema(),
        alias_groups: artifact_collection_alias_groups(),
    }
}

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
                        object(&[("loader_inventory_source_id", nonempty_text())]),
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
                ("provenance", object(&[("const", text("PROV-O-JSON-LD"))])),
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
                                ("required", strings(&["schema_id", "source_identity"])),
                                (
                                    "properties",
                                    object(&[
                                        ("schema_id", nonempty.clone()),
                                        ("source_identity", nonempty),
                                        ("qualification", nonempty_text()),
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
                                    object(&[("type", text("integer")), ("minimum", number(0))]),
                                ),
                            ]),
                        ),
                        (
                            "children",
                            object(&[
                                ("type", text("object")),
                                ("additionalProperties", child_scale),
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
                            object(&[("enum", strings(&["rows", "reference", "terminology"]))]),
                        ),
                    ]),
                ),
                ("additionalProperties", Value::Bool(true)),
            ]),
        ),
    ]);
    let composition_component = object(&[
        ("type", text("object")),
        ("required", strings(&["id", "version", "label", "checksum"])),
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
        ("required", strings(&["id", "version", "domain_types"])),
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
                            object(&[("id", text_schema.clone()), ("version", version())]),
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
                        ("additionalProperties", generate_dataset_source_schema()),
                    ]),
                ),
                ("source_bindings", source_bindings),
                (
                    "schemas",
                    object(&[("type", text("array")), ("items", schema_reference)]),
                ),
            ]),
        ),
        ("additionalProperties", Value::Bool(true)),
    ])
}

/// Return Rust-generated schema data and the TypeScript predecessor's
/// intra-result object-identity classes. Paths are RFC 6901 JSON Pointers.
pub fn generate_domain_pack_schema_graph() -> GeneratedSchemaGraph {
    let text_paths = [
        "/properties/id",
        "/properties/family/properties/id",
        "/properties/family/properties/label",
        "/properties/composition/properties/components/items/properties/label",
        "/properties/generator/properties/id",
        "/properties/scale_presets/additionalProperties/properties/children/additionalProperties/properties/parent",
        "/properties/source_bindings/items/properties/schema_id",
        "/properties/source_bindings/items/properties/source_id",
        "/properties/schemas/items/properties/id",
        "/properties/schemas/items/properties/format",
        "/properties/schemas/items/properties/reference",
    ];
    let version_paths = [
        "/properties/version",
        "/properties/family/properties/version",
        "/properties/composition/properties/components/items/properties/version",
        "/properties/generator/properties/version",
    ];
    let mut alias_groups = vec![pointer_group(&text_paths), pointer_group(&version_paths)];
    alias_groups.extend(prefix_alias_groups(
        "/properties/artifact_collections/items",
        artifact_collection_alias_groups(),
    ));
    alias_groups.extend(prefix_alias_groups(
        "/properties/sources/additionalProperties",
        crate::domain_pack_source_schema::dataset_source_schema_alias_groups(),
    ));
    GeneratedSchemaGraph {
        schema: generate_domain_pack_schema(),
        alias_groups,
    }
}

fn alias_groups_value(groups: &[Vec<String>]) -> Value {
    Value::Array(
        groups
            .iter()
            .map(|group| Value::Array(group.iter().map(|path| text(path)).collect()))
            .collect(),
    )
}

pub(crate) fn generated_schema_graph_json(
    graph: GeneratedSchemaGraph,
) -> Result<String, EngineError> {
    let envelope = object(&[
        ("schema", graph.schema),
        ("aliasGroups", alias_groups_value(&graph.alias_groups)),
    ]);
    write_json_value(&envelope, Format::Json, &mut Context::ordinary())?
        .to_utf8()
        .map_err(|_| {
            EngineError::new(
                "DOMAIN_PACK_SCHEMA_ENCODING",
                Utf16::default(),
                "Generated schema graph is not valid UTF-8",
            )
        })
}

/// Wire form for the Node/WASM default-route wrappers. Canonical resource
/// APIs remain separate and retain their checked-in pretty bytes.
pub fn domain_pack_schema_graph_json() -> Result<String, EngineError> {
    generated_schema_graph_json(generate_domain_pack_schema_graph())
}

pub fn dataset_source_schema_graph_json() -> Result<String, EngineError> {
    generated_schema_graph_json(generate_dataset_source_schema_graph())
}

pub fn artifact_collection_schema_graph_json() -> Result<String, EngineError> {
    generated_schema_graph_json(generate_artifact_collection_schema_graph())
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
                    if chars.get(index.wrapping_sub(1)) != Some(&if ch == '}' { '{' } else { '[' })
                    {
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

    fn assert_alias_groups(schema: &Value, groups: &[Vec<String>]) {
        let compact = stringify_compact(schema).unwrap().to_utf8().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&compact).unwrap();
        let mut seen = std::collections::HashSet::new();
        for group in groups {
            assert!(
                group.len() >= 2,
                "alias class must contain at least two paths"
            );
            let first = group.first().unwrap();
            let expected = parsed
                .pointer(first)
                .unwrap_or_else(|| panic!("missing alias path {first}"));
            for path in group {
                assert!(
                    seen.insert(path),
                    "alias path appears in multiple groups: {path}"
                );
                let actual = parsed
                    .pointer(path)
                    .unwrap_or_else(|| panic!("missing alias path {path}"));
                assert_eq!(actual, expected, "alias class values differ at {path}");
            }
        }
    }

    #[test]
    fn generated_schema_matches_canonical_ordered_structure_and_compact_bytes() {
        let generated = generate_domain_pack_schema();
        let generated_compact = stringify_compact(&generated).unwrap().to_utf8().unwrap();
        let canonical = DOMAIN_PACK_SCHEMA_1_0_0;
        let canonical_compact = compact_preserving_source_whitespace(canonical);
        assert_eq!(generated_compact, canonical_compact);
        let generated_parsed: serde_json::Value = serde_json::from_str(&generated_compact).unwrap();
        let canonical_parsed: serde_json::Value = serde_json::from_str(canonical).unwrap();
        assert_eq!(generated_parsed, canonical_parsed);
        assert_eq!(pretty_two_space(&generated_compact), canonical);
    }

    #[test]
    fn v1_resource_is_standalone_draft_2020_12_schema() {
        let resource: serde_json::Value =
            serde_json::from_str(&domain_pack_schema_json("1.0.0").unwrap()).unwrap();
        assert_eq!(
            resource["$schema"],
            "https://json-schema.org/draft/2020-12/schema"
        );
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

    #[test]
    fn schema_graph_alias_paths_resolve_and_match_their_generated_values() {
        let artifact_collection = generate_artifact_collection_schema_graph();
        assert_alias_groups(
            &artifact_collection.schema,
            &artifact_collection.alias_groups,
        );
        assert_eq!(artifact_collection.alias_groups.len(), 5);

        let dataset_source = generate_dataset_source_schema_graph();
        assert_alias_groups(&dataset_source.schema, &dataset_source.alias_groups);
        assert_eq!(dataset_source.alias_groups.len(), 1);

        let domain_pack = generate_domain_pack_schema_graph();
        assert_alias_groups(&domain_pack.schema, &domain_pack.alias_groups);
        assert_eq!(domain_pack.alias_groups.len(), 8);
        assert!(domain_pack.alias_groups[2].contains(
            &"/properties/artifact_collections/items/anyOf/1/properties/loader_inventory_source_id"
                .to_owned()
        ));
    }

    #[test]
    fn schema_graph_wire_contains_the_exact_schema_and_alias_sidecar() {
        let artifact_graph: serde_json::Value =
            serde_json::from_str(&artifact_collection_schema_graph_json().unwrap()).unwrap();
        let source_graph: serde_json::Value =
            serde_json::from_str(&dataset_source_schema_graph_json().unwrap()).unwrap();
        let pack_graph: serde_json::Value =
            serde_json::from_str(&domain_pack_schema_graph_json().unwrap()).unwrap();
        assert_eq!(
            source_graph["schema"],
            serde_json::from_str::<serde_json::Value>(include_str!(
                "../../../spec/extensions/dataset-source/schema.json"
            ))
            .unwrap()
        );
        let pack_schema: serde_json::Value = serde_json::from_str::<serde_json::Value>(
            include_str!("../../../spec/extensions/domain-pack/schema.json"),
        )
        .unwrap();
        assert_eq!(
            artifact_graph["schema"],
            pack_schema["properties"]["artifact_collections"]["items"]
        );
        assert_eq!(
            pack_graph["schema"],
            serde_json::from_str::<serde_json::Value>(include_str!(
                "../../../spec/extensions/domain-pack/schema.json"
            ))
            .unwrap()
        );
        assert_eq!(source_graph["aliasGroups"].as_array().unwrap().len(), 1);
        assert_eq!(artifact_graph["aliasGroups"].as_array().unwrap().len(), 5);
        assert_eq!(pack_graph["aliasGroups"].as_array().unwrap().len(), 8);
    }
}
