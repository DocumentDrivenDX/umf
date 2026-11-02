// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    csv_boolean_lexical::{
        prepare_csv_boolean_lexical_verification, validate_csv_boolean_lexical,
        verify_csv_boolean_lexical,
    },
    engine::{Engine, ResourceSet},
    serialization::{read_json_value, Format},
    Context, Utf16, Value,
};
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
        Value::Object(f) => f.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn get_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    match v {
        Value::Object(f) => f
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from(n))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn engine() -> Engine {
    Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn source() -> Value {
    parse(include_str!(
        "../../../spec/domain-packs/medical/ontology.json"
    ))
}
fn request(token: &str) -> Value {
    parse(&format!(
        r#"{{"profile":"umf.csv-boolean-lexical/1.0.0","field":{{"module":"domain","element":"patients.active"}},"token":"{token}","sourceContext":{{"source":"original.csv","row":1,"unknown":["雪",null]}}}}"#
    ))
}
#[test]
fn finite_tokens_preserve_source_request_and_public_field_verdict() {
    let e = engine();
    for (t, b) in [
        ("true", true),
        ("True", true),
        ("false", false),
        ("False", false),
    ] {
        let s = source();
        let r = request(t);
        let mut c = Context::ordinary();
        let out = validate_csv_boolean_lexical(&s, &r, &e, &mut c).unwrap();
        assert_eq!(
            get(get(&out, "value").unwrap(), "boolean"),
            Some(&Value::Bool(b))
        );
        assert_eq!(get(&out, "source"), Some(&s));
        assert_eq!(get(&out, "request"), Some(&r));
        assert_eq!(
            get(&out, "provenance"),
            Some(&Value::string_utf8("unverified"))
        );
        let verified =
            verify_csv_boolean_lexical(&out, &s, &r, &e, &mut Context::ordinary()).unwrap();
        assert_eq!(verified, out);
    }
}
#[test]
fn rejects_unsupported_tokens_wrong_field_and_forged_receipt() {
    let e = engine();
    let s = source();
    for t in ["TRUE", " true", "true ", "1", ""] {
        let mut r = request(t);
        if t.is_empty() {
            if let Value::Object(fields) = &mut r {
                fields.retain(|(k, _)| k != &Utf16::from("token"));
            }
        }
        assert!(validate_csv_boolean_lexical(&s, &r, &e, &mut Context::ordinary()).is_err());
    }
    let mut r = request("true");
    if let Value::Object(fields) = &mut r {
        if let Some((_, v)) = fields.iter_mut().find(|(k, _)| k == &Utf16::from("field")) {
            *v = parse(r#"{"module":"domain","element":"patients.birth_date"}"#);
        }
    }
    assert!(validate_csv_boolean_lexical(&s, &r, &e, &mut Context::ordinary()).is_err());
    let good =
        validate_csv_boolean_lexical(&s, &request("true"), &e, &mut Context::ordinary()).unwrap();
    let forged = parse(
        r#"{"operation":"validate-csv-boolean-lexical","version":"1.0.0","source":null,"request":{},"value":{"boolean":false},"validation":{"valid":true,"complete":true,"diagnostics":[]},"provenance":"unverified","extra":true}"#,
    );
    assert!(verify_csv_boolean_lexical(
        &forged,
        &s,
        &request("true"),
        &e,
        &mut Context::ordinary()
    )
    .is_err());
    assert!(
        verify_csv_boolean_lexical(&good, &s, &request("False"), &e, &mut Context::ordinary())
            .is_err()
    );
}

#[test]
fn receipt_source_schema_admission_precedes_independent_expected_inputs() {
    let e = engine();
    let s = source();
    let mut good =
        validate_csv_boolean_lexical(&s, &request("true"), &e, &mut Context::ordinary()).unwrap();
    // Unknown extension payload is structurally admitted and retained by the
    // receipt schema; preparing a receipt must not apply semantic interpretation.
    if let Value::Object(fields) = get_mut(&mut good, "source").unwrap() {
        fields.push((
            Utf16::from("extensions"),
            parse(r#"{"futureExtension":{"opaque":[true,"retained"]}}"#),
        ));
    }
    let prepared =
        prepare_csv_boolean_lexical_verification(&good, &e, &mut Context::ordinary()).unwrap();
    assert_eq!(
        get(get(&prepared, "source").unwrap(), "extensions"),
        get(get(&good, "source").unwrap(), "extensions")
    );
    let mut duplicate = good.clone();
    let modules = get_mut(get_mut(&mut duplicate, "source").unwrap(), "modules").unwrap();
    let Value::Array(modules) = modules else {
        panic!("modules array")
    };
    let elements = get_mut(&mut modules[0], "elements").unwrap();
    let Value::Array(elements) = elements else {
        panic!("elements array")
    };
    elements.push(elements[0].clone());
    let bad_request = request("TRUE");
    let error =
        verify_csv_boolean_lexical(
            &duplicate,
            &parse("{}"),
            &bad_request,
            &e,
            &mut Context::ordinary(),
        )
            .unwrap_err();
    assert_eq!(error.code, "CSV_BOOLEAN_LEXICAL");
    assert_eq!(
        error.message,
        Utf16::from("Expected explicit closed Boolean lexical profile request")
    );

    let mut malformed_validation = good.clone();
    *get_mut(
        get_mut(&mut malformed_validation, "validation").unwrap(),
        "valid",
    )
    .unwrap() = Value::string_utf8("true");
    let error = prepare_csv_boolean_lexical_verification(
        &malformed_validation,
        &e,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(error.code, "CSV_BOOLEAN_LEXICAL");
    assert_eq!(error.message, Utf16::from("Malformed Boolean lexical receipt"));
}

#[test]
fn final_receipt_copy_enforces_envelope_depth_and_control_failure_provenance() {
    let e = engine();
    let s = source();
    let mut deep_request = request("true");
    let mut nested = Value::Null;
    for _ in 0..127 {
        nested = Value::Array(vec![nested]);
    }
    *get_mut(&mut deep_request, "sourceContext").unwrap() = nested;
    let error =
        validate_csv_boolean_lexical(&s, &deep_request, &e, &mut Context::ordinary()).unwrap_err();
    assert_eq!(error.code, "LIMIT");

    let receipt =
        validate_csv_boolean_lexical(&s, &request("true"), &e, &mut Context::ordinary()).unwrap();
    let mut copy_context = Context::ordinary();
    umf_core::copy_json(&receipt, &mut copy_context).unwrap();
    let threshold = copy_context.charged_work();
    let mut used = 0u64;
    let mut meter = |amount: usize| {
        used += amount as u64;
        if used > threshold {
            Err(umf_core::EngineError::new(
                "HOST_FAILURE",
                Utf16::from("/host"),
                "sentinel",
            ))
        } else {
            Ok(())
        }
    };
    let error = verify_csv_boolean_lexical(
        &receipt,
        &s,
        &request("true"),
        &e,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "HOST_FAILURE");
    assert!(error.is_control_failure());
}
