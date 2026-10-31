// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::smithy_binding::{execute_wire_with_session, Session, PROFILE};

fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn text(s: &str) -> Value {
    Value::string_utf8(s)
}
fn member<'a>(v: &'a Value, key: &str) -> &'a Value {
    let Value::Object(fields) = v else {
        panic!("object expected")
    };
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
        .unwrap()
}
fn call(
    session: &mut Session,
    op: &str,
    fields: impl IntoIterator<Item = (&'static str, Value)>,
) -> Result<Value, Json> {
    let mut pairs = vec![
        (Utf16::from("profile"), text(PROFILE)),
        (Utf16::from("op"), text(op)),
    ];
    pairs.extend(fields.into_iter().map(|(k, v)| (Utf16::from(k), v)));
    let wire = umf_core_wire::encode(&Value::Object(pairs), &mut Context::ordinary()).unwrap();
    let mut control = |_: usize| Ok(());
    let envelope: Json =
        serde_json::from_str(&execute_wire_with_session(session, &wire, &mut control)).unwrap();
    if envelope["status"] != "ok" {
        return Err(envelope);
    }
    Ok(
        umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary())
            .unwrap(),
    )
}
fn source_doc(id: &str) -> Value {
    object([
        ("umf", text("0.10.0")),
        ("id", text(id)),
        (
            "vocabularies",
            object([("umf.smithy", object([("version", text("0.1.0"))]))]),
        ),
        (
            "modules",
            Value::Array(vec![object([
                ("id", text("schema")),
                ("namespace", text("")),
                (
                    "elements",
                    Value::Array(vec![object([
                        ("id", text("schema")),
                        (
                            "extensions",
                            object([(
                                "umf.smithy",
                                object([
                                    ("profile", text("smithy-idl-sources")),
                                    (
                                        "files",
                                        object([(
                                            "model.smithy",
                                            text("$version: \"2\"\nnamespace demo\nstring Thing"),
                                        )]),
                                    ),
                                ]),
                            )]),
                        ),
                    ])]),
                ),
            ])]),
        ),
    ])
}

#[test]
fn smithy_wire_runs_explicit_assemble_then_selection() {
    let mut session = Session::new();
    let prepared = call(
        &mut session,
        "smithy.prepareAssembly",
        [
            ("document", source_doc("source")),
            ("id", text("assembled")),
            (
                "identity",
                text("smithy-model@1.73.0/teavm@0.15.0/umf-compat-v1"),
            ),
        ],
    )
    .unwrap();
    let request = member(&prepared, "request");
    assert_eq!(member(request, "operation"), &text("assemble"));
    assert_eq!(
        member(member(request, "files"), "model.smithy"),
        &text("$version: \"2\"\nnamespace demo\nstring Thing")
    );
    let completed=call(&mut session,"smithy.completeAssembly",[
        ("token",member(&prepared,"token").clone()),
        ("response",object([
            ("valid",Value::Bool(true)),("events",Value::Array(vec![])),
            ("modelJson",text("{\"smithy\":\"2.0\",\"shapes\":{\"demo#Thing\":{\"type\":\"string\"}}}")),
        ])),
    ]).unwrap();
    assert_eq!(
        member(member(&completed, "result"), "status"),
        &text("assembled")
    );
    let selected = call(
        &mut session,
        "smithy.prepareSelection",
        [
            ("assemblyToken", member(&completed, "assemblyToken").clone()),
            ("selector", text("string")),
        ],
    )
    .unwrap();
    assert_eq!(
        member(member(&selected, "request"), "operation"),
        &text("select")
    );
    let result = call(
        &mut session,
        "smithy.completeSelection",
        [
            ("token", member(&selected, "token").clone()),
            (
                "response",
                object([("shapeIds", Value::Array(vec![text("demo#Thing")]))]),
            ),
        ],
    )
    .unwrap();
    assert_eq!(member(&result, "status"), &text("selected"));
    assert_eq!(
        member(&result, "shapeIds"),
        &Value::Array(vec![text("demo#Thing")])
    );
    assert_eq!(
        member(member(&result, "assembly"), "complete"),
        &Value::Bool(false)
    );
}

