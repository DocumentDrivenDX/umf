// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::postgresql_catalog_binding::{execute_wire, PROFILE};

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
fn postgres_catalog_public_flow_imports_columns_edits_and_exports_native_capture() {
    let source = include_str!("../../../fixtures/postgresql/catalog-capture.json");
    let document = call(
        "postgresql.import",
        [
            ("source", Value::string_utf8(source)),
            ("id", Value::string_utf8("pg-wire")),
        ],
    )
    .unwrap();
    let columns = call("postgresql.columns", [("document", document.clone())]).unwrap();
    let Value::Array(rows) = columns else {
        panic!("derived columns")
    };
    let scalar = rows
        .iter()
        .find(|row| {
            member(member(row, "relation"), "schema") == &Value::string_utf8("sales")
                && member(member(row, "relation"), "name") == &Value::string_utf8("scalar_types")
                && member(member(row, "element"), "scalarType") == &Value::string_utf8("boolean")
        })
        .unwrap();
    let path = match member(scalar, "path") {
        Value::String(s) => s.clone(),
        _ => panic!("native pointer"),
    };
    let comment_path = Utf16::from(format!("{}/comment", path.to_utf8().unwrap()));
    let edited = call(
        "postgresql.edit",
        [
            ("document", document.clone()),
            ("path", Value::String(comment_path)),
            ("text", Value::string_utf8("\"native column note\"")),
        ],
    )
    .unwrap();
    let report = call("postgresql.inspect", [("document", edited.clone())]).unwrap();
    assert_eq!(member(&report, "valid"), &Value::Bool(true));
    let archive = call("postgresql.export", [("document", edited)]).unwrap();
    assert!(
        matches!(archive,Value::String(ref s) if s.to_utf8().unwrap().contains("native column note")&&s.to_utf8().unwrap().contains("9223372036854775807"))
    );
}
#[test]
fn postgres_catalog_wire_refuses_a_malformed_relation_capture() {
    let malformed = r#"{"profile":"postgresql-catalog-capture-v1","state":"captured","serverVersion":170004,"snapshot":{"relations":{} }}"#;
    let error = call(
        "postgresql.import",
        [
            ("source", Value::string_utf8(malformed)),
            ("id", Value::string_utf8("bad")),
        ],
    )
    .unwrap_err();
    assert_eq!(error["status"], "error");
    assert_eq!(error["code"], "POSTGRESQL_CATALOG_CAPTURE");
}

#[test]
fn postgres_catalog_queries_keep_native_observations_and_original_archive_scope() {
    let source = include_str!("../../../fixtures/postgresql/catalog-capture.json");
    let document = call(
        "postgresql.import",
        [
            ("source", Value::string_utf8(source)),
            ("id", Value::string_utf8("pg-query")),
        ],
    )
    .unwrap();
    let relation = call(
        "postgresql.findRelation",
        [
            ("document", document.clone()),
            ("schema", Value::string_utf8("public")),
            ("name", Value::string_utf8("events")),
        ],
    )
    .unwrap();
    assert_ne!(relation, Value::Null);
    let reconstruction = call(
        "postgresql.reconstruction",
        [("document", document.clone())],
    )
    .unwrap();
    assert_eq!(member(&reconstruction, "complete"), &Value::Bool(false));
    let dependencies = call("postgresql.dependencies", [("document", document.clone())]).unwrap();
    assert_eq!(member(&dependencies, "available"), &Value::Bool(true));
    let missing = call(
        "postgresql.getNode",
        [
            ("document", document),
            ("pointer", Value::string_utf8("/snapshot/no_such_field")),
        ],
    )
    .unwrap_err();
    assert_eq!(missing["status"], "error");
}

