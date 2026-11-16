// SPDX-License-Identifier: MIT OR Apache-2.0

use serde_json::{json, Value};
use umf_core::{exact_duration, workflow, Context};

pub fn inspect(source: &[u8]) -> String {
    let result = workflow::inspect(source, &mut Context::ordinary()).map(|inspection| {
        json!({
            "source": std::str::from_utf8(inspection.source()).expect("admitted UTF-8"),
            "complete": inspection.unchecked().is_empty(),
            "findings": findings(inspection.unchecked()),
        })
    });
    result_json(result)
}

pub fn compile(source: &[u8], profile: &str) -> String {
    let result = workflow::compile(source, profile, &mut Context::ordinary()).map(|prepared| {
        json!({
            "id": prepared.id(),
            "version": prepared.version(),
            "profile": prepared.profile(),
            "entry": prepared.entry(),
            "sourceDigest": prepared.digest(),
            "definitionDigest": prepared.lowered_digest(),
            "effectRevisions": prepared.effect_revisions(),
        })
    });
    result_json(result)
}

pub fn elapsed_duration(token: &str) -> String {
    match exact_duration::ExactDuration::parse(token) {
        Ok(value) => json!({"ok": true, "value": {
            "profile": exact_duration::EXACT_DURATION_PROFILE,
            "originalText": token,
            "nanoseconds": value.canonical_nanoseconds(),
        }})
        .to_string(),
        Err(error) => json!({"ok": false, "findings": [{
            "code": "DURATION",
            "path": "",
            "message": error.to_string(),
        }]})
        .to_string(),
    }
}

fn result_json(result: Result<Value, workflow::WorkflowError>) -> String {
    match result {
        Ok(value) => json!({"ok": true, "value": value}),
        Err(error) => json!({"ok": false, "findings": findings(&error.0)}),
    }
    .to_string()
}

fn findings(rows: &[workflow::Finding]) -> Vec<Value> {
    rows.iter()
        .map(|finding| {
            json!({
                "code": finding.code,
                "path": finding.path,
                "message": finding.message,
            })
        })
        .collect()
}
