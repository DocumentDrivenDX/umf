// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
};
use umf_core_wire::{
    decode, encode, execute_request, execute_request_with_control, transport_context,
};

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
fn parse(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
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
fn run(op: &str, args: &[(&str, &Value)]) -> (serde_json::Value, Option<Value>) {
    let mut fields = vec![
        ("op".into(), Value::string_utf8(op)),
        ("resources".into(), resources()),
    ];
    fields.extend(
        args.iter()
            .map(|(name, value)| ((*name).into(), (*value).clone())),
    );
    let wire = encode(&Value::Object(fields), &mut transport_context()).unwrap();
    let response: serde_json::Value = serde_json::from_str(&execute_request(
        &wire,
        ResourceProfile::Cooperative,
        &mut NoCapabilities,
    ))
    .unwrap();
    let decoded = if response["status"] == "ok" {
        Some(decode(response["wire"].as_str().unwrap(), &mut transport_context()).unwrap())
    } else {
        None
    };
    (response, decoded)
}
fn text(value: &Value) -> String {
    match value {
        Value::String(s) => s.to_utf8().unwrap(),
        _ => panic!("expected text"),
    }
}
fn utf16_units(value: &Value) -> serde_json::Value {
    match value {
        Value::String(s) => serde_json::json!(s.units()),
        _ => panic!("expected UTF-16 text"),
    }
}

#[test]
fn tagged_key_operations_match_all_frozen_predecessor_cases() {
    let frozen = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-core-keys/frozen-typescript.json"
    ));
    let cases = get(&frozen, "cases").unwrap();
    let outcomes = get(&frozen, "outcomes").unwrap();
    let operations = [
        ("inspect_known", "model/inspectCoreKeys"),
        ("inspect_absent", "model/inspectCoreKeys"),
        ("inspect_inapplicable", "model/inspectCoreKeys"),
        ("lookup_by_stable_id", "model/lookupCoreKey"),
        ("lookup_name_does_not_resolve", "model/lookupCoreKey"),
        ("declare_members_ordered", "model/declareCoreRecordMembers"),
        ("declare_key_explicit_primary", "model/declareCoreKey"),
        ("preserve_unknown_qualifiers", "model/declareCoreKey"),
        (
            "remove_unknown_member_refused",
            "model/declareCoreRecordMembers",
        ),
        ("tuple_change_refused", "model/declareCoreKey"),
        ("old_profile_refused", "model/declareCoreKey"),
        ("extra_identity_refused", "model/inspectCoreKeys"),
        (
            "duplicate_member_request_before_source",
            "model/declareCoreRecordMembers",
        ),
        (
            "duplicate_key_request_before_source",
            "model/declareCoreKey",
        ),
        ("lookup_identity_before_source", "model/lookupCoreKey"),
        (
            "receipt_shape_before_recompute",
            "model/verifyCoreKeyOperation",
        ),
    ];
    for (name, op) in operations {
        let case = get(cases, name).unwrap();
        let expected = get(outcomes, name).unwrap();
        let mut args = Vec::new();
        for field in ["source", "identity", "request", "receipt", "current"] {
            if let Some(value) = get(case, field) {
                args.push((field, value));
            }
        }
        let (response, actual) = run(op, &args);
        if get(expected, "ok") == Some(&Value::Bool(true)) {
            assert_eq!(response["status"], "ok", "{name}: {response}");
            assert_eq!(actual.unwrap(), *get(expected, "value").unwrap(), "{name}");
        } else {
            let error = get(expected, "error").unwrap();
            assert_eq!(response["status"], "error", "{name}: {response}");
            assert_eq!(
                response["code"],
                text(get(error, "code").unwrap()),
                "{name}"
            );
            assert_eq!(
                response["messageUnits"],
                utf16_units(get(error, "message").unwrap()),
                "{name}"
            );
            assert_eq!(
                response["pathUnits"],
                utf16_units(get(error, "path").unwrap()),
                "{name}"
            );
        }
    }

    let receipt = get(
        get(outcomes, "declare_key_explicit_primary").unwrap(),
        "value",
    )
    .unwrap();
    let stale = parse(r#"{"umf":"0.10.0","id":"changed","vocabularies":{},"modules":[]}"#);
    let expected = get(outcomes, "verify_stale_document").unwrap();
    let (response, _) = run(
        "model/verifyCoreKeyOperation",
        &[("receipt", receipt), ("current", &stale)],
    );
    let error = get(expected, "error").unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], text(get(error, "code").unwrap()));
    assert_eq!(
        response["messageUnits"],
        utf16_units(get(error, "message").unwrap())
    );
    assert_eq!(
        response["pathUnits"],
        utf16_units(get(error, "path").unwrap())
    );
}

#[test]
fn key_preflight_and_receipt_prepare_operations_are_available_on_tagged_wire() {
    let frozen = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-core-keys/frozen-typescript.json"
    ));
    let cases = get(&frozen, "cases").unwrap();
    let outcomes = get(&frozen, "outcomes").unwrap();
    let lookup = get(cases, "lookup_by_stable_id").unwrap();
    let (response, identity) = run(
        "model/admitCoreKeyIdentity",
        &[("identity", get(lookup, "identity").unwrap())],
    );
    assert_eq!(response["status"], "ok", "{response}");
    assert_eq!(identity.unwrap(), *get(lookup, "identity").unwrap());

    let declaration = get(cases, "declare_key_explicit_primary").unwrap();
    let (response, request) = run(
        "model/admitCoreKeyRequest",
        &[("request", get(declaration, "request").unwrap())],
    );
    assert_eq!(response["status"], "ok", "{response}");
    assert_eq!(request.unwrap(), *get(declaration, "request").unwrap());

    let members = get(cases, "declare_members_ordered").unwrap();
    let (response, request) = run(
        "model/admitCoreKeyMemberRequest",
        &[("request", get(members, "request").unwrap())],
    );
    assert_eq!(response["status"], "ok", "{response}");
    assert_eq!(request.unwrap(), *get(members, "request").unwrap());

    let receipt = get(
        get(outcomes, "declare_key_explicit_primary").unwrap(),
        "value",
    )
    .unwrap();
    let (response, prepared) = run("model/prepareCoreKeyVerification", &[("receipt", receipt)]);
    assert_eq!(response["status"], "ok", "{response}");
    assert_eq!(prepared.unwrap(), *receipt);
}

#[test]
fn tagged_key_operations_propagate_host_resource_and_cancellation_controls() {
    let frozen = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-core-keys/frozen-typescript.json"
    ));
    let case = get(get(&frozen, "cases").unwrap(), "inspect_known").unwrap();
    let mut fields = vec![
        ("op".into(), Value::string_utf8("model/inspectCoreKeys")),
        ("resources".into(), resources()),
    ];
    for field in ["source", "identity"] {
        fields.push((field.into(), get(case, field).unwrap().clone()));
    }
    let wire = encode(&Value::Object(fields), &mut transport_context()).unwrap();
    for code in ["RESOURCE_LIMIT", "CANCELLED"] {
        let mut capabilities = NoCapabilities;
        let mut control = |_: usize| {
            Err(umf_core::EngineError::new(
                code,
                Utf16::default(),
                if code == "RESOURCE_LIMIT" {
                    "Host work budget exceeded"
                } else {
                    "Operation cancelled"
                },
            ))
        };
        let response: serde_json::Value = serde_json::from_str(&execute_request_with_control(
            &wire,
            ResourceProfile::Cooperative,
            &mut capabilities,
            &mut control,
        ))
        .unwrap();
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], code);
    }
}