#[test]
fn postgres_native_facet_type_inspection_preserves_numeric_typmod() {
    let native = Value::Object(vec![
        (Utf16::from("kind"), Value::string_utf8("object")),
        (
            Utf16::from("members"),
            Value::Object(vec![
                (Utf16::from("schema"), tagged_string("pg_catalog")),
                (Utf16::from("kind"), tagged_string("b")),
                (Utf16::from("name"), tagged_string("numeric")),
                (Utf16::from("category"), tagged_string("N")),
                (Utf16::from("dimensions"), tagged_number("0")),
                (
                    Utf16::from("modifier"),
                    tagged_number(&((20 * 65536 + 4 + 4).to_string())),
                ),
            ]),
        ),
    ]);
    let inspection = call("postgresql.facetType", [("native", native)]).unwrap();
    assert_eq!(
        member(&inspection, "state"),
        &Value::string_utf8("observed")
    );
    assert_eq!(
        member(member(&inspection, "meaning"), "precision"),
        &Value::Number(20.0)
    );
    assert_eq!(
        member(member(&inspection, "meaning"), "scale"),
        &Value::Number(4.0)
    );
}
fn tagged_string(value: &str) -> Value {
    Value::Object(vec![
        (Utf16::from("kind"), Value::string_utf8("string")),
        (Utf16::from("value"), Value::string_utf8(value)),
    ])
}
fn tagged_number(value: &str) -> Value {
    Value::Object(vec![
        (Utf16::from("kind"), Value::string_utf8("number")),
        (Utf16::from("value"), Value::string_utf8(value)),
    ])
}

#[test]
fn postgres_syntax_facet_returns_only_complete_closed_candidate_sets() {
    let evidence: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/validation/facets-postgresql-predicate-browser.json"
    ))
    .unwrap();
    let ast = json_to_value(evidence["rows"][0]["ast"].clone());
    let result = call(
        "postgresql.facetPredicate",
        [("native", ast), ("columnName", Value::string_utf8("value"))],
    )
    .unwrap();
    assert_eq!(member(&result, "state"), &Value::string_utf8("candidate"));
    let Value::Array(candidates) = member(&result, "candidates") else {
        panic!("candidate list")
    };
    assert_eq!(candidates.len(), 3);
    let unsupported = call(
        "postgresql.facetPredicate",
        [
            ("native", json_to_value(evidence["rows"][6]["ast"].clone())),
            ("columnName", Value::string_utf8("value")),
        ],
    )
    .unwrap();
    assert_eq!(
        member(&unsupported, "state"),
        &Value::string_utf8("unsupported")
    );
    assert_eq!(
        member(&unsupported, "candidates"),
        &Value::Array(Vec::new())
    );
}
fn json_to_value(value: serde_json::Value) -> Value {
    match value {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(v) => Value::Bool(v),
        serde_json::Value::Number(v) => Value::Number(v.as_f64().unwrap()),
        serde_json::Value::String(v) => Value::string_utf8(v),
        serde_json::Value::Array(values) => {
            Value::Array(values.into_iter().map(json_to_value).collect())
        }
        serde_json::Value::Object(fields) => Value::Object(
            fields
                .into_iter()
                .map(|(k, v)| (Utf16::from(k), json_to_value(v)))
                .collect(),
        ),
    }
}

