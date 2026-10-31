// SPDX-License-Identifier: MIT OR Apache-2.0
//! Pure admission inspection for the CONTRACT-057 loader annotation.
//!
//! This module validates only the published metadata shape and its declared
//! artifact closure. It never resolves paths or invokes a companion.
use crate::{
    context::{Context, Limits, ResourceProfile},
    native_json::{NativeJsonNode, NativeJsonTree},
    value::Utf16,
};
use serde_json::{json, Value};

fn member<'a>(value: &'a NativeJsonNode, key: &str) -> Option<&'a NativeJsonNode> {
    let key: Vec<u16> = key.encode_utf16().collect();
    let NativeJsonNode::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name.units() == key)
        .map(|(_, value)| value)
}

fn string(value: &NativeJsonNode) -> Option<&Utf16> {
    match value {
        NativeJsonNode::String(value) => Some(value),
        _ => None,
    }
}

fn text_at<'a>(value: &'a NativeJsonNode, key: &str) -> Option<&'a Utf16> {
    member(value, key).and_then(string)
}

fn equals_ascii(value: &Utf16, expected: &str) -> bool {
    value.units().iter().copied().eq(expected.encode_utf16())
}

fn valid_reference(value: &Utf16) -> bool {
    if value.is_empty() || value.units().first() == Some(&(b'/' as u16)) {
        return false;
    }
    let mut segment_len = 0usize;
    for unit in value.units() {
        match *unit {
            0x41..=0x5a | 0x61..=0x7a | 0x30..=0x39 | 0x5f | 0x2d => segment_len += 1,
            0x2e | 0x2f if segment_len > 0 => segment_len = 0,
            _ => return false,
        }
    }
    segment_len > 0
}

fn valid_sha256(value: &Utf16) -> bool {
    value.units().len() == 64
        && value
            .units()
            .iter()
            .all(|unit| matches!(*unit, 0x30..=0x39 | 0x61..=0x66))
}

/// Structural authority equivalent to `generateDomainPackLoaderSchema()`.
/// Every field check completes before duplicate and closure diagnostics run.
pub fn inspect_domain_pack_loader_value(value: &NativeJsonNode) -> Value {
    if !matches!(value, NativeJsonNode::Object(_)) {
        return json!({"valid": false, "complete": false, "diagnostics": ["Unsupported or malformed loader companion"]});
    }
    let required = [
        ("version", "1.0.0"),
        ("id", "umf.document-loader"),
        ("implementation_version", "1.0.0"),
        ("runtime", "bun"),
        ("entrypoint", "run.ts"),
        ("configuration_schema", "inventory.schema.json"),
    ];
    if required.iter().any(|(key, expected)| {
        !text_at(value, key).is_some_and(|text| equals_ascii(text, expected))
    }) || !matches!(
        text_at(value, "profile"),
        Some(profile) if ["court-documents", "sec-filings", "documents"].iter().any(|candidate| equals_ascii(profile, candidate))
    ) || !text_at(value, "qualification").is_some_and(|text| !text.is_empty())
    {
        return malformed();
    }
    let Some(NativeJsonNode::Array(artifacts)) = member(value, "artifacts") else {
        return malformed();
    };
    if !(2..=32).contains(&artifacts.len()) {
        return malformed();
    }
    for artifact in artifacts {
        let NativeJsonNode::Object(fields) = artifact else {
            return malformed();
        };
        if !fields.iter().any(|(key, _)| equals_ascii(key, "reference"))
            || !fields.iter().any(|(key, _)| equals_ascii(key, "sha256"))
            || !text_at(artifact, "reference").is_some_and(valid_reference)
            || !text_at(artifact, "sha256").is_some_and(valid_sha256)
        {
            return malformed();
        }
    }

    // Unrecognized annotation fields are accepted as ordinary JSON properties.
    let references: Vec<&Utf16> = artifacts
        .iter()
        .filter_map(|artifact| text_at(artifact, "reference"))
        .collect();
    let mut diagnostics = Vec::new();
    let mut unique = std::collections::HashSet::new();
    if references
        .iter()
        .any(|reference| !unique.insert(*reference))
    {
        diagnostics.push("Duplicate loader artifact");
    }
    let entrypoint = text_at(value, "entrypoint").expect("validated required field");
    let configuration_schema =
        text_at(value, "configuration_schema").expect("validated required field");
    if !references.contains(&entrypoint) || !references.contains(&configuration_schema) {
        diagnostics.push("Incomplete loader artifact closure");
    }
    let valid = diagnostics.is_empty();
    json!({"valid": valid, "complete": valid, "diagnostics": diagnostics})
}

fn malformed() -> Value {
    json!({"valid": false, "complete": false, "diagnostics": ["Unsupported or malformed loader companion"]})
}

