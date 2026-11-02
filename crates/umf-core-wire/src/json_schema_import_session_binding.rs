// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private staged tagged-wire boundary for the owned JSON Schema import session.
use crate::{fail, field, result_envelope, text_field};
use umf_core::{
    context::TransportUsage, json_schema_adapter::JsonSchemaImportSession, Context, EngineError,
    Utf16, Value,
};

/// One binding-owned import session. It stores Rust state and cumulative
/// transport accounting, never a host callback or token-keyed global state.
pub struct JsonSchemaImportSessionWire {
    session: Option<JsonSchemaImportSession>,
    usage: TransportUsage,
    failed: bool,
}

impl JsonSchemaImportSessionWire {
    pub fn new() -> Self {
        Self {
            session: None,
            usage: TransportUsage::default(),
            failed: false,
        }
    }

    /// Execute exactly one stage request. Request strings are decoded as UTF-16
    /// units and JSON parsing is performed only by the core session.
    pub fn execute_stage_with_control(
        &mut self,
        wire_json: &str,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> String {
        let result = {
            let mut ctx = Context::ordinary().with_host_control(control);
            self.usage.seed(&mut ctx);
            let result = self.execute_stage_inner(wire_json, &mut ctx);
            self.usage.capture(&ctx);
            result
        };
        if result.is_err() {
            self.failed = true;
        }
        result_envelope(result)
    }

    pub fn execute_stage(&mut self, wire_json: &str) -> String {
        let mut no_control = |_amount: usize| Ok(());
        self.execute_stage_with_control(wire_json, &mut no_control)
    }

    pub fn charged_work(&self) -> u64 {
        self.usage.charged_work()
    }
    pub fn constraint_steps(&self) -> usize {
        self.usage.constraint_steps()
    }

    fn execute_stage_inner(
        &mut self,
        wire_json: &str,
        ctx: &mut Context<'_>,
    ) -> Result<String, EngineError> {
        if self.failed {
            return Err(fail("JSON_SCHEMA_IMPORT_ORDER", "Import session is closed"));
        }
        let request = umf_tagged_wire::decode(wire_json, ctx)?;
        let stage = text_field(&request, "stage")
            .ok_or_else(|| fail("REQUEST", "JSON Schema import stage is required"))?;
        let ack = Value::Bool(true);
        let output = match stage.as_str() {
            "begin" if self.session.is_none() => {
                let first = required_text(&request, "firstBaseUri")?;
                self.session = Some(JsonSchemaImportSession::new(first, ctx)?);
                ack
            }
            "resource" => {
                let session = self.session.as_mut().ok_or_else(order_error)?;
                let uri = required_text(&request, "uri")?;
                let source = required_text(&request, "source")?;
                session.add_resource(uri, source.units(), ctx)?;
                ack
            }
            "payloadBaseUri" => {
                self.session
                    .as_mut()
                    .ok_or_else(order_error)?
                    .set_payload_base_uri(required_text(&request, "baseUri")?.clone())?;
                ack
            }
            "root" => {
                let source = required_text(&request, "source")?;
                self.session
                    .as_mut()
                    .ok_or_else(order_error)?
                    .parse_root(source.units(), ctx)?;
                ack
            }
            "id" => {
                self.session
                    .as_mut()
                    .ok_or_else(order_error)?
                    .set_id(required_text(&request, "id")?.clone())?;
                ack
            }
            "namespace" => {
                self.session
                    .as_mut()
                    .ok_or_else(order_error)?
                    .set_namespace(required_text(&request, "baseUri")?.clone())?;
                ack
            }
            "finish" => self
                .session
                .take()
                .ok_or_else(order_error)?
                .finish(None, ctx)?,
            _ => {
                return Err(fail(
                    "JSON_SCHEMA_IMPORT_ORDER",
                    "Unexpected JSON Schema import stage",
                ))
            }
        };
        umf_tagged_wire::encode(&output, ctx)
    }
}

impl Default for JsonSchemaImportSessionWire {
    fn default() -> Self {
        Self::new()
    }
}

fn required_text<'a>(value: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    field(value, name)
        .and_then(|v| {
            if let Value::String(s) = v {
                Some(s)
            } else {
                None
            }
        })
        .ok_or_else(|| fail("REQUEST", format!("JSON Schema {name} must be a string")))
}
fn order_error() -> EngineError {
    fail(
        "JSON_SCHEMA_IMPORT_ORDER",
        "Unexpected JSON Schema import stage",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(stage: &str, fields: &[(&str, Value)]) -> String {
        let mut members = vec![(Utf16::from("stage"), Value::string_utf8(stage))];
        members.extend(fields.iter().map(|(k, v)| (Utf16::from(*k), v.clone())));
        umf_tagged_wire::encode(&Value::Object(members), &mut Context::ordinary()).unwrap()
    }
    fn text(s: &str) -> Value {
        Value::String(Utf16::from(s))
    }
    fn units(v: Vec<u16>) -> Value {
        Value::String(Utf16::new(v))
    }
    fn member<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
        crate::field(v, key)
    }
    fn wire(envelope: &str) -> String {
        let env: serde_json::Value = serde_json::from_str(envelope).unwrap();
        assert_eq!(env["status"], "ok", "{envelope}");
        env["wire"].as_str().unwrap().to_owned()
    }
    fn call(
        session: &mut JsonSchemaImportSessionWire,
        stage: &str,
        fields: &[(&str, Value)],
    ) -> Result<String, String> {
        let mut control = |_n| Ok(());
        let envelope = session.execute_stage_with_control(&request(stage, fields), &mut control);
        let env: serde_json::Value = serde_json::from_str(&envelope).unwrap();
        if env["status"] == "error" {
            return Err(env["code"].as_str().unwrap().to_owned());
        }
        Ok(wire(&envelope))
    }

    #[test]
    fn malformed_stage_closes_session_and_preserves_envelope_error() {
        let mut session = JsonSchemaImportSessionWire::new();
        let error = call(&mut session, "begin", &[]).unwrap_err();
        assert_eq!(error, "REQUEST");
        assert_eq!(
            call(
                &mut session,
                "begin",
                &[("firstBaseUri", text("https://x.test/"))]
            )
            .unwrap_err(),
            "JSON_SCHEMA_IMPORT_ORDER"
        );
    }

    #[test]
    fn staged_wire_preserves_lone_surrogates_and_three_distinct_uri_observations() {
        let mut session = JsonSchemaImportSessionWire::new();
        call(
            &mut session,
            "begin",
            &[("firstBaseUri", text("https://x.test/validated"))],
        )
        .unwrap();
        call(
            &mut session,
            "resource",
            &[
                ("uri", text("https://x.test/r")),
                (
                    "source",
                    units(r#"{"type":"string"}"#.encode_utf16().collect()),
                ),
            ],
        )
        .unwrap();
        call(
            &mut session,
            "payloadBaseUri",
            &[("baseUri", text("https://x.test/payload"))],
        )
        .unwrap();
        // An escaped lone surrogate is valid JSON text and remains a UTF-16
        // code unit throughout decode, core parse, and output encoding.
        let root = r#"{"title":"\ud800"}"#.encode_utf16().collect();
        call(&mut session, "root", &[("source", units(root))]).unwrap();
        call(&mut session, "id", &[("id", text("session-id"))]).unwrap();
        call(
            &mut session,
            "namespace",
            &[("baseUri", text("https://x.test/namespace"))],
        )
        .unwrap();
        let output_wire = call(&mut session, "finish", &[]).unwrap();
        let output = umf_tagged_wire::decode(&output_wire, &mut Context::ordinary()).unwrap();
        let Value::Object(doc) = output else {
            panic!("expected document")
        };
        let document = Value::Object(doc.clone());
        assert_eq!(member(&document, "id"), Some(&text("session-id")));
        let Value::Array(modules) = member(&document, "modules").unwrap() else {
            panic!("expected modules")
        };
        assert_eq!(
            member(&modules[0], "namespace"),
            Some(&text("https://x.test/namespace"))
        );
        let Value::Array(elements) = member(&modules[0], "elements").unwrap() else {
            panic!("expected elements")
        };
        let extension = member(
            member(&elements[0], "extensions").unwrap(),
            "umf.json-schema",
        )
        .unwrap();
        assert_eq!(
            member(extension, "baseUri"),
            Some(&text("https://x.test/payload"))
        );
        fn contains_string(value: &Value, expected: &[u16]) -> bool {
            match value {
                Value::String(value) => value.units() == expected,
                Value::Array(items) => items.iter().any(|item| contains_string(item, expected)),
                Value::Object(items) => items
                    .iter()
                    .any(|(_, item)| contains_string(item, expected)),
                _ => false,
            }
        }
        assert!(contains_string(&Value::Object(doc.clone()), &[0xD800]));
    }

    #[test]
    fn out_of_order_stage_and_malformed_tagged_request_poison_the_session() {
        let mut out_of_order = JsonSchemaImportSessionWire::new();
        assert_eq!(
            call(&mut out_of_order, "root", &[("source", text("true"))]).unwrap_err(),
            "JSON_SCHEMA_IMPORT_ORDER"
        );
        assert_eq!(
            call(
                &mut out_of_order,
                "begin",
                &[("firstBaseUri", text("https://x.test/"))]
            )
            .unwrap_err(),
            "JSON_SCHEMA_IMPORT_ORDER"
        );

        let mut malformed = JsonSchemaImportSessionWire::new();
        let envelope = malformed.execute_stage("{broken tagged wire");
        let error: serde_json::Value = serde_json::from_str(&envelope).unwrap();
        assert_eq!(error["status"], "error");
        assert_eq!(
            malformed.execute_stage(&request(
                "begin",
                &[("firstBaseUri", text("https://x.test/"))]
            )),
            result_envelope(Err(fail(
                "JSON_SCHEMA_IMPORT_ORDER",
                "Import session is closed"
            )))
        );
    }

    #[test]
    fn callback_is_reattached_per_stage_and_cumulative_accounting_continues() {
        let mut session = JsonSchemaImportSessionWire::new();
        let mut seen = 0usize;
        let mut callback = |amount: usize| {
            seen = seen.saturating_add(amount);
            Ok(())
        };
        let envelope = session.execute_stage_with_control(
            &request("begin", &[("firstBaseUri", text("https://x.test/"))]),
            &mut callback,
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&envelope).unwrap()["status"],
            "ok"
        );
        assert!(seen > 0);
        let charged = session.charged_work();
        assert!(charged > 0);
        let mut refusal = |_amount| Err(EngineError::new("HOST_STOP", Utf16::default(), "stopped"));
        let envelope = session.execute_stage_with_control(
            &request(
                "resource",
                &[("uri", text("https://x.test/r")), ("source", text("true"))],
            ),
            &mut refusal,
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&envelope).unwrap()["code"],
            "HOST_STOP"
        );
        assert!(session.charged_work() >= charged);
        assert_eq!(
            call(
                &mut session,
                "payloadBaseUri",
                &[("baseUri", text("https://x.test/"))]
            )
            .unwrap_err(),
            "JSON_SCHEMA_IMPORT_ORDER"
        );
    }
}