#[test]
fn postgres_supplement_wire_inspectors_validate_schemas_and_preserve_sources() {
    let facet: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/validation/facets-postgresql-constraints-native.json"
    ))
    .unwrap();
    let facet_text = serde_json::to_string(&facet["capture"]).unwrap();
    let inspected = call(
        "postgresql.facetCatalog",
        [("source", Value::string_utf8(&facet_text))],
    )
    .unwrap();
    assert_eq!(
        member(&inspected, "nativeSource"),
        &Value::string_utf8(&facet_text)
    );
    let Value::Array(constraints) = member(&inspected, "constraints") else {
        panic!("constraint observations")
    };
    assert!(!constraints.is_empty());
    let catalog_text = facet["sourceText"].as_str().unwrap();
    let document = call(
        "postgresql.import",
        [
            ("source", Value::string_utf8(catalog_text)),
            ("id", Value::string_utf8("facet-pair")),
        ],
    )
    .unwrap();
    let paired = call(
        "postgresql.facetCorrelate",
        [
            ("source", Value::string_utf8(&facet_text)),
            ("document", document),
            ("datumFormat", Value::string_utf8("little-endian-datum64")),
        ],
    )
    .unwrap();
    assert_eq!(member(&paired, "sameSnapshotVerified"), &Value::Bool(false));
    assert_eq!(member(&paired, "authenticated"), &Value::Bool(false));
    let Value::Array(matches) = member(&paired, "matches") else {
        panic!("facet correspondence")
    };
    assert_eq!(matches.len(), 12);
    let cardinality: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/validation/cardinality-postgresql-catalog-native.json"
    ))
    .unwrap();
    let card_text = serde_json::to_string(&cardinality["supplement"]).unwrap();
    let card = call(
        "postgresql.cardinalityCatalog",
        [("source", Value::string_utf8(&card_text))],
    )
    .unwrap();
    assert_eq!(member(&card, "qualifiedVersion"), &Value::Bool(true));
    let resolved = call(
        "postgresql.cardinalityType",
        [
            ("source", Value::string_utf8(&card_text)),
            ("schema", Value::string_utf8("cardinality")),
            ("relation", Value::string_utf8("declared")),
            ("name", Value::string_utf8("value")),
        ],
    )
    .unwrap();
    assert!(matches!(member(&resolved, "native"), Value::Object(_)));
    let capture_text = cardinality["captureSource"].as_str().unwrap();
    let document = call(
        "postgresql.import",
        [
            ("source", Value::string_utf8(capture_text)),
            ("id", Value::string_utf8("cardinality-pair")),
        ],
    )
    .unwrap();
    let correlation = call(
        "postgresql.cardinalityCorrelate",
        [
            ("source", Value::string_utf8(&card_text)),
            ("document", document),
        ],
    )
    .unwrap();
    assert_eq!(
        member(&correlation, "sameSnapshotVerified"),
        &Value::Bool(false)
    );
    assert_eq!(
        member(&correlation, "nativeSupplement"),
        &Value::string_utf8(&card_text)
    );
    let key_discovery: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/validation/key-postgresql-discovery-native.json"
    ))
    .unwrap();
    let key_capture = serde_json::json!({"profile":"umf-postgresql-key-observations-17-v1","serverVersion":170004,"encoding":"UTF8","query":"SELECT native catalog key observations","indexes":key_discovery["indexes"]});
    let key_text = serde_json::to_string(&key_capture).unwrap();
    let keys = call(
        "postgresql.keyCatalog",
        [("source", Value::string_utf8(&key_text))],
    )
    .unwrap();
    let Value::Array(indexes) = member(&keys, "indexes") else {
        panic!("index observations")
    };
    assert_eq!(indexes.len(), 17);
}

