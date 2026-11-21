// SPDX-License-Identifier: MIT OR Apache-2.0
//! A Fireweed-shaped space schema: core `json` and `set` Fields, a
//! `umf.tables` table with GIN and partial claim indexes, and a host-owned
//! extension registered beside `umf.tables` (CONTRACT-081, CONTRACT-084).
//! This is the Rust path a host such as Fireweed calls from the published
//! `umf-codegen` crate.
use std::{fs, path::Path};

use umf_codegen::value::{array_items, member, string_member};
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::serialization::{read_json_value, stringify_compact_metered, Format};
use umf_core::{
    Capabilities, Context, Diagnostic, SemanticContext, Severity, Utf16, Value,
};

const FIREWEED_TOKEN: u64 = 4096;

fn fixture_text(name: &str) -> String {
    fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .unwrap()
}
fn parse(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn s(text: &str) -> Value {
    Value::string_utf8(text)
}

/// Host semantics for the stand-in `fireweed.space` vocabulary.
struct FireweedHost {
    calls: usize,
}
impl Capabilities for FireweedHost {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        assert_eq!(token, FIREWEED_TOKEN);
        self.calls += 1;
        if context.scope == "module" && member(payload, "queues").is_none() {
            return Ok(vec![Diagnostic {
                code: Utf16::from("FIREWEED_QUEUES"),
                path: context.path.clone(),
                python_source_path: false,
                message: Utf16::from("A space declares its queues"),
                severity: Severity::Error,
                python_text_origin: None,
            }]);
        }
        Ok(Vec::new())
    }
}

fn resources() -> CodegenResources {
    let mut ctx = Context::catalog();
    let mut resources = CodegenResources::release(&mut ctx).unwrap();
    resources
        .register_host_extension(
            &parse(&fixture_text("fireweed-space.package.json")),
            FIREWEED_TOKEN,
            &mut ctx,
        )
        .unwrap();
    resources
}

fn configuration(independent: bool) -> Value {
    let mut fields = vec![
        ("module", s("space")),
        ("schema", s("fireweed_space")),
        ("ownerRole", s("fireweed_owner")),
        ("personRole", s("fireweed_person")),
        ("batchRole", s("fireweed_batch")),
        ("groupRoles", Value::Object(vec![])),
    ];
    if independent {
        fields.push((
            "independentExtensions",
            Value::Array(vec![object(vec![
                ("id", s("fireweed.space")),
                ("version", s("0.1.0")),
            ])]),
        ));
    }
    object(fields)
}

fn request(text: &str, independent: bool) -> Value {
    object(vec![
        ("text", s(text)),
        ("format", s("json")),
        ("configuration", configuration(independent)),
    ])
}

fn codes(inspection: &Value) -> Vec<String> {
    array_items(member(inspection, "diagnostics").unwrap())
        .unwrap()
        .iter()
        .map(|d| {
            string_member(d, "code")
                .unwrap()
                .to_utf8()
                .unwrap()
        })
        .collect()
}

fn steps_sql(bundle: &Value) -> Vec<String> {
    array_items(member(bundle, "steps").unwrap())
        .unwrap()
        .iter()
        .map(|step| string_member(step, "sql").unwrap().to_utf8().unwrap())
        .collect()
}

#[test]
fn space_schema_inspects_with_host_semantics_and_is_unchecked_without() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let document = parse(&fixture_text("fireweed-space.json"));
    let mut host = FireweedHost { calls: 0 };
    let inspection = engine
        .inspect_table_lifecycle_with_host(&document, &mut host, &mut Context::ordinary())
        .unwrap();
    assert_eq!(codes(&inspection), Vec::<String>::new());
    assert_eq!(member(&inspection, "valid"), Some(&Value::Bool(true)));
    assert_eq!(member(&inspection, "complete"), Some(&Value::Bool(true)));
    assert_eq!(host.calls, 2, "module and Record payloads reach the host");

    let unchecked = engine
        .inspect_table_lifecycle(&document, &mut Context::ordinary())
        .unwrap();
    assert_eq!(member(&unchecked, "complete"), Some(&Value::Bool(false)));
    assert!(codes(&unchecked).contains(&"SEMANTICS_UNCHECKED".to_string()));

    let mut broken = fixture_text("fireweed-space.json").replacen("\"queues\"", "\"lanes\"", 1);
    let inspection = engine
        .inspect_table_lifecycle_with_host(&parse(&broken), &mut host, &mut Context::ordinary())
        .unwrap();
    assert!(codes(&inspection).contains(&"FIREWEED_QUEUES".to_string()));
    broken.clear();
}

