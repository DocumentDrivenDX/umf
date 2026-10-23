// SPDX-License-Identifier: MIT OR Apache-2.0
//! Emit actual Rust R5 field-value results for independent schema validation.
use umf_core::{
    engine::{Engine, ResourceSet},
    serialization::{read_json_value, write_json_value, Format},
    Context, Utf16, Value,
};

fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .expect("JSON")
}
fn get<'a>(value: &'a Value, name: &str) -> &'a Value {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
            .expect("fixture member"),
        _ => panic!("object"),
    }
}
fn string(value: &Utf16) -> Value {
    Value::String(value.clone())
}
fn main() {
    let resource = |source| parse(source);
    let engine = Engine::new(
        ResourceSet::new(
            resource(include_str!("../../../spec/core/schema.json")),
            resource(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            resource(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            resource(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            resource(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .expect("engine");
    let fixture = parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-field-value/frozen-typescript.json"));
    let mut outputs = Vec::new();
    let Value::Array(cases) = get(&fixture, "cases") else {
        panic!("cases")
    };
    for case in cases {
        let source = match case {
            Value::Object(fields) => fields
                .iter()
                .find(|(key, _)| key == &Utf16::from("source"))
                .map(|(_, source)| source)
                .unwrap_or_else(|| get(&fixture, "source")),
            _ => unreachable!(),
        };
        let result = engine.validate_core_field_value_public(
            source,
            get(case, "identity"),
            get(case, "value"),
            &mut Context::ordinary(),
        );
        if let Err(error) = result {
            assert_eq!(
                error.code, "TYPE_ERROR",
                "only the frozen TypeError control may throw"
            );
            outputs.push(Value::Object(vec![
                (Utf16::from("id"), get(case, "id").clone()),
                (
                    Utf16::from("thrown"),
                    Value::Object(vec![
                        (Utf16::from("name"), Value::string_utf8("TypeError")),
                        (Utf16::from("message"), string(&error.message)),
                    ]),
                ),
            ]));
            continue;
        }
        let result = result.unwrap();
        let diagnostics = result
            .diagnostics
            .iter()
            .map(|d| {
                Value::Object(vec![
                    (Utf16::from("code"), string(&d.code)),
                    (Utf16::from("path"), string(&d.path)),
                    (Utf16::from("message"), string(&d.message)),
                    (
                        Utf16::from("severity"),
                        string(&Utf16::from(match d.severity {
                            umf_core::error::Severity::Error => "error",
                            umf_core::error::Severity::Warning => "warning",
                        })),
                    ),
                ])
            })
            .collect();
        outputs.push(Value::Object(vec![
            (Utf16::from("id"), get(case, "id").clone()),
            (
                Utf16::from("result"),
                Value::Object(vec![
                    (Utf16::from("valid"), Value::Bool(result.valid)),
                    (Utf16::from("complete"), Value::Bool(result.complete)),
                    (Utf16::from("diagnostics"), Value::Array(diagnostics)),
                ]),
            ),
        ]));
    }
    let encoded = write_json_value(
        &Value::Array(outputs),
        Format::Json,
        &mut Context::ordinary(),
    )
    .expect("serialize");
    println!("{}", String::from_utf16(encoded.units()).expect("UTF-16"));
}
