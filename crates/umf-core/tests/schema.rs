// SPDX-License-Identifier: MIT OR Apache-2.0
use num_bigint::BigInt;
use umf_core::schema::{CompiledSchema, SchemaDialect, SchemaResources};
use umf_core::{Context, PythonReVersion, Utf16, Value};
use umf_core::{PyText, PythonConsumerValue};

fn s(value: &str) -> Value {
    Value::String(Utf16::from(value))
}
fn n(value: f64) -> Value {
    Value::Number(value)
}
fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn arr(items: Vec<Value>) -> Value {
    Value::Array(items)
}
fn parse(source: &str) -> Value {
    let units: Vec<u16> = source.encode_utf16().collect();
    umf_core::serialization::read_json_value(
        &units,
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn compile(source: &str, dialect: SchemaDialect) -> CompiledSchema {
    CompiledSchema::compile_with_dialect(
        &parse(source),
        &SchemaResources::default(),
        dialect,
        true,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn compile_consumer(source: &str, dialect: SchemaDialect) -> CompiledSchema {
    CompiledSchema::compile_with_dialect(
        &parse(source),
        &SchemaResources::default(),
        dialect,
        false,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn errors(schema: &CompiledSchema, source: &str) -> Vec<umf_core::schema::StructuralError> {
    schema
        .validate(&parse(source), &mut Context::ordinary())
        .unwrap()
}

#[test]
fn boolean_schemas_and_false_schema_diagnostic_are_supported() {
    let yes = CompiledSchema::compile(
        &Value::Bool(true),
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    let no = CompiledSchema::compile(
        &Value::Bool(false),
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&yes, "null").is_empty());
    let e = errors(&no, "null");
    assert_eq!(e.len(), 1);
    assert_eq!(e[0].keyword, "false schema");
    assert_eq!(e[0].schema_path, Utf16::from("#/false schema"));
}

#[test]
fn equality_and_unique_items_use_recursive_order_independent_json_equality() {
    let schema = compile(
        r#"{"type":"object","properties":{"v":{"const":{"a":1,"b":[true,null]}}}}"#,
        SchemaDialect::Draft2020_12,
    );
    assert!(errors(&schema, r#"{"v":{"b":[true,null],"a":1}}"#).is_empty());
    assert_eq!(
        errors(&schema, r#"{"v":{"a":2,"b":[true,null]}}"#)[0].keyword,
        "const"
    );
    let unique = compile(
        r#"{"type":"array","uniqueItems":true}"#,
        SchemaDialect::Draft2020_12,
    );
    assert!(errors(&unique, r#"[{"x":1,"y":2},{"y":2,"x":1}]"#)
        .iter()
        .any(|e| e.keyword == "uniqueItems"));
    assert!(errors(&unique, "[1,1.0]")
        .iter()
        .any(|e| e.keyword == "uniqueItems"));
}

#[test]
fn consumer_empty_enum_is_admitted_and_rejects_every_instance() {
    for dialect in [SchemaDialect::Draft2019_09, SchemaDialect::Draft2020_12] {
        let schema = compile_consumer(r#"{"enum":[]}"#, dialect);
        assert_eq!(errors(&schema, r#""anything""#).len(), 1);
        assert_eq!(errors(&schema, "null").len(), 1);
    }
}

#[test]
fn local_refs_and_external_resources_are_explicit_and_offline() {
    let schema = parse(
        r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:test:root","$defs":{"name":{"type":"string","minLength":2}},"properties":{"name":{"$ref":"#/$defs/name"}},"type":"object"}"##,
    );
    let compiled = CompiledSchema::compile(
        &schema,
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#"{"name":"ok"}"#).is_empty());
    assert_eq!(errors(&compiled, r#"{"name":"x"}"#)[0].keyword, "minLength");
    let missing = parse(r#"{"$ref":"https://example.invalid/schema"}"#);
    assert!(CompiledSchema::compile(
        &missing,
        &SchemaResources::default(),
        &mut Context::ordinary()
    )
    .is_err());
    let external = parse(r#"{"$id":"urn:test:child","type":"string"}"#);
    let use_ref = parse(r#"{"$ref":"urn:test:child"}"#);
    let resources = SchemaResources {
        entries: vec![(Utf16::from("urn:test:child"), external)],
    };
    let compiled = CompiledSchema::compile(&use_ref, &resources, &mut Context::ordinary()).unwrap();
    assert_eq!(errors(&compiled, "3")[0].keyword, "type");

    let escaped = parse(
        r##"{"$defs":{"percent%field":{"type":"string"},"café":{"type":"integer"}},"$ref":"#/$defs/percent%25field"}"##,
    );
    let compiled = CompiledSchema::compile(
        &escaped,
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#""ok""#).is_empty());
    assert_eq!(errors(&compiled, "3")[0].keyword, "type");

    let unicode = parse(r##"{"$defs":{"café":{"type":"integer"}},"$ref":"#/$defs/caf%C3%A9"}"##);
    let compiled = CompiledSchema::compile(
        &unicode,
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, "3").is_empty());
}

#[test]
fn consumer_refs_resolve_legacy_fragment_ids_and_file_uri_resources() {
    let legacy = parse(
        r##"{"$schema":"http://json-schema.org/draft-04/schema#","definitions":{"value":{"id":"#foo","type":"string"}},"$ref":"#foo"}"##,
    );
    let compiled = CompiledSchema::compile_consumer(
        &legacy,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#""ok""#).is_empty());
    assert!(!errors(&compiled, "1").is_empty());

    let root = parse(
        r##"{"$schema":"http://json-schema.org/draft-07/schema#","$id":"file:///folder/file.json","$ref":"sub.json"}"##,
    );
    let sub = parse(r#"{"$id":"file:///folder/sub.json","type":"string"}"#);
    let compiled = CompiledSchema::compile_consumer(
        &root,
        &SchemaResources {
            entries: vec![(Utf16::from("file:///folder/sub.json"), sub)],
        },
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#""ok""#).is_empty());
    assert!(!errors(&compiled, "1").is_empty());
}

#[test]
fn draft7_dependencies_and_tuple_items_remain_available() {
    let schema = compile(
        r#"{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","dependencies":{"credit_card":["billing_address"]},"properties":{"items":{"type":"array","items":[{"type":"string"},{"type":"integer"}],"additionalItems":false}}}"#,
        SchemaDialect::Draft7,
    );
    assert!(errors(&schema, r#"{"credit_card":1}"#)
        .iter()
        .any(|e| e.keyword == "dependencies"));
    let es = errors(&schema, r#"{"items":["ok",2,true]}"#);
    assert!(es.iter().any(|e| e.keyword == "additionalItems"));
}

#[test]
fn draft2020_prefix_items_and_conditionals_are_evaluated() {
    let schema = compile(
        r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","if":{"required":["kind"],"properties":{"kind":{"const":"a"}}},"then":{"required":["value"],"properties":{"value":{"type":"integer"}}},"properties":{"tuple":{"type":"array","prefixItems":[{"type":"string"},{"type":"integer"}],"items":false}}}"#,
        SchemaDialect::Draft2020_12,
    );
    let e = errors(&schema, r#"{"kind":"a","tuple":["x",1,false]}"#);
    assert!(e.iter().any(|x| x.keyword == "required"));
    assert!(e.iter().any(|x| x.keyword == "false schema"));
}

#[test]
fn strict_keyword_refusal_and_consumer_draft7_selection() {
    let bad = parse(r#"{"typo":true}"#);
    assert_eq!(
        CompiledSchema::compile(&bad, &SchemaResources::default(), &mut Context::ordinary())
            .unwrap_err()
            .code,
        "SCHEMA_UNKNOWN_KEYWORD"
    );
    let d7 = parse(
        r#"{"$schema":"http://json-schema.org/draft-07/schema#","type":"string","minLength":2}"#,
    );
    let compiled = CompiledSchema::compile_consumer(
        &d7,
        &SchemaResources::default(),
        true,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, "\"x\"")
        .iter()
        .any(|e| e.keyword == "minLength"));
    let unknown = parse(r#"{"$schema":"urn:unknown:dialect"}"#);
    let failure = CompiledSchema::compile_consumer(
        &unknown,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(failure.code, "SCHEMA_DIALECT");

    let annotation = parse(r#"{"type":"string","x-consumer-note":"inert"}"#);
    assert!(CompiledSchema::compile_consumer(
        &annotation,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .is_ok());
    assert_eq!(
        CompiledSchema::compile_consumer(
            &annotation,
            &SchemaResources::default(),
            true,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "SCHEMA_UNKNOWN_KEYWORD"
    );
    let fake_dialect = parse(r#"{"$schema":"urn:vendor:draft-2020-12:custom","type":"string"}"#);
    assert_eq!(
        CompiledSchema::compile_consumer(
            &fake_dialect,
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "SCHEMA_DIALECT"
    );
}

#[test]
fn consumer_accepts_all_six_predecessor_metaschemas_and_legacy_mechanics() {
    let profiles = [
        (
            "http://json-schema.org/draft-03/schema#",
            SchemaDialect::Draft3,
        ),
        (
            "http://json-schema.org/draft-04/schema#",
            SchemaDialect::Draft4,
        ),
        (
            "http://json-schema.org/draft-06/schema#",
            SchemaDialect::Draft6,
        ),
        (
            "http://json-schema.org/draft-07/schema#",
            SchemaDialect::Draft7,
        ),
        (
            "https://json-schema.org/draft/2019-09/schema",
            SchemaDialect::Draft2019_09,
        ),
        (
            "https://json-schema.org/draft/2020-12/schema",
            SchemaDialect::Draft2020_12,
        ),
    ];
    for (uri, _dialect) in profiles {
        let source = format!(r#"{{"$schema":"{uri}","type":"string"}}"#);
        let selected = CompiledSchema::compile_consumer(
            &parse(&source),
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(errors(&selected, r#""text""#).is_empty(), "{uri}");
        assert_eq!(errors(&selected, "1")[0].keyword, "type", "{uri}");
    }

    for uri in [
        "http://json-schema.org/draft-03/schema",
        "http://json-schema.org/draft-04/schema",
        "http://json-schema.org/draft-06/schema",
        "http://json-schema.org/draft-07/schema",
        "https://json-schema.org/draft/2019-09/schema#",
        "https://json-schema.org/draft/2020-12/schema#",
    ] {
        let source = format!(r#"{{"$schema":"{uri}","type":"string"}}"#);
        let selected = CompiledSchema::compile_consumer(
            &parse(&source),
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(errors(&selected, r#""text""#).is_empty(), "{uri}");
    }
    for uri in [
        "https://json-schema.org/draft-07/schema",
        "http://json-schema.org/draft/2020-12/schema",
        "http://json-schema.org/draft-07/schema#x",
    ] {
        let source = format!(r#"{{"$schema":"{uri}","type":"string"}}"#);
        assert_eq!(
            CompiledSchema::compile_consumer(
                &parse(&source),
                &SchemaResources::default(),
                false,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "SCHEMA_DIALECT",
            "{uri}",
        );
    }

    let draft3_required = compile(
        r#"{"$schema":"http://json-schema.org/draft-03/schema#","properties":{"name":{"type":"string","required":true}}}"#,
        SchemaDialect::Draft3,
    );
    assert_eq!(errors(&draft3_required, "{}")[0].keyword, "required");
    let draft4_exclusive = compile(
        r#"{"$schema":"http://json-schema.org/draft-04/schema#","minimum":1,"exclusiveMinimum":true}"#,
        SchemaDialect::Draft4,
    );
    assert_eq!(errors(&draft4_exclusive, "1")[0].keyword, "minimum");
    let draft2019_tuple = compile(
        r#"{"$schema":"https://json-schema.org/draft/2019-09/schema","items":[{"type":"string"}],"additionalItems":false}"#,
        SchemaDialect::Draft2019_09,
    );
    assert!(errors(&draft2019_tuple, r#"["x",2]"#)
        .iter()
        .any(|error| error.keyword == "additionalItems"));
}

#[test]
fn draft3_keyword_activation_and_legacy_schema_valued_types_match_the_profile() {
    let draft3 = compile_consumer(
        r#"{"$schema":"http://json-schema.org/draft-03/schema#","type":[{"type":"string"},"null"]}"#,
        SchemaDialect::Draft3,
    );
    assert!(errors(&draft3, r#""text""#).is_empty());
    assert!(errors(&draft3, "null").is_empty());
    assert!(errors(&draft3, "1")
        .iter()
        .any(|error| error.keyword == "type"));

    // These keywords were not registered by Draft3Validator.
    let draft3_inert = compile_consumer(
        r#"{"$schema":"http://json-schema.org/draft-03/schema#","allOf":[false],"minProperties":2,"maxProperties":0}"#,
        SchemaDialect::Draft3,
    );
    assert!(errors(&draft3_inert, "{}").is_empty());

    let draft4 = compile_consumer(
        r#"{"$schema":"http://json-schema.org/draft-04/schema#","allOf":[{"required":["name"]}],"minProperties":2}"#,
        SchemaDialect::Draft4,
    );
    assert!(errors(&draft4, "{}")
        .iter()
        .any(|error| error.keyword == "required"));
    assert!(errors(&draft4, r#"{"a":1}"#)
        .iter()
        .any(|error| error.keyword == "minProperties"));
}

#[test]
fn string_length_uses_unicode_code_points_and_preserves_unpaired_units() {
    let schema = compile(
        r#"{"type":"string","minLength":2}"#,
        SchemaDialect::Draft2020_12,
    );
    let emoji = Value::String(Utf16::new(vec![0xd83d, 0xde00]));
    assert_eq!(
        schema.validate(&emoji, &mut Context::ordinary()).unwrap()[0].keyword,
        "minLength"
    );
    let lone = Value::String(Utf16::new(vec![0xd800, 0x61]));
    assert!(schema
        .validate(&lone, &mut Context::ordinary())
        .unwrap()
        .is_empty());
}

#[test]
fn property_names_and_required_values_preserve_raw_utf16_units() {
    let lone_surrogate = Utf16::new(vec![0xd800]);
    let schema_value = Value::Object(vec![
        (Utf16::from("type"), s("object")),
        (
            Utf16::from("required"),
            arr(vec![Value::String(lone_surrogate.clone())]),
        ),
        (
            Utf16::from("properties"),
            Value::Object(vec![(lone_surrogate.clone(), Value::Bool(true))]),
        ),
        (Utf16::from("additionalProperties"), Value::Bool(false)),
    ]);
    let compiled = CompiledSchema::compile(
        &schema_value,
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    let present = Value::Object(vec![(lone_surrogate.clone(), Value::Null)]);
    assert!(compiled
        .validate(&present, &mut Context::ordinary())
        .unwrap()
        .is_empty());

    let missing = compiled
        .validate(&Value::Object(vec![]), &mut Context::ordinary())
        .unwrap();
    assert_eq!(missing.len(), 1);
    assert_eq!(missing[0].keyword, "required");
    assert_eq!(
        missing[0].message.units(),
        [
            "must have required property '"
                .encode_utf16()
                .collect::<Vec<_>>(),
            lone_surrogate.units().to_vec(),
            vec![0x27],
        ]
        .concat()
    );
    let Value::Object(params) = &missing[0].params else {
        panic!("required params must be an object");
    };
    assert_eq!(params[0].1, Value::String(lone_surrogate));
}

#[test]
fn unevaluated_keywords_use_annotations_from_properties_refs_and_prefix_items() {
    let properties = compile(
        r##"{"$defs":{"base":{"properties":{"x":true}}},"allOf":[{"$ref":"#/$defs/base"}],"unevaluatedProperties":false}"##,
        SchemaDialect::Draft2020_12,
    );
    assert!(errors(&properties, r#"{"x":1}"#).is_empty());
    let extra = errors(&properties, r#"{"x":1,"y":2}"#);
    assert_eq!(extra.len(), 1);
    assert_eq!(extra[0].keyword, "unevaluatedProperties");

    let items = compile(
        r#"{"prefixItems":[true],"unevaluatedItems":false}"#,
        SchemaDialect::Draft2020_12,
    );
    assert!(errors(&items, "[1]").is_empty());
    let extra = errors(&items, "[1,2]");
    assert_eq!(extra.len(), 1);
    assert_eq!(extra[0].keyword, "unevaluatedItems");
}

#[test]
fn unevaluated_annotations_are_scoped_to_reference_and_allof_subschemas() {
    let referenced = compile(
        r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$defs":{"A":{"unevaluatedProperties":false}},"properties":{"prop1":{"type":"string"}},"$ref":"#/$defs/A"}"##,
        SchemaDialect::Draft2020_12,
    );
    assert!(!errors(&referenced, r#"{"prop1":"match"}"#).is_empty());

    let nested = compile(
        r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","allOf":[{"properties":{"foo":true}},{"unevaluatedProperties":false}]}"##,
        SchemaDialect::Draft2020_12,
    );
    assert!(!errors(&nested, r#"{"foo":1}"#).is_empty());

    let parent = compile(
        r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","allOf":[{"properties":{"foo":true}}],"unevaluatedProperties":false}"##,
        SchemaDialect::Draft2020_12,
    );
    assert!(errors(&parent, r#"{"foo":1}"#).is_empty());

    for dialect in [SchemaDialect::Draft2019_09, SchemaDialect::Draft2020_12] {
        let uri = if dialect == SchemaDialect::Draft2019_09 {
            "https://json-schema.org/draft/2019-09/schema"
        } else {
            "https://json-schema.org/draft/2020-12/schema"
        };
        let source = format!(
            r##"{{"$schema":"{uri}","$defs":{{"A":{{"unevaluatedProperties":false}}}},"properties":{{"prop1":{{"type":"string"}}}},"$ref":"#/$defs/A"}}"##
        );
        let referenced = compile(&source, dialect);
        assert!(!errors(&referenced, r#"{"prop1":"match"}"#).is_empty());

        let item_keyword = if dialect == SchemaDialect::Draft2019_09 {
            "items"
        } else {
            "prefixItems"
        };
        let source = format!(
            r##"{{"$schema":"{uri}","allOf":[{{"{item_keyword}":[true]}},{{"unevaluatedItems":false}}]}}"##
        );
        let nested_items = compile(&source, dialect);
        assert!(!errors(&nested_items, "[1]").is_empty());
    }

    let conditional = compile(
        r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","if":{"properties":{"foo":{"const":"then"}},"required":["foo"]},"then":{"properties":{"bar":{"type":"string"}},"required":["bar"]},"else":{"properties":{"baz":{"type":"string"}},"required":["baz"]},"unevaluatedProperties":false}"##,
        SchemaDialect::Draft2020_12,
    );
    assert!(errors(&conditional, r#"{"foo":"then","bar":"bar"}"#).is_empty());
}

#[test]
fn dynamic_ref_uses_the_outer_dynamic_anchor_for_recursive_resource_validation() {
    let base = parse(
        r##"{"$id":"urn:tree","$dynamicAnchor":"node","type":"object","properties":{"children":{"type":"array","items":{"$dynamicRef":"#node"}}}}"##,
    );
    let root = parse(
        r##"{"$id":"urn:strict-tree","$dynamicAnchor":"node","$ref":"urn:tree","properties":{"data":{"type":"integer"}}}"##,
    );
    let compiled = CompiledSchema::compile(
        &root,
        &SchemaResources {
            entries: vec![(Utf16::from("urn:tree"), base)],
        },
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#"{"data":1,"children":[{"data":2}]}"#).is_empty());
    let invalid = errors(&compiled, r#"{"data":1,"children":[{"data":"bad"}]}"#);
    assert!(invalid.iter().any(|error| {
        error.keyword == "type" && error.instance_path == Utf16::from("/children/0/data")
    }));
}

#[test]
fn draft2019_recursive_ref_uses_recursive_anchor_scope() {
    let base = parse(
        r##"{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"https://fixture.example/tree","$recursiveAnchor":true,"type":"object","properties":{"children":{"type":"array","items":{"$recursiveRef":"#"}}}}"##,
    );
    let root = parse(
        r##"{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"https://fixture.example/strict-tree","$recursiveAnchor":true,"$ref":"tree","properties":{"data":{"type":"integer"}}}"##,
    );
    let compiled = CompiledSchema::compile_consumer(
        &root,
        &SchemaResources {
            entries: vec![(Utf16::from("https://fixture.example/tree"), base)],
        },
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#"{"data":1,"children":[{"data":2}]}"#).is_empty());
    assert!(errors(&compiled, r#"{"children":[{"data":"bad"}]}"#)
        .iter()
        .any(|error| error.keyword == "type"));
}

#[test]
fn draft2019_recursive_ref_uses_nested_embedded_resource_identifiers() {
    let schema = parse(
        r##"{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:4242/draft2019-09/recursiveRef2/schema.json","$defs":{"myobject":{"$id":"myobject.json","$recursiveAnchor":true,"anyOf":[{"type":"string"},{"type":"object","additionalProperties":{"$recursiveRef":"#"}}]}},"anyOf":[{"type":"integer"},{"$ref":"#/$defs/myobject"}]}"##,
    );
    let compiled = CompiledSchema::compile_consumer(
        &schema,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#"{"foo":"hi"}"#).is_empty());
    assert!(errors(&compiled, r#"{"foo":1}"#)
        .iter()
        .any(|error| error.keyword == "anyOf" || error.keyword == "type"));

    let outer_anchor = parse(
        r##"{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:4242/draft2019-09/recursiveRef3/schema.json","$recursiveAnchor":true,"$defs":{"myobject":{"$id":"myobject.json","$recursiveAnchor":true,"anyOf":[{"type":"string"},{"type":"object","additionalProperties":{"$recursiveRef":"#"}}]}},"anyOf":[{"type":"integer"},{"$ref":"#/$defs/myobject"}]}"##,
    );
    let compiled = CompiledSchema::compile_consumer(
        &outer_anchor,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#"{"foo":1}"#).is_empty());
    assert!(errors(&compiled, r#"{"foo":{"bar":1}}"#).is_empty());
}

#[test]
fn newer_keywords_are_inert_in_older_consumer_dialects() {
    let schema = parse(
        r#"{"$schema":"http://json-schema.org/draft-03/schema#","type":"array","prefixItems":[{"type":"string"}],"unevaluatedItems":false,"$defs":{"x":{"type":"number"}},"contentSchema":{"type":"boolean"}}"#,
    );
    let compiled = CompiledSchema::compile_consumer(
        &schema,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#"["x",2]"#).is_empty());
}

#[test]
fn contains_bounds_are_only_active_in_drafts_that_define_them() {
    let draft7_schema = parse(
        r#"{"$schema":"http://json-schema.org/draft-07/schema#","contains":true,"minContains":0,"maxContains":0}"#,
    );
    let draft7 = CompiledSchema::compile_consumer(
        &draft7_schema,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    let draft7_errors = errors(&draft7, "[]");
    assert_eq!(draft7_errors.len(), 1);
    assert_eq!(draft7_errors[0].keyword, "contains");

    let draft2019_schema = parse(
        r#"{"$schema":"https://json-schema.org/draft/2019-09/schema","contains":true,"minContains":0,"maxContains":0}"#,
    );
    let draft2019 = CompiledSchema::compile_consumer(
        &draft2019_schema,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&draft2019, "[]").is_empty());
    assert_eq!(errors(&draft2019, "[1]")[0].keyword, "contains");
}

#[test]
fn regex_compilation_and_matching_preserve_utf16_and_unicode_mode() {
    let schema = parse(r#"{"pattern":"^.$"}"#);
    let compiled = CompiledSchema::compile(
        &schema,
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#""💩""#).is_empty());

    let lone_surrogate = parse(r#"{"pattern":"\\ud800"}"#);
    let compiled = CompiledSchema::compile(
        &lone_surrogate,
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#""\ud800""#).is_empty());

    let pattern_property =
        parse(r#"{"patternProperties":{"\\ud800":true},"additionalProperties":false}"#);
    let compiled = CompiledSchema::compile(
        &pattern_property,
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&compiled, r#"{"\ud800":1}"#).is_empty());

    let python_profile_schema = parse(r#"{"pattern":"\\a"}"#);
    let python_profile = CompiledSchema::compile_python_consumer(
        &python_profile_schema,
        &SchemaResources::default(),
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&python_profile, r#""\u0007""#).is_empty());
    assert_eq!(errors(&python_profile, r#""a""#)[0].keyword, "pattern");
    assert_eq!(
        CompiledSchema::compile(
            &python_profile_schema,
            &SchemaResources::default(),
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "SCHEMA_INVALID"
    );
}

#[test]
fn python_consumer_keeps_unknown_annotations_inert_and_strict_core_rejects_them() {
    let schema = parse(r#"{"type":"string","x-consumer-note":{"any":"opaque"}}"#);
    let consumer = CompiledSchema::compile_python_consumer(
        &schema,
        &SchemaResources::default(),
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&consumer, r#""text""#).is_empty());

    assert_eq!(
        CompiledSchema::compile_python_schema(
            &schema,
            &SchemaResources::default(),
            true,
            PythonReVersion::V3_11,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "SCHEMA_UNKNOWN_KEYWORD",
    );

    let raw_extension_key = parse(r#"{"type":"string","\ud800":"opaque"}"#);
    let raw_consumer = CompiledSchema::compile_python_consumer(
        &raw_extension_key,
        &SchemaResources::default(),
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(errors(&raw_consumer, r#""text""#).is_empty());
}

#[test]
fn test_helpers_keep_ordered_owned_values() {
    let expected = obj(vec![("x", n(1.0)), ("y", arr(vec![s("z")]))]);
    assert_eq!(expected, parse(r#"{"x":1,"y":["z"]}"#));
}

#[test]
fn generated_extension_package_schema_resolves_its_local_definitions() {
    let schema = parse(include_str!(
        "../../../spec/core/extension-package.schema.json"
    ));
    let reference = parse(include_str!(
        "../../../spec/core/semantic-type-reference.schema.json"
    ));
    let resources = SchemaResources {
        entries: vec![(
            Utf16::from("urn:umf:core:semantic-type-reference:1.0.0"),
            reference,
        )],
    };
    let compiled = CompiledSchema::compile(&schema, &resources, &mut Context::ordinary()).unwrap();
    let manifest = parse(
        r#"{"id":"urn:test:ext","version":"1.0.0","coreVersion":"0.10.0","description":"x","schema":true,"semantics":"x","scopes":["document"],"capabilities":{"validation":"structural","directions":[],"evidence":[]}}"#,
    );
    assert!(compiled
        .validate(&manifest, &mut Context::ordinary())
        .unwrap()
        .is_empty());
}

#[test]
fn generated_core_schema_resolves_all_local_pointers() {
    let schema = parse(include_str!("../../../spec/core/schema.json"));
    let reference = parse(include_str!(
        "../../../spec/core/semantic-type-reference.schema.json"
    ));
    let package = parse(include_str!(
        "../../../spec/core/extension-package.schema.json"
    ));
    let resources = SchemaResources {
        entries: vec![
            (
                Utf16::from("urn:umf:core:semantic-type-reference:1.0.0"),
                reference,
            ),
            (Utf16::from("urn:umf:extension-package:0.10.0"), package),
        ],
    };
    let compiled = CompiledSchema::compile(&schema, &resources, &mut Context::ordinary()).unwrap();
    let document = parse(r#"{"umf":"0.10.0","id":"x","vocabularies":{},"modules":[]}"#);
    assert!(compiled
        .validate(&document, &mut Context::ordinary())
        .unwrap()
        .is_empty());
}

#[test]
fn python_schema_source_preserves_explicit_surrogate_codepoints() {
    let schema = PythonConsumerValue::Object(vec![
        (
            PyText::from_utf8("type"),
            PythonConsumerValue::String(PyText::from_utf8("string")),
        ),
        (
            PyText::from_utf8("pattern"),
            PythonConsumerValue::String(
                PyText::from_codepoints(vec![b'^' as u32, 0xd83d, 0xde00, b'$' as u32]).unwrap(),
            ),
        ),
    ]);
    let compiled = CompiledSchema::compile_python_source(
        &schema,
        &Default::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    let pair = PythonConsumerValue::String(PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap());
    let scalar = PythonConsumerValue::String(PyText::from_codepoints(vec![0x1f600]).unwrap());
    assert!(compiled
        .validate(&pair, &mut Context::ordinary())
        .unwrap()
        .is_empty());
    assert_eq!(
        compiled
            .validate(&scalar, &mut Context::ordinary())
            .unwrap()[0]
            .keyword,
        Some(PyText::from_utf8("pattern"))
    );

    let unsafe_schema_number = PythonConsumerValue::Object(vec![(
        PyText::from_utf8("const"),
        PythonConsumerValue::Integer(BigInt::from(1u8) << 54usize),
    )]);
    assert_eq!(
        CompiledSchema::compile_python_source(
            &unsafe_schema_number,
            &Default::default(),
            false,
            PythonReVersion::V3_11,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "NUMBER"
    );
}

#[test]
fn python_schema_source_preserves_utf16_colliding_property_names() {
    let astral = PyText::from_codepoints(vec![0x1f600]).unwrap();
    let pair = PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap();
    let schema = PythonConsumerValue::Object(vec![
        (
            PyText::from_utf8("type"),
            PythonConsumerValue::String(PyText::from_utf8("object")),
        ),
        (
            PyText::from_utf8("properties"),
            PythonConsumerValue::Object(vec![
                (
                    astral.clone(),
                    PythonConsumerValue::Object(vec![(
                        PyText::from_utf8("const"),
                        PythonConsumerValue::Integer(BigInt::from(1)),
                    )]),
                ),
                (
                    pair.clone(),
                    PythonConsumerValue::Object(vec![(
                        PyText::from_utf8("const"),
                        PythonConsumerValue::Integer(BigInt::from(2)),
                    )]),
                ),
            ]),
        ),
        (
            PyText::from_utf8("required"),
            PythonConsumerValue::Array(vec![
                PythonConsumerValue::String(astral.clone()),
                PythonConsumerValue::String(pair.clone()),
            ]),
        ),
        (
            PyText::from_utf8("additionalProperties"),
            PythonConsumerValue::Bool(false),
        ),
    ]);
    let compiled = CompiledSchema::compile_python_source(
        &schema,
        &Default::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    let document = PythonConsumerValue::Object(vec![
        (
            astral.clone(),
            PythonConsumerValue::Integer(BigInt::from(1)),
        ),
        (pair.clone(), PythonConsumerValue::Integer(BigInt::from(2))),
    ]);
    assert!(compiled
        .validate(&document, &mut Context::ordinary())
        .unwrap()
        .is_empty());
    let swapped = PythonConsumerValue::Object(vec![
        (astral, PythonConsumerValue::Integer(BigInt::from(2))),
        (pair, PythonConsumerValue::Integer(BigInt::from(1))),
    ]);
    assert_eq!(
        compiled
            .validate(&swapped, &mut Context::ordinary())
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn python_schema_source_preserves_nested_const_enum_and_additional_property_identity() {
    let scalar = PyText::from_codepoints(vec![0x1f600]).unwrap();
    let pair = PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap();
    let nested = |key: PyText, value: u8| {
        PythonConsumerValue::Object(vec![(
            key,
            PythonConsumerValue::Object(vec![(
                PyText::from_utf8("value"),
                PythonConsumerValue::Integer(BigInt::from(value)),
            )]),
        )])
    };

    let exact_object = nested(scalar.clone(), 1);
    let const_schema =
        PythonConsumerValue::Object(vec![(PyText::from_utf8("const"), exact_object.clone())]);
    let compiled = CompiledSchema::compile_python_source(
        &const_schema,
        &Default::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(compiled
        .validate(&exact_object, &mut Context::ordinary())
        .unwrap()
        .is_empty());
    let const_errors = compiled
        .validate(&nested(pair.clone(), 1), &mut Context::ordinary())
        .unwrap();
    assert_eq!(const_errors.len(), 1);
    assert_eq!(
        const_errors[0].params,
        PythonConsumerValue::Object(vec![(
            PyText::from_utf8("allowedValue"),
            exact_object.clone()
        ),])
    );

    let enum_schema = PythonConsumerValue::Object(vec![(
        PyText::from_utf8("enum"),
        PythonConsumerValue::Array(vec![nested(scalar.clone(), 1), nested(pair.clone(), 2)]),
    )]);
    let compiled = CompiledSchema::compile_python_source(
        &enum_schema,
        &Default::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(compiled
        .validate(&nested(scalar.clone(), 1), &mut Context::ordinary())
        .unwrap()
        .is_empty());
    assert!(compiled
        .validate(&nested(pair.clone(), 2), &mut Context::ordinary())
        .unwrap()
        .is_empty());
    assert_eq!(
        compiled
            .validate(&nested(pair.clone(), 1), &mut Context::ordinary())
            .unwrap()
            .len(),
        1
    );

    let properties_schema = PythonConsumerValue::Object(vec![
        (
            PyText::from_utf8("type"),
            PythonConsumerValue::String(PyText::from_utf8("object")),
        ),
        (
            PyText::from_utf8("properties"),
            PythonConsumerValue::Object(vec![(scalar, PythonConsumerValue::Bool(true))]),
        ),
        (
            PyText::from_utf8("additionalProperties"),
            PythonConsumerValue::Bool(false),
        ),
    ]);
    let compiled = CompiledSchema::compile_python_source(
        &properties_schema,
        &Default::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    let pair_only =
        PythonConsumerValue::Object(vec![(pair, PythonConsumerValue::Integer(BigInt::from(1)))]);
    let errors = compiled
        .validate(&pair_only, &mut Context::ordinary())
        .unwrap();
    assert_eq!(errors.len(), 1);
    assert_eq!(
        errors[0].keyword,
        Some(PyText::from_utf8("additionalProperties"))
    );
}

#[test]
fn python_schema_source_refs_select_distinct_utf16_colliding_definition_keys() {
    let scalar = PyText::from_codepoints(vec![0x1f600]).unwrap();
    let pair = PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap();
    for (reference_key, expected, rejected) in [(scalar.clone(), 1, 2), (pair, 2, 1)] {
        let schema = PythonConsumerValue::Object(vec![
            (
                PyText::from_utf8("$defs"),
                PythonConsumerValue::Object(vec![
                    (
                        scalar.clone(),
                        PythonConsumerValue::Object(vec![(
                            PyText::from_utf8("const"),
                            PythonConsumerValue::Integer(BigInt::from(1)),
                        )]),
                    ),
                    (
                        PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap(),
                        PythonConsumerValue::Object(vec![(
                            PyText::from_utf8("const"),
                            PythonConsumerValue::Integer(BigInt::from(2)),
                        )]),
                    ),
                ]),
            ),
            (
                PyText::from_utf8("$ref"),
                PythonConsumerValue::String(
                    PyText::from_codepoints(
                        [
                            "#/$defs/".chars().map(u32::from).collect::<Vec<_>>(),
                            reference_key.codepoints().to_vec(),
                        ]
                        .concat(),
                    )
                    .unwrap(),
                ),
            ),
        ]);
        let compiled = CompiledSchema::compile_python_source(
            &schema,
            &Default::default(),
            false,
            PythonReVersion::V3_11,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(compiled
            .validate(
                &PythonConsumerValue::Integer(BigInt::from(expected)),
                &mut Context::ordinary()
            )
            .unwrap()
            .is_empty());
        assert_eq!(
            compiled
                .validate(
                    &PythonConsumerValue::Integer(BigInt::from(rejected)),
                    &mut Context::ordinary()
                )
                .unwrap()
                .len(),
            1
        );
    }
}

#[test]
fn python_pattern_properties_preserves_colliding_regex_key_origins() {
    let scalar_pattern = PyText::from_codepoints("^😀$".chars().map(u32::from).collect()).unwrap();
    let pair_pattern =
        PyText::from_codepoints(vec![b'^' as u32, 0xd83d, 0xde00, b'$' as u32]).unwrap();
    let scalar_key = PyText::from_codepoints(vec![0x1f600]).unwrap();
    let pair_key = PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap();
    let schema = PythonConsumerValue::Object(vec![
        (
            PyText::from_utf8("type"),
            PythonConsumerValue::String(PyText::from_utf8("object")),
        ),
        (
            PyText::from_utf8("patternProperties"),
            PythonConsumerValue::Object(vec![
                (
                    scalar_pattern,
                    PythonConsumerValue::Object(vec![(
                        PyText::from_utf8("const"),
                        PythonConsumerValue::Integer(BigInt::from(1)),
                    )]),
                ),
                (
                    pair_pattern,
                    PythonConsumerValue::Object(vec![(
                        PyText::from_utf8("const"),
                        PythonConsumerValue::Integer(BigInt::from(2)),
                    )]),
                ),
            ]),
        ),
    ]);
    let compiled = CompiledSchema::compile_python_source(
        &schema,
        &Default::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    let valid = PythonConsumerValue::Object(vec![
        (
            scalar_key.clone(),
            PythonConsumerValue::Integer(BigInt::from(1)),
        ),
        (
            pair_key.clone(),
            PythonConsumerValue::Integer(BigInt::from(2)),
        ),
    ]);
    assert!(compiled
        .validate(&valid, &mut Context::ordinary())
        .unwrap()
        .is_empty());
    let invalid = PythonConsumerValue::Object(vec![
        (scalar_key, PythonConsumerValue::Integer(BigInt::from(2))),
        (pair_key, PythonConsumerValue::Integer(BigInt::from(1))),
    ]);
    assert_eq!(
        compiled
            .validate(&invalid, &mut Context::ordinary())
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn python_schema_diagnostic_paths_preserve_explicit_surrogate_codepoints() {
    let pair = vec![0xd83d, 0xde00];
    let pattern =
        PyText::from_codepoints([vec![b'^' as u32], pair.clone(), vec![b'$' as u32]].concat())
            .unwrap();
    let schema = PythonConsumerValue::Object(vec![(
        PyText::from_utf8("patternProperties"),
        PythonConsumerValue::Object(vec![(
            pattern.clone(),
            PythonConsumerValue::Object(vec![(
                PyText::from_utf8("const"),
                PythonConsumerValue::Integer(BigInt::from(2)),
            )]),
        )]),
    )]);
    let compiled = CompiledSchema::compile_python_source(
        &schema,
        &Default::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    let key = PyText::from_codepoints(pair.clone()).unwrap();
    let instance =
        PythonConsumerValue::Object(vec![(key, PythonConsumerValue::Integer(BigInt::from(1)))]);
    let errors = compiled
        .validate(&instance, &mut Context::ordinary())
        .unwrap();
    assert_eq!(errors.len(), 1);
    assert_eq!(
        errors[0].instance_path,
        PyText::from_codepoints([vec![b'/' as u32], pair.clone()].concat()).unwrap()
    );
    let mut expected_schema_path = "#/patternProperties/^"
        .chars()
        .map(u32::from)
        .collect::<Vec<_>>();
    expected_schema_path.extend(pair);
    expected_schema_path.extend("$/const".chars().map(u32::from));
    assert_eq!(
        errors[0].schema_path,
        PyText::from_codepoints(expected_schema_path).unwrap()
    );
}

#[test]
fn python_multiple_of_uses_predecessor_quotient_divisibility_arithmetic() {
    let schema = PythonConsumerValue::Object(vec![(
        PyText::from_utf8("multipleOf"),
        PythonConsumerValue::float(0.0001),
    )]);
    let compiled = CompiledSchema::compile_python_source(
        &schema,
        &Default::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    let instance = PythonConsumerValue::float(0.0075);
    assert!(compiled
        .validate(&instance, &mut Context::ordinary())
        .unwrap()
        .is_empty());

    let fractional = PythonConsumerValue::Object(vec![
        (
            PyText::from_utf8("type"),
            PythonConsumerValue::String(PyText::from_utf8("integer")),
        ),
        (
            PyText::from_utf8("multipleOf"),
            PythonConsumerValue::float(1e-8),
        ),
    ]);
    let compiled = CompiledSchema::compile_python_source(
        &fractional,
        &Default::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    let integer = PythonConsumerValue::Integer(BigInt::from(12_391_239_123u64));
    assert!(compiled
        .validate(&integer, &mut Context::ordinary())
        .unwrap()
        .is_empty());
}

#[test]
fn schema_resource_ids_and_reference_text_are_private_work_not_text_output() {
    let long_id_text = format!("urn:fixture:{}", "x".repeat(4_000_001));
    let long_id = Utf16::from(long_id_text.clone());
    let resources = SchemaResources {
        entries: vec![(long_id.clone(), Value::Bool(true))],
    };
    let schema_value = obj(vec![("$ref", s(&long_id_text))]);
    let schema = CompiledSchema::compile_consumer(
        &schema_value,
        &resources,
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    let snapshot = schema
        .snapshot_with_context(&mut Context::ordinary())
        .unwrap();
    assert!(snapshot
        .validate(&Value::Null, &mut Context::ordinary())
        .unwrap()
        .is_empty());

    let reference_schema = schema_value;
    let error = CompiledSchema::compile_consumer(
        &reference_schema,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(error.code, "SCHEMA_REF_UNRESOLVED");

    let mut large_charges = 0usize;
    let mut meter = |amount: usize| {
        if amount > 1_000_000 {
            large_charges += 1;
            if large_charges == 2 {
                return Err(umf_core::EngineError::new(
                    "METER_STOP",
                    Utf16::default(),
                    "stopped before private reference conversion",
                ));
            }
        }
        Ok(())
    };
    let error = CompiledSchema::compile_consumer(
        &reference_schema,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "METER_STOP");
}