#[test]
fn postgres_supplement_wire_refuses_unsafe_declared_integers_and_duplicates() {
    let cardinality: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/validation/cardinality-postgresql-catalog-native.json"
    ))
    .unwrap();
    let mut invalid = cardinality["supplement"].clone();
    invalid["columns"][0]["declaredDimensions"] = serde_json::json!(9007199254740992u64);
    let error = call(
        "postgresql.cardinalityCatalog",
        [(
            "source",
            Value::string_utf8(&serde_json::to_string(&invalid).unwrap()),
        )],
    )
    .unwrap_err();
    assert_eq!(error["status"], "error");
    let key_discovery: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/validation/key-postgresql-discovery-native.json"
    ))
    .unwrap();
    let mut key_capture = serde_json::json!({"profile":"umf-postgresql-key-observations-17-v1","serverVersion":170004,"encoding":"UTF8","query":"SELECT native catalog key observations","indexes":key_discovery["indexes"]});
    let duplicate = key_capture["indexes"][0].clone();
    key_capture["indexes"]
        .as_array_mut()
        .unwrap()
        .push(duplicate);
    let error = call(
        "postgresql.keyCatalog",
        [(
            "source",
            Value::string_utf8(&serde_json::to_string(&key_capture).unwrap()),
        )],
    )
    .unwrap_err();
    assert_eq!(error["status"], "error");
    let facet: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/validation/facets-postgresql-constraints-native.json"
    ))
    .unwrap();
    let mut invalid = facet["capture"].clone();
    let duplicate = invalid["constraints"][0].clone();
    invalid["constraints"]
        .as_array_mut()
        .unwrap()
        .push(duplicate);
    let error = call(
        "postgresql.facetCatalog",
        [(
            "source",
            Value::string_utf8(&serde_json::to_string(&invalid).unwrap()),
        )],
    )
    .unwrap_err();
    assert_eq!(error["status"], "error");
    let capture_text = cardinality["captureSource"].as_str().unwrap();
    let document = call(
        "postgresql.import",
        [
            ("source", Value::string_utf8(capture_text)),
            ("id", Value::string_utf8("cardinality-mismatch")),
        ],
    )
    .unwrap();
    let mut mismatched = cardinality["supplement"].clone();
    mismatched["serverVersion"] = serde_json::json!(170005);
    let error = call(
        "postgresql.cardinalityCorrelate",
        [
            (
                "source",
                Value::string_utf8(&serde_json::to_string(&mismatched).unwrap()),
            ),
            ("document", document),
        ],
    )
    .unwrap_err();
    assert_eq!(error["status"], "error");
}

#[test]
fn resolved_predicate_decodes_pinned_numeric_bounds_and_scale() {
    let evidence: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/validation/facets-postgresql-constraints-native.json"
    ))
    .unwrap();
    let input = json_to_value(
        evidence["capture"]["constraints"]
            .as_array()
            .unwrap()
            .iter()
            .find(|constraint| constraint["relation"] == "decimal_exact")
            .unwrap()
            .clone(),
    );
    let result = call(
        "postgresql.resolvedPredicate",
        [
            ("native", input.clone()),
            ("serverVersion", Value::Number(170004.0)),
            ("encoding", Value::string_utf8("UTF8")),
            ("datumFormat", Value::string_utf8("little-endian-datum64")),
        ],
    )
    .unwrap();
    assert_eq!(
        member(&result, "state"),
        &Value::string_utf8("verified-expression")
    );
    assert_eq!(member(&result, "native"), &input);
    assert_eq!(
        member(&result, "terms"),
        &Value::Array(vec![
            Value::Object(vec![
                (Utf16::from("kind"), Value::string_utf8("bound")),
                (Utf16::from("operator"), Value::string_utf8(">=")),
                (Utf16::from("literal"), Value::string_utf8("-999.99")),
            ]),
            Value::Object(vec![
                (Utf16::from("kind"), Value::string_utf8("bound")),
                (Utf16::from("operator"), Value::string_utf8("<=")),
                (Utf16::from("literal"), Value::string_utf8("999.99")),
            ]),
            Value::Object(vec![
                (Utf16::from("kind"), Value::string_utf8("scale")),
                (Utf16::from("scale"), Value::string_utf8("2")),
            ]),
        ])
    );
    assert_eq!(
        member(&result, "valueScope"),
        &Value::string_utf8("stored-and-new-values")
    );
    let mut forged = input.clone();
    let Value::Object(fields) = &mut forged else {
        unreachable!()
    };
    let node_tree = fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from("nodeTree"))
        .map(|(_, value)| value)
        .unwrap();
    let Value::String(node_tree) = node_tree else {
        unreachable!()
    };
    *node_tree = Utf16::from(
        node_tree
            .to_utf8()
            .unwrap()
            .replace(":varattno 1", ":varattno 2"),
    );
    let refused = call(
        "postgresql.resolvedPredicate",
        [
            ("native", forged),
            ("serverVersion", Value::Number(170004.0)),
            ("encoding", Value::string_utf8("UTF8")),
            ("datumFormat", Value::string_utf8("little-endian-datum64")),
        ],
    )
    .unwrap();
    assert_eq!(
        member(&refused, "state"),
        &Value::string_utf8("unsupported")
    );
    assert_eq!(member(&refused, "terms"), &Value::Array(Vec::new()));
}

