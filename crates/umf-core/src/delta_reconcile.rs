// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded ordinary Delta commit action-state reconstruction.
//! This is not a native Delta reader/writer or transaction validator.
use crate::{
    context::Context,
    delta_actions::{self, DeltaActionResources},
    delta_log::DeltaLogResources,
    error::{EngineError, Severity},
    value::{Utf16, Value},
};

#[derive(Clone)]
struct Action {
    version: Utf16,
    line: usize,
    name: String,
    value: Value,
}

pub fn reconcile_delta_commits(
    commits: &Value,
    logs: &DeltaLogResources,
    actions: &DeltaActionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    reconcile_delta_commits_inner(commits, logs, actions, ctx, None)
}

/// Checkpoint replay uses the checkpoint's full remove identity so two
/// deletion-vector tombstones for the same path remain distinct occurrences.
pub fn reconcile_delta_checkpoint_commits(
    commits: &Value,
    logs: &DeltaLogResources,
    actions: &DeltaActionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    reconcile_delta_commits_inner(commits, logs, actions, ctx, Some("legacy"))
}

/// Reconcile an explicit V1 or V2 checkpoint and its contiguous later commits.
/// The result preserves the original checkpoint separately from the post-checkpoint sources.
pub fn reconcile_delta_checkpoint(
    checkpoint: &Value,
    commits: &Value,
    spec: &str,
    logs: &DeltaLogResources,
    actions: &DeltaActionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !matches!(commits, Value::Array(_)) {
        return Err(fail("DELTA_HISTORY_INPUT", "Expected an array of commits"));
    }
    let checkpoint = crate::value::copy_json(checkpoint, ctx)?;
    let commits = crate::value::copy_json(commits, ctx)?;
    let Value::Array(tail) = commits else {
        return Err(fail("DELTA_HISTORY_INPUT", "Expected an array of commits"));
    };
    let mut combined = Vec::with_capacity(tail.len().saturating_add(1));
    combined.push(checkpoint);
    combined.extend(tail);
    let mut result =
        reconcile_delta_commits_inner(&Value::Array(combined), logs, actions, ctx, Some(spec))?;
    if let Value::Object(fields) = &mut result {
        let sources_index = fields
            .iter()
            .position(|(name, _)| name == &Utf16::from("sources"));
        if let Some(index) = sources_index {
            let checkpoint = match &mut fields[index].1 {
                Value::Array(sources) if !sources.is_empty() => Some(sources.remove(0)),
                _ => None,
            };
            if let Some(checkpoint) = checkpoint {
                fields.push((Utf16::from("checkpoint"), checkpoint));
            }
        }
        let diagnostics_index = fields
            .iter()
            .position(|(name, _)| name == &Utf16::from("diagnostics"));
        if let Some(index) = diagnostics_index {
            if let Value::Array(diagnostics) = &mut fields[index].1 {
                for diagnostic in diagnostics {
                    if let Some((_, Value::String(path))) = match diagnostic {
                        Value::Object(members) => members
                            .iter_mut()
                            .find(|(name, _)| name == &Utf16::from("path")),
                        _ => None,
                    } {
                        *path = rewrite_checkpoint_path(path, ctx)?;
                    }
                }
            }
        }
    }
    Ok(result)
}