#[test]
fn space_schema_compiles_postgresql18_ddl_and_verifies() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let text = fixture_text("fireweed-space.json");
    let mut host = FireweedHost { calls: 0 };
    let result = engine
        .compile_table_deployment_with_host(&request(&text, true), &mut host, &mut Context::ordinary())
        .unwrap();
    assert_eq!(member(&result, "status"), Some(&s("compiled")), "{result:?}");
    let bundle = member(&result, "bundle").unwrap();
    let sql = steps_sql(bundle);
    if let Some(out) = std::env::var_os("UMF_FIREWEED_DDL_OUT") {
        fs::write(out, sql.join(";\n") + ";\n").unwrap();
    }
    let all = sql.join("\n");
    for expected in [
        "\"body\" pg_catalog.\"jsonb\" NOT NULL DEFAULT E'{}'::pg_catalog.jsonb",
        "\"await_keys\" pg_catalog.\"text\"[] COLLATE pg_catalog.\"C\" NOT NULL",
        "pg_catalog.array_position(\"await_keys\", NULL) IS NULL",
        "CREATE INDEX \"queue_items_claim\" ON \"fireweed_space\".\"queue_items\" USING btree (\"due_at\", \"priority\" DESC, \"id\") WHERE ((\"state\" IN (",
        "CREATE INDEX \"queue_items_await_keys\" ON \"fireweed_space\".\"queue_items\" USING gin (\"await_keys\")",
        "CREATE INDEX \"queue_items_body\" ON \"fireweed_space\".\"queue_items\" USING gin (\"body\")",
    ] {
        assert!(all.contains(expected), "missing {expected}\n{all}");
    }
    let catalog = member(bundle, "expectedCatalog").unwrap();
    let columns = array_items(member(catalog, "columns").unwrap()).unwrap();
    let type_of = |name: &str| {
        columns
            .iter()
            .find(|c| member(c, "name") == Some(&s(name)))
            .and_then(|c| string_member(c, "typeName"))
            .unwrap()
            .to_utf8()
            .unwrap()
    };
    assert_eq!(type_of("body"), "jsonb");
    assert_eq!(type_of("await_keys"), "_text");

    let verified = engine
        .verify_table_deployment_with_host(bundle, &mut host, &mut Context::ordinary())
        .unwrap();
    assert_eq!(&verified, bundle);
}

#[test]
fn host_extensions_must_be_declared_independent_before_ddl() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let text = fixture_text("fireweed-space.json");
    let mut host = FireweedHost { calls: 0 };
    let result = engine
        .compile_table_deployment_with_host(&request(&text, false), &mut host, &mut Context::ordinary())
        .unwrap();
    assert_eq!(member(&result, "status"), Some(&s("blocked")));
    // Without host capabilities the extension stays unchecked and blocks.
    let result = engine
        .compile_table_deployment(&request(&text, true), &mut Context::ordinary())
        .unwrap();
    assert_eq!(member(&result, "status"), Some(&s("blocked")));
}

fn inspect_codes(engine: &CodegenEngine<'_>, text: &str) -> Vec<String> {
    let mut host = FireweedHost { calls: 0 };
    let document = read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap();
    codes(
        &engine
            .inspect_table_lifecycle_with_host(&document, &mut host, &mut Context::ordinary())
            .unwrap(),
    )
}

