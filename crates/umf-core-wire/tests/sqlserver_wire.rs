// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::sqlserver_binding::{PROFILE, execute_wire};

fn call(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> Result<Value, Json> {
    let mut request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    request.extend(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value)),
    );
    let wire = umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let envelope: Json = serde_json::from_str(&execute_wire(&wire)).unwrap();
    if envelope["status"] != "ok" {
        return Err(envelope);
    }
    Ok(
        umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary())
            .unwrap(),
    )
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .unwrap()
}

#[test]
fn sqlserver_catalog_wire_preserves_unknown_exact_values_and_refreshes_metadata() {
    let source = include_str!("../../../fixtures/sqlserver/catalog.json").replacen(
        "\"column_id\": 1,",
        "\"column_id\": 1,\n          \"futureExact\": 9007199254740993,",
        1,
    );
    let document = call(
        "sqlserver.import",
        [
            ("source", Value::string_utf8(source)),
            ("id", Value::string_utf8("sqlserver-wire")),
        ],
    )
    .unwrap();
    let columns = call("sqlserver.columns", [("document", document.clone())]).unwrap();
    let Value::Array(rows) = columns else {
        panic!("column rows")
    };
    assert!(member(member(&rows[0], "element"), "scalarType") == &Value::string_utf8("integer"));
    let report = call("sqlserver.inspect", [("document", document.clone())]).unwrap();
    assert_eq!(member(&report, "valid"), &Value::Bool(true));
    let edit = call(
        "sqlserver.edit",
        [
            ("document", document.clone()),
            ("path", Value::string_utf8("/tables/0/columns/0/name")),
            ("text", Value::string_utf8("\"renamed_id\"")),
        ],
    )
    .unwrap();
    let edited_column = call("sqlserver.columns", [("document", edit.clone())]).unwrap();
    let Value::Array(edited_rows) = edited_column else {
        panic!("edited column rows")
    };
    assert_eq!(
        member(member(&edited_rows[0], "element"), "name"),
        &Value::string_utf8("renamed_id")
    );
    let export = call("sqlserver.export", [("document", edit)]).unwrap();
    assert!(
        matches!(&export, Value::String(text) if text.to_utf8().unwrap().contains("9007199254740993"))
    );
}

#[test]
fn sqlserver_wire_rejects_unknown_members_and_bad_integer_edits() {
    let bad = call(
        "sqlserver.import",
        [
            ("source", Value::string_utf8("{}")),
            ("id", Value::string_utf8("bad")),
            ("receipt", Value::Null),
        ],
    )
    .unwrap_err();
    assert_eq!(bad["status"], "error");
    let document = call(
        "sqlserver.import",
        [
            (
                "source",
                Value::string_utf8(include_str!("../../../fixtures/sqlserver/catalog.json")),
            ),
            ("id", Value::string_utf8("bad-integer")),
        ],
    )
    .unwrap();
    let invalid = call(
        "sqlserver.edit",
        [
            ("document", document),
            ("path", Value::string_utf8("/tables/0/columns/0/column_id")),
            ("text", Value::string_utf8("-0")),
        ],
    )
    .unwrap_err();
    assert_eq!(invalid["status"], "error");
}

#[test]
fn inspection_reports_unknown_payload_encoding_without_blocking_metadata_reads() {
    let mut document = call(
        "sqlserver.import",
        [
            (
                "source",
                Value::string_utf8(include_str!("../../../fixtures/sqlserver/catalog.json")),
            ),
            ("id", Value::string_utf8("unknown-payload")),
        ],
    )
    .unwrap();
    let Value::Object(document_fields) = &mut document else {
        panic!("document")
    };
    let extensions = document_fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("extensions"))
        .map(|(_, value)| value)
        .unwrap();
    let Value::Object(extension_fields) = extensions else {
        panic!("extensions")
    };
    let payload = extension_fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("umf.sqlserver"))
        .map(|(_, value)| value)
        .unwrap();
    let Value::Object(payload_fields) = payload else {
        panic!("payload")
    };
    payload_fields.push((
        Utf16::from("futureEncoding"),
        Value::string_utf8("preserved"),
    ));
    let report = call("sqlserver.inspect", [("document", document.clone())]).unwrap();
    assert_eq!(member(&report, "valid"), &Value::Bool(true));
    let Value::Array(diagnostics) = member(&report, "diagnostics") else {
        panic!("diagnostics")
    };
    assert!(
        diagnostics
            .iter()
            .any(|diagnostic| member(diagnostic, "code")
                == &Value::string_utf8("SQLSERVER_ENCODING"))
    );
    assert!(call("sqlserver.columns", [("document", document.clone())]).is_ok());
    assert!(call("sqlserver.export", [("document", document)]).is_err());
}

