// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{Context, EngineError, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn tagged_object(fields: Vec<(&str, Value)>) -> Value {
    object(vec![
        ("kind", Value::string_utf8("object")),
        (
            "members",
            Value::Object(
                fields
                    .into_iter()
                    .map(|(key, value)| (Utf16::from(key), value))
                    .collect(),
            ),
        ),
    ])
}

fn tagged_string(value: &str) -> Value {
    object(vec![
        ("kind", Value::string_utf8("string")),
        ("value", Value::string_utf8(value)),
    ])
}

fn tagged_array(items: Vec<Value>) -> Value {
    object(vec![
        ("kind", Value::string_utf8("array")),
        ("items", Value::Array(items)),
    ])
}

fn request(root: Value, dependencies: Vec<Value>) -> String {
    umf_core_wire::encode(
        &object(vec![
            ("op", Value::string_utf8("avro.schema.inspect")),
            ("root", root),
            ("dependencies", Value::Array(dependencies)),
        ]),
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn dependency(id: &str, root: Value) -> Value {
    object(vec![("id", Value::string_utf8(id)), ("root", root)])
}

fn run(wire: &str) -> serde_json::Value {
    serde_json::from_str(&umf_core_wire::execute_avro_inspect_wire(wire)).unwrap()
}

fn output(envelope: &serde_json::Value) -> Value {
    umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("object expected")
    };
    &fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .unwrap()
        .1
}

fn codes(value: &Value) -> Vec<String> {
    let Value::Array(items) = member(value, "diagnostics") else {
        panic!("array expected")
    };
    items
        .iter()
        .map(|item| match member(item, "code") {
            Value::String(code) => code.to_utf8().unwrap(),
            _ => panic!("code expected"),
        })
        .collect()
}

#[test]
fn ordered_dependencies_resolve_names_and_profile_stays_incomplete() {
    let dep = tagged_object(vec![
        ("type", tagged_string("record")),
        ("name", tagged_string("Thing")),
        ("namespace", tagged_string("demo")),
        ("fields", tagged_array(vec![])),
    ]);
    let root = tagged_string("demo.Thing");
    let request = request(root, vec![dependency("schema-dep", dep.clone())]);
    let decoded = umf_core_wire::decode(&request, &mut Context::ordinary()).unwrap();
    assert_eq!(
        member(&decoded, "dependencies"),
        &Value::Array(vec![dependency("schema-dep", dep)])
    );
    let Value::Array(items) = member(&decoded, "dependencies") else {
        panic!("dependencies array expected")
    };
    let Value::Object(fields) = &items[0] else {
        panic!("dependency object expected")
    };
    let dep_value = &fields
        .iter()
        .find(|(k, _)| k == &Utf16::from("root"))
        .unwrap()
        .1;
    umf_core::native_json::NativeJsonTree::from_tagged_value(dep_value, &mut Context::ordinary())
        .unwrap();
    let envelope = run(&request);
    assert_eq!(envelope["status"], "ok", "{envelope:?}");
    let result = output(&envelope);
    assert_eq!(member(&result, "valid"), &Value::Bool(true));
    assert_eq!(member(&result, "complete"), &Value::Bool(false));
    assert_eq!(codes(&result), vec!["AVRO_PROFILE_LIMIT"]);
}

#[test]
fn unresolved_names_are_explicit_errors_with_incomplete_profile() {
    let result = output(&run(&request(tagged_string("missing.Type"), vec![])));
    assert_eq!(member(&result, "valid"), &Value::Bool(false));
    assert_eq!(member(&result, "complete"), &Value::Bool(false));
    assert_eq!(
        codes(&result),
        vec!["AVRO_UNRESOLVED_NAME", "AVRO_PROFILE_LIMIT"]
    );
}

#[test]
fn duplicate_dependency_ids_are_rejected_before_inspection() {
    let schema = tagged_string("string");
    let envelope = run(&request(
        tagged_string("string"),
        vec![
            dependency("same", schema.clone()),
            dependency("same", schema),
        ],
    ));
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "AVRO_DEPENDENCY_ID");
}

#[test]
fn host_budget_covers_inspection_and_unknown_operation_is_refused() {
    let wire = request(tagged_string("string"), vec![]);
    let mut stop =
        |_amount: usize| Err(EngineError::new("HOST_BUDGET", Utf16::default(), "stopped"));
    let envelope: serde_json::Value = serde_json::from_str(
        &umf_core_wire::execute_avro_inspect_wire_with_control(&wire, &mut stop),
    )
    .unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "HOST_BUDGET");
    let unknown = umf_core_wire::encode(
        &object(vec![
            ("op", Value::string_utf8("avro.schema.export")),
            ("root", tagged_string("string")),
        ]),
        &mut Context::ordinary(),
    )
    .unwrap();
    let envelope = run(&unknown);
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "REQUEST");
}