fn reconcile_delta_commits_inner(
    commits: &Value,
    logs: &DeltaLogResources,
    actions: &DeltaActionResources,
    ctx: &mut Context<'_>,
    checkpoint_spec: Option<&str>,
) -> Result<Value, EngineError> {
    let input = match commits {
        Value::Array(v) => v,
        _ => return Err(fail("DELTA_HISTORY_INPUT", "Expected an array of commits")),
    };
    let sources = crate::value::copy_json(commits, ctx)?;
    let mut out = Vec::new();
    macro_rules! issue {
        ($code:expr,$path:expr,$message:expr,$severity:expr) => {{
            let severity = $severity;
            out.push(diag($code, &$path, $message, severity));
        }};
    }
    if checkpoint_spec.is_some_and(|spec| spec != "legacy" && spec != "v1" && spec != "v2") {
        issue!(
            "DELTA_CHECKPOINT_SPEC",
            String::new(),
            "Expected v1 or v2 checkpoint spec",
            Severity::Error
        );
        return Ok(report("blocked", sources, out, None));
    }
    if input.is_empty() {
        issue!(
            "DELTA_HISTORY_EMPTY",
            String::new(),
            "A history must begin with version zero",
            Severity::Error
        );
        return Ok(report("blocked", sources, out, None));
    }
    if input.len() > 10000 {
        issue!(
            "DELTA_HISTORY_LIMIT",
            String::new(),
            "At most 10000 explicit commits can be reconciled",
            Severity::Error
        );
        return Ok(report("blocked", sources, out, None));
    }
    let checkpoint_mode = checkpoint_spec.is_some_and(|spec| spec == "v1" || spec == "v2");
    let start_version = if checkpoint_mode {
        let version = text(&input[0], "version").unwrap_or_default();
        let valid = !version.is_empty()
            && version.bytes().all(|byte| byte.is_ascii_digit())
            && (version == "0" || !version.starts_with('0'))
            && version.len() <= 19
            && version
                .parse::<u64>()
                .is_ok_and(|number| number <= i64::MAX as u64);
        if !valid {
            issue!(
                "DELTA_CHECKPOINT_VERSION",
                "/sources/0/version".to_owned(),
                "Expected a nonnegative signed-int64 checkpoint version",
                Severity::Error
            );
            return Ok(report("blocked", sources, out, None));
        }
        version.parse::<u64>().unwrap_or(0)
    } else {
        0
    };
    let mut histories: Vec<Vec<Action>> = Vec::new();
    for (i, c) in input.iter().enumerate() {
        let version = text(c, "version").unwrap_or_default();
        let valid = !version.is_empty()
            && version.bytes().all(|b| b.is_ascii_digit())
            && (version == "0" || !version.starts_with('0'))
            && version.len() <= 19;
        let numeric = version.parse::<u64>().ok();
        if !valid
            || numeric != start_version.checked_add(i as u64)
            || numeric.is_none()
            || numeric.unwrap_or(u64::MAX) > i64::MAX as u64
        {
            issue!(
                "DELTA_HISTORY_SEQUENCE",
                format!("/sources/{i}/version"),
                if checkpoint_mode {
                    "Require ascending contiguous versions after the checkpoint"
                } else {
                    "Require ascending contiguous versions beginning at zero"
                },
                Severity::Error
            );
            return Ok(report("blocked", sources, out, None));
        }
        let source = field(c, "source").unwrap_or(&Value::Null);
        let inspected = match delta_actions::inspect_delta_actions(source, logs, actions, ctx) {
            Ok(v) => v,
            Err(e) => {
                out.push(source_error_diagnostic(i, e.message.clone()));
                return Ok(report("blocked", sources, out, None));
            }
        };
        if !all_strings_are_well_formed_utf16(&inspected) {
            issue!(
                "DELTA_HISTORY_UTF16",
                format!("/sources/{i}"),
                "Action data contains an isolated UTF-16 surrogate; reconciliation refused before identity conversion",
                Severity::Error
            );
            return Ok(report("blocked", sources, out, None));
        }
        if let Some(ds) = arr(field(&inspected, "diagnostics")) {
            for d in ds {
                let p = format!("/sources/{i}{}", text(d, "path").unwrap_or_default());
                let severity = if text(d, "severity").as_deref() == Some("warning") {
                    Severity::Warning
                } else {
                    Severity::Error
                };
                issue!(
                    &text(d, "code").unwrap_or_default(),
                    p,
                    &text(d, "message").unwrap_or_default(),
                    severity
                );
            }
        }
        if !boolval(field(&inspected, "knownShapesValid")).unwrap_or(false) {
            return Ok(report("blocked", sources, out, None));
        }
        let mut list = Vec::new();
        let mut blank = false;
        if let Some(lines) = arr(field(&inspected, "lines")) {
            for l in lines {
                let status = text(l, "status").unwrap_or_default();
                let line = number(field(l, "line")).unwrap_or(1.0) as usize;
                if status == "blank" {
                    issue!(
                        "DELTA_HISTORY_BLANK",
                        format!("/sources/{i}/lines/{}", line.saturating_sub(1)),
                        "Blank lines are outside the ordinary commit profile",
                        Severity::Error
                    );
                    blank = true;
                    continue;
                }
                if status == "parsed" {
                    if let (Some(name), Some(value)) = (text(l, "action"), field(l, "node")) {
                        let member = field(value, "members")
                            .and_then(|m| field(m, &name))
                            .cloned()
                            .unwrap_or(Value::Null);
                        list.push(Action {
                            version: Utf16::from(version.as_str()),
                            line,
                            name,
                            value: member,
                        });
                    }
                }
            }
        }
        let is_checkpoint = checkpoint_mode && i == 0;
        if is_checkpoint && checkpoint_spec == Some("v2") {
            let markers = list
                .iter()
                .filter(|action| action.name == "checkpointMetadata")
                .collect::<Vec<_>>();
            let marker_matches = markers.len() == 1
                && scalar(&markers[0].value, "version").and_then(|v| v.parse::<u64>().ok())
                    == Some(start_version);
            if !marker_matches {
                issue!(
                    "DELTA_CHECKPOINT_METADATA",
                    "/sources/0".to_owned(),
                    "Exactly one checkpointMetadata must match the supplied version",
                    Severity::Error
                );
            }
            let protocol = list
                .iter()
                .find(|action| action.name == "protocol")
                .map(|action| &action.value);
            let has_feature = |key: &str| -> bool {
                let Some(features) = field(
                    field(protocol.unwrap_or(&Value::Null), "members").unwrap_or(&Value::Null),
                    key,
                ) else {
                    return false;
                };
                let Some(items) = arr(field(features, "items")) else {
                    return false;
                };
                items.iter().any(|item| {
                    text(item, "kind").as_deref() == Some("string")
                        && text(item, "value").as_deref() == Some("v2Checkpoint")
                })
            };
            if protocol.is_none()
                || scalar(protocol.unwrap(), "minReaderVersion").as_deref() != Some("3")
                || scalar(protocol.unwrap(), "minWriterVersion").as_deref() != Some("7")
                || !has_feature("readerFeatures")
                || !has_feature("writerFeatures")
            {
                issue!(
                    "DELTA_CHECKPOINT_PROTOCOL",
                    "/sources/0".to_owned(),
                    "V2 checkpoints require protocol 3/7 and both v2Checkpoint feature declarations",
                    Severity::Error
                );
            }
        }
        let mut seen = Vec::<String>::new();
        for a in &list {
            if is_checkpoint
                && checkpoint_spec == Some("v1")
                && ["checkpointMetadata", "sidecar"].contains(&a.name.as_str())
            {
                issue!(
                    "DELTA_CHECKPOINT_V1_ACTION",
                    format!("/sources/{i}/lines/{}", a.line.saturating_sub(1)),
                    "V1 checkpoints cannot contain checkpointMetadata or sidecars",
                    Severity::Error
                );
                continue;
            }
            if is_checkpoint && checkpoint_spec == Some("v2") && a.name == "checkpointMetadata" {
                continue;
            }
            if is_checkpoint && checkpoint_spec == Some("v2") && a.name == "sidecar" {
                issue!(
                    "DELTA_CHECKPOINT_SIDECAR_UNRESOLVED",
                    format!("/sources/{i}/lines/{}", a.line.saturating_sub(1)),
                    "Parquet sidecars must be resolved before state can be reconstructed",
                    Severity::Error
                );
                continue;
            }
            if is_checkpoint
                && (["commitInfo", "cdc"].contains(&a.name.as_str())
                    || a.name == "domainMetadata"
                        && boolval(field(
                            field(&a.value, "members").unwrap_or(&Value::Null),
                            "removed",
                        )) == Some(true))
            {
                issue!(
                    "DELTA_CHECKPOINT_FORBIDDEN_ACTION",
                    format!("/sources/{i}/lines/{}", a.line.saturating_sub(1)),
                    "Checkpoint cannot contain provenance, CDC or removed domain actions",
                    Severity::Error
                );
                continue;
            }
            if ["sidecar", "checkpointMetadata"].contains(&a.name.as_str()) {
                issue!(
                    "DELTA_HISTORY_CHECKPOINT",
                    format!("/sources/{i}/lines/{}", a.line.saturating_sub(1)),
                    "Checkpoint actions are not ordinary commit actions",
                    Severity::Error
                );
                continue;
            }
            let key = if ["protocol", "metaData"].contains(&a.name.as_str()) {
                Some(a.name.clone())
            } else if checkpoint_spec.is_some() && i == 0 && a.name == "remove" {
                Some(format!("remove:{}", file_identity(&a.value)))
            } else {
                let field_name = match a.name.as_str() {
                    "add" | "remove" => "path",
                    "txn" => "appId",
                    "domainMetadata" => "domain",
                    _ => "",
                };
                if field_name.is_empty() {
                    None
                } else {
                    Some(format!(
                        "{}:{}",
                        a.name,
                        scalar(&a.value, field_name).unwrap_or_default()
                    ))
                }
            };
            if let Some(k) = key {
                if seen.contains(&k) {
                    issue!(
                        "DELTA_HISTORY_DUPLICATE",
                        format!("/sources/{i}/lines/{}", a.line.saturating_sub(1)),
                        "Duplicate action identity in one commit",
                        Severity::Error
                    );
                }
                seen.push(k);
            }
        }
        histories.push(list);
        if blank
            || out
                .iter()
                .any(|d| text(d, "severity").as_deref() == Some("error"))
        {
            return Ok(report("blocked", sources, out, None));
        }
    }
    let mut protocol = None;
    let mut metadata = None;
    let mut adds = Vec::<Value>::new();
    let mut removes = Vec::<Value>::new();
    let mut txns = Vec::<Value>::new();
    let mut domains = Vec::<Value>::new();
    let mut commit_info = Vec::<Value>::new();
    let mut deferred = Vec::<Value>::new();
    for (i, hs) in histories.iter().enumerate() {
        commit_info.clear();
        let new_adds: Vec<_> = hs.iter().filter(|a| a.name == "add").collect();
        let new_removes: Vec<_> = hs.iter().filter(|a| a.name == "remove").collect();
        let removed_keys: Vec<_> = new_removes
            .iter()
            .map(|a| file_identity(&a.value))
            .collect();
        for add in &new_adds {
            let key = file_identity(&add.value);
            let path = scalar(&add.value, "path").unwrap_or_default();
            if removed_keys.iter().any(|removed| removed == &key) {
                issue!(
                    "DELTA_HISTORY_FILE_CONFLICT",
                    format!("/sources/{i}"),
                    "Same logical file is both added and removed in one commit",
                    Severity::Error
                );
            }
            if let Some(prior) = adds
                .iter()
                .find(|v| scalar(v, "path").as_deref() == Some(&path))
            {
                if file_identity(prior) != key
                    && !removed_keys
                        .iter()
                        .any(|removed| removed == &file_identity(prior))
                {
                    issue!(
                        "DELTA_HISTORY_DV_REPLACEMENT",
                        format!("/sources/{i}"),
                        "Changing a live file deletion vector requires removal of the prior logical file",
                        Severity::Error
                    );
                }
            }
        }
        if out
            .iter()
            .any(|d| text(d, "severity").as_deref() == Some("error"))
        {
            return Ok(report("blocked", sources, out, None));
        }
        for remove in &new_removes {
            let key = file_identity(&remove.value);
            let path = scalar(&remove.value, "path").unwrap_or_default();
            adds.retain(|prior| {
                scalar(prior, "path").as_deref() != Some(&path) || file_identity(prior) != key
            });
            put_with_identity(&mut removes, &remove.value, key);
        }
        for add in &new_adds {
            let key = file_identity(&add.value);
            put(&mut adds, &add.value, "path");
            removes.retain(|prior| file_identity(prior) != key);
        }
        for a in hs {
            if checkpoint_mode && i == 0 && a.name == "checkpointMetadata" {
                continue;
            }
            match a.name.as_str() {
                "protocol" => protocol = Some(a.value.clone()),
                "metaData" => metadata = Some(a.value.clone()),
                "txn" => put(&mut txns, &a.value, "appId"),
                "domainMetadata" => {
                    let key = scalar(&a.value, "domain").unwrap_or_default();
                    if boolval(field(
                        field(&a.value, "members").unwrap_or(&Value::Null),
                        "removed",
                    ))
                    .unwrap_or(false)
                    {
                        domains.retain(|v| scalar(v, "domain").as_deref() != Some(&key));
                    } else {
                        put(&mut domains, &a.value, "domain");
                    }
                }
                "commitInfo" => commit_info.push(a.value.clone()),
                "add" | "remove" => {}
                _ => deferred.push(obj(vec![
                    ("version", Value::String(a.version.clone())),
                    ("line", Value::Number(a.line as f64)),
                    ("action", Value::string_utf8(&a.name)),
                    ("value", a.value.clone()),
                ])),
            }
        }
        if protocol.is_none() || metadata.is_none() {
            issue!(
                "DELTA_HISTORY_INITIAL_CONTEXT",
                format!("/sources/{i}"),
                if checkpoint_mode {
                    "Checkpoint must establish protocol and metadata"
                } else {
                    "Version zero must establish protocol and metadata"
                },
                Severity::Error
            );
            return Ok(report("blocked", sources, out, None));
        }
    }
    issue!("DELTA_HISTORY_UNVERIFIED",String::new(),"Action state only: feature requirements, encoded-path aliases, file contents, transaction legality and tombstone expiry remain unverified",Severity::Warning);
    let state = obj(vec![
        (
            "version",
            field(input.last().unwrap(), "version")
                .cloned()
                .unwrap_or(Value::Null),
        ),
        ("protocol", protocol.unwrap()),
        ("metaData", metadata.unwrap()),
        ("adds", Value::Array(adds)),
        ("removes", Value::Array(removes)),
        ("transactions", Value::Array(txns)),
        ("domains", Value::Array(domains)),
        ("commitInfo", Value::Array(commit_info)),
        ("deferred", Value::Array(deferred)),
    ]);
    Ok(report("reconciled", sources, out, Some(state)))
}
fn put(list: &mut Vec<Value>, value: &Value, key: &str) {
    let id = scalar(value, key);
    if let Some(id) = id {
        if let Some(i) = list
            .iter()
            .position(|v| scalar(v, key).as_deref() == Some(&id))
        {
            list[i] = value.clone();
        } else {
            list.push(value.clone());
        }
    }
}
fn put_with_identity(list: &mut Vec<Value>, value: &Value, identity: String) {
    if let Some(i) = list.iter().position(|v| file_identity(v) == identity) {
        list[i] = value.clone();
    } else {
        list.push(value.clone());
    }
}
fn file_identity(v: &Value) -> String {
    let path = scalar(v, "path").unwrap_or_default();
    let dv = field(
        field(v, "members").unwrap_or(&Value::Null),
        "deletionVector",
    );
    let Some(dv) = dv.filter(|value| !matches!(value, Value::Null)) else {
        return format!("{path}\u{0}null");
    };
    let storage = scalar(dv, "storageType").unwrap_or_default();
    let location = scalar(dv, "pathOrInlineDv").unwrap_or_default();
    let offset = scalar(dv, "offset").unwrap_or_default();
    format!("{path}\u{0}{storage}{location}@{offset}")
}
fn scalar(v: &Value, k: &str) -> Option<String> {
    let value = field(field(v, "members")?, k)?;
    match value {
        Value::String(s) => s.to_utf8().ok(),
        Value::Number(n) => Some(n.to_string()),
        Value::Object(_) => match text(value, "kind")?.as_str() {
            "string" | "number" => text(value, "value"),
            _ => None,
        },
        _ => None,
    }
}
fn all_strings_are_well_formed_utf16(value: &Value) -> bool {
    match value {
        Value::String(text) => text.to_utf8().is_ok(),
        Value::Array(items) => items.iter().all(all_strings_are_well_formed_utf16),
        Value::Object(fields) => fields
            .iter()
            .all(|(key, value)| key.to_utf8().is_ok() && all_strings_are_well_formed_utf16(value)),
        Value::Null | Value::Bool(_) | Value::Number(_) => true,
    }
}
fn report(status: &str, sources: Value, diagnostics: Vec<Value>, state: Option<Value>) -> Value {
    let mut f = vec![
        ("status", Value::string_utf8(status)),
        ("complete", Value::Bool(false)),
        ("sources", sources),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    if let Some(s) = state {
        f.push(("state", s));
    }
    obj(f)
}
fn diag(c: &str, p: &str, m: &str, s: Severity) -> Value {
    obj(vec![
        ("code", Value::string_utf8(c)),
        ("path", Value::string_utf8(p)),
        ("message", Value::string_utf8(m)),
        (
            "severity",
            Value::string_utf8(if s == Severity::Error {
                "error"
            } else {
                "warning"
            }),
        ),
    ])
}
fn rewrite_checkpoint_path(path: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(path.units().len(), Utf16::default())?;
    let Ok(text) = path.to_utf8() else {
        return Ok(path.clone());
    };
    let rewritten = if let Some(rest) = text.strip_prefix("/sources/0") {
        format!("/checkpoint{rest}")
    } else if let Some(rest) = text.strip_prefix("/sources/") {
        let (index, suffix) = rest.split_once('/').unwrap_or((rest, ""));
        match index.parse::<usize>() {
            Ok(index) if index > 0 && suffix.is_empty() => format!("/sources/{}", index - 1),
            Ok(index) if index > 0 => format!("/sources/{}/{suffix}", index - 1),
            _ => text,
        }
    } else {
        text
    };
    ctx.charge_text(rewritten.encode_utf16().count(), Utf16::default())?;
    Ok(Utf16::from(rewritten.as_str()))
}

fn source_error_diagnostic(index: usize, message: Utf16) -> Value {
    obj(vec![
        ("code", Value::string_utf8("DELTA_HISTORY_SOURCE")),
        ("path", Value::string_utf8(&format!("/sources/{index}"))),
        ("message", Value::String(message)),
        ("severity", Value::string_utf8("error")),
    ])
}
fn obj(f: Vec<(&str, Value)>) -> Value {
    Value::Object(f.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn field<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(f) = v {
        f.iter().find(|(n, _)| n == &Utf16::from(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn text(v: &Value, k: &str) -> Option<String> {
    match field(v, k)? {
        Value::String(s) => s.to_utf8().ok(),
        _ => None,
    }
}
fn arr(v: Option<&Value>) -> Option<&Vec<Value>> {
    if let Value::Array(a) = v? {
        Some(a)
    } else {
        None
    }
}
fn number(v: Option<&Value>) -> Option<f64> {
    if let Value::Number(n) = v? {
        Some(*n)
    } else {
        None
    }
}
fn boolval(v: Option<&Value>) -> Option<bool> {
    match v? {
        Value::Bool(b) => Some(*b),
        Value::Object(_) if text(v?, "kind").as_deref() == Some("boolean") => {
            if let Value::Bool(b) = field(v?, "value")? {
                Some(*b)
            } else {
                None
            }
        }
        _ => None,
    }
}
fn fail(c: &str, m: &str) -> EngineError {
    EngineError::new(c, Utf16::default(), m)
}

#[cfg(test)]
mod tests {
    use super::{field, source_error_diagnostic};
    use crate::value::{Utf16, Value};

    #[test]
    fn source_error_diagnostic_preserves_isolated_surrogate_units() {
        let message = Utf16::new(vec![b'x' as u16, 0xd800, b'y' as u16]);
        let diagnostic = source_error_diagnostic(3, message.clone());
        let Value::String(actual) = field(&diagnostic, "message").unwrap() else {
            panic!("diagnostic message should stay a UTF-16 string");
        };
        assert_eq!(actual.units(), message.units());
    }
}