#[test]
fn invalid_json_set_and_index_declarations_are_reported() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let text = stringify_compact_metered(&parse(&fixture_text("fireweed-space.json")), &mut Context::catalog())
        .unwrap()
        .to_utf8()
        .unwrap();
    let cases: [(&str, &str, &str); 6] = [
        // A set item without exact equality.
        (
            r#"{"id":"await_key","kind":"field","scalarType":"string""#,
            r#"{"id":"await_key","kind":"field","scalarType":"float""#,
            "SET_ITEM_EQUALITY",
        ),
        // A GIN index cannot be unique.
        (
            r#""method":"gin","fields":[{"module":"space","element":"await_keys"}],"unique":false"#,
            r#""method":"gin","fields":[{"module":"space","element":"await_keys"}],"unique":true"#,
            "TABLES_INDEX_METHOD",
        ),
        // GIN keys need array or jsonb columns.
        (
            r#""method":"gin","fields":[{"module":"space","element":"await_keys"}]"#,
            r#""method":"gin","fields":[{"module":"space","element":"owner"}]"#,
            "TABLES_INDEX_METHOD",
        ),
        // One direction per key field.
        (
            r#""directions":["asc","desc","asc"]"#,
            r#""directions":["asc","desc"]"#,
            "TABLES_INDEX_DIRECTIONS",
        ),
        // jsonb maps only the json family.
        (
            r#""name":"body","nativeType":{"kind":"jsonb"}"#,
            r#""name":"body","nativeType":{"kind":"text"}"#,
            "TABLES_NATIVE_TYPE",
        ),
        // The text[] element must match the string item Field.
        (
            r#""element":{"kind":"text"}"#,
            r#""element":{"kind":"int8"}"#,
            "TABLES_NATIVE_TYPE",
        ),
    ];
    for (from, to, code) in cases {
        assert_eq!(text.matches(from).count(), 1, "fixture drift: {from}");
        let codes = inspect_codes(&engine, &text.replacen(from, to, 1));
        assert!(codes.contains(&code.to_string()), "{code} not in {codes:?}");
    }
}

