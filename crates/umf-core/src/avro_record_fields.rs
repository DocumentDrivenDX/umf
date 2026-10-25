// SPDX-License-Identifier: MIT OR Apache-2.0
//! Selected-record field discovery for the bounded Avro Record Type profile.
//!
//! This resolves one selected `avro.fields` identity, then returns the direct
//! fields of its resolved record with their derived UMF identities and native
//! paths. It does not classify or reconcile any UMF ideal.

use crate::{
    avro_fields::{derive_avro_fields, AvroDependency, AvroFieldMetadata},
    avro_record_type_candidate::{resolve_candidate, Resolution},
    context::Context,
    error::EngineError,
    native_json::{NativeJsonNode, NativeJsonTree},
    value::Utf16,
};
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub struct SelectedRecordFields {
    pub record_fullname: Utf16,
    pub record_path: Utf16,
    pub dependency_id: Option<Utf16>,
    /// Ordered direct fields only; nested record fields are not included.
    pub fields: Vec<AvroFieldMetadata>,
}

/// Resolve the selected core field and discover the direct fields of its
/// native record. Dependencies are caller-ordered and identified only by ID.
pub fn discover_selected_record_fields<'a>(
    root: &'a NativeJsonTree,
    dependencies: &[AvroDependency<'a>],
    selected_identity: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<SelectedRecordFields, EngineError> {
    let candidate = resolve_candidate(root, dependencies, selected_identity, ctx)?;
    let (fullname, record_path, dependency_id) = match candidate.resolution {
        Resolution::Direct {
            fullname,
            path,
            dependency_id,
        }
        | Resolution::Qualified {
            fullname,
            path,
            dependency_id,
        } => (fullname, path, dependency_id),
        Resolution::Ambiguous { fullname } => {
            return Err(refusal(
                "AVRO_RECORD_FIELDS_AMBIGUOUS",
                format!("Record {fullname:?} has multiple declarations"),
            ))
        }
        Resolution::Unresolved { fullname } => {
            return Err(refusal(
                "AVRO_RECORD_FIELDS_UNRESOLVED",
                format!("Record {fullname:?} has no declaration"),
            ))
        }
        Resolution::Unsupported { reason } => {
            return Err(refusal("AVRO_RECORD_FIELDS_UNSUPPORTED", reason.to_owned()))
        }
    };
    ctx.charge_work(
        fullname.len().saturating_add(record_path.len()),
        record_path.clone(),
    )?;
    let tree = match dependency_id.as_ref() {
        Some(id) => dependencies
            .iter()
            .find(|dependency| dependency.id == id)
            .map(|dependency| dependency.root),
        None => Some(root),
    }
    .ok_or_else(|| {
        refusal(
            "AVRO_RECORD_FIELDS_UNRESOLVED",
            "Resolved dependency identity is absent".to_owned(),
        )
    })?;
    let record = tree.child(&record_path, ctx)?;
    let fields = match record {
        NativeJsonNode::Object(members) => members
            .iter()
            .find(|(key, _)| key == &Utf16::from("fields"))
            .map(|(_, node)| node),
        _ => None,
    };
    let Some(NativeJsonNode::Array(native_fields)) = fields else {
        return Err(refusal(
            "AVRO_RECORD_FIELDS_UNSUPPORTED",
            "Resolved declaration has no record fields array".to_owned(),
        ));
    };
    ctx.charge_work(native_fields.len(), record_path.clone())?;

    let metadata = derive_avro_fields(root, dependencies, ctx)?;
    ctx.charge_work(metadata.len(), record_path.clone())?;
    let mut by_source_path = HashMap::with_capacity(metadata.len());
    for field in metadata {
        let key = (field.path.clone(), field.dependency_id.clone());
        if by_source_path.insert(key, field).is_some() {
            return Err(refusal(
                "AVRO_RECORD_FIELDS_METADATA",
                "Derived avro.fields metadata contains duplicate source identity".to_owned(),
            ));
        }
    }
    let prefix = record_path.to_utf8().map_err(|_| {
        refusal(
            "AVRO_RECORD_FIELDS_UNSUPPORTED",
            "Resolved record path is not UTF-8".to_owned(),
        )
    })?;
    ctx.charge_work(prefix.len(), record_path.clone())?;
    let prefix = format!("{prefix}/fields/");
    // Charge the complete result allocation before creating it.
    ctx.charge_work(native_fields.len(), record_path.clone())?;
    let mut direct = Vec::with_capacity(native_fields.len());
    for index in 0..native_fields.len() {
        let digits = if index == 0 {
            1
        } else {
            index.ilog10() as usize + 1
        };
        ctx.charge_work(prefix.len().saturating_add(digits), record_path.clone())?;
        let expected_path = Utf16::from(format!("{prefix}{index}"));
        let Some(field) = by_source_path.remove(&(expected_path.clone(), dependency_id.clone()))
        else {
            return Err(refusal("AVRO_RECORD_FIELDS_METADATA", format!("Direct field at {expected_path:?} does not have one matching avro.fields identity")));
        };
        direct.push(field);
    }
    Ok(SelectedRecordFields {
        record_fullname: fullname,
        record_path,
        dependency_id,
        fields: direct,
    })
}

fn refusal(code: &'static str, message: String) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(source: &str) -> NativeJsonTree {
        NativeJsonTree::parse_json(
            &source.encode_utf16().collect::<Vec<_>>(),
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn identity(path: &str) -> Utf16 {
        Utf16::from(format!("[null,{path:?}]"))
    }

    #[test]
    fn discovers_direct_fields_and_excludes_nested_fields() {
        let root = tree(
            r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[{"name":"id","type":"long"},{"name":"address","type":{"type":"record","name":"Address","fields":[{"name":"zip","type":"string"}]}}]}}]}"#,
        );
        let result = discover_selected_record_fields(
            &root,
            &[],
            &identity("/fields/0"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(result.record_fullname, Utf16::from("sales.Customer"));
        assert_eq!(result.record_path, Utf16::from("/fields/0/type"));
        assert_eq!(
            result
                .fields
                .iter()
                .map(|field| field.name.to_utf8().unwrap())
                .collect::<Vec<_>>(),
            ["id", "address"]
        );
        assert_eq!(
            result.fields[0].path,
            Utf16::from("/fields/0/type/fields/0")
        );
        assert_eq!(
            result.fields[0].element_id,
            identity("/fields/0/type/fields/0")
        );
    }

    #[test]
    fn resolves_named_dependency_and_preserves_artifact_identity() {
        let root = tree(
            r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":"Customer"}]}"#,
        );
        let dependency = tree(
            r#"{"type":"record","name":"Customer","namespace":"sales","fields":[{"name":"id","type":"string"}]}"#,
        );
        let id = Utf16::from("customer-schema");
        let result = discover_selected_record_fields(
            &root,
            &[AvroDependency {
                id: &id,
                root: &dependency,
            }],
            &identity("/fields/0"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(result.dependency_id, Some(id.clone()));
        assert_eq!(result.fields[0].dependency_id, Some(id));
        assert_eq!(result.fields[0].path, Utf16::from("/fields/0"));
    }

    #[test]
    fn discovers_fields_of_an_avro_error_declaration() {
        let root = tree(
            r#"{"type":"record","name":"Holder","fields":[{"name":"failure","type":{"type":"error","name":"Failure","fields":[{"name":"message","type":"string"}]}}]}"#,
        );
        let result = discover_selected_record_fields(
            &root,
            &[],
            &identity("/fields/0"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(result.record_fullname, Utf16::from("Failure"));
        assert_eq!(result.fields.len(), 1);
        assert_eq!(result.fields[0].name, Utf16::from("message"));
    }

    #[test]
    fn rejects_ambiguous_unresolved_and_unsupported_shapes() {
        let root = tree(
            r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":"Customer"},{"name":"wrapped","type":["null","Customer"]}]}"#,
        );
        let dep = tree(r#"{"type":"record","name":"Customer","namespace":"sales","fields":[]}"#);
        let id1 = Utf16::from("one");
        let id2 = Utf16::from("two");
        let ambiguous = discover_selected_record_fields(
            &root,
            &[
                AvroDependency {
                    id: &id1,
                    root: &dep,
                },
                AvroDependency {
                    id: &id2,
                    root: &dep,
                },
            ],
            &identity("/fields/0"),
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(ambiguous.code, "AVRO_RECORD_FIELDS_AMBIGUOUS");
        let unresolved = discover_selected_record_fields(
            &root,
            &[],
            &identity("/fields/0"),
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(unresolved.code, "AVRO_RECORD_FIELDS_UNRESOLVED");
        let unsupported = discover_selected_record_fields(
            &root,
            &[],
            &identity("/fields/1"),
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(unsupported.code, "AVRO_RECORD_FIELDS_UNSUPPORTED");
    }

    #[test]
    fn refuses_malformed_record_field_shapes() {
        let root = tree(
            r#"{"type":"record","name":"Holder","fields":[{"name":"broken","type":{"type":"record","name":"Broken"}}]}"#,
        );
        let error = discover_selected_record_fields(
            &root,
            &[],
            &identity("/fields/0"),
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "AVRO_RECORD_FIELDS_UNSUPPORTED");
    }
}
