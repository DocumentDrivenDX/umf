use serde_json::Value as Json;
use umf_core::parser_backend_protocol::ParserSession;
use umf_core::{Context, Utf16, Value};

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    &fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .expect("member")
        .1
}

fn json_to_value(value: serde_json::Value) -> Value {
    match value {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(value) => Value::Bool(value),
        serde_json::Value::Number(value) => {
            Value::Number(value.as_f64().expect("finite fixture number"))
        }
        serde_json::Value::String(value) => Value::string_utf8(&value),
        serde_json::Value::Array(values) => {
            Value::Array(values.into_iter().map(json_to_value).collect())
        }
        serde_json::Value::Object(fields) => Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), json_to_value(value)))
                .collect(),
        ),
    }
}

fn call(
    session: &mut ParserSession,
    op: &str,
    fields: impl IntoIterator<Item = (&'static str, Value)>,
) -> Result<Value, Json> {
    let mut members = vec![
        (
            Utf16::from("profile"),
            Value::string_utf8(umf_core_wire::postgresql_parser_binding::PROFILE),
        ),
        (
            Utf16::from("op"),
            Value::string_utf8(&format!("postgresql-parser.{op}")),
        ),
    ];
    members.extend(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value)),
    );
    let wire = umf_core_wire::encode(&Value::Object(members), &mut Context::ordinary()).unwrap();
    let mut control = |_amount| Ok(());
    let envelope: Json = serde_json::from_str(
        &umf_core_wire::postgresql_parser_binding::execute_wire_with_session(
            session,
            &wire,
            &mut control,
        ),
    )
    .unwrap();
    if envelope["status"] != "ok" {
        return Err(envelope);
    }
    Ok(
        umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary())
            .unwrap(),
    )
}

#[test]
fn parser_session_wire_import_edit_export_and_cancel_are_rust_owned() {
    let mut session = ParserSession::default();
    let prepared = call(
        &mut session,
        "prepareImport",
        [
            ("source", Value::string_utf8("SELECT 1")),
            ("id", Value::string_utf8("session-wire")),
        ],
    )
    .unwrap();
    assert_eq!(member(&prepared, "work"), &Value::string_utf8("parse"));
    let ast: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/postgresql/select-one-ast.json"
    ))
    .unwrap();
    let imported = call(
        &mut session,
        "completeImport",
        [
            ("token", member(&prepared, "token").clone()),
            (
                "response",
                Value::Object(vec![
                    (Utf16::from("kind"), Value::string_utf8("parsed")),
                    (Utf16::from("tree"), json_to_value(ast)),
                ]),
            ),
        ],
    )
    .unwrap();
    let edited = call(
        &mut session,
        "editNode",
        [
            ("document", member(&imported, "document").clone()),
            (
                "pointer",
                Value::string_utf8(
                    "/stmts/0/stmt/SelectStmt/targetList/0/ResTarget/val/A_Const/ival/ival",
                ),
            ),
            ("text", Value::string_utf8("2")),
        ],
    )
    .unwrap();
    assert_eq!(
        member(member(&edited, "validation"), "valid"),
        &Value::Bool(true)
    );
    let prepared_export = call(
        &mut session,
        "prepareExport",
        [("document", member(&edited, "document").clone())],
    )
    .unwrap();
    assert_eq!(
        member(&prepared_export, "work"),
        &Value::string_utf8("codecRoundTrip")
    );
    let ast: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/postgresql/select-one-ast.json"
    ))
    .unwrap();
    let mut edited_ast = ast;
    edited_ast["stmts"][0]["stmt"]["SelectStmt"]["targetList"][0]["ResTarget"]["val"]["A_Const"]
        ["ival"]["ival"] = serde_json::json!(2);
    let completion = call(
        &mut session,
        "completeExport",
        [
            ("token", member(&prepared_export, "token").clone()),
            (
                "response",
                Value::Object(vec![
                    (Utf16::from("kind"), Value::string_utf8("codecRoundTripped")),
                    (Utf16::from("tree"), json_to_value(edited_ast.clone())),
                ]),
            ),
        ],
    )
    .unwrap();
    assert_eq!(member(&completion, "done"), &Value::Bool(false));
    let deparse = member(&completion, "request").clone();
    let completion = call(
        &mut session,
        "completeExport",
        [
            ("token", member(&deparse, "token").clone()),
            (
                "response",
                Value::Object(vec![
                    (Utf16::from("kind"), Value::string_utf8("deparsed")),
                    (Utf16::from("sql"), Value::string_utf8("SELECT 2")),
                ]),
            ),
        ],
    )
    .unwrap();
    assert_eq!(member(&completion, "done"), &Value::Bool(false));
    let reparse = member(&completion, "request").clone();
    let completion = call(
        &mut session,
        "completeExport",
        [
            ("token", member(&reparse, "token").clone()),
            (
                "response",
                Value::Object(vec![
                    (Utf16::from("kind"), Value::string_utf8("parsed")),
                    (Utf16::from("tree"), json_to_value(edited_ast)),
                ]),
            ),
        ],
    )
    .unwrap();
    assert_eq!(member(&completion, "done"), &Value::Bool(true));
    assert_eq!(member(&completion, "sql"), &Value::string_utf8("SELECT 2"));

    let pending = call(
        &mut session,
        "prepareImport",
        [
            ("source", Value::string_utf8("SELECT 3")),
            ("id", Value::string_utf8("cancelled")),
        ],
    )
    .unwrap();
    let cancelled = call(
        &mut session,
        "cancel",
        [("token", member(&pending, "token").clone())],
    )
    .unwrap();
    assert_eq!(cancelled, Value::Bool(true));
    let wrong_version = serde_json::json!({"version":160004,"stmts":[]});
    let prepared = call(
        &mut session,
        "prepareImport",
        [
            ("source", Value::string_utf8("SELECT 1")),
            ("id", Value::string_utf8("wrong-version")),
        ],
    )
    .unwrap();
    let error = call(
        &mut session,
        "completeImport",
        [
            ("token", member(&prepared, "token").clone()),
            (
                "response",
                Value::Object(vec![
                    (Utf16::from("kind"), Value::string_utf8("parsed")),
                    (Utf16::from("tree"), json_to_value(wrong_version)),
                ]),
            ),
        ],
    )
    .unwrap_err();
    assert_eq!(error["code"], "POSTGRESQL_AST_VERSION");
}