#[test]
fn sqlserver_facet_wire_exposes_type_predicate_and_scoped_check_observations() {
    let proof: Json = serde_json::from_str(include_str!(
        "../../../fixtures/validation/facets-sqlserver-discovery-native.json"
    ))
    .unwrap();
    let source = proof["sourceText"].as_str().unwrap();
    let document = call(
        "sqlserver.import",
        [
            ("source", Value::string_utf8(source)),
            ("id", Value::string_utf8("sqlserver-facet-wire")),
        ],
    )
    .unwrap();
    let columns = call("sqlserver.columns", [("document", document.clone())]).unwrap();
    let Value::Array(columns) = columns else {
        panic!("column rows")
    };
    let column = columns
        .iter()
        .find(|column| member(member(column, "table"), "name") == &Value::string_utf8("signed8"))
        .unwrap();
    let path = member(column, "path").clone();
    let native = member(column, "nativeColumn").clone();
    let ty = call("sqlserver.facetType", [("native", native)]).unwrap();
    assert_eq!(
        member(member(&ty, "meaning"), "family"),
        &Value::string_utf8("integer")
    );
    let predicate = call(
        "sqlserver.facetPredicate",
        [
            (
                "source",
                Value::string_utf8("[value]>=-128 AND [value]<=127"),
            ),
            ("columnName", Value::string_utf8("value")),
        ],
    )
    .unwrap();
    assert_eq!(
        member(&predicate, "state"),
        &Value::string_utf8("candidate")
    );
    let constraints = call(
        "sqlserver.facetConstraints",
        [("document", document), ("columnPath", path)],
    )
    .unwrap();
    assert_eq!(
        member(&constraints, "sourceAuthenticity"),
        &Value::string_utf8("unverified")
    );
    let Value::Array(observations) = member(&constraints, "observations") else {
        panic!("check observations")
    };
    assert_eq!(
        member(&observations[0], "state"),
        &Value::string_utf8("interpreted")
    );
}

#[test]
fn sqlserver_payload_semantic_inspector_accepts_a_valid_capture() {
    let document = call(
        "sqlserver.import",
        [
            (
                "source",
                Value::string_utf8(include_str!("../../../fixtures/sqlserver/catalog.json")),
            ),
            ("id", Value::string_utf8("registry-inspector")),
        ],
    )
    .unwrap();
    let payload = member(member(&document, "extensions"), "umf.sqlserver").clone();
    let diagnostics = call("sqlserver.inspectPayload", [("payload", payload)]).unwrap();
    let Value::Array(diagnostics) = diagnostics else {
        panic!("payload diagnostics")
    };
    assert_eq!(
        diagnostics
            .iter()
            .filter(|item| member(item, "code") == &Value::string_utf8("SQLSERVER_CAPTURE_SCOPE"))
            .count(),
        1,
    );
}

#[test]
fn sqlserver_facet_predicate_preserves_non_string_inputs_as_unsupported() {
    let result = call(
        "sqlserver.facetPredicate",
        [
            ("source", Value::Bool(true)),
            ("columnName", Value::string_utf8("value")),
        ],
    )
    .unwrap();
    assert_eq!(member(&result, "native"), &Value::Bool(true));
    assert_eq!(member(&result, "state"), &Value::string_utf8("unsupported"));
    assert!(matches!(member(&result, "candidates"), Value::Array(items) if items.is_empty()));
}
