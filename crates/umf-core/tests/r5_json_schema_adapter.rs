// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{json_schema_adapter as js, Context, Limits, ResourceProfile, Utf16, Value};

fn s(value: &str) -> Value { Value::string_utf8(value) }
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k,v)| (Utf16::from(k),v)).collect())
}
fn tagged_object(fields: Vec<(&str, Value)>) -> Value {
    obj(vec![
        ("kind", s("object")),
        ("members", Value::Object(fields.into_iter().map(|(k,v)| (Utf16::from(k),v)).collect())),
    ])
}
fn tagged_string(v: &str) -> Value { obj(vec![("kind",s("string")),("value",s(v))]) }
fn payload(root: Value, resources: Value) -> Value {
    payload_at(root, resources, "https://example.test/root")
}
fn payload_at(root: Value, resources: Value, base_uri: &str) -> Value {
    obj(vec![("dialect",s(js::DIALECT_2020_12)),("baseUri",s(base_uri)),("root",root),("resources",resources)])
}
fn payload_with_extra(root: Value, resources: Value) -> Value {
    let Value::Object(mut fields) = payload(root,resources) else { unreachable!() };
    fields.push((Utf16::from("future"),obj(vec![("retained",Value::Bool(true))])));
    Value::Object(fields)
}
fn tagged_object_with_extra(fields: Vec<(&str,Value)>) -> Value {
    let Value::Object(mut node) = tagged_object(fields) else { unreachable!() };
    node.push((Utf16::from("future"),s("representation")));
    Value::Object(node)
}

