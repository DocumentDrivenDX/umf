// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
};
use umf_core_wire::{decode, encode, execute_request, transport_context};

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> { Ok(Vec::new()) }
}
fn parse(source: &str) -> Value {
    read_json_value(&source.encode_utf16().collect::<Vec<_>>(), Format::Json, &mut Context::ordinary()).unwrap()
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value { Value::Object(fields) => fields.iter().find(|(key, _)| key == &Utf16::from(name)).map(|(_, value)| value), _ => None }
}
fn resources() -> Value {
    Value::Object(vec![
        ("coreSchema".into(), parse(include_str!("../../../spec/core/schema.json"))),
        ("referenceSchema".into(), parse(include_str!("../../../spec/core/semantic-type-reference.schema.json"))),
        ("packageSchema".into(), parse(include_str!("../../../spec/core/extension-package.schema.json"))),
        ("constraints".into(), parse(include_str!("../../../spec/metamodel/generated/core-constraints.json"))),
        ("domainPolicy".into(), parse(include_str!("../../../spec/metamodel/generated/domain-policy.json"))),
    ])
}
fn run(op: &str, args: &[(&str, &Value)]) -> (serde_json::Value, Option<Value>) {
    let mut fields = vec![("op".into(), Value::String(op.into())), ("resources".into(), resources())];
    fields.extend(args.iter().map(|(name, value)| (Utf16::from(*name), (*value).clone())));
    let wire = encode(&Value::Object(fields), &mut transport_context()).unwrap();
    let mut capabilities = NoCapabilities;
    let response: serde_json::Value = serde_json::from_str(&execute_request(&wire, ResourceProfile::Cooperative, &mut capabilities)).unwrap();
    let value = (response["status"] == "ok").then(|| decode(response["wire"].as_str().unwrap(), &mut transport_context()).unwrap());
    (response, value)
}
fn source() -> Value { parse(include_str!("../../../spec/domain-packs/medical/ontology.json")) }
fn request(token: &str) -> Value {
    parse(&format!(r#"{{"profile":"umf.csv-boolean-lexical/1.0.0","field":{{"module":"domain","element":"patients.active"}},"token":"{token}","sourceContext":{{"source":"original.csv","row":1,"unknown":["雪",null]}}}}"#))
}

#[test]
fn tagged_validate_and_staged_verify_match_the_closed_receipt() {
    let source = source();
    let request = request("True");
    let (validated, receipt) = run("model/validateCsvBooleanLexical", &[("source", &source), ("csvRequest", &request)]);
    assert_eq!(validated["status"], "ok", "{validated}");
    let receipt = receipt.unwrap();
    assert_eq!(get(get(&receipt, "value").unwrap(), "boolean"), Some(&Value::Bool(true)));
    let (prepared, prepared_receipt) = run("model/prepareCsvBooleanLexicalVerification", &[("receipt", &receipt)]);
    assert_eq!(prepared["status"], "ok", "{prepared}");
    let prepared_receipt = prepared_receipt.unwrap();
    let (finished, result) = run("model/finishCsvBooleanLexicalVerification", &[
        ("preparedReceipt", &prepared_receipt), ("source", &source), ("csvRequest", &request),
    ]);
    assert_eq!(finished["status"], "ok", "{finished}");
    assert_eq!(result.unwrap(), receipt);
}

#[test]
fn staged_finish_rejects_forgery_and_preserves_receipt_first_refusal() {
    let source = source();
    let request = request("true");
    let (validated, receipt) = run("model/validateCsvBooleanLexical", &[("source", &source), ("csvRequest", &request)]);
    assert_eq!(validated["status"], "ok");
    let mut forged = receipt.unwrap();
    if let Value::Object(fields) = &mut forged {
        fields.retain(|(key, _)| key != &Utf16::from("provenance"));
    }
    let (prepared, _) = run("model/prepareCsvBooleanLexicalVerification", &[("receipt", &forged)]);
    assert_eq!(prepared["status"], "error");
    assert_eq!(prepared["code"], "CSV_BOOLEAN_LEXICAL");
    assert_eq!(
        prepared["messageUnits"],
        serde_json::json!("Malformed Boolean lexical receipt"
            .encode_utf16()
            .collect::<Vec<_>>())
    );
    let (direct, _) = run("model/verifyCsvBooleanLexical", &[("receipt", &forged), ("source", &source), ("csvRequest", &request)]);
    assert_eq!(direct["status"], "error");
    assert_eq!(direct["code"], "CSV_BOOLEAN_LEXICAL");
}
