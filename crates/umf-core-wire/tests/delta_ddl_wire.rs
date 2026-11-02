#![cfg(feature = "embedded-adapters")]
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{
    decode,
    delta_ddl_binding::{execute_json, PROFILE},
    encode,
};

fn text(value: &str) -> Value {
    Value::String(Utf16::from(value))
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn definition(extra: bool) -> Value {
    let mut fields = vec![
        ("profile", text("databricks-managed-delta/0.1")),
        (
            "name",
            Value::Array(vec![text("catalog"), text("schema"), text("items")]),
        ),
        ("clusterBy", Value::Array(vec![text("id")])),
        ("partitionBy", Value::Array(vec![])),
        (
            "properties",
            object(vec![("delta.targetFileSize", text("67108864"))]),
        ),
    ];
    if extra {
        fields.push(("futureMeaning", text("preserve")));
    }
    object(fields)
}

fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut members = vec![
        (Utf16::from("profile"), text(PROFILE)),
        (Utf16::from("op"), text(op)),
    ];
    members.extend(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value)),
    );
    encode(&Value::Object(members), &mut Context::ordinary()).unwrap()
}

fn result(response: &str) -> Result<Value, (String, String)> {
    let envelope: serde_json::Value = serde_json::from_str(response).unwrap();
    if envelope["status"] == "ok" {
        return Ok(decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap());
    }
    let message = String::from_utf16(
        &envelope["messageUnits"]
            .as_array()
            .unwrap()
            .iter()
            .map(|unit| unit.as_u64().unwrap() as u16)
            .collect::<Vec<_>>(),
    )
    .unwrap();
    Err((envelope["code"].as_str().unwrap().to_owned(), message))
}

#[test]
fn define_and_generate_retain_schema_source_and_return_the_proposal_fields() {
    let source = " { \"type\":\"struct\", \"fields\":[{\"name\":\"id\",\"type\":\"long\",\"nullable\":false,\"metadata\":{}}] } ";
    let imported = result(&execute_json(&request(
        "delta.ddl.defineTable",
        vec![
            ("source", text(source)),
            ("id", text("table/orders")),
            ("definition", definition(false)),
        ],
    )))
    .unwrap();
    let proposal = result(&execute_json(&request(
        "delta.ddl.generate",
        vec![("document", imported)],
    )))
    .unwrap();
    let field = |key: &str| match &proposal {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    };
    let get_text = |key| match field(key) {
        Some(Value::String(value)) => value.to_utf8().unwrap(),
        _ => panic!("missing proposal text field {key}"),
    };
    assert!(get_text("sql").contains("CREATE TABLE `catalog`.`schema`.`items`"));
    assert_eq!(
        get_text("schemaJson"),
        r#"{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}"#
    );
    assert!(get_text("qualification").contains("no application"));
    assert!(matches!(field("definition"), Some(Value::Object(_))));
}

#[test]
fn unknown_definition_meaning_is_refused_before_a_sql_proposal() {
    let response = execute_json(&request(
        "delta.ddl.defineTable",
        vec![
            (
                "source",
                text(
                    r#"{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}"#,
                ),
            ),
            ("id", text("table/orders")),
            ("definition", definition(true)),
        ],
    ));
    assert_eq!(result(&response).unwrap_err().0, "DELTA_DDL_UNSUPPORTED");
}

