// SPDX-License-Identifier: MIT OR Apache-2.0
#![cfg(feature = "native-postgresql")]

use serde_json::Value as Json;
use umf_core::{
    serialization::{read_json_value, Format},
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
};
use umf_core_wire::postgresql_native_binding::{execute_wire_with_control, PROFILE};
use umf_core_wire::{decode, encode, execute_request};

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

fn member_mut<'a>(value: &'a mut Value, name: &str) -> &'a mut Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .unwrap()
}

fn set_member(value: &mut Value, name: &str, replacement: Value) {
    *member_mut(value, name) = replacement;
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value))
            .collect(),
    )
}

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn parse_json(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn core_resources() -> Value {
    object(vec![
        (
            "coreSchema",
            parse_json(include_str!("../../../spec/core/schema.json")),
        ),
        (
            "referenceSchema",
            parse_json(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
        ),
        (
            "packageSchema",
            parse_json(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
        ),
        (
            "constraints",
            parse_json(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
        ),
        (
            "domainPolicy",
            parse_json(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
    ])
}

fn model_call(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    let mut request = vec![
        (Utf16::from("op"), Value::string_utf8(op)),
        (Utf16::from("resources"), core_resources()),
    ];
    request.extend(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value)),
    );
    let wire = encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let mut capabilities = NoCapabilities;
    let envelope: Json = serde_json::from_str(&execute_request(
        &wire,
        ResourceProfile::Cooperative,
        &mut capabilities,
    ))
    .unwrap();
    assert_eq!(envelope["status"], "ok", "{op}: {envelope}");
    decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

fn kind_author(
    source: &Value,
    target: &Value,
    module: &str,
    element: &str,
    path: &str,
    kind: &str,
) -> Value {
    object(vec![
        ("operation", Value::string_utf8("declare-core-kind")),
        ("version", Value::string_utf8("6.0.0")),
        ("source", source.clone()),
        ("target", target.clone()),
        (
            "identity",
            object(vec![
                ("module", Value::string_utf8(module)),
                ("element", Value::string_utf8(element)),
            ]),
        ),
        (
            "provenance",
            object(vec![
                ("origin", Value::string_utf8("authored")),
                ("idealPath", Value::string_utf8(path)),
                ("kind", Value::string_utf8(kind)),
                (
                    "binding",
                    object(vec![
                        ("id", Value::string_utf8("umf.core.kind.authoring")),
                        ("version", Value::string_utf8("6.0.0")),
                    ]),
                ),
                ("basis", Value::string_utf8("explicit-author-declaration")),
                ("nativePath", Value::Null),
            ]),
        ),
    ])
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

#[test]
fn native_postgresql_authored_cardinality_projects_and_recovers_without_parser_values() {
    let source = object(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::string_utf8("native-authored-source")),
        ("vocabularies", object(vec![])),
        (
            "modules",
            Value::Array(vec![object(vec![
                ("id", Value::string_utf8("m")),
                ("namespace", Value::string_utf8("")),
                (
                    "elements",
                    Value::Array(vec![object(vec![
                        ("id", Value::string_utf8("value")),
                        ("kind", Value::string_utf8("field")),
                        ("extensions", object(vec![])),
                    ])]),
                ),
            ])]),
        ),
    ]);
    let target = object(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::string_utf8("native-authored-source")),
        ("vocabularies", object(vec![])),
        (
            "modules",
            Value::Array(vec![object(vec![
                ("id", Value::string_utf8("m")),
                ("namespace", Value::string_utf8("")),
                (
                    "elements",
                    Value::Array(vec![object(vec![
                        ("id", Value::string_utf8("value")),
                        ("kind", Value::string_utf8("field")),
                        ("cardinality", Value::string_utf8("one")),
                        ("extensions", object(vec![])),
                    ])]),
                ),
            ])]),
        ),
    ]);
    let author = object(vec![
        ("operation", Value::string_utf8("declare-core-cardinality")),
        ("version", Value::string_utf8("4.0.0")),
        ("source", source.clone()),
        ("target", target),
        (
            "identity",
            object(vec![
                ("module", Value::string_utf8("m")),
                ("element", Value::string_utf8("value")),
            ]),
        ),
        (
            "request",
            object(vec![("cardinality", Value::string_utf8("one"))]),
        ),
        (
            "provenance",
            object(vec![
                ("origin", Value::string_utf8("authored")),
                (
                    "idealPath",
                    Value::string_utf8("/modules/0/elements/0/cardinality"),
                ),
                ("cardinality", Value::string_utf8("one")),
                (
                    "binding",
                    object(vec![
                        ("id", Value::string_utf8("umf.core.cardinality.authoring")),
                        ("version", Value::string_utf8("4.0.0")),
                    ]),
                ),
                ("basis", Value::string_utf8("explicit-author-declaration")),
                ("nativePath", Value::Null),
            ]),
        ),
    ]);
    let request = object(vec![
        ("id", Value::string_utf8("native-authored-cardinality")),
        ("namespace", Value::string_utf8("public")),
        ("tableName", Value::string_utf8("values")),
        ("columnName", Value::string_utf8("value")),
        ("nativeType", Value::string_utf8("integer")),
        ("mode", Value::string_utf8("report")),
        ("storage", Value::string_utf8("scalar")),
        ("requireExactValues", Value::Bool(false)),
    ]);
    let receipt = call_catalog(
        "postgresql.projectCardinalityWithNativeBackend",
        [("author", author.clone()), ("request", request)],
    )
    .unwrap();
    assert_eq!(member(&receipt, "status"), &Value::string_utf8("projected"));
    assert_eq!(
        member(member(&receipt, "mapping"), "outcome"),
        &Value::string_utf8("exact")
    );
    let native_sql = member(&receipt, "nativeSql").clone();
    let recovered = call_catalog(
        "postgresql.recoverCardinalityWithNativeBackend",
        [("receipt", receipt), ("nativeText", native_sql)],
    )
    .unwrap();
    assert_eq!(recovered, member(&author, "target").clone());

    let refused_request = object(vec![
        (
            "id",
            Value::string_utf8("native-authored-cardinality-refusal"),
        ),
        ("namespace", Value::string_utf8("public")),
        ("tableName", Value::string_utf8("values")),
        ("columnName", Value::string_utf8("value")),
        ("nativeType", Value::string_utf8("integer")),
        ("mode", Value::string_utf8("strict")),
        ("storage", Value::string_utf8("scalar")),
        ("requireExactValues", Value::Bool(false)),
    ]);
    let mut array_author = author;
    if let Value::Object(fields) = &mut array_author {
        let target = fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from("target"))
            .map(|(_, value)| value)
            .unwrap();
        if let Value::Array(modules) = member_mut(target, "modules") {
            if let Value::Array(elements) = member_mut(&mut modules[0], "elements") {
                set_member(&mut elements[0], "cardinality", Value::string_utf8("array"));
            }
        }
        let provenance = member_mut(&mut array_author, "provenance");
        set_member(provenance, "cardinality", Value::string_utf8("array"));
        let request = member_mut(&mut array_author, "request");
        set_member(request, "cardinality", Value::string_utf8("array"));
    }
    let blocked = call_catalog(
        "postgresql.projectCardinalityWithNativeBackend",
        [("author", array_author), ("request", refused_request)],
    )
    .unwrap();
    assert_eq!(member(&blocked, "status"), &Value::string_utf8("blocked"));

    let authored_source = object(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::string_utf8("authored-source")),
        ("vocabularies", object(vec![])),
        (
            "modules",
            Value::Array(vec![
                object(vec![
                    ("id", Value::string_utf8("records")),
                    ("namespace", Value::string_utf8("sales")),
                    (
                        "elements",
                        Value::Array(vec![object(vec![
                            ("id", Value::string_utf8("orders")),
                            ("name", Value::string_utf8("orders")),
                            ("kind", Value::string_utf8("record")),
                            (
                                "references",
                                Value::Array(vec![object(vec![
                                    ("role", Value::string_utf8("member")),
                                    ("module", Value::string_utf8("fields")),
                                    ("element", Value::string_utf8("id")),
                                ])]),
                            ),
                            ("extensions", object(vec![])),
                        ])]),
                    ),
                ]),
                object(vec![
                    ("id", Value::string_utf8("fields")),
                    ("namespace", Value::string_utf8("sales")),
                    (
                        "elements",
                        Value::Array(vec![object(vec![
                            ("id", Value::string_utf8("id")),
                            ("name", Value::string_utf8("id")),
                            ("kind", Value::string_utf8("field")),
                            ("scalarType", Value::string_utf8("integer")),
                            ("extensions", object(vec![])),
                        ])]),
                    ),
                ]),
            ]),
        ),
    ]);
    let record_author = kind_author(
        &authored_source,
        &authored_source,
        "records",
        "orders",
        "/modules/0/elements/0/kind",
        "record",
    );
    let field_author = kind_author(
        &authored_source,
        &authored_source,
        "fields",
        "id",
        "/modules/1/elements/0/kind",
        "field",
    );
    let field_request = object(vec![
        ("id", Value::string_utf8("native-field")),
        ("namespace", Value::string_utf8("sales")),
        ("tableName", Value::string_utf8("orders")),
        ("columnName", Value::string_utf8("id")),
        ("nativeType", Value::string_utf8("bigint")),
        ("mode", Value::string_utf8("report")),
    ]);
    let field_receipt = call_catalog(
        "postgresql.projectFieldWithNativeBackend",
        [("author", field_author.clone()), ("request", field_request)],
    )
    .unwrap();
    assert_eq!(
        member(&field_receipt, "status"),
        &Value::string_utf8("projected")
    );
    let field_native = member(&field_receipt, "nativeSql").clone();
    let field_recovered = call_catalog(
        "postgresql.recoverFieldWithNativeBackend",
        [("receipt", field_receipt), ("nativeText", field_native)],
    )
    .unwrap();
    assert_eq!(field_recovered, authored_source);

    let record_request = object(vec![
        ("id", Value::string_utf8("native-record")),
        ("namespace", Value::string_utf8("sales")),
        ("tableName", Value::string_utf8("orders")),
        ("mode", Value::string_utf8("strict")),
        (
            "fields",
            Value::Array(vec![object(vec![
                ("author", field_author),
                ("columnName", Value::string_utf8("id")),
                ("nativeType", Value::string_utf8("bigint")),
            ])]),
        ),
    ]);
    let record_receipt = call_catalog(
        "postgresql.projectRecordWithNativeBackend",
        [
            ("author", record_author.clone()),
            ("request", record_request),
        ],
    )
    .unwrap();
    assert_eq!(
        member(&record_receipt, "status"),
        &Value::string_utf8("projected")
    );
    let record_native = member(&record_receipt, "nativeSql").clone();
    let record_recovered = call_catalog(
        "postgresql.recoverRecordWithNativeBackend",
        [("receipt", record_receipt), ("nativeText", record_native)],
    )
    .unwrap();
    assert_eq!(record_recovered, authored_source);
}

