// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in wire operations for bounded Delta JSONL source capture.
use umf_core::{Context, EngineError, Utf16, Value, delta_log};

pub const PROFILE: &str = "umf-r8-delta-log/0.1.0";
pub fn execute_json(input: &str) -> String {
    let mut control = |_n: usize| Ok(());
    execute_json_with_control(input, &mut control)
}
pub fn execute_json_with_control(
    input: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = super::decode(input, &mut ctx)?;
        if text(&request, "profile").as_deref() != Some(PROFILE) {
            return Err(fail(
                "REQUEST",
                "umf-r8-delta-log/0.1.0 profile is required",
            ));
        }
        let op = text(&request, "op")
            .ok_or_else(|| fail("REQUEST", "Delta log operation is required"))?;
        let resources = delta_log::DeltaLogResources::new(&mut ctx)?;
        let value = match op.as_str() {
            "delta/log.capture" => delta_log::capture_delta_log(
                required(&request, "source")?.units(),
                required(&request, "id")?,
                &resources,
                &mut ctx,
            )?,
            "delta/log.export" => Value::String(delta_log::export_delta_log(
                field(&request, "document")
                    .ok_or_else(|| fail("REQUEST", "Delta document is required"))?,
                &resources,
                &mut ctx,
            )?),
            "delta/log.inspect" => delta_log::inspect_delta_log(
                field(&request, "document")
                    .ok_or_else(|| fail("REQUEST", "Delta document is required"))?,
                &resources,
                &mut ctx,
            )?,
            "delta/log.inspectActions" => {
                let action_resources =
                    umf_core::delta_actions::DeltaActionResources::new(&mut ctx)?;
                umf_core::delta_actions::inspect_delta_actions(
                    field(&request, "document")
                        .ok_or_else(|| fail("REQUEST", "Delta document is required"))?,
                    &resources,
                    &action_resources,
                    &mut ctx,
                )?
            }
            "delta/log.reconcileCommits" => {
                let action_resources =
                    umf_core::delta_actions::DeltaActionResources::new(&mut ctx)?;
                umf_core::delta_reconcile::reconcile_delta_commits(
                    field(&request, "commits")
                        .ok_or_else(|| fail("REQUEST", "Delta commits array is required"))?,
                    &resources,
                    &action_resources,
                    &mut ctx,
                )?
            }
            _ => return Err(fail("REQUEST", "Unknown Delta log operation")),
        };
        super::encode(&value, &mut ctx)
    })();
    super::result_envelope(result)
}
fn field<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(f) = v {
        f.iter()
            .find(|(name, _)| name == &Utf16::from(k))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn required<'a>(v: &'a Value, k: &str) -> Result<&'a Utf16, EngineError> {
    field(v, k)
        .and_then(|v| {
            if let Value::String(s) = v {
                Some(s)
            } else {
                None
            }
        })
        .ok_or_else(|| fail("REQUEST", &format!("Delta {k} string is required")))
}
fn text(v: &Value, k: &str) -> Option<String> {
    field(v, k).and_then(|v| {
        if let Value::String(s) = v {
            s.to_utf8().ok()
        } else {
            None
        }
    })
}
fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
