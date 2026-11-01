// SPDX-License-Identifier: MIT OR Apache-2.0
#![cfg(feature = "native-postgresql")]

use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::postgresql_native_binding::{execute_wire_with_control, PROFILE};

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
    let mut control = |_| Ok(());
    let envelope: Json =
        serde_json::from_str(&execute_wire_with_control(&wire, &mut control)).unwrap();
    if envelope["status"] != "ok" {
        return Err(envelope);
    }
    Ok(
        umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary())
            .unwrap(),
    )
}

fn call_catalog(
    op: &str,
    fields: impl IntoIterator<Item = (&'static str, Value)>,
) -> Result<Value, Json> {
    let mut request = vec![
        (
            Utf16::from("profile"),
            Value::string_utf8(umf_core_wire::postgresql_catalog_binding::PROFILE),
        ),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    request.extend(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value)),
    );
    let wire = umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let mut control = |_| Ok(());
    let envelope: Json = serde_json::from_str(
        &umf_core_wire::postgresql_native_binding::execute_catalog_wire_with_control(
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
fn native_postgresql_parses_edits_deparses_and_reparses_select_one() {
    let document = call(
        "postgresql-sql.import",
        [
            ("source", Value::string_utf8("SELECT 1 AS value")),
            ("id", Value::string_utf8("native-select")),
        ],
    )
    .unwrap();
    let edited = call(
        "postgresql-sql.editNode",
        [
            ("document", document),
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
    let edited_document = member(&edited, "document").clone();
    let sql = call("postgresql-sql.export", [("document", edited_document)]).unwrap();
    let Value::String(sql) = sql else {
        panic!("expected deparsed SQL")
    };
    let sql = sql.to_utf8().unwrap();
    assert!(sql.contains('2'), "{sql}");
    assert!(!sql.contains('1'), "{sql}");
    let reparsed = call(
        "postgresql-sql.import",
        [
            ("source", Value::string_utf8(&sql)),
            ("id", Value::string_utf8("native-select-reparsed")),
        ],
    )
    .unwrap();
    let inspection = call("postgresql-sql.inspect", [("document", reparsed)]).unwrap();
    assert_eq!(member(&inspection, "valid"), &Value::Bool(true));
}

#[test]
fn native_postgresql_refuses_an_unsupported_ast_version() {
    // The public AST validator is structural and accepts other i32 version
    // values. Native PostgreSQL export is pinned to the parser's 170004 AST.
    let structurally_valid = Value::Object(vec![
        (Utf16::from("version"), Value::Number(160004.0)),
        (Utf16::from("stmts"), Value::Array(Vec::new())),
    ]);
    let validation = call("postgresql-sql.validateAst", [("ast", structurally_valid)]).unwrap();
    assert_eq!(member(&validation, "valid"), &Value::Bool(true));
    assert_eq!(member(&validation, "complete"), &Value::Bool(false));

    let document = call(
        "postgresql-sql.import",
        [
            ("source", Value::string_utf8("SELECT 1")),
            ("id", Value::string_utf8("wrong-version")),
        ],
    )
    .unwrap();
    let edited = call(
        "postgresql-sql.editNode",
        [
            ("document", document),
            ("pointer", Value::string_utf8("/version")),
            ("text", Value::string_utf8("160004")),
        ],
    )
    .unwrap();
    let error = call(
        "postgresql-sql.export",
        [("document", member(&edited, "document").clone())],
    )
    .unwrap_err();
    assert_eq!(error["status"], "error");
    assert_eq!(error["code"], "POSTGRESQL_AST_VERSION");
}

#[test]
fn native_postgresql_catalog_classifies_and_recovers_ddl_without_parser_values() {
    let sql = "-- retained comment\nCREATE TABLE sales.simple (id pg_catalog.int8, payload pg_catalog.text);\n";
    let source = call(
        "postgresql-sql.import",
        [
            ("source", Value::string_utf8(sql)),
            ("id", Value::string_utf8("native-ddl")),
        ],
    )
    .unwrap();
    let inventory = call_catalog(
        "postgresql.getDdlDeclarations",
        [("document", source.clone())],
    )
    .unwrap();
    let declarations = member(&inventory, "declarations");
    let Value::Array(declarations) = declarations else {
        panic!("expected declaration array")
    };
    let declaration = declarations
        .iter()
        .find(|declaration| member(declaration, "kind") == &Value::string_utf8("create-table"))
        .expect("CREATE TABLE declaration");
    let declaration_path = member(declaration, "path").clone();
    let request = Value::Object(vec![
        (Utf16::from("module"), Value::string_utf8("native-derived")),
        (Utf16::from("recordId"), Value::string_utf8("simple")),
        (Utf16::from("declaration"), declaration_path),
        (Utf16::from("mode"), Value::string_utf8("strict")),
    ]);
    let receipt = call_catalog(
        "postgresql.classifyDdlRecord",
        [("source", source.clone()), ("request", request.clone())],
    )
    .unwrap();
    assert_eq!(
        member(&receipt, "status"),
        &Value::string_utf8("classified")
    );
    let current_target = member(&receipt, "target").clone();
    let recovered = call_catalog(
        "postgresql.recoverDdlKinds",
        [("receipt", receipt), ("current", current_target)],
    )
    .unwrap();
    assert_eq!(recovered, Value::string_utf8(sql));

    let Value::Array(modules) = member(&source, "modules") else {
        panic!("expected source module array")
    };
    let existing_module_id = member(modules.first().expect("source module"), "id").clone();
    let collision_request = Value::Object(vec![
        (Utf16::from("module"), existing_module_id),
        (Utf16::from("recordId"), Value::string_utf8("simple")),
        (
            Utf16::from("declaration"),
            member(declaration, "path").clone(),
        ),
        (Utf16::from("mode"), Value::string_utf8("strict")),
    ]);
    let refused = call_catalog(
        "postgresql.classifyDdlRecord",
        [("source", source), ("request", collision_request)],
    )
    .unwrap();
    assert_eq!(member(&refused, "status"), &Value::string_utf8("blocked"));
}