struct FixtureParser {
    mismatched: bool,
}
impl umf_core::parser_backend_protocol::PostgresqlParserBackend for FixtureParser {
    fn identity(&self) -> &'static str {
        umf_core::parser_backend_protocol::PARSER_BACKEND_IDENTITY
    }
    fn parse(&self, sql: &Utf16, _ctx: &mut Context<'_>) -> Result<Value, umf_core::EngineError> {
        assert!(
            sql.to_utf8().unwrap().contains("decimal") || sql.to_utf8().unwrap().contains("value")
        );
        let mut json: serde_json::Value = serde_json::from_str(include_str!(
            "../../../fixtures/postgresql/decimal-check-ast.json"
        ))
        .unwrap();
        if self.mismatched {
            json["stmts"][0]["stmt"]["SelectStmt"]["targetList"][0]["ResTarget"]["val"]
                ["BoolExpr"]["args"][0]["A_Expr"]["rexpr"]["TypeCast"]["arg"]["A_Const"]["sval"]
                ["sval"] = serde_json::json!("-999.98");
        }
        Ok(json_to_value(json))
    }
    fn deparse(
        &self,
        _tree: &Value,
        _ctx: &mut Context<'_>,
    ) -> Result<Utf16, umf_core::EngineError> {
        Ok(Utf16::from("SELECT 2"))
    }
    fn codec_round_trip(
        &self,
        tree: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, umf_core::EngineError> {
        Ok(umf_core::copy_json(tree, ctx)?)
    }
}

#[test]
fn parser_backed_facet_correlation_checks_sql_and_native_decimal_evidence() {
    let evidence: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/validation/facets-postgresql-constraints-native.json"
    ))
    .unwrap();
    let mut supplement = evidence["capture"].clone();
    supplement["constraints"] = serde_json::Value::Array(
        supplement["constraints"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|constraint| constraint["relation"] == "decimal_exact")
            .cloned()
            .collect(),
    );
    let source = serde_json::to_string(&supplement).unwrap();
    let mut catalog: serde_json::Value =
        serde_json::from_str(evidence["sourceText"].as_str().unwrap()).unwrap();
    for relation in catalog["snapshot"]["relations"].as_array_mut().unwrap() {
        if relation["name"] != "decimal_exact" {
            relation["constraints"] = serde_json::json!([]);
        }
    }
    let catalog_text = serde_json::to_string(&catalog).unwrap();
    let document = call(
        "postgresql.import",
        [
            ("source", Value::string_utf8(&catalog_text)),
            ("id", Value::string_utf8("verified-predicate")),
        ],
    )
    .unwrap();
    let mut request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (
            Utf16::from("op"),
            Value::string_utf8("postgresql.facetCorrelate"),
        ),
        (Utf16::from("source"), Value::string_utf8(&source)),
        (Utf16::from("document"), document),
        (
            Utf16::from("datumFormat"),
            Value::string_utf8("little-endian-datum64"),
        ),
    ];
    let mut context = Context::ordinary();
    let result = umf_core_wire::postgresql_catalog_binding::execute_with_parser_backend(
        &Value::Object(request.clone()),
        &FixtureParser { mismatched: false },
        &mut context,
    )
    .unwrap();
    let matches = match member(&result, "matches") {
        Value::Array(v) => v,
        _ => panic!("matches"),
    };
    let decimal = matches
        .iter()
        .find(|item| {
            member(member(item, "identity"), "relation") == &Value::string_utf8("decimal_exact")
        })
        .unwrap();
    let inspection = member(decimal, "inspection");
    assert_eq!(
        member(inspection, "state"),
        &Value::string_utf8("verified-expression")
    );
    assert_eq!(
        member(inspection, "terms"),
        &Value::Array(vec![
            Value::Object(vec![
                (Utf16::from("kind"), Value::string_utf8("bound")),
                (Utf16::from("operator"), Value::string_utf8(">=")),
                (Utf16::from("literal"), Value::string_utf8("-999.99"))
            ]),
            Value::Object(vec![
                (Utf16::from("kind"), Value::string_utf8("bound")),
                (Utf16::from("operator"), Value::string_utf8("<=")),
                (Utf16::from("literal"), Value::string_utf8("999.99"))
            ]),
            Value::Object(vec![
                (Utf16::from("kind"), Value::string_utf8("scale")),
                (Utf16::from("scale"), Value::string_utf8("2"))
            ]),
        ])
    );
    let mut context = Context::ordinary();
    assert!(
        umf_core_wire::postgresql_catalog_binding::execute_with_parser_backend(
            &Value::Object(request),
            &FixtureParser { mismatched: true },
            &mut context
        )
        .is_err()
    );
}