#[test]
fn bundle_generation_is_ordered_and_refuses_duplicates_atomically() {
    let source = r#"{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}"#;
    let first = result(&execute_json(&request(
        "delta.ddl.defineTable",
        vec![
            ("source", text(source)),
            ("id", text("table/one")),
            ("definition", definition(false)),
        ],
    )))
    .unwrap();
    let mut second_definition = definition(false);
    if let Value::Object(fields) = &mut second_definition {
        if let Some((_, Value::Array(names))) = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("name"))
        {
            names.pop();
            names.push(text("other"));
        }
    }
    let second = result(&execute_json(&request(
        "delta.ddl.defineTable",
        vec![
            ("source", text(source)),
            ("id", text("table/two")),
            ("definition", second_definition),
        ],
    )))
    .unwrap();
    let generated = result(&execute_json(&request(
        "delta.ddl.generateBundle",
        vec![("documents", Value::Array(vec![first.clone(), second]))],
    )))
    .unwrap();
    let Value::Object(fields) = generated else {
        panic!("bundle object expected");
    };
    let sql = fields
        .iter()
        .find(|(key, _)| key == &Utf16::from("sql"))
        .unwrap();
    assert!(
        matches!(&sql.1, Value::String(value) if value.to_utf8().unwrap().matches("CREATE TABLE").count() == 2)
    );
    let tables = fields
        .iter()
        .find(|(key, _)| key == &Utf16::from("tables"))
        .unwrap();
    assert!(matches!(&tables.1, Value::Array(items) if items.len() == 2));

    let refused = execute_json(&request(
        "delta.ddl.generateBundle",
        vec![("documents", Value::Array(vec![first.clone(), first]))],
    ));
    assert_eq!(result(&refused).unwrap_err().0, "DELTA_DDL_UNSUPPORTED");
}

#[test]
fn spark_delta4_realization_uses_local_target_and_reports_writer_dispositions() {
    let source = r#"{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}"#;
    let mut authored = definition(false);
    if let Value::Object(fields) = &mut authored {
        if let Some((_, Value::Object(properties))) = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("properties"))
        {
            properties.push((Utf16::from("delta.parquet.compression.codec"), text("zstd")));
        }
    }
    let document = result(&execute_json(&request(
        "delta.ddl.defineTable",
        vec![
            ("source", text(source)),
            ("id", text("table/orders")),
            ("definition", authored),
        ],
    )))
    .unwrap();
    let target = object(vec![
        ("kind", text("relation")),
        (
            "relation",
            Value::Array(vec![
                text("local_catalog"),
                text("local_schema"),
                text("orders"),
            ]),
        ),
        ("location", text("/tmp/orders")),
    ]);
    let realization = result(&execute_json(&request(
        "delta.ddl.realizeSparkDelta4",
        vec![("document", document), ("target", target)],
    )))
    .unwrap();
    let Value::Object(fields) = realization else {
        panic!("realization object expected");
    };
    let get_text = |key: &str| -> String {
        match fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value)
        {
            Some(Value::String(value)) => value.to_utf8().unwrap(),
            _ => panic!("missing realization text field {key}"),
        }
    };
    let sql = get_text("sql");
    assert!(sql.contains("CREATE TABLE `local_catalog`.`local_schema`.`orders`"));
    assert!(sql.contains("LOCATION '/tmp/orders'"));
    assert!(!sql.contains("delta.targetFileSize"));
    assert!(!sql.contains("delta.parquet.compression.codec"));
    assert!(get_text("realizationProfile").contains("spark-realization"));
    assert!(
        matches!(fields.iter().find(|(name, _)| name == &Utf16::from("writerSettings")).map(|(_, value)| value), Some(Value::Array(settings)) if settings.len() == 1)
    );
    assert!(
        matches!(fields.iter().find(|(name, _)| name == &Utf16::from("dispositions")).map(|(_, value)| value), Some(Value::Array(items)) if items.iter().any(|item| matches!(item, Value::Object(row) if row.iter().any(|(key, value)| key == &Utf16::from("outcome") && value == &text("unrealized-performance-hint")))))
    );
}

#[test]
fn spark_delta4_refuses_unqualified_codec_without_a_partial_proposal() {
    let source = r#"{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}"#;
    let mut authored = definition(false);
    if let Value::Object(fields) = &mut authored {
        if let Some((_, Value::Object(properties))) = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("properties"))
        {
            properties.push((Utf16::from("delta.parquet.compression.codec"), text("gzip")));
        }
    }
    let document = result(&execute_json(&request(
        "delta.ddl.defineTable",
        vec![
            ("source", text(source)),
            ("id", text("table/orders")),
            ("definition", authored),
        ],
    )))
    .unwrap();
    let refused = execute_json(&request(
        "delta.ddl.realizeSparkDelta4",
        vec![
            ("document", document),
            (
                "target",
                object(vec![
                    ("kind", text("delta-path")),
                    ("path", text("/tmp/orders")),
                ]),
            ),
        ],
    ));
    assert_eq!(result(&refused).unwrap_err().0, "DELTA_DDL_UNSUPPORTED");
}