#[test]
fn native_postgresql_nullability_projection_uses_catalog_parser_without_parser_values() {
    let source = object(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::string_utf8("nullability-source")),
        ("vocabularies", object(vec![])),
        (
            "modules",
            Value::Array(vec![object(vec![
                ("id", Value::string_utf8("m")),
                ("namespace", Value::string_utf8("")),
                (
                    "elements",
                    Value::Array(vec![object(vec![
                        ("id", Value::string_utf8("value")),
                        ("kind", Value::string_utf8("field")),
                        ("scalarType", Value::string_utf8("integer")),
                        ("extensions", object(vec![])),
                    ])]),
                ),
            ])]),
        ),
    ]);
    let mut target = source.clone();
    if let Value::Array(modules) = member_mut(&mut target, "modules") {
        if let Value::Array(elements) = member_mut(&mut modules[0], "elements") {
            if let Value::Object(fields) = &mut elements[0] {
                fields.push((Utf16::from("nullability"), Value::string_utf8("required")));
            }
        }
    }
    let author = object(vec![
        ("operation", Value::string_utf8("declare-core-nullability")),
        ("version", Value::string_utf8("5.0.0")),
        ("source", source.clone()),
        ("target", target.clone()),
        (
            "identity",
            object(vec![
                ("module", Value::string_utf8("m")),
                ("element", Value::string_utf8("value")),
            ]),
        ),
        (
            "provenance",
            object(vec![
                ("origin", Value::string_utf8("authored")),
                (
                    "idealPath",
                    Value::string_utf8("/modules/0/elements/0/nullability"),
                ),
                ("nullability", Value::string_utf8("required")),
                (
                    "binding",
                    object(vec![
                        ("id", Value::string_utf8("umf.core.nullability.authoring")),
                        ("version", Value::string_utf8("5.0.0")),
                    ]),
                ),
                ("basis", Value::string_utf8("explicit-author-declaration")),
                ("nativePath", Value::Null),
            ]),
        ),
    ]);
    let request = object(vec![
        ("id", Value::string_utf8("native-authored-nullability")),
        ("namespace", Value::string_utf8("public")),
        ("tableName", Value::string_utf8("values")),
        ("columnName", Value::string_utf8("value")),
        ("nativeType", Value::string_utf8("integer")),
        ("mode", Value::string_utf8("report")),
        ("scope", Value::string_utf8("stored-relation")),
        ("carrier", Value::string_utf8("sql-null")),
    ]);
    let receipt = call_catalog(
        "postgresql.projectNullabilityWithNativeBackend",
        [("author", author.clone()), ("request", request)],
    )
    .unwrap();
    assert_eq!(member(&receipt, "status"), &Value::string_utf8("projected"));
    assert_eq!(
        member(member(&receipt, "mapping"), "encoding"),
        &Value::string_utf8("not-null")
    );
    let native_sql = member(&receipt, "nativeSql").clone();
    let recovered = call_catalog(
        "postgresql.recoverNullabilityWithNativeBackend",
        [("receipt", receipt), ("nativeText", native_sql)],
    )
    .unwrap();
    assert_eq!(recovered, target);

    let mut future_source = source.clone();
    if let Value::Object(fields) = &mut future_source {
        fields.push((Utf16::from("future"), Value::Bool(true)));
    }
    let mut future_target = target;
    if let Value::Object(fields) = &mut future_target {
        fields.push((Utf16::from("future"), Value::Bool(true)));
    }
    let mut future_author = author;
    set_member(&mut future_author, "source", future_source.clone());
    set_member(&mut future_author, "target", future_target);
    let strict = object(vec![
        (
            "id",
            Value::string_utf8("native-authored-nullability-refusal"),
        ),
        ("namespace", Value::string_utf8("public")),
        ("tableName", Value::string_utf8("values")),
        ("columnName", Value::string_utf8("value")),
        ("nativeType", Value::string_utf8("integer")),
        ("mode", Value::string_utf8("strict")),
        ("scope", Value::string_utf8("stored-relation")),
        ("carrier", Value::string_utf8("sql-null")),
    ]);
    let blocked = call_catalog(
        "postgresql.projectNullabilityWithNativeBackend",
        [("author", future_author), ("request", strict)],
    )
    .unwrap();
    assert_eq!(member(&blocked, "status"), &Value::string_utf8("blocked"));
}

