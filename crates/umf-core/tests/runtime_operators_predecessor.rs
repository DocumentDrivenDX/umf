// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-089-AC19, US-089-AC20, US-089-AC22, US-089-AC24
use umf_core::{
    constraints::{execute_constraints, prepare_program},
    schema::{CompiledSchema, SchemaResources},
    Context, Diagnostic, Limits, Registry, ResourceProfile, Severity, Utf16, Value,
};

const ORACLE: &str = include_str!(
    "../../../docs/helix/04-build/evidence/rust-migration/r2/sol-runtime-operators-predecessor.json"
);

fn parse(source: &str) -> Value {
    let mut limits = Limits::ordinary();
    limits.max_text_units = 10_000_000;
    limits.max_values = 1_000_000;
    umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::with_limits(ResourceProfile::Cooperative, limits).unwrap(),
    )
    .unwrap()
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
            .unwrap_or_else(|| panic!("missing field {name}")),
        _ => panic!("expected object field {name}"),
    }
}

fn array(value: &Value) -> &[Value] {
    match value {
        Value::Array(items) => items,
        _ => panic!("expected array"),
    }
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn variable(name: &str) -> Value {
    object(vec![("var", Value::string_utf8(name))])
}

fn operation(name: &str, args: Vec<Value>) -> Value {
    object(vec![
        ("op", Value::string_utf8(name)),
        ("args", Value::Array(args)),
    ])
}

fn emit(code: &str, message: Value) -> Value {
    object(vec![
        ("op", Value::string_utf8("emit")),
        (
            "diagnostic",
            object(vec![
                ("code", Value::string_utf8(code)),
                ("path", Value::string_utf8("")),
                ("message", message),
                ("severity", Value::string_utf8("error")),
            ]),
        ),
    ])
}

fn diagnostic(value: &Value) -> Diagnostic {
    let field = |name| match member(value, name) {
        Value::String(text) => text.clone(),
        _ => panic!("callback diagnostic {name} is not a string"),
    };
    let severity = match field("severity").to_utf8().unwrap().as_str() {
        "warning" => Severity::Warning,
        "error" => Severity::Error,
        other => panic!("unexpected severity {other:?}"),
    };
    Diagnostic {
        code: field("code"),
        path: field("path"),
        message: field("message"),
        severity,
        python_text_origin: None,
        python_source_path: false,
    }
}

fn value_of_diagnostic(value: &Diagnostic) -> Value {
    object(vec![
        ("code", Value::String(value.code.clone())),
        ("path", Value::String(value.path.clone())),
        ("message", Value::String(value.message.clone())),
        (
            "severity",
            Value::string_utf8(if value.severity == Severity::Error {
                "error"
            } else {
                "warning"
            }),
        ),
    ])
}

struct FrozenCallback(Vec<Diagnostic>);
impl umf_core::Capabilities for FrozenCallback {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &umf_core::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(self.0.clone())
    }
}

#[test]
fn retained_typescript_runtime_operator_matrix_matches_all_frozen_cases() {
    let fixture_value = parse(ORACLE);
    assert_eq!(
        member(&fixture_value, "profile"),
        &Value::string_utf8("umf.sol-retained-ts-runtime-operators/1")
    );
    assert_eq!(array(member(&fixture_value, "cases")).len(), 6271);
    let manifest = member(&fixture_value, "manifest");
    let schema_resources = SchemaResources::default();
    let package_schema = CompiledSchema::compile(
        &Value::Bool(true),
        &schema_resources,
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut registry = Registry::new();
    registry
        .register(
            manifest,
            Some(1),
            &package_schema,
            &schema_resources,
            &mut Context::ordinary(),
        )
        .unwrap();
    let callback = FrozenCallback(
        array(member(&fixture_value, "callbackDiagnostics"))
            .iter()
            .map(diagnostic)
            .collect(),
    );

    let mut mismatches = Vec::new();
    let mut mismatch_count = 0usize;
    for case_value in array(member(&fixture_value, "cases")) {
        let case_id = match member(case_value, "id") {
            Value::String(id) => id.to_utf8().unwrap(),
            _ => panic!("case id is not a string"),
        };
        let mut steps = array(member(&fixture_value, "setup")).to_vec();
        steps.push(object(vec![
            ("op", Value::string_utf8("let")),
            ("name", Value::string_utf8("result")),
            ("value", member(case_value, "expression").clone()),
        ]));
        steps.push(emit(
            "CANONICAL",
            operation(
                "canonical",
                vec![operation("tuple", vec![variable("result")])],
            ),
        ));
        steps.push(emit(
            "STRING",
            operation("concat", vec![variable("result")]),
        ));
        steps.push(emit(
            "TRUTH",
            operation("concat", vec![operation("not", vec![variable("result")])]),
        ));
        let program = object(vec![
            ("profile", Value::string_utf8("umf.constraints/1")),
            ("steps", Value::Array(steps)),
        ]);
        let prepared = prepare_program(&program, &mut Context::ordinary())
            .unwrap_or_else(|error| panic!("{case_id}: prepare failed: {error:?}"));
        let actual = execute_constraints(
            member(&fixture_value, "document"),
            &prepared,
            member(&fixture_value, "policy"),
            &registry,
            &mut FrozenCallback(callback.0.clone()),
            &mut Context::ordinary(),
        )
        .unwrap_or_else(|error| panic!("{case_id}: execution failed: {error:?}"));
        let actual = Value::Array(actual.iter().map(value_of_diagnostic).collect());
        let expected = member(member(case_value, "expected"), "diagnostics");
        if &actual != expected {
            mismatch_count += 1;
            if mismatches.len() < 25 {
                mismatches.push(format!(
                    "{case_id}: expected {expected:?}, actual {actual:?}"
                ));
            }
        }
    }
    assert!(
        mismatches.is_empty(),
        "{mismatch_count} mismatches; first cases:\n{}",
        mismatches.join("\n")
    );
}
