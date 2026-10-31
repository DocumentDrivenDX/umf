// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{scalar_type_inspection, Utf16};

#[test]
fn current_vocabulary_matches_the_generated_core_schema_in_source_order() {
    let schema: serde_json::Value =
        serde_json::from_str(include_str!("../../../spec/core/schema.json")).unwrap();
    let version = schema["$id"]
        .as_str()
        .and_then(|id| id.strip_prefix("urn:umf:core:"))
        .expect("generated schema has a core version id");
    let generated = schema["$defs"]["knownScalarType"]["enum"]
        .as_array()
        .expect("generated scalar vocabulary is an enum")
        .iter()
        .map(|value| value.as_str().unwrap())
        .collect::<Vec<_>>();
    let rust = scalar_type_inspection::scalar_types_for_version(&Utf16::from(version))
        .into_iter()
        .map(|value| value.to_utf8().unwrap())
        .collect::<Vec<_>>();

    assert_eq!(rust, generated);
}

#[test]
fn version_lookup_is_exact_and_preserves_utf16_string_comparison() {
    let current = scalar_type_inspection::scalar_types_for_version(&Utf16::from("0.10.0"));
    assert_eq!(current.len(), 11);
    for unknown in ["0.9.0", "", "0.10.0 ", "0.10.1"] {
        assert!(
            scalar_type_inspection::scalar_types_for_version(&Utf16::from(unknown)).is_empty(),
            "{unknown:?} must not select the current vocabulary"
        );
    }
    assert!(scalar_type_inspection::scalar_types_for_version(&Utf16::new(vec![0xd800])).is_empty());
}
