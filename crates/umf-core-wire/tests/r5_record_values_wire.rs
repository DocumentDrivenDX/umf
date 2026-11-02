use umf_core::{serialization::{read_json_value, Format}, Context, Utf16, Value};
use umf_core_wire::{decode, encode, execute_request, transport_context};

fn parse(text: &str) -> Value {
    read_json_value(&text.encode_utf16().collect::<Vec<_>>(), Format::Json, &mut Context::ordinary()).unwrap()
}
fn text(s: &str) -> Value { Value::String(Utf16::from(s)) }
fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> { match v { Value::Object(m) => m.iter().find(|(k, _)| k == &Utf16::from(key)).map(|(_, v)| v), _ => None } }
fn array(v: &Value) -> &[Value] { match v { Value::Array(items) => items, _ => panic!("expected array") } }
fn resources() -> Value {
    Value::Object([
        (Utf16::from("coreSchema"), parse(include_str!("../../../spec/core/schema.json"))),
        (Utf16::from("referenceSchema"), parse(include_str!("../../../spec/core/semantic-type-reference.schema.json"))),
        (Utf16::from("packageSchema"), parse(include_str!("../../../spec/core/extension-package.schema.json"))),
        (Utf16::from("constraints"), parse(include_str!("../../../spec/metamodel/generated/core-constraints.json"))),
        (Utf16::from("domainPolicy"), parse(include_str!("../../../spec/metamodel/generated/domain-policy.json"))),
    ].into_iter().collect())
}

struct EmptyCaps;
impl umf_core::Capabilities for EmptyCaps {
    fn validate_extension(&mut self, _: u64, _: &Value, _: &umf_core::SemanticContext) -> Result<Vec<umf_core::Diagnostic>, Utf16> { Ok(Vec::new()) }
}

#[test]
fn tagged_operation_matches_frozen_success_refusal_and_utf16_cases() {
    let packet = parse(include_str!("../../../tests/rust-core/fixtures/r5-record-values/frozen-typescript.json"));
    let wire_cases = ["valid-present", "invalid-source-version", "sol-surrogate-present", "sol-array-record-identity"];
    for case in array(get(&packet, "cases").unwrap()).iter().filter(|case| {
        let id = match get(case, "id").unwrap() { Value::String(s) => s.to_utf8().unwrap(), _ => String::new() };
        wire_cases.contains(&id.as_str())
    }) {
        let source = get(case, "source").unwrap().clone();
        let identity = get(case, "identity").unwrap().clone();
        let values = get(case, "values").unwrap().clone();
        let fields = vec![
            (Utf16::from("op"), text("model/validateCoreRecordValues")),
            (Utf16::from("resources"), resources()),
            (Utf16::from("source"), source.clone()),
            (Utf16::from("identity"), identity),
            (Utf16::from("values"), values),
        ];
        let request = encode(&Value::Object(fields.into_iter().collect()), &mut transport_context()).unwrap();
        let response = parse(&execute_request(&request, umf_core::ResourceProfile::Cooperative, &mut EmptyCaps));
        let case_id = get(case, "id").unwrap();
        if let Some(expected_error) = get(case, "thrown") {
            assert_eq!(get(&response, "status"), Some(&text("error")), "case {case_id:?}");
            assert_eq!(get(&response, "code"), get(expected_error, "code"), "case {case_id:?}");
            let path = match get(expected_error, "path").unwrap() { Value::String(s) => s, _ => panic!("path string expected") };
            let units = Value::Array(path.units().iter().map(|n| Value::Number(*n as f64)).collect());
            assert_eq!(get(&response, "pathUnits"), Some(&units), "case {case_id:?}");
        } else {
            assert_eq!(get(&response, "status"), Some(&text("ok")), "case {case_id:?}");
            let wire = match get(&response, "wire").unwrap() { Value::String(s) => s.to_utf8().unwrap(), _ => panic!("wire string expected") };
            let actual = decode(&wire, &mut transport_context()).unwrap();
            assert_eq!(actual, *get(case, "result").unwrap(), "case {case_id:?}");
        }
        assert_eq!(source, get(case, "source").unwrap().clone(), "source copy case {case_id:?}");
    }
}