#[test]
fn smithy_wire_refuses_unsafe_source_path_before_host_call() {
    let mut session = Session::new();
    // The wire must reject traversal at source admission, without producing a host request.
    let bad = object([
        ("umf", text("0.10.0")),
        ("id", text("unsafe")),
        (
            "vocabularies",
            object([("umf.smithy", object([("version", text("0.1.0"))]))]),
        ),
        (
            "modules",
            Value::Array(vec![object([
                ("id", text("schema")),
                ("namespace", text("")),
                (
                    "elements",
                    Value::Array(vec![object([
                        ("id", text("schema")),
                        (
                            "extensions",
                            object([(
                                "umf.smithy",
                                object([
                                    ("profile", text("smithy-idl-sources")),
                                    (
                                        "files",
                                        object([("../escape.smithy", text("namespace demo"))]),
                                    ),
                                ]),
                            )]),
                        ),
                    ])]),
                ),
            ])]),
        ),
    ]);
    let err = call(
        &mut session,
        "smithy.prepareAssembly",
        [
            ("document", bad),
            ("id", text("out")),
            (
                "identity",
                text("smithy-model@1.73.0/teavm@0.15.0/umf-compat-v1"),
            ),
        ],
    )
    .unwrap_err();
    assert_eq!(err["status"], "error");
    assert_eq!(err["code"], "SMITHY_DOCUMENT");
}

#[test]
fn smithy_wire_source_and_native_json_routes_preserve_exact_inputs_and_edits() {
    let mut session = Session::new();
    let source = text("$version: \"2\"\nnamespace demo\nstring Thing");
    let imported = call(
        &mut session,
        "smithy.importSources",
        [
            ("id", text("source")),
            ("files", object([("model.smithy", source.clone())])),
        ],
    )
    .unwrap();
    let inspected = call(
        &mut session,
        "smithy.inspect",
        [("document", imported.clone())],
    )
    .unwrap();
    assert_eq!(member(&inspected, "valid"), &Value::Bool(true));
    let edited = call(
        &mut session,
        "smithy.editSource",
        [
            ("document", imported),
            ("path", text("model.smithy")),
            (
                "source",
                text("$version: \"2\"\nnamespace demo\nstring Changed"),
            ),
        ],
    )
    .unwrap();
    let files = call(
        &mut session,
        "smithy.exportSources",
        [("document", member(&edited, "document").clone())],
    )
    .unwrap();
    assert_eq!(
        member(member(&files, "files"), "model.smithy"),
        &text("$version: \"2\"\nnamespace demo\nstring Changed")
    );

    let ast = call(
        &mut session,
        "smithy.importJson",
        [
            ("id", text("ast")),
            (
                "source",
                text("{\"smithy\":\"2.0\",\"metadata\":{\"exact\":9007199254740993}}"),
            ),
        ],
    )
    .unwrap();
    let node = call(
        &mut session,
        "smithy.getNode",
        [("document", ast.clone()), ("path", text("/metadata/exact"))],
    )
    .unwrap();
    assert_eq!(member(&node, "value"), &text("9007199254740993"));
    let edited = call(
        &mut session,
        "smithy.editNode",
        [
            ("document", ast),
            ("path", text("/metadata/exact")),
            ("replacement", text("9007199254740995")),
        ],
    )
    .unwrap();
    let bundle = call(
        &mut session,
        "smithy.exportBundle",
        [("document", member(&edited, "document").clone())],
    )
    .unwrap();
    let Value::String(schema) = member(&bundle, "schema") else {
        panic!("schema text expected")
    };
    assert!(schema.to_utf8().unwrap().contains("9007199254740995"));
}

#[test]
fn smithy_wire_payload_inspector_reports_source_semantics_without_parsing() {
    let mut session = Session::new();
    let diagnostics = call(
        &mut session,
        "smithy.inspectPayload",
        [(
            "payload",
            object([
                ("profile", text("smithy-idl-sources")),
                ("files", object([("model.smithy", text("namespace demo"))])),
            ]),
        )],
    )
    .unwrap();
    let Value::Array(diagnostics) = diagnostics else {
        panic!("diagnostics array expected")
    };
    assert!(diagnostics
        .iter()
        .any(|d| member(d, "code") == &text("SMITHY_SOURCE_UNVALIDATED")));
}

#[test]
fn smithy_wire_refuses_export_that_would_drop_dependencies() {
    let mut session = Session::new();
    let doc = call(
        &mut session,
        "smithy.importJson",
        [
            ("id", text("ast")),
            ("source", text("{\"smithy\":\"2.0\"}")),
            (
                "dependencies",
                Value::Array(vec![object([
                    ("id", text("dep")),
                    ("schema", text("{\"smithy\":\"2.0\"}")),
                ])]),
            ),
        ],
    )
    .unwrap();
    let error: Json = serde_json::from_str(&execute_wire_with_session(
        &mut session,
        &umf_core_wire::encode(
            &object([
                ("profile", text(PROFILE)),
                ("op", text("smithy.exportJson")),
                ("document", doc),
            ]),
            &mut Context::ordinary(),
        )
        .unwrap(),
        &mut |_| Ok(()),
    ))
    .unwrap();
    assert_eq!(error["status"], "error");
    assert_eq!(error["code"], "SMITHY_DEPENDENCIES_REQUIRED");
}