#[test]
fn set_and_json_literals_follow_core_meaning() {
    let mut ctx = Context::catalog();
    let resources = CodegenResources::release(&mut ctx).unwrap();
    let engine = resources.engine();
    let document = parse(&fixture_text("fireweed-space.json"));
    let policy = engine.policy();
    let field = |id: &str| {
        array_items(member(&array_items(member(&document, "modules").unwrap()).unwrap()[0], "elements").unwrap())
            .unwrap()
            .iter()
            .find(|e| member(e, "id") == Some(&s(id)))
            .unwrap()
            .clone()
    };
    let errors = |field: &Value, literal: &str| {
        umf_core::literal::literal_errors(&document, field, &parse(literal), true, policy, &mut Context::ordinary())
            .unwrap()
            .into_iter()
            .map(|d| d.message.to_utf8().unwrap())
            .collect::<Vec<_>>()
    };
    let set = field("await_keys");
    assert!(errors(&set, r#"{"array":[{"string":"b"},{"string":"a"}]}"#).is_empty());
    assert_eq!(
        errors(&set, r#"{"array":[{"string":"a"},{"string":"a"}]}"#),
        vec!["Set items must be distinct".to_string()]
    );
    let json = field("body");
    assert!(errors(&json, r#"{"json":{"a":[1,null,"x"],"b":{"c":true}}}"#).is_empty());
    assert!(errors(&json, r#"{"json":null}"#).is_empty(), "JSON null is a present value");
    assert!(!errors(&json, r#"{"string":"{}"}"#).is_empty(), "a JSON text string is not a json carrier");
}

#[test]
fn array_ddl_enforces_scalar_item_domains() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let text = compact_space();
    let mut native_ddl = Vec::new();
    for (scalar, facets, native, bounds) in [
        (
            "decimal",
            r#","facets":{"precision":8,"scale":2}"#,
            r#"{"kind":"numeric","precision":8,"scale":2}"#,
            vec![r#"array_position("await_keys", 'NaN'::pg_catalog.numeric) IS NULL"#],
        ),
        (
            "date",
            "",
            r#"{"kind":"date"}"#,
            vec![
                "'0001-01-01'::pg_catalog.date",
                "'9999-12-31'::pg_catalog.date",
            ],
        ),
        (
            "timestamp",
            "",
            r#"{"kind":"timestamptz"}"#,
            vec![
                "'0001-01-01T00:00:00Z'::pg_catalog.timestamptz",
                "'9999-12-31T23:59:59.999999Z'::pg_catalog.timestamptz",
            ],
        ),
    ] {
        let doc = text
            .replace(
                r#""id":"await_key","kind":"field","scalarType":"string""#,
                &format!(r#""id":"await_key","kind":"field","scalarType":"{scalar}"{facets}"#),
            )
            .replace(r#""cardinality":"set""#, r#""cardinality":"array""#)
            .replace(
                r#""element":{"kind":"text"}"#,
                &format!(r#""element":{native}"#),
            );
        let result = engine
            .compile_table_deployment_with_host(
                &request(&doc, true),
                &mut FireweedHost { calls: 0 },
                &mut Context::ordinary(),
            )
            .unwrap();
        assert_eq!(
            member(&result, "status"),
            Some(&s("compiled")),
            "{result:?}"
        );
        let bundle = member(&result, "bundle").unwrap();
        let ddl = steps_sql(bundle)
            .into_iter()
            .find(|sql| sql.starts_with(r#"CREATE TABLE "fireweed_space"."queue_items""#))
            .unwrap();
        for predicate in [
            r#"pg_catalog.array_ndims("await_keys") = 1"#,
            r#"pg_catalog.array_lower("await_keys", 1) = 1"#,
            r#"pg_catalog.array_position("await_keys", NULL) IS NULL"#,
        ]
        .into_iter()
        .chain(bounds)
        {
            assert!(
                ddl.contains(predicate),
                "{scalar} array is missing {predicate}: {ddl}"
            );
        }
        let catalog = member(bundle, "expectedCatalog").unwrap();
        let keys = array_items(member(catalog, "keys").unwrap()).unwrap();
        let key_name = string_member(&keys[0], "name").unwrap().to_utf8().unwrap();
        native_ddl.push(
            ddl.replace(
                r#""fireweed_space"."queue_items""#,
                &format!("pg_temp.{scalar}_items"),
            )
            // All three variants share a logical table ID. Give their primary
            // key indexes distinct names in the temporary schema.
            .replace(&key_name, &format!("{scalar}_test_pk")),
        );
    }
    // Opt in with UMF_TEST_POSTGRES_18=1 and standard libpq connection
    // variables. Only temporary tables are created on that connection.
    if std::env::var_os("UMF_TEST_POSTGRES_18").is_some() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let sql = native_ddl.join(";\n") + ";\n" + include_str!("fixtures/array-domains.pg.sql");
        let mut psql = Command::new("psql")
            .args(["-X", "-w", "-v", "ON_ERROR_STOP=1"])
            .stdin(Stdio::piped())
            .spawn()
            .expect("start PostgreSQL oracle");
        psql.stdin.take().unwrap().write_all(sql.as_bytes()).unwrap();
        assert!(psql.wait().unwrap().success(), "PostgreSQL array domain checks");
    }
}

fn compact_space() -> String {
    stringify_compact_metered(
        &parse(&fixture_text("fireweed-space.json")),
        &mut Context::catalog(),
    )
    .unwrap()
    .to_utf8()
    .unwrap()
}

#[test]
fn json_literal_comparisons_are_rejected_in_checks_and_partial_indexes() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let text = compact_space();
    for expr in [
        r#"{"op":"eq","left":{"op":"literal","value":{"json":null}},"right":{"op":"literal","value":{"json":null}}}"#,
        r#"{"op":"lt","left":{"op":"literal","value":{"json":1}},"right":{"op":"literal","value":{"json":2}}}"#,
        r#"{"op":"in","arg":{"op":"literal","value":{"json":{}}},"values":[{"json":{}}]}"#,
    ] {
        let check = format!(
            r#""checks":[{{"id":"json_compare","name":"json_compare","expression":{expr}}}]"#,
        );
        let index = format!(r#""name":"queue_items_body","where":{expr}"#);
        for (from, to) in [
            (r#""checks":[]"#, check),
            (r#""name":"queue_items_body""#, index),
        ] {
            assert_eq!(text.matches(from).count(), 1);
            let codes = inspect_codes(&engine, &text.replacen(from, &to, 1));
            assert!(
                codes.iter().any(|code| code == "TABLES_EXPRESSION_TYPE"),
                "{expr}: {codes:?}"
            );
        }
    }

    let is_null = r#""checks":[{"id":"json_presence","name":"json_presence","expression":{"op":"isNull","arg":{"op":"literal","value":{"json":null}}}}]"#;
    assert!(inspect_codes(&engine, &text.replacen(r#""checks":[]"#, is_null, 1)).is_empty());
}

#[test]
fn gin_operator_classes_are_typed_and_recompiled_from_source() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let original = stringify_compact_metered(&parse(&fixture_text("fireweed-space.json")), &mut Context::catalog()).unwrap().to_utf8().unwrap();
    let marker = r#""method":"gin","fields":[{"module":"space","element":"body"}]"#;
    assert_eq!(original.matches(marker).count(), 1);
    let text = original.replace(marker, &format!(r#"{marker},"operatorClasses":["jsonb_path_ops"]"#));
    let mut host = FireweedHost { calls: 0 };
    let result = engine.compile_table_deployment_with_host(&request(&text, true), &mut host, &mut Context::ordinary()).unwrap();
    assert_eq!(member(&result, "status"), Some(&s("compiled")), "{result:?}");
    let bundle = member(&result, "bundle").unwrap();
    assert!(steps_sql(bundle).join("\n").contains(r#"USING gin ("body" pg_catalog."jsonb_path_ops")"#));
    assert_eq!(engine.verify_table_deployment_with_host(bundle, &mut host, &mut Context::ordinary()).unwrap(), *bundle);
    for bad in [
        text.replace("jsonb_path_ops", "array_ops"),
        text.replace(r#""operatorClasses":["jsonb_path_ops"]"#, r#""operatorClasses":["jsonb_ops","jsonb_path_ops"]"#),
        text.replace(marker, &marker.replace("gin", "btree")),
    ] {
        assert!(inspect_codes(&engine, &bad).contains(&"TABLES_INDEX_OPERATOR_CLASSES".to_string()));
    }
}

#[test]
fn millisecond_timestamp_uses_native_precision_without_silent_default_rounding() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let original = stringify_compact_metered(&parse(&fixture_text("fireweed-space.json")), &mut Context::catalog()).unwrap().to_utf8().unwrap();
    let marker = r#""nativeType":{"kind":"timestamptz"}"#;
    assert_eq!(original.matches(marker).count(), 1);
    let text = original.replace(marker, r#""nativeType":{"kind":"timestamptz","precision":3}"#);
    let mut host = FireweedHost { calls: 0 };
    let result = engine.compile_table_deployment_with_host(&request(&text, true), &mut host, &mut Context::ordinary()).unwrap();
    assert_eq!(member(&result, "status"), Some(&s("compiled")), "{result:?}");
    let bundle = member(&result, "bundle").unwrap();
    assert!(steps_sql(bundle).join("\n").contains(r#""due_at" pg_catalog."timestamptz"(3)"#));
    assert_eq!(engine.verify_table_deployment_with_host(bundle, &mut host, &mut Context::ordinary()).unwrap(), *bundle);
}
