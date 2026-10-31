// SPDX-License-Identifier: MIT OR Apache-2.0
//! Read-only validation of artifact-collection references after pack structure
//! has been validated. References never authorize retrieval.
use crate::value::{Utf16, Value};

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key.to_utf8().ok().as_deref() == Some(name))
        .map(|(_, value)| value)
}

fn text(value: &Value) -> Option<Utf16> {
    match value {
        Value::String(value) => Some(value.clone()),
        _ => None,
    }
}

fn append_text(prefix: &str, value: &Utf16) -> Utf16 {
    let mut units: Vec<u16> = prefix.encode_utf16().collect();
    units.extend_from_slice(value.units());
    Utf16::new(units)
}

fn items(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(values)) => values,
        _ => &[],
    }
}

fn has_own(value: Option<&Value>, id: &Utf16) -> bool {
    let Some(Value::Object(fields)) = value else {
        return false;
    };
    fields.iter().any(|(key, _)| key == id)
}

/// Match `inspectArtifactReferences` for structurally validated domain packs.
/// The function preserves collection and reference order, including repeated
/// diagnostics, and does not fetch or interpret any referenced content.
pub fn inspect_artifact_references(pack: &Value) -> Vec<Utf16> {
    let collections = items(member(pack, "artifact_collections"));
    let schemas = items(member(pack, "schemas"));
    let sources = member(pack, "sources");
    let mut diagnostics = Vec::new();
    let mut ids: Vec<Utf16> = Vec::new();
    let mut has_duplicate_identity = false;
    for collection in collections {
        if let Some(id) = member(collection, "id").and_then(text) {
            if ids.contains(&id) {
                has_duplicate_identity = true;
            }
            ids.push(id);
        }
    }
    if has_duplicate_identity {
        diagnostics.push(Utf16::from("Duplicate artifact collection identity"));
    }
    for collection in collections {
        for id in items(member(collection, "source_ids"))
            .iter()
            .filter_map(text)
        {
            if !has_own(sources, &id) {
                diagnostics.push(append_text("Unresolved artifact source: ", &id));
            }
        }
        if let Some(id) = member(collection, "loader_inventory_source_id")
            .and_then(text)
            .filter(|id| !id.is_empty())
        {
            if !has_own(sources, &id) {
                diagnostics.push(Utf16::from("Unresolved artifact inventory source"));
            }
        }
        for (field, required_format) in [
            ("metadata_schema_ids", Some("tablespec")),
            ("derived_schema_ids", None),
            ("ontology_schema_ids", Some("umf")),
        ] {
            for id in items(member(collection, field)).iter().filter_map(text) {
                let schema = schemas
                    .iter()
                    .find(|schema| member(schema, "id").and_then(text).as_ref() == Some(&id));
                match schema {
                    None => diagnostics.push(append_text("Unresolved artifact schema: ", &id)),
                    Some(schema)
                        if required_format.is_some_and(|format| {
                            member(schema, "format")
                                .and_then(text)
                                .and_then(|value| value.to_utf8().ok())
                                .as_deref()
                                != Some(format)
                        }) =>
                    {
                        diagnostics.push(append_text("Artifact schema format mismatch: ", &id));
                    }
                    _ => {}
                }
            }
        }
    }
    diagnostics
}

#[cfg(test)]
mod tests {
    use super::*;

    fn string(value: &str) -> Value {
        Value::String(Utf16::from(value))
    }

    fn obj(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        )
    }

    fn arr(values: Vec<Value>) -> Value {
        Value::Array(values)
    }

    fn strings(values: Vec<&str>) -> Vec<Utf16> {
        values.into_iter().map(Utf16::from).collect()
    }

    #[test]
    fn emits_one_duplicate_diagnostic_and_preserves_order() {
        let pack = obj(vec![
            ("sources", obj(vec![("own", Value::Null)])),
            (
                "schemas",
                arr(vec![obj(vec![
                    ("id", string("table")),
                    ("format", string("json")),
                ])]),
            ),
            (
                "artifact_collections",
                arr(vec![
                    obj(vec![
                        ("id", string("same")),
                        ("source_ids", arr(vec![string("own"), string("missing")])),
                        ("loader_inventory_source_id", string("unknown")),
                        ("metadata_schema_ids", arr(vec![string("table")])),
                        ("derived_schema_ids", arr(vec![string("missing-schema")])),
                        ("ontology_schema_ids", arr(vec![string("table")])),
                    ]),
                    obj(vec![("id", string("same")), ("source_ids", arr(vec![]))]),
                    obj(vec![("id", string("same")), ("source_ids", arr(vec![]))]),
                ]),
            ),
        ]);
        assert_eq!(
            inspect_artifact_references(&pack),
            strings(vec![
                "Duplicate artifact collection identity",
                "Unresolved artifact source: missing",
                "Unresolved artifact inventory source",
                "Artifact schema format mismatch: table",
                "Unresolved artifact schema: missing-schema",
                "Artifact schema format mismatch: table",
            ])
        );
    }

    #[test]
    fn keeps_lone_surrogate_reference_keys_exact() {
        let odd_id = Utf16::new(vec![0xD800]);
        let pack = obj(vec![
            (
                "sources",
                Value::Object(vec![(odd_id.clone(), Value::Null)]),
            ),
            (
                "artifact_collections",
                arr(vec![obj(vec![
                    ("id", string("assets")),
                    ("source_ids", arr(vec![Value::String(odd_id)])),
                ])]),
            ),
        ]);
        assert!(inspect_artifact_references(&pack).is_empty());
    }
}