struct SelectParser;
impl umf_core::parser_backend_protocol::PostgresqlParserBackend for SelectParser {
    fn identity(&self) -> &'static str {
        umf_core::parser_backend_protocol::PARSER_BACKEND_IDENTITY
    }
    fn parse(&self, sql: &Utf16, _ctx: &mut Context<'_>) -> Result<Value, umf_core::EngineError> {
        let mut ast: serde_json::Value = serde_json::from_str(include_str!(
            "../../../fixtures/postgresql/select-one-ast.json"
        ))
        .unwrap();
        if sql.to_utf8().unwrap().contains('2') {
            ast["stmts"][0]["stmt"]["SelectStmt"]["targetList"][0]["ResTarget"]["val"]["A_Const"]
                ["ival"]["ival"] = serde_json::json!(2);
        }
        Ok(json_to_value(ast))
    }
    fn deparse(
        &self,
        tree: &Value,
        _ctx: &mut Context<'_>,
    ) -> Result<Utf16, umf_core::EngineError> {
        let Value::Array(statements) = member(tree, "stmts") else {
            panic!("statements")
        };
        let select = member(member(&statements[0], "stmt"), "SelectStmt");
        let Value::Array(targets) = member(select, "targetList") else {
            panic!("targets")
        };
        let constant = member(
            member(member(member(&targets[0], "ResTarget"), "val"), "A_Const"),
            "ival",
        );
        assert_eq!(member(constant, "ival"), &Value::Number(2.0));
        Ok(Utf16::from("SELECT 2"))
    }
    fn codec_round_trip(
        &self,
        tree: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, umf_core::EngineError> {
        Ok(umf_core::copy_json(tree, ctx)?)
    }
}

