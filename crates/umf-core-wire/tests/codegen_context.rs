#![cfg(feature = "codegen")]

use umf_core::{
    Capabilities, Context, Diagnostic, EngineError, ResourceProfile, SemanticContext, Utf16, Value,
};

fn json(source: &str) -> Value {
    umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("object expected")
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .expect("fixture member")
}

fn resources() -> Value {
    let tables = json(include_str!(
        "../../../python/umf_codegen/src/umf_codegen/_resources/tables.package.json"
    ));
    let actions = json(include_str!(
        "../../../python/umf_codegen/src/umf_codegen/_resources/actions.package.json"
    ));
    Value::Object(vec![
        (
            Utf16::from("coreSchema"),
            json(include_str!("../../../spec/core/schema.json")),
        ),
        (
            Utf16::from("referenceSchema"),
            json(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
        ),
        (
            Utf16::from("packageSchema"),
            json(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
        ),
        (
            Utf16::from("constraints"),
            json(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
        ),
        (
            Utf16::from("domainPolicy"),
            json(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        (Utf16::from("tablesPackage"), tables.clone()),
        (Utf16::from("actionsPackage"), actions.clone()),
        (
            Utf16::from("bindingPackage"),
            json(include_str!(
                "../../../python/umf_codegen/src/umf_codegen/_resources/binding.package.json"
            )),
        ),
        (
            Utf16::from("stableBindingPackage"),
            json(include_str!(
                "../../../python/umf_codegen/src/umf_codegen/_resources/stable-binding.package.json"
            )),
        ),
    ])
}

fn ordinary_request() -> Value {
    Value::Object(vec![
        (
            Utf16::from("op"),
            Value::string_utf8("codegen/singleSetCapabilities"),
        ),
        (Utf16::from("resources"), resources()),
        (Utf16::from("request"), Value::Object(Vec::new())),
    ])
}

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

#[test]
fn ordinary_codegen_wire_shares_meter_from_decode_through_encode() {
    let request = ordinary_request();
    let wire = umf_core_wire::encode(&request, &mut umf_core_wire::transport_context()).unwrap();
    let mut capability = NoCapabilities;
    let mut total = 0usize;
    let mut meter = |amount: usize| {
        total = total.saturating_add(amount);
        Ok(())
    };
    let response = umf_core_wire::execute_request_with_control(
        &wire,
        ResourceProfile::Cooperative,
        &mut capability,
        &mut meter,
    );
    let envelope: serde_json::Value = serde_json::from_str(&response).unwrap();
    assert_eq!(envelope["status"], "ok");
    let output_wire = envelope["wire"].as_str().expect("encoded codegen outcome");
    let decoded = umf_core_wire::decode(output_wire, &mut Context::ordinary()).unwrap();
    assert_eq!(member(&decoded, "ok"), &Value::Bool(true));
    let cumulative = total;
    assert!(
        cumulative > 1_000_000,
        "fixture should cross multiple phases"
    );

    let mut capability = NoCapabilities;
    let mut total = 0usize;
    let budget = cumulative - 1;
    let mut meter = |amount: usize| {
        total = total.saturating_add(amount);
        if total > budget {
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "host work budget exceeded",
            ))
        } else {
            Ok(())
        }
    };
    let response = umf_core_wire::execute_request_with_control(
        &wire,
        ResourceProfile::Cooperative,
        &mut capability,
        &mut meter,
    );
    let envelope: serde_json::Value = serde_json::from_str(&response).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "RESOURCE_LIMIT");
    assert!(total > budget);

    // Frozen late-phase controls: the same cumulative counter reaches the
    // end of resource compilation and operation work, then still guards
    // response transport. These used to escape through fresh phase contexts.
    for (code, message) in [("CANCELLED", "host cancelled"), ("DEADLINE", "deadline elapsed")] {
        let mut capability = NoCapabilities;
        let mut total = 0usize;
        let mut control = |amount: usize| {
            total = total.saturating_add(amount);
            if total > budget {
                Err(EngineError::new(code, Utf16::default(), message))
            } else {
                Ok(())
            }
        };
        let response = umf_core_wire::execute_request_with_control(
            &wire,
            ResourceProfile::Cooperative,
            &mut capability,
            &mut control,
        );
        let envelope: serde_json::Value = serde_json::from_str(&response).unwrap();
        assert_eq!(envelope["status"], "error");
        assert_eq!(envelope["code"], code);
        assert!(total > budget);
    }
}

struct StopAtHostRead;
impl umf_core_wire::PythonClientHostReadV3 for StopAtHostRead {
    fn read(&mut self, _: &str, _: Option<&str>) -> Result<Value, EngineError> {
        Err(EngineError::new(
            "HOST_READ_STOP",
            Utf16::default(),
            "stop after admission",
        ))
    }
}

#[test]
fn host_read_v3_wire_shares_context_through_catalog_and_host_dispatch() {
    for profile in [None, Some("umf.python-client-host-read/4")] {
        let mut fields = vec![
            (
                Utf16::from("op"),
                Value::string_utf8("codegen/generatePythonClientHostV3"),
            ),
            (Utf16::from("resources"), resources()),
        ];
        if let Some(profile) = profile {
            fields.push((Utf16::from("hostReadProfile"), Value::string_utf8(profile)));
        }
        let wire = umf_core_wire::encode(
            &Value::Object(fields),
            &mut umf_core_wire::transport_context(),
        )
        .unwrap();
        let mut total = 0usize;
        let mut meter = |amount: usize| {
            total = total.saturating_add(amount);
            Ok(())
        };
        let response = umf_core_wire::execute_codegen_host_read_v3_wire_with_control(
            &wire,
            ResourceProfile::Cooperative,
            &mut StopAtHostRead,
            &mut meter,
        );
        let envelope: serde_json::Value = serde_json::from_str(&response).unwrap();
        assert_eq!(envelope["status"], "ok");
        let wire_result = envelope["wire"].as_str().expect("wire result");
        let decoded = umf_core_wire::decode(wire_result, &mut Context::ordinary()).unwrap();
        assert_eq!(member(&decoded, "ok"), &Value::Bool(false));
        assert!(
            total > 1_000_000,
            "decode and catalog admission were charged"
        );
    }
}