/// Synchronous wire entry point shared by the Node and WebAssembly bindings.
pub fn inspect_domain_pack_loader_wire(input: &str) -> Result<String, crate::EngineError> {
    let source: Vec<u16> = input.encode_utf16().collect();
    let mut limits = Limits::catalog();
    limits.max_text_units = source.len();
    let mut context = Context::with_limits(ResourceProfile::Cooperative, limits)?;
    let tree = NativeJsonTree::parse_json(&source, &mut context)?;
    Ok(inspect_domain_pack_loader_value(tree.root()).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid_loader() -> Value {
        json!({
            "version":"1.0.0", "id":"umf.document-loader", "implementation_version":"1.0.0",
            "profile":"documents", "runtime":"bun", "entrypoint":"run.ts",
            "configuration_schema":"inventory.schema.json", "qualification":"local profile",
            "artifacts":[
                {"reference":"run.ts", "sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "vendor":{"opaque":true}},
                {"reference":"inventory.schema.json", "sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
            ], "future_annotation":{"keep":[1,true,null]}
        })
    }

    fn inspect_json(wire: &str) -> Value {
        serde_json::from_str(&inspect_domain_pack_loader_wire(wire).unwrap()).unwrap()
    }

    #[test]
    fn accepts_annotations_then_reports_duplicate_before_closure() {
        let mut loader = valid_loader();
        loader["artifacts"][1]["reference"] = json!("run.ts");
        let result = inspect_json(&serde_json::to_string(&loader).unwrap());
        assert_eq!(
            result["diagnostics"],
            json!([
                "Duplicate loader artifact",
                "Incomplete loader artifact closure"
            ])
        );
        assert_eq!(result["valid"], false);
    }

    #[test]
    fn structural_errors_precede_closure_and_unknown_fields_survive_admission() {
        let mut loader = valid_loader();
        loader["artifacts"][1]["reference"] = json!("elsewhere.json");
        assert_eq!(
            inspect_json(&serde_json::to_string(&loader).unwrap())["diagnostics"],
            json!(["Incomplete loader artifact closure"])
        );
        loader["artifacts"][1]["sha256"] = json!("B".repeat(64));
        assert_eq!(
            inspect_json(&serde_json::to_string(&loader).unwrap())["diagnostics"],
            json!(["Unsupported or malformed loader companion"])
        );
        assert_eq!(
            inspect_json(&serde_json::to_string(&valid_loader()).unwrap())["valid"],
            true
        );
    }

    #[test]
    fn validates_paths_and_checksum_profile_without_path_resolution() {
        for reference in ["/run.ts", "../run.ts", "a//b", "a/./b", "a\\b", "a b"] {
            assert!(!valid_reference(&Utf16::from(reference)), "{reference}");
        }
        for reference in ["run.ts", "nested/run.ts", "nested.v1/run.ts"] {
            assert!(valid_reference(&Utf16::from(reference)), "{reference}");
        }
        assert!(!valid_sha256(&Utf16::from("A".repeat(64))));
        assert!(valid_sha256(&Utf16::from("0a".repeat(32))));
    }

    #[test]
    fn preserves_lone_surrogates_in_annotations_and_qualification() {
        let wire = r#"{"version":"1.0.0","id":"umf.document-loader","implementation_version":"1.0.0","profile":"documents","runtime":"bun","entrypoint":"run.ts","configuration_schema":"inventory.schema.json","qualification":"\ud800","future_\ud800":"\udfff","artifacts":[{"reference":"run.ts","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","annotation":"\udfff"},{"reference":"inventory.schema.json","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}"#;
        assert_eq!(
            inspect_json(wire),
            json!({"valid":true,"complete":true,"diagnostics":[]})
        );
    }

    #[test]
    fn accepts_unknown_annotation_at_the_host_copy_json_depth_limit() {
        // The root is depth zero; the annotation value adds one, so 127 nested
        // arrays place its null leaf at depth 128, the predecessor's limit.
        let nested = format!("{}null{}", "[".repeat(127), "]".repeat(127));
        let wire = format!(
            r#"{{"version":"1.0.0","id":"umf.document-loader","implementation_version":"1.0.0","profile":"documents","runtime":"bun","entrypoint":"run.ts","configuration_schema":"inventory.schema.json","qualification":"q","future_annotation":{},"artifacts":[{{"reference":"run.ts","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}},{{"reference":"inventory.schema.json","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}]}}"#,
            nested
        );
        assert_eq!(
            inspect_json(&wire),
            json!({"valid":true,"complete":true,"diagnostics":[]})
        );
    }

    #[test]
    fn accepts_catalog_sized_unknown_annotations() {
        let values = std::iter::repeat("true")
            .take(100_001)
            .collect::<Vec<_>>()
            .join(",");
        let wire = format!(
            r#"{{"version":"1.0.0","id":"umf.document-loader","implementation_version":"1.0.0","profile":"documents","runtime":"bun","entrypoint":"run.ts","configuration_schema":"inventory.schema.json","qualification":"q","future_annotation":[{}],"artifacts":[{{"reference":"run.ts","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}},{{"reference":"inventory.schema.json","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}]}}"#,
            values
        );
        assert_eq!(
            inspect_json(&wire),
            json!({"valid":true,"complete":true,"diagnostics":[]})
        );
    }
}
