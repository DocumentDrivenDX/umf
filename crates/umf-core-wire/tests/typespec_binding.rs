// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::typespec_binding::{execute_wire_with_session, Session, PROFILE};

fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn call(
    session: &mut Session,
    op: &str,
    fields: impl IntoIterator<Item = (&'static str, Value)>,
) -> Result<Value, Json> {
    let mut request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    request.extend(fields.into_iter().map(|(k, v)| (Utf16::from(k), v)));
    let wire = umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let envelope: Json =
        serde_json::from_str(&execute_wire_with_session(session, &wire, &mut |_| Ok(()))).unwrap();
    if envelope["status"] != "ok" {
        return Err(envelope);
    }
    Ok(
        umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary())
            .unwrap(),
    )
}
fn text(value: &str) -> Value {
    Value::string_utf8(value)
}
fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, v)| v)
        .unwrap()
}
fn token(value: &Value) -> Value {
    member(value, "token").clone()
}

#[test]
fn typespec_source_wire_runs_import_and_compile_prepare_complete() {
    let mut session = Session::new();
    let input = object([
        ("entrypoint", text("main.tsp")),
        (
            "files",
            object([("main.tsp", text("model Item { id: string; }"))]),
        ),
    ]);
    let prepared = call(
        &mut session,
        "typespec.prepareImport",
        [("input", input), ("id", text("typespec-wire"))],
    )
    .unwrap();
    let document = call(
        &mut session,
        "typespec.completeImport",
        [
            ("token", token(&prepared)),
            ("response", Value::Array(vec![])),
        ],
    )
    .unwrap();
    let prepared = call(
        &mut session,
        "typespec.prepareCompile",
        [("document", document)],
    )
    .unwrap();
    assert_eq!(
        member(member(&prepared, "request"), "operation"),
        &text("compile")
    );
    let report = call(
        &mut session,
        "typespec.completeCompile",
        [
            ("token", token(&prepared)),
            (
                "response",
                object([
                    ("valid", Value::Bool(true)),
                    ("diagnostics", Value::Array(vec![])),
                ]),
            ),
        ],
    )
    .unwrap();
    assert_eq!(member(&report, "valid"), &Value::Bool(true));
    assert_eq!(member(&report, "complete"), &Value::Bool(false));
}

#[test]
fn typespec_source_wire_refuses_invalid_source_path_before_parser_capability() {
    let mut session = Session::new();
    let input = object([
        ("entrypoint", text("../main.tsp")),
        (
            "files",
            object([("../main.tsp", text("model Item { id: string; }"))]),
        ),
    ]);
    let error = call(
        &mut session,
        "typespec.prepareImport",
        [("input", input), ("id", text("typespec-invalid"))],
    )
    .unwrap_err();
    assert_eq!(error["status"], "error");
    assert_eq!(error["code"], "TYPESPEC_DOCUMENT");
}