#[test]
fn native_postgresql_authored_keys_and_facets_project_and_recover_without_parser_values() {
    let source = object(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::string_utf8("native-authored-pg-source")),
        ("vocabularies", object(vec![])),
        ("extensions", object(vec![])),
        (
            "modules",
            Value::Array(vec![object(vec![
                ("id", Value::string_utf8("sales")),
                ("namespace", Value::string_utf8("sales")),
                (
                    "elements",
                    Value::Array(vec![
                        object(vec![
                            ("id", Value::string_utf8("orders")),
                            ("name", Value::string_utf8("orders")),
                            ("kind", Value::string_utf8("record")),
                            (
                                "members",
                                Value::Array(vec![object(vec![
                                    ("module", Value::string_utf8("sales")),
                                    ("element", Value::string_utf8("id")),
                                ])]),
                            ),
                            ("extensions", object(vec![])),
                        ]),
                        object(vec![
                            ("id", Value::string_utf8("id")),
                            ("name", Value::string_utf8("id")),
                            ("kind", Value::string_utf8("field")),
                            ("scalarType", Value::string_utf8("integer")),
                            ("cardinality", Value::string_utf8("one")),
                            ("nullability", Value::string_utf8("required")),
                            ("extensions", object(vec![])),
                        ]),
                    ]),
                ),
            ])]),
        ),
    ]);
    let record_identity = object(vec![
        ("module", Value::string_utf8("sales")),
        ("element", Value::string_utf8("orders")),
    ]);
    let field_identity = object(vec![
        ("module", Value::string_utf8("sales")),
        ("element", Value::string_utf8("id")),
    ]);
    let key_author = model_call(
        "model/declareCoreKey",
        [
            ("source", source.clone()),
            ("identity", record_identity.clone()),
            (
                "request",
                object(vec![
                    ("id", Value::string_utf8("order-id")),
                    ("name", Value::string_utf8("Order identity")),
                    ("fields", Value::Array(vec![field_identity.clone()])),
                    ("primary", Value::Bool(true)),
                ]),
            ),
        ],
    );
    let key_source = member(&key_author, "target").clone();
    let key_request = object(vec![
        ("id", Value::string_utf8("native-orders-key")),
        ("record", record_identity),
        ("namespace", Value::string_utf8("sales")),
        ("tableName", Value::string_utf8("orders")),
        ("scope", Value::string_utf8("new-table-stored-values")),
        ("mode", Value::string_utf8("report")),
        (
            "keyNames",
            Value::Array(vec![object(vec![
                ("keyId", Value::string_utf8("order-id")),
                ("name", Value::string_utf8("orders_pk")),
            ])]),
        ),
        (
            "columns",
            Value::Array(vec![object(vec![
                ("field", field_identity.clone()),
                ("name", Value::string_utf8("id")),
                ("nativeType", Value::string_utf8("integer")),
            ])]),
        ),
    ]);
    let key_receipt = call_catalog(
        "postgresql.projectKeysWithNativeBackend",
        [
            ("source", key_source.clone()),
            ("authors", Value::Array(vec![key_author.clone()])),
            ("request", key_request.clone()),
        ],
    )
    .unwrap();
    assert_eq!(
        member(&key_receipt, "status"),
        &Value::string_utf8("projected")
    );
    let key_native_sql = member(&key_receipt, "nativeSql").clone();
    let key_recovered = call_catalog(
        "postgresql.recoverKeysWithNativeBackend",
        [("receipt", key_receipt), ("nativeText", key_native_sql)],
    )
    .unwrap();
    assert_eq!(key_recovered, key_source);
    let mut strict_key_request = key_request;
    set_member(
        &mut strict_key_request,
        "mode",
        Value::string_utf8("strict"),
    );
    let refused_key = call_catalog(
        "postgresql.projectKeysWithNativeBackend",
        [
            ("source", key_source.clone()),
            ("authors", Value::Array(vec![key_author])),
            ("request", strict_key_request),
        ],
    )
    .unwrap();
    assert_eq!(
        member(&refused_key, "status"),
        &Value::string_utf8("blocked")
    );

    let facet_author = model_call(
        "model/declareCoreFacets",
        [
            ("source", key_source),
            ("identity", field_identity),
            (
                "request",
                object(vec![(
                    "integerWidth",
                    object(vec![
                        ("bits", Value::Number(16.0)),
                        ("signed", Value::Bool(true)),
                    ]),
                )]),
            ),
        ],
    );
    let facet_request = object(vec![
        ("id", Value::string_utf8("native-orders-facet")),
        ("namespace", Value::string_utf8("sales")),
        ("tableName", Value::string_utf8("orders")),
        ("columnName", Value::string_utf8("id")),
        ("nativeType", Value::string_utf8("integer")),
        ("mode", Value::string_utf8("report")),
        ("encoding", Value::string_utf8("checked")),
        ("obligation", Value::string_utf8("value-domain")),
    ]);
    let facet_receipt = call_catalog(
        "postgresql.projectFacetsWithNativeBackend",
        [
            ("author", facet_author.clone()),
            ("request", facet_request.clone()),
        ],
    )
    .unwrap();
    assert_eq!(
        member(&facet_receipt, "status"),
        &Value::string_utf8("projected")
    );
    let facet_native_sql = member(&facet_receipt, "nativeSql").clone();
    let facet_recovered = call_catalog(
        "postgresql.recoverFacetsWithNativeBackend",
        [("receipt", facet_receipt), ("nativeText", facet_native_sql)],
    )
    .unwrap();
    assert_eq!(facet_recovered, member(&facet_author, "target").clone());

    let mut strict_facet_request = facet_request;
    set_member(
        &mut strict_facet_request,
        "mode",
        Value::string_utf8("strict"),
    );
    set_member(
        &mut strict_facet_request,
        "obligation",
        Value::string_utf8("exact-input"),
    );
    let refused_facet = call_catalog(
        "postgresql.projectFacetsWithNativeBackend",
        [("author", facet_author), ("request", strict_facet_request)],
    )
    .unwrap();
    assert_eq!(
        member(&refused_facet, "status"),
        &Value::string_utf8("blocked")
    );
}