fn call_sql(
    op: &str,
    fields: impl IntoIterator<Item = (&'static str, Value)>,
    backend: &dyn umf_core::parser_backend_protocol::PostgresqlParserBackend,
) -> Result<Value, serde_json::Value> {
    let mut request = vec![
        (
            Utf16::from("profile"),
            Value::string_utf8(umf_core_wire::postgresql_sql_binding::PROFILE),
        ),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    request.extend(fields.into_iter().map(|(k, v)| (Utf16::from(k), v)));
    let wire = umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let mut control = |_: usize| Ok(());
    let envelope: serde_json::Value = serde_json::from_str(
        &umf_core_wire::postgresql_sql_binding::execute_wire_with_backend(
            &wire,
            backend,
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
fn public_raw_sql_flow_archives_source_edits_node_and_exports_regenerated_sql() {
    let parser = SelectParser;
    let document = call_sql(
        "postgresql-sql.import",
        [
            ("source", Value::string_utf8("SELECT 1")),
            ("id", Value::string_utf8("sql-root")),
        ],
        &parser,
    )
    .unwrap();
    let Value::Array(modules) = member(&document, "modules") else {
        panic!("modules")
    };
    let Value::Array(elements) = member(&modules[0], "elements") else {
        panic!("elements")
    };
    let payload = member(member(&elements[0], "extensions"), "umf.postgresql").clone();
    let diagnostics = call_sql(
        "postgresql-sql.inspectPayload",
        [("payload", payload)],
        &parser,
    )
    .unwrap();
    let Value::Array(diagnostics) = diagnostics else {
        panic!("diagnostics")
    };
    assert!(diagnostics.is_empty());
    let inspection = call_sql(
        "postgresql-sql.inspect",
        [("document", document.clone())],
        &parser,
    )
    .unwrap();
    let Value::Array(diagnostics) = member(&inspection, "diagnostics") else {
        panic!("document diagnostics")
    };
    assert_eq!(
        member(&diagnostics[0], "code"),
        &Value::string_utf8("POSTGRESQL_CATALOG_UNRESOLVED")
    );
    assert_eq!(
        call_sql(
            "postgresql-sql.getSource",
            [("document", document.clone())],
            &parser
        )
        .unwrap(),
        Value::string_utf8("SELECT 1")
    );
    let edit = call_sql(
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
        &parser,
    )
    .unwrap();
    let edited = member(&edit, "document").clone();
    assert_eq!(
        member(member(&edit, "validation"), "valid"),
        &Value::Bool(true)
    );
    assert_eq!(
        call_sql(
            "postgresql-sql.getSource",
            [("document", edited.clone())],
            &parser
        )
        .unwrap(),
        Value::string_utf8("SELECT 1")
    );
    assert_eq!(
        call_sql("postgresql-sql.export", [("document", edited)], &parser).unwrap(),
        Value::string_utf8("SELECT 2")
    );
}

#[test]
fn opaque_parser_session_runs_three_host_steps_for_sql_edit() {
    use umf_core::context::TransportUsage;
    let mut session = umf_core::parser_backend_protocol::ParserSession::default();
    let mut ctx = Context::ordinary();
    let first = umf_core_wire::postgresql_parser_binding::prepare_sql_edit(
        &mut session,
        Utf16::from("SELECT 1"),
        Utf16::from("/stmts/0/stmt/SelectStmt/targetList/0/ResTarget/val/A_Const/ival/ival"),
        Utf16::from("2"),
        TransportUsage::default(),
        &mut ctx,
    )
    .unwrap();
    let first_token = member(&first, "token").clone();
    let original_ast = json_to_value(
        serde_json::from_str(include_str!(
            "../../../fixtures/postgresql/select-one-ast.json"
        ))
        .unwrap(),
    );
    let deparse_step = umf_core_wire::postgresql_parser_binding::complete_sql_edit(
        &mut session,
        as_string(&first_token),
        umf_core::parser_backend_protocol::ParserResponse::Parsed { tree: original_ast },
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        member(member(&deparse_step, "request"), "work"),
        &Value::string_utf8("deparse")
    );
    let deparse_token = member(member(&deparse_step, "request"), "token").clone();
    let parse_step = umf_core_wire::postgresql_parser_binding::complete_sql_edit(
        &mut session,
        as_string(&deparse_token),
        umf_core::parser_backend_protocol::ParserResponse::Deparsed {
            sql: Utf16::from("SELECT 2"),
        },
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        member(member(&parse_step, "request"), "work"),
        &Value::string_utf8("parse")
    );
    let final_token = member(member(&parse_step, "request"), "token").clone();
    let final_ast_json: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/postgresql/select-one-ast.json"
    ))
    .unwrap();
    let mut final_ast_json = final_ast_json;
    final_ast_json["stmts"][0]["stmt"]["SelectStmt"]["targetList"][0]["ResTarget"]["val"]
        ["A_Const"]["ival"]["ival"] = serde_json::json!(2);
    let final_result = umf_core_wire::postgresql_parser_binding::complete_sql_edit(
        &mut session,
        as_string(&final_token),
        umf_core::parser_backend_protocol::ParserResponse::Parsed {
            tree: json_to_value(final_ast_json),
        },
        &mut ctx,
    )
    .unwrap();
    assert_eq!(member(&final_result, "done"), &Value::Bool(true));
    assert_eq!(
        member(member(&final_result, "result"), "candidateSql"),
        &Value::string_utf8("SELECT 2")
    );
}

#[test]
fn parser_session_import_and_export_keep_state_across_host_boundary() {
    use umf_core::context::TransportUsage;
    use umf_core::parser_backend_protocol::ParserResponse;
    let mut session = umf_core::parser_backend_protocol::ParserSession::default();
    let mut ctx = Context::ordinary();
    let parse_request = umf_core_wire::postgresql_parser_binding::prepare_sql_import(
        &mut session,
        Utf16::from("SELECT 1"),
        Utf16::from("async-sql"),
        TransportUsage::default(),
        &mut ctx,
    )
    .unwrap();
    assert_eq!(member(&parse_request, "work"), &Value::string_utf8("parse"));
    let imported = umf_core_wire::postgresql_parser_binding::complete_sql_import(
        &mut session,
        as_string(member(&parse_request, "token")),
        json_to_value(
            serde_json::from_str(include_str!(
                "../../../fixtures/postgresql/select-one-ast.json"
            ))
            .unwrap(),
        ),
        &mut ctx,
    )
    .unwrap();
    let document = member(&imported, "document");
    let edited = umf_core::postgresql_sql_runtime::edit_postgresql_node(
        document,
        &Utf16::from("/stmts/0/stmt/SelectStmt/targetList/0/ResTarget/val/A_Const/ival/ival"),
        &Utf16::from("2"),
        &mut ctx,
    )
    .unwrap();
    let document = member(&edited, "document");
    let codec_request = umf_core_wire::postgresql_parser_binding::prepare_sql_export(
        &mut session,
        document,
        TransportUsage::default(),
        &mut ctx,
    )
    .unwrap();
    let codec_tree = member(&codec_request, "tree").clone();
    let deparse_step = umf_core_wire::postgresql_parser_binding::complete_sql_export(
        &mut session,
        as_string(member(&codec_request, "token")),
        ParserResponse::CodecRoundTripped { tree: codec_tree },
        &mut ctx,
    )
    .unwrap();
    let deparse_request = member(&deparse_step, "request");
    assert_eq!(
        member(deparse_request, "work"),
        &Value::string_utf8("deparse")
    );
    let parse_step = umf_core_wire::postgresql_parser_binding::complete_sql_export(
        &mut session,
        as_string(member(deparse_request, "token")),
        ParserResponse::Deparsed {
            sql: Utf16::from("SELECT 2"),
        },
        &mut ctx,
    )
    .unwrap();
    let reparse_request = member(&parse_step, "request");
    let mut reparsed: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/postgresql/select-one-ast.json"
    ))
    .unwrap();
    reparsed["stmts"][0]["stmt"]["SelectStmt"]["targetList"][0]["ResTarget"]["val"]["A_Const"]
        ["ival"]["ival"] = serde_json::json!(2);
    let final_result = umf_core_wire::postgresql_parser_binding::complete_sql_export(
        &mut session,
        as_string(member(reparse_request, "token")),
        ParserResponse::Parsed {
            tree: json_to_value(reparsed),
        },
        &mut ctx,
    )
    .unwrap();
    assert_eq!(member(&final_result, "done"), &Value::Bool(true));
    assert_eq!(
        member(&final_result, "sql"),
        &Value::string_utf8("SELECT 2")
    );
}

fn as_string(value: &Value) -> &Utf16 {
    match value {
        Value::String(s) => s,
        _ => panic!("string"),
    }
}