#[test]
fn admits_uri_and_schema_root_and_preserves_exact_number_export() {
    let root = tagged_object(vec![("minimum", obj(vec![("kind",s("number")),("value",s("9007199254740993"))]))]);
    let mut ctx = Context::ordinary();
    let admitted = js::admit_payload(
        &payload(root, obj(vec![("https://example.test/resource", tagged_object(vec![]))])),
        &mut ctx,
    ).unwrap();
    let rendered = js::export_root(&admitted, &mut Context::ordinary()).unwrap();
    assert_eq!(rendered.to_utf8().unwrap(), format!("{}\n",r#"{"minimum":9007199254740993}"#));
    assert_eq!(js::export_resources(&admitted, &mut Context::ordinary()).unwrap()[0].1.to_utf8().unwrap(), "{}\n");
}

#[test]
fn rejects_root_resource_collision_and_non_schema_root() {
    let collision = obj(vec![("https://example.test/root", tagged_object(vec![]))]);
    assert_eq!(js::admit_payload(&payload(tagged_object(vec![]), collision), &mut Context::ordinary()).unwrap_err().code, "JSON_SCHEMA_RESOURCE_COLLISION");
    let array = obj(vec![("kind",s("array")),("items",Value::Array(vec![]))]);
    assert_eq!(js::admit_payload(&payload(array, obj(vec![])), &mut Context::ordinary()).unwrap_err().code, "JSON_SCHEMA_ROOT");
}

#[test]
fn walks_only_schema_positions_and_copies_get_results() {
    let child = tagged_object(vec![("type",tagged_string("string"))]);
    let properties = tagged_object(vec![("a/b~c",child.clone())]);
    let root = tagged_object(vec![
        ("properties",properties),
        ("contentSchema",child),
        ("dependentSchemas",tagged_object(vec![("when",obj(vec![("kind",s("boolean")),("value",Value::Bool(false))]))])),
        ("additionalItems",obj(vec![("kind",s("boolean")),("value",Value::Bool(false))])),
        ("default",tagged_object(vec![("properties",tagged_object(vec![]))])),
        ("enum",obj(vec![("kind",s("array")),("items",Value::Array(vec![]))])),
        ("unknownKeyword",tagged_object(vec![("properties",tagged_object(vec![]))])),
    ]);
    let p = js::admit_payload(&payload(root, obj(vec![])), &mut Context::ordinary()).unwrap();
    let positions = js::walk(&p, &mut Context::ordinary()).unwrap().into_iter().map(|x| x.pointer.to_utf8().unwrap()).collect::<Vec<_>>();
    assert_eq!(positions, vec!["", "/properties/a~1b~0c", "/contentSchema", "/dependentSchemas/when"]);
    let got = js::get_node(&p, &Utf16::from("/properties/a~1b~0c"), &mut Context::ordinary()).unwrap();
    assert!(matches!(got.root(), umf_core::native_json::NativeJsonNode::Object(_)));
}

#[test]
fn walk_and_get_keep_unpaired_utf16_pointer_units_and_representation_extras() {
    let lone = Utf16::new(vec![0xd800]);
    let child = Value::Object(vec![
        (Utf16::from("kind"), s("object")),
        (Utf16::from("members"), Value::Object(vec![])),
        (Utf16::from("future"), s("retained")),
    ]);
    let root = obj(vec![
        ("kind", s("object")),
        ("members", Value::Object(vec![
            (Utf16::from("properties"), obj(vec![("kind",s("object")),("members",Value::Object(vec![(lone.clone(),child)]))])),
        ])),
    ]);
    let p = js::admit_payload(&payload(root,obj(vec![])), &mut Context::ordinary()).unwrap();
    let positions = js::walk(&p, &mut Context::ordinary()).unwrap();
    let expected = Utf16::new("/properties/".encode_utf16().chain([0xd800]).collect());
    let position = positions.iter().find(|position| position.pointer == expected).expect("UTF-16 pointer retained");
    assert_eq!(position.node.render_tagged(&mut Context::ordinary()).unwrap_err().code, "NATIVE_JSON_REPRESENTATION");
    assert_eq!(js::get_node(&p, &expected, &mut Context::ordinary()).unwrap().render_tagged(&mut Context::ordinary()).unwrap_err().code, "NATIVE_JSON_REPRESENTATION");
}

#[test]
fn metering_limits_copies_and_empty_export_checks_cancellation() {
    let root = tagged_object(vec![("properties", tagged_object(vec![("deep", tagged_object(vec![("type",tagged_string("string"))]))]))]);
    let p = js::admit_payload(&payload(root,obj(vec![])), &mut Context::ordinary()).unwrap();
    let limits = Limits { max_values: 1, max_depth: 0, ..Limits::ordinary() };
    let mut limited = Context::with_limits(ResourceProfile::Cooperative,limits).unwrap();
    assert_eq!(js::get_node(&p,&Utf16::from("/properties/deep"),&mut limited).unwrap_err().code,"LIMIT");
    let mut cancel = || true;
    let mut cancelled = Context::ordinary().with_cancellation(&mut cancel);
    assert_eq!(js::export_resources(&p,&mut cancelled).unwrap_err().code,"CANCELLED");
    let with_resource = payload(tagged_object(vec![]),obj(vec![("https://example.test/r",tagged_object(vec![]))]));
    let mut cancel_admission = || true;
    let mut cancelled_admission = Context::ordinary().with_cancellation(&mut cancel_admission);
    assert_eq!(js::admit_payload(&with_resource,&mut cancelled_admission).unwrap_err().code,"CANCELLED");
}

#[test]
fn uses_whatwg_uri_admission_but_preserves_uninterpreted_schema_ids() {
    for bad in ["http://", "https://[bad", "https://a b"] {
        assert_eq!(js::admit_payload(&payload_at(tagged_object(vec![]),obj(vec![]),bad),&mut Context::ordinary()).unwrap_err().code,"JSON_SCHEMA_URI");
    }
    let urn = js::admit_payload(
        &payload_at(tagged_object(vec![]), obj(vec![]), "urn:y"),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(urn.base_uri, Utf16::from("urn:y"));

    for (base, id) in [("urn:x", "relative"), ("https://example.test/root", "https://[bad")] {
        let root = tagged_object(vec![("$id", tagged_string(id))]);
        let admitted = js::admit_payload(&payload_at(root,obj(vec![]),base),&mut Context::ordinary()).unwrap();
        assert!(js::export_root(&admitted,&mut Context::ordinary()).unwrap().to_utf8().unwrap().contains(id));
    }

    let resource = tagged_object(vec![("$id",tagged_string("urn:y"))]);
    let resources = obj(vec![("urn:x",resource.clone()),("urn:z",resource)]);
    let admitted = js::admit_payload(&payload(tagged_object(vec![]),resources),&mut Context::ordinary()).unwrap();
    assert_eq!(js::export_resources(&admitted,&mut Context::ordinary()).unwrap().len(),2);
    let duplicate_retrievals = Value::Object(vec![
        (Utf16::from("urn:x"),tagged_object(vec![])),
        (Utf16::from("urn:x"),tagged_object(vec![])),
    ]);
    assert_eq!(js::admit_payload(&payload(tagged_object(vec![]),duplicate_retrievals),&mut Context::ordinary()).unwrap_err().code,"JSON_SCHEMA_RESOURCE_COLLISION");
}

#[test]
fn output_newline_is_included_in_the_text_limit() {
    let p = js::admit_payload(&payload(obj(vec![("kind",s("boolean")),("value",Value::Bool(true))]),obj(vec![])),&mut Context::ordinary()).unwrap();
    let limits = Limits { max_text_units: 4, ..Limits::ordinary() };
    let mut ctx = Context::with_limits(ResourceProfile::Cooperative,limits).unwrap();
    assert_eq!(js::export_root(&p,&mut ctx).unwrap_err().code,"LIMIT");
}

#[test]
fn large_uri_is_metered_before_conversion_and_copy() {
    let base_uri = format!("https://example.test/{}", "x".repeat(2048));
    let input = payload_at(tagged_object(vec![]),obj(vec![]),&base_uri);
    let mut work = 0usize;
    let mut meter = |amount: usize| {
        work += amount;
        if work > 100 { Err(umf_core::EngineError::new("TEST_METER",Utf16::default(),"meter stopped")) } else { Ok(()) }
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    assert_eq!(js::admit_payload(&input,&mut ctx).unwrap_err().code,"TEST_METER");
}

#[test]
fn envelope_unknowns_are_copied_for_reading_but_block_every_export() {
    let p = js::admit_payload(&payload_with_extra(tagged_object(vec![]),obj(vec![])),&mut Context::ordinary()).unwrap();
    assert_eq!(p.representation_extras.len(),1);
    assert!(matches!(js::get_node(&p,&Utf16::default(),&mut Context::ordinary()).unwrap().root(),umf_core::native_json::NativeJsonNode::Object(_)));
    assert_eq!(js::walk(&p,&mut Context::ordinary()).unwrap().len(),1);
    assert_eq!(js::export_root(&p,&mut Context::ordinary()).unwrap_err().code,"JSON_SCHEMA_EXPORT");
    assert_eq!(js::export_resources(&p,&mut Context::ordinary()).unwrap_err().code,"JSON_SCHEMA_EXPORT");
    assert_eq!(js::export_bundle(&obj(vec![]),&p,&mut Context::ordinary()).unwrap_err().code,"JSON_SCHEMA_EXPORT");
}

#[test]
fn representation_safety_is_checked_across_root_and_all_resources() {
    let root_extra = js::admit_payload(&payload(tagged_object_with_extra(vec![]),obj(vec![])),&mut Context::ordinary()).unwrap();
    assert_eq!(js::export_resources(&root_extra,&mut Context::ordinary()).unwrap_err().code,"JSON_SCHEMA_EXPORT");

    let resource_extra = obj(vec![("https://example.test/r",tagged_object_with_extra(vec![]))]);
    let resource_payload = js::admit_payload(&payload(tagged_object(vec![]),resource_extra),&mut Context::ordinary()).unwrap();
    assert_eq!(js::export_root(&resource_payload,&mut Context::ordinary()).unwrap_err().code,"JSON_SCHEMA_EXPORT");
}

#[test]
fn envelope_extra_copy_obeys_meter_and_value_limits() {
    let input = payload_with_extra(tagged_object(vec![]),obj(vec![]));
    let mut calls = 0;
    let mut meter = |_: usize| { calls += 1; if calls > 1 { Err(umf_core::EngineError::new("TEST_METER",Utf16::default(),"stopped")) } else { Ok(()) } };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    assert_eq!(js::admit_payload(&input,&mut ctx).unwrap_err().code,"TEST_METER");

    let nested = obj(vec![("a",obj(vec![("b",Value::Bool(true))]))]);
    let Value::Object(mut fields) = payload(tagged_object(vec![]),obj(vec![])) else { unreachable!() };
    fields.push((Utf16::from("future"),nested));
    let limited_payload = Value::Object(fields);
    let limits = Limits { max_values: 2, ..Limits::ordinary() };
    let mut limited = Context::with_limits(ResourceProfile::Cooperative,limits).unwrap();
    assert_eq!(js::admit_payload(&limited_payload,&mut limited).unwrap_err().code,"LIMIT");
}

#[test]
fn document_lookup_validates_the_complete_envelope_and_exact_extension_version() {
    let payload_value = payload(tagged_object(vec![]),obj(vec![]));
    let element = obj(vec![("id",s("schema")),("extensions",obj(vec![("umf.json-schema",payload_value)]))]);
    let module = obj(vec![("id",s("schema")),("namespace",s("https://example.test/root")),("elements",Value::Array(vec![element]))]);
    let vocab = obj(vec![("umf.json-schema",obj(vec![("version",s("0.1.0"))]))]);
    let valid = obj(vec![("umf",s("0.10.0")),("id",s("doc")),("vocabularies",vocab),("modules",Value::Array(vec![module.clone()]))]);
    js::payload_from_document(&valid,&mut Context::ordinary()).unwrap();
    let invalid = obj(vec![("umf",s("0.10.0")),("id",s("doc")),("vocabularies",obj(vec![("umf.json-schema",obj(vec![("version",s("0.2.0"))]))])),("modules",Value::Array(vec![module.clone()]))]);
    assert_eq!(js::payload_from_document(&invalid,&mut Context::ordinary()).unwrap_err().code,"JSON_SCHEMA_VERSION");
    let duplicate_module = obj(vec![("umf",s("0.10.0")),("id",s("doc")),("vocabularies",obj(vec![("umf.json-schema",obj(vec![("version",s("0.1.0"))]))])),("modules",Value::Array(vec![module.clone(),module]))]);
    assert_eq!(js::payload_from_document(&duplicate_module,&mut Context::ordinary()).unwrap_err().code,"INVALID_DOCUMENT");
}
