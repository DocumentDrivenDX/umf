// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
    serialization::{Format, read_json_value},
};
use umf_core_wire::{decode, encode, execute_request, transport_context};
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
fn parse(s: &str) -> Value {
    read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn get_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    match v {
        Value::Object(m) => m
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from(n))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn element_mut<'a>(source: &'a mut Value, module: usize, element: usize) -> &'a mut Value {
    let Value::Array(modules) = get_mut(source, "modules").unwrap() else {
        panic!("modules")
    };
    let Value::Array(elements) = get_mut(&mut modules[module], "elements").unwrap() else {
        panic!("elements")
    };
    &mut elements[element]
}
fn set(v: &mut Value, n: &str, next: Value) {
    let Value::Object(m) = v else {
        panic!("object")
    };
    let key = Utf16::from(n);
    if let Some((_, old)) = m.iter_mut().find(|(k, _)| k == &key) {
        *old = next
    } else {
        m.push((key, next));
    }
}
fn resources() -> Value {
    Value::Object(vec![
        (
            "coreSchema".into(),
            parse(include_str!("../../../spec/core/schema.json")),
        ),
        (
            "referenceSchema".into(),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
        ),
        (
            "packageSchema".into(),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
        ),
        (
            "constraints".into(),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
        ),
        (
            "domainPolicy".into(),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
    ])
}
fn request(op: &str, args: &[(&str, &Value)]) -> String {
    let mut fields = vec![
        ("op".into(), Value::String(op.into())),
        ("resources".into(), resources()),
        ("registry".into(), Value::Array(Vec::new())),
    ];
    fields.extend(args.iter().map(|(n, v)| (Utf16::from(*n), (*v).clone())));
    encode(&Value::Object(fields), &mut transport_context()).unwrap()
}
fn run(op: &str, args: &[(&str, &Value)]) -> (serde_json::Value, Option<Value>) {
    let mut caps = NoCapabilities;
    let out = execute_request(&request(op, args), ResourceProfile::Cooperative, &mut caps);
    let response: serde_json::Value = serde_json::from_str(&out).unwrap();
    let value = if response["status"] == "ok" {
        Some(decode(response["wire"].as_str().unwrap(), &mut transport_context()).unwrap())
    } else {
        None
    };
    (response, value)
}
fn run_value(request: Value) -> serde_json::Value {
    let mut caps = NoCapabilities;
    let wire = encode(&request, &mut transport_context()).unwrap();
    serde_json::from_str(&execute_request(
        &wire,
        ResourceProfile::Cooperative,
        &mut caps,
    ))
    .unwrap()
}
fn authors(source: &Value) -> (Value, Value) {
    let field_identity = Value::Object(vec![
        ("module".into(), Value::String("sales".into())),
        ("element".into(), Value::String("slot".into())),
    ]);
    let (response, field) = run(
        "model/declareCoreKind",
        &[
            ("source", source),
            ("identity", &field_identity),
            ("kind", &Value::String("field".into())),
        ],
    );
    assert_eq!(response["status"], "ok", "field author: {response}");
    let field = field.unwrap();
    let field_target = get(&field, "target").unwrap();
    let record_identity = Value::Object(vec![
        ("module".into(), Value::String("sales".into())),
        ("element".into(), Value::String("child".into())),
    ]);
    let (response, record) = run(
        "model/declareCoreKind",
        &[
            ("source", field_target),
            ("identity", &record_identity),
            ("kind", &Value::String("record".into())),
        ],
    );
    assert_eq!(response["status"], "ok", "record author: {response}");
    (field, record.unwrap())
}
fn eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| eq(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter().all(|(k, v)| {
                    b.iter()
                        .find(|(x, _)| x == k)
                        .is_some_and(|(_, w)| eq(v, w))
                })
        }
        _ => a == b,
    }
}
fn assert_error(response: &serde_json::Value, expected: &Value) {
    let error = get(expected, "error").unwrap();
    let text = |name: &str| match get(error, name).unwrap() {
        Value::String(s) => s.units().to_vec(),
        _ => panic!("string"),
    };
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], String::from_utf16_lossy(&text("code")));
    assert_eq!(response["messageUnits"], serde_json::json!(text("message")));
    assert_eq!(response["pathUnits"], serde_json::json!(text("path")));
}
#[test]
fn frozen_record_type_declare_verify_and_refusals() {
    let packet = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-core-record-type/frozen-typescript.json"
    ));
    let successes = get(&packet, "successes").unwrap();
    for variant in ["nested", "recursive", "qualified"] {
        let base = get(successes, &format!("declare-{variant}")).unwrap();
        let (response, actual) = run(
            "model/declareCoreRecordType",
            &[
                ("fieldAuthor", get(base, "fieldAuthor").unwrap()),
                ("recordAuthor", get(base, "recordAuthor").unwrap()),
            ],
        );
        assert_eq!(response["status"], "ok", "{variant}: {response}");
        let actual = actual.unwrap();
        assert!(
            eq(&actual, base),
            "{variant}: declaration differs from frozen TS envelope"
        );
        let (response, verified) = run(
            "model/verifyCoreRecordTypeDeclaration",
            &[
                ("receipt", &actual),
                ("current", get(&actual, "target").unwrap()),
            ],
        );
        assert_eq!(response["status"], "ok", "{variant}: {response}");
        assert!(eq(
            &verified.unwrap(),
            get(successes, &format!("verify-{variant}")).unwrap()
        ));
    }
    let refusals = get(&packet, "refusals").unwrap();
    for (name, field_name, record_name) in [("wrongAuthorOrder", "recordAuthor", "fieldAuthor")] {
        let (response, _) = run(
            "model/declareCoreRecordType",
            &[
                (
                    "fieldAuthor",
                    get(get(successes, "declare-nested").unwrap(), field_name).unwrap(),
                ),
                (
                    "recordAuthor",
                    get(get(successes, "declare-nested").unwrap(), record_name).unwrap(),
                ),
            ],
        );
        let expected = get(refusals, name).unwrap();
        assert_error(&response, expected);
    }
    let mut malformed = get(successes, "declare-nested").unwrap().clone();
    if let Value::Object(fields) = &mut malformed {
        fields.retain(|(key, _)| key != &Utf16::from("reference"));
    }
    let (response, _) = run(
        "model/verifyCoreRecordTypeDeclaration",
        &[
            ("receipt", &malformed),
            (
                "current",
                get(get(successes, "declare-nested").unwrap(), "target").unwrap(),
            ),
        ],
    );
    assert_error(&response, get(refusals, "malformedReceipt").unwrap());
    let mut tampered = get(successes, "declare-nested").unwrap().clone();
    set(
        get_mut(&mut tampered, "provenance").unwrap(),
        "recordPath",
        Value::String("/forged".into()),
    );
    let current = get(get(successes, "declare-nested").unwrap(), "target").unwrap();
    let (response, _) = run(
        "model/verifyCoreRecordTypeDeclaration",
        &[("receipt", &tampered), ("current", current)],
    );
    assert_error(&response, get(refusals, "tamperedReceipt").unwrap());
    let mut stale = current.clone();
    set(&mut stale, "future", Value::Bool(true));
    let receipt = get(successes, "declare-nested").unwrap();
    let (response, _) = run(
        "model/verifyCoreRecordTypeDeclaration",
        &[("receipt", receipt), ("current", &stale)],
    );
    assert_error(&response, get(refusals, "staleCurrent").unwrap());

    let source = get(get(successes, "declare-nested").unwrap(), "source").unwrap();
    for (case, expected_name) in ["scalar", "facets", "existing"].into_iter().zip([
        "scalarConflict",
        "facetsConflict",
        "existingRecordTypeReference",
    ]) {
        let mut candidate = source.clone();
        let field = element_mut(&mut candidate, 0, 1);
        match case {
            "scalar" => set(field, "scalarType", Value::String("string".into())),
            "facets" => {
                if let Value::Object(m) = field {
                    m.retain(|(k, _)| k != &Utf16::from("references"));
                }
                set(field, "scalarType", Value::String("integer".into()));
                set(
                    field,
                    "facets",
                    Value::Object(vec![(
                        "integerWidth".into(),
                        Value::Object(vec![
                            ("bits".into(), Value::Number(64.0)),
                            ("signed".into(), Value::Bool(true)),
                        ]),
                    )]),
                );
            }
            "existing" => {
                let refs = get_mut(field, "references").unwrap();
                let Value::Array(refs) = refs else {
                    panic!("references")
                };
                refs.push(Value::Object(vec![
                    ("role".into(), Value::String("record-type".into())),
                    ("module".into(), Value::String("sales".into())),
                    ("element".into(), Value::String("child".into())),
                ]));
            }
            _ => unreachable!(),
        }
        let (field, record) = authors(&candidate);
        let (response, _) = run(
            "model/declareCoreRecordType",
            &[("fieldAuthor", &field), ("recordAuthor", &record)],
        );
        assert_error(&response, get(refusals, expected_name).unwrap());
    }
    let mut container = source.clone();
    if let Value::Array(modules) = get_mut(&mut container, "modules").unwrap() {
        if let Value::Array(elements) = get_mut(&mut modules[0], "elements").unwrap() {
            elements.push(Value::Object(vec![
                ("id".into(), Value::String("item".into())),
                ("kind".into(), Value::String("field".into())),
                ("extensions".into(), Value::Object(vec![])),
            ]));
        }
    }
    let slot = element_mut(&mut container, 0, 1);
    set(slot, "cardinality", Value::String("array".into()));
    set(
        slot,
        "itemType",
        Value::Object(vec![
            ("module".into(), Value::String("sales".into())),
            ("element".into(), Value::String("item".into())),
        ]),
    );
    let (field, record) = authors(&container);
    let (response, _) = run(
        "model/declareCoreRecordType",
        &[("fieldAuthor", &field), ("recordAuthor", &record)],
    );
    assert_error(&response, get(refusals, "containerDirectType").unwrap());
}

#[test]
fn record_type_wire_requires_closed_request_exact_resources_and_empty_registry() {
    let base = decode(
        &request(
            "model/declareCoreRecordType",
            &[
                ("fieldAuthor", &Value::Null),
                ("recordAuthor", &Value::Null),
            ],
        ),
        &mut transport_context(),
    )
    .unwrap();
    let mut extra = base.clone();
    if let Value::Object(fields) = &mut extra {
        fields.push(("unexpected".into(), Value::Bool(true)));
    }
    let response = run_value(extra);
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "REQUEST");
    let mut registry = base.clone();
    if let Value::Object(fields) = &mut registry {
        if let Some((_, v)) = fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("registry"))
        {
            *v = Value::Array(vec![Value::Null]);
        }
    }
    let response = run_value(registry);
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "REQUEST");
    let mut missing = base;
    if let Some(resources) = get_mut(&mut missing, "resources") {
        if let Value::Object(fields) = resources {
            fields.retain(|(k, _)| k != &Utf16::from("domainPolicy"));
        }
    }
    let response = run_value(missing);
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "REQUEST");
}
