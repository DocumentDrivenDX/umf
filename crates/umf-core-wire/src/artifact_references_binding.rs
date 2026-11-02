// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in artifact-reference inspection over the private tagged UTF-16 wire.
//! Admission applies the ordinary core tree/work budgets, then narrows traversal
//! to at most 64 collections, 1,000 schemas, and 10,000 reference entries.
use umf_core::{copy_json, Context, EngineError, Utf16, Value};

const MAX_COLLECTIONS: usize = 64;
const MAX_SCHEMAS: usize = 1_000;
const MAX_REFERENCE_ENTRIES: usize = 10_000;

fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

fn array_len(value: Option<&Value>) -> usize {
    match value {
        Some(Value::Array(items)) => items.len(),
        _ => 0,
    }
}

/// Inspect references after the caller has structurally validated the pack.
/// This operation deliberately does not run structural validation itself.
pub fn execute_wire(wire_json: &str) -> String {
    execute_wire_with_control(wire_json, &mut |_| Ok(()))
}

pub fn execute_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = super::decode(wire_json, &mut ctx)?;
        if field(&request, "op") != Some(&Value::string_utf8("artifactReferences/inspect")) {
            return Err(fail(
                "REQUEST",
                "artifactReferences/inspect operation is required",
            ));
        }
        let pack = field(&request, "pack")
            .ok_or_else(|| fail("REQUEST", "Structurally validated pack is required"))?;
        let pack = copy_json(pack, &mut ctx)?;
        let collections = array_len(field(&pack, "artifact_collections"));
        let schemas = array_len(field(&pack, "schemas"));
        if collections > MAX_COLLECTIONS || schemas > MAX_SCHEMAS {
            return Err(fail(
                "RESOURCE_LIMIT",
                "Artifact reference inspection profile limit exceeded",
            ));
        }
        let mut references = 0usize;
        if let Some(Value::Array(items)) = field(&pack, "artifact_collections") {
            for collection in items {
                references = references.saturating_add(array_len(field(collection, "source_ids")));
                references =
                    references.saturating_add(array_len(field(collection, "metadata_schema_ids")));
                references =
                    references.saturating_add(array_len(field(collection, "derived_schema_ids")));
                references =
                    references.saturating_add(array_len(field(collection, "ontology_schema_ids")));
                references = references.saturating_add(usize::from(matches!(
                    field(collection, "loader_inventory_source_id"),
                    Some(Value::String(id)) if !id.is_empty()
                )));
            }
        }
        if references > MAX_REFERENCE_ENTRIES {
            return Err(fail(
                "RESOURCE_LIMIT",
                "Artifact reference inspection profile limit exceeded",
            ));
        }
        let diagnostics = umf_core::artifact_references::inspect_artifact_references(&pack)
            .into_iter()
            .map(Value::String)
            .collect();
        let wire = super::encode(&Value::Array(diagnostics), &mut ctx)?;
        Ok(wire)
    })();
    super::result_envelope(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(pack: Option<Value>) -> String {
        let mut fields = vec![(
            Utf16::from("op"),
            Value::string_utf8("artifactReferences/inspect"),
        )];
        if let Some(pack) = pack {
            fields.push((Utf16::from("pack"), pack));
        }
        super::super::encode(
            &Value::Object(fields),
            &mut super::super::transport_context(),
        )
        .unwrap()
    }

    fn response_value(response: &str) -> Value {
        let envelope: serde_json::Value = serde_json::from_str(response).unwrap();
        assert_eq!(envelope["status"], "ok");
        super::super::decode(
            envelope["wire"].as_str().unwrap(),
            &mut super::super::transport_context(),
        )
        .unwrap()
    }

    #[test]
    fn result_wire_preserves_lone_surrogate_diagnostic_units() {
        let odd = Utf16::new(vec![0xD800]);
        let pack = Value::Object(vec![
            (Utf16::from("sources"), Value::Object(Vec::new())),
            (
                Utf16::from("artifact_collections"),
                Value::Array(vec![Value::Object(vec![(
                    Utf16::from("source_ids"),
                    Value::Array(vec![Value::String(odd.clone())]),
                )])]),
            ),
        ]);
        let response = execute_wire(&request(Some(pack)));
        let Value::Array(diagnostics) = response_value(&response) else {
            panic!("array expected")
        };
        assert_eq!(
            diagnostics,
            vec![Value::String({
                let mut units = Utf16::from("Unresolved artifact source: ").into_units();
                units.push(0xD800);
                Utf16::new(units)
            })]
        );
    }

    #[test]
    fn wire_requires_an_explicit_pack_and_honors_host_refusal() {
        let missing = execute_wire(&request(None));
        let missing: serde_json::Value = serde_json::from_str(&missing).unwrap();
        assert_eq!(missing["status"], "error");
        assert_eq!(missing["code"], "REQUEST");

        let request = request(Some(Value::Object(Vec::new())));
        let mut refuse = |_| Err(fail("TEST_DENIED", "denied"));
        let denied = execute_wire_with_control(&request, &mut refuse);
        let denied: serde_json::Value = serde_json::from_str(&denied).unwrap();
        assert_eq!(denied["status"], "error");
        assert_eq!(denied["code"], "TEST_DENIED");
    }
}
