// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit bounded assembly and replay for classic Delta multipart checkpoints.
//! This reconstructs action state and does not read table data or discover files.
use crate::{
    context::Context,
    delta_actions::DeltaActionResources,
    delta_log::{self, DeltaLogResources},
    delta_parquet_actions::project_delta_parquet_actions,
    delta_reconcile,
    delta_spark_hash::spark_string_hash,
    engine::{Capabilities, Engine},
    error::{EngineError, Severity},
    parquet_capture_inspection::export_parquet_capture,
    registry::Registry,
    value::{Utf16, Value},
};

const MAX_PARTS: usize = 1_000;
const MAX_BYTES: usize = 16_000_000;
const MAX_ACTIONS: usize = 10_000;
const MAX_TEXT: usize = 1_000_000;

pub fn reconcile_delta_multipart_checkpoint(
    version: &str,
    part_count: usize,
    parts: &Value,
    commits: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    logs: &DeltaLogResources,
    actions: &DeltaActionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut diagnostics = Vec::new();
    let mut projections: Vec<Option<Value>> = Vec::new();
    if !valid_version(version) {
        diagnostics.push(diag(
            "DELTA_MULTIPART_BLOCKED",
            "",
            "Expected a canonical nonnegative signed-int64 checkpoint version",
        ));
        return make_report(
            version,
            part_count,
            parts,
            commits,
            diagnostics,
            &projections,
            None,
            None,
            "",
            ctx,
        );
    }
    let Some(part_rows) = array(parts) else {
        diagnostics.push(diag(
            "DELTA_MULTIPART_BLOCKED",
            "/parts",
            "Multipart parts must be an array",
        ));
        return make_report(
            version,
            part_count,
            parts,
            commits,
            diagnostics,
            &projections,
            None,
            None,
            "",
            ctx,
        );
    };
    if !(2..=MAX_PARTS).contains(&part_count) || part_rows.len() != part_count {
        diagnostics.push(diag(
            "DELTA_MULTIPART_BLOCKED",
            "/parts",
            "Require exactly 2..1000 declared parts",
        ));
        return make_report(
            version,
            part_count,
            parts,
            commits,
            diagnostics,
            &projections,
            None,
            None,
            "",
            ctx,
        );
    }
    let Some(commit_rows) = array(commits) else {
        diagnostics.push(diag(
            "DELTA_HISTORY_INPUT",
            "/sources",
            "Expected following commits",
        ));
        return make_report(
            version,
            part_count,
            parts,
            commits,
            diagnostics,
            &projections,
            None,
            None,
            "",
            ctx,
        );
    };
    ctx.charge_work(part_count, Utf16::default())?;
    let mut ordinal_to_input = Vec::new();
    ordinal_to_input
        .try_reserve_exact(part_count)
        .map_err(|_| limit("Part index allocation refused"))?;
    ordinal_to_input.resize(part_count, usize::MAX);
    let mut total_bytes = 0usize;
    for (input_index, part) in part_rows.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let Some(Value::String(name_value)) = field(part, "name") else {
            diagnostics.push(diag(
                "DELTA_MULTIPART_BLOCKED",
                &format!("/parts/{input_index}/name"),
                "Part name is required",
            ));
            return make_report(
                version,
                part_count,
                parts,
                commits,
                diagnostics,
                &projections,
                None,
                None,
                "",
                ctx,
            );
        };
        ctx.charge_text(name_value.units().len(), Utf16::default())?;
        let Some(name) = name_value.to_utf8().ok() else {
            diagnostics.push(diag(
                "DELTA_MULTIPART_BLOCKED",
                &format!("/parts/{input_index}/name"),
                "Part name must be valid UTF-8",
            ));
            return make_report(
                version,
                part_count,
                parts,
                commits,
                diagnostics,
                &projections,
                None,
                None,
                "",
                ctx,
            );
        };
        let Some((named_version, ordinal, declared_count)) = parse_name(&name) else {
            diagnostics.push(diag(
                "DELTA_MULTIPART_BLOCKED",
                &format!("/parts/{input_index}/name"),
                "Part filename must use canonical 20/10/10 checkpoint naming",
            ));
            return make_report(
                version,
                part_count,
                parts,
                commits,
                diagnostics,
                &projections,
                None,
                None,
                "",
                ctx,
            );
        };
        if named_version != version
            || declared_count != part_count
            || ordinal == 0
            || ordinal > part_count
            || ordinal_to_input[ordinal - 1] != usize::MAX
        {
            diagnostics.push(diag(
                "DELTA_MULTIPART_BLOCKED",
                &format!("/parts/{input_index}/name"),
                "Part version/count mismatch or duplicate/out-of-range ordinal",
            ));
            return make_report(
                version,
                part_count,
                parts,
                commits,
                diagnostics,
                &projections,
                None,
                None,
                "",
                ctx,
            );
        }
        ordinal_to_input[ordinal - 1] = input_index;
        let Some(source) = field(part, "source") else {
            diagnostics.push(diag(
                "DELTA_MULTIPART_BLOCKED",
                &format!("/parts/{input_index}/source"),
                "Part source is required",
            ));
            return make_report(
                version,
                part_count,
                parts,
                commits,
                diagnostics,
                &projections,
                None,
                None,
                "",
                ctx,
            );
        };
        let bytes = match export_parquet_capture(source, engine, registry, capabilities, ctx) {
            Ok(bytes) => bytes,
            Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
            Err(error) => {
                diagnostics.push(diag(
                    "DELTA_MULTIPART_BLOCKED",
                    &format!("/parts/{input_index}/source"),
                    &error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Invalid Parquet source".into()),
                ));
                return make_report(
                    version,
                    part_count,
                    parts,
                    commits,
                    diagnostics,
                    &projections,
                    None,
                    None,
                    "",
                    ctx,
                );
            }
        };
        total_bytes = total_bytes
            .checked_add(bytes.len())
            .ok_or_else(|| limit("Multipart byte total overflow"))?;
        if total_bytes > MAX_BYTES {
            diagnostics.push(diag(
                "DELTA_MULTIPART_BLOCKED",
                "/parts",
                "Multipart input exceeds the 16 MB decode budget",
            ));
            return make_report(
                version,
                part_count,
                parts,
                commits,
                diagnostics,
                &projections,
                None,
                None,
                "",
                ctx,
            );
        }
    }

    projections
        .try_reserve_exact(part_count)
        .map_err(|_| limit("Projection index allocation refused"))?;
    projections.resize_with(part_count, || None);
    let mut origins: Vec<Value> = Vec::new();
    let mut cluster_rows: Vec<Value> = Vec::new();
    let mut combined: Vec<u16> = Vec::new();
    let mut action_rows_seen = 0usize;
    for (ordinal_index, input_index) in ordinal_to_input.iter().copied().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let source = field(&part_rows[input_index], "source")
            .ok_or_else(|| request("Part source missing"))?;
        let projection = project_delta_parquet_actions(
            source,
            engine,
            registry,
            capabilities,
            logs,
            actions,
            ctx,
        )?;
        append_diagnostics(
            &mut diagnostics,
            field(&projection, "diagnostics"),
            &format!("/parts/{input_index}/projection"),
            ctx,
        )?;
        let projection_valid = text(&projection, "status").as_deref() == Some("projected");
        let action_rows = array_field(&projection, "actions").unwrap_or(&[]);
        let log = field(&projection, "log");
        let projected_text = match log {
            Some(log) if projection_valid => delta_log::export_delta_log(log, logs, ctx)?,
            _ => {
                projections[input_index] = Some(projection);
                return make_report(
                    version,
                    part_count,
                    parts,
                    commits,
                    diagnostics,
                    &projections,
                    None,
                    None,
                    "",
                    ctx,
                );
            }
        };
        let raw_lines = projected_text
            .units()
            .split_inclusive(|unit| *unit == b'\n' as u16);
        let mut raw_iter = raw_lines.peekable();
        if action_rows.len().saturating_add(action_rows_seen) > MAX_ACTIONS {
            diagnostics.push(diag(
                "DELTA_MULTIPART_BLOCKED",
                "/parts",
                "Combined action limit exceeds 10000",
            ));
            projections[input_index] = Some(projection);
            return make_report(
                version,
                part_count,
                parts,
                commits,
                diagnostics,
                &projections,
                None,
                None,
                "",
                ctx,
            );
        }
        for (row_index, action) in action_rows.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            let Some(raw) = raw_iter.next() else {
                return Err(request("Projected action has no JSONL source line"));
            };
            if raw.is_empty() {
                continue;
            }
            if raw.len() > MAX_TEXT.saturating_sub(combined.len()) {
                diagnostics.push(diag(
                    "DELTA_MULTIPART_BLOCKED",
                    "/parts",
                    "Combined checkpoint exceeds one million UTF-16 code units",
                ));
                projections[input_index] = Some(projection);
                return make_report(
                    version,
                    part_count,
                    parts,
                    commits,
                    diagnostics,
                    &projections,
                    None,
                    None,
                    "",
                    ctx,
                );
            }
            ctx.charge_text(raw.len(), Utf16::default())?;
            combined
                .try_reserve(raw.len())
                .map_err(|_| limit("Multipart log allocation refused"))?;
            combined.extend_from_slice(raw);
            let kind = text(action, "action").unwrap_or_default();
            let action_value =
                field(action, "value").ok_or_else(|| request("Projected action value missing"))?;
            if !matches!(
                kind.as_str(),
                "add" | "remove" | "protocol" | "metaData" | "txn" | "domainMetadata"
            ) {
                diagnostics.push(diag(
                    "DELTA_MULTIPART_BLOCKED",
                    &format!("/parts/{input_index}/projection/actions/{row_index}"),
                    "Unsupported or forbidden multipart action",
                ));
                projections[input_index] = Some(projection);
                return make_report(
                    version,
                    part_count,
                    parts,
                    commits,
                    diagnostics,
                    &projections,
                    None,
                    None,
                    "",
                    ctx,
                );
            }
            ctx.charge_text(11, Utf16::default())?;
            origins
                .try_reserve(1)
                .map_err(|_| limit("Origin output allocation refused"))?;
            origins.push(object(vec![
                ("line", Value::Number((action_rows_seen + 1) as f64)),
                ("part", Value::Number(input_index as f64)),
                (
                    "row",
                    Value::Number(number_field(action, "row").unwrap_or((row_index + 1) as f64)),
                ),
            ]));
            cluster_rows
                .try_reserve(1)
                .map_err(|_| limit("Clustering row allocation refused"))?;
            cluster_rows.push(object(vec![
                ("ordinal", Value::Number((ordinal_index + 1) as f64)),
                ("action", Value::string_utf8(&kind)),
                ("value", crate::copy_json(action_value, ctx)?),
            ]));
            action_rows_seen += 1;
        }
        if raw_iter.next().is_some() {
            return Err(request("Projected log has extra JSONL source lines"));
        }
        projections[input_index] = Some(projection);
    }

    let checkpoint_log_id = derived_id(version, ctx)?;
    let checkpoint_log = delta_log::capture_delta_log(&combined, &checkpoint_log_id, logs, ctx)?;
    let checkpoint_for_report = object(vec![
        ("version", Value::string_utf8(version)),
        ("source", crate::copy_json(&checkpoint_log, ctx)?),
    ]);
    let inspected =
        crate::delta_actions::inspect_delta_actions(&checkpoint_log, logs, actions, ctx)?;
    if !bool_field(&inspected, "knownShapesValid").unwrap_or(false) {
        append_diagnostics(
            &mut diagnostics,
            field(&inspected, "diagnostics"),
            "/checkpoint",
            ctx,
        )?;
        return make_report(
            version,
            part_count,
            parts,
            commits,
            diagnostics,
            &projections,
            None,
            None,
            "",
            ctx,
        );
    }
    if action_rows_seen.saturating_add(commit_rows.len()) > MAX_ACTIONS {
        diagnostics.push(diag(
            "DELTA_HISTORY_LIMIT",
            "/sources",
            "Checkpoint actions and following commits exceed 10000 entries",
        ));
        return make_report(
            version,
            part_count,
            parts,
            commits,
            diagnostics,
            &projections,
            None,
            None,
            "",
            ctx,
        );
    }
    if has_v2_checkpoint_feature(&cluster_rows, ctx)? {
        diagnostics.push(diag(
            "DELTA_MULTIPART_BLOCKED",
            "/parts",
            "v2Checkpoint forbids multipart checkpoints",
        ));
        return make_report(
            version,
            part_count,
            parts,
            commits,
            diagnostics,
            &projections,
            None,
            None,
            "",
            ctx,
        );
    }
    if let Some(message) = check_spark_clustering(&cluster_rows, part_count, ctx)? {
        diagnostics.push(diag("DELTA_MULTIPART_BLOCKED", "/parts", &message));
        return make_report(
            version,
            part_count,
            parts,
            commits,
            diagnostics,
            &projections,
            None,
            None,
            "",
            ctx,
        );
    }
    if let Some(message) = validate_following(version, commit_rows, ctx)? {
        diagnostics.push(diag("DELTA_HISTORY_SEQUENCE", "/sources", &message));
        return make_report(
            version,
            part_count,
            parts,
            commits,
            diagnostics,
            &projections,
            None,
            None,
            "",
            ctx,
        );
    }

    // The shared replay kernel uses zero-based synthetic versions. Original
    // version/commit inputs remain in the public report untouched.
    let mut synthetic = Vec::new();
    synthetic
        .try_reserve_exact(commit_rows.len().saturating_add(1))
        .map_err(|_| limit("Replay input allocation refused"))?;
    synthetic.push(object(vec![
        ("version", Value::string_utf8("0")),
        ("source", checkpoint_log),
    ]));
    for (index, commit) in commit_rows.iter().enumerate() {
        synthetic.push(object(vec![
            ("version", Value::string_utf8(&(index + 1).to_string())),
            (
                "source",
                crate::copy_json(
                    field(commit, "source").ok_or_else(|| request("Commit source missing"))?,
                    ctx,
                )?,
            ),
        ]));
    }
    let mut recovery = delta_reconcile::reconcile_delta_checkpoint_commits(
        &Value::Array(synthetic),
        logs,
        actions,
        ctx,
    )?;
    remap_replay_paths(&mut recovery, ctx)?;
    let final_version = commit_rows
        .last()
        .and_then(|commit| field(commit, "version"))
        .or_else(|| Some(field(&checkpoint_for_report, "version")?));
    if let (Some(state), Some(version)) = (field(&recovery, "state"), final_version) {
        let mut state = crate::copy_json(state, ctx)?;
        set(&mut state, "version", crate::copy_json(version, ctx)?)?;
        set(&mut recovery, "state", state)?;
    }
    append_diagnostics(
        &mut diagnostics,
        field(&recovery, "diagnostics"),
        "/recovery",
        ctx,
    )?;
    set(&mut recovery, "sources", crate::copy_json(commits, ctx)?)?;
    set(&mut recovery, "checkpoint", checkpoint_for_report)?;
    make_report(
        version, part_count, parts, commits, diagnostics, &projections,
        Some(Value::Array(origins)), Some(recovery),
        "Complete explicit part identities and Spark 4.0.1 hash clustering checked. Concurrent-writer provenance, placement, discovery and safe writes remain unverified",
        ctx,
    )
}

fn make_report(
    version: &str,
    part_count: usize,
    parts: &Value,
    sources: &Value,
    diagnostics: Vec<Value>,
    projections: &[Option<Value>],
    origins: Option<Value>,
    recovery: Option<Value>,
    warning: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut part_copy = crate::copy_json(parts, ctx)?;
    if let (Value::Array(rows), true) = (&mut part_copy, !projections.is_empty()) {
        ctx.charge_work(rows.len(), Utf16::default())?;
        ctx.charge_text(rows.len().saturating_mul(10), Utf16::default())?;
        for (index, (row, projection)) in rows.iter_mut().zip(projections).enumerate() {
            let Some(projection) = projection else {
                continue;
            };
            if let Value::Object(fields) = row {
                let key = Utf16::from("projection");
                if !fields.iter().any(|(field, _)| field == &key) {
                    ctx.charge_text(key.units().len(), Utf16::default())?;
                    fields
                        .try_reserve(1)
                        .map_err(|_| limit("Part projection output allocation refused"))?;
                }
                set(row, "projection", crate::copy_json(projection, ctx)?)?;
            } else {
                return Err(request(if index == 0 {
                    "Part must be an object"
                } else {
                    "Part must be an object"
                }));
            }
        }
    }
    let mut result = vec![
        (
            Utf16::from("status"),
            Value::string_utf8(
                if recovery.as_ref().and_then(|r| text(r, "status")).as_deref()
                    == Some("reconciled")
                {
                    "reconciled"
                } else {
                    "blocked"
                },
            ),
        ),
        (Utf16::from("complete"), Value::Bool(false)),
        (Utf16::from("version"), Value::string_utf8(version)),
        (Utf16::from("partCount"), Value::Number(part_count as f64)),
        (Utf16::from("parts"), part_copy),
        (Utf16::from("sources"), crate::copy_json(sources, ctx)?),
        (Utf16::from("diagnostics"), Value::Array(diagnostics)),
    ];
    if let Some(origins) = origins {
        result.push((Utf16::from("origins"), origins));
    }
    if let Some(recovery) = recovery {
        result.push((Utf16::from("recovery"), recovery));
    }
    if !warning.is_empty() {
        if let Value::Array(rows) = &mut result[6].1 {
            ctx.charge_work(1, Utf16::default())?;
            rows.try_reserve(1)
                .map_err(|_| limit("Scope diagnostic allocation refused"))?;
            rows.push(warning_diag("DELTA_MULTIPART_SCOPE", "", warning));
        }
    }
    Ok(Value::Object(result))
}

fn validate_following(
    version: &str,
    commits: &[Value],
    ctx: &mut Context<'_>,
) -> Result<Option<String>, EngineError> {
    let start = version
        .parse::<u64>()
        .map_err(|_| request("Invalid checkpoint version"))?;
    if commits.len().saturating_add(1) > MAX_ACTIONS {
        return Ok(Some("Checkpoint and commits exceed 10000 entries".into()));
    }
    for (index, commit) in commits.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let Some(expected) = start.checked_add(index as u64 + 1) else {
            return Ok(Some("Commit version overflow".into()));
        };
        let expected_text = expected.to_string();
        if expected > i64::MAX as u64
            || text(commit, "version").as_deref() != Some(expected_text.as_str())
        {
            return Ok(Some(
                "Following commits must be contiguous after the multipart checkpoint".into(),
            ));
        }
        if field(commit, "source").is_none() {
            return Ok(Some("Commit source is required".into()));
        }
    }
    Ok(None)
}

fn has_v2_checkpoint_feature(rows: &[Value], ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    for line in rows {
        ctx.charge_work(1, Utf16::default())?;
        let action = text(line, "action").unwrap_or_default();
        if action != "protocol" {
            continue;
        }
        let empty = Value::Null;
        let value = field(line, "value").unwrap_or(&empty);
        for name in ["readerFeatures", "writerFeatures"] {
            if feature_contains(Some(value), name, "v2Checkpoint", ctx)? {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn feature_contains(
    protocol: Option<&Value>,
    field_name: &str,
    expected: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for item in native_array(protocol.and_then(|value| native_field(Some(value), field_name))) {
        ctx.charge_work(1, Utf16::default())?;
        let value = match item {
            Value::String(value) => Some(value),
            Value::Object(_) if native_string_kind(item, "string") => {
                match native_field(Some(item), "value") {
                    Some(Value::String(value)) => Some(value),
                    _ => None,
                }
            }
            _ => None,
        };
        if value.is_some_and(|value| utf16_equals(value.units(), expected)) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn native_string_kind(value: &Value, expected: &str) -> bool {
    matches!(native_field(Some(value), "kind"), Some(Value::String(kind)) if utf16_equals(kind.units(), expected))
}

fn utf16_equals(units: &[u16], expected: &str) -> bool {
    units.iter().copied().eq(expected.encode_utf16())
}

fn check_spark_clustering(
    rows: &[Value],
    part_count: usize,
    ctx: &mut Context<'_>,
) -> Result<Option<String>, EngineError> {
    let mut protocol = None;
    for row in rows {
        ctx.charge_work(1, Utf16::default())?;
        if text(row, "action").as_deref() == Some("protocol") {
            protocol = field(row, "value");
            break;
        }
    }
    let read_dv = feature_contains(protocol, "readerFeatures", "deletionVectors", ctx)?;
    let write_dv = feature_contains(protocol, "writerFeatures", "deletionVectors", ctx)?;
    if read_dv != write_dv {
        return Ok(Some("Deletion-vector feature declarations disagree".into()));
    }
    let uses_dv = read_dv || write_dv;
    if uses_dv
        && (native_integer(protocol.and_then(|p| native_field(Some(p), "minReaderVersion")))
            != Some(3)
            || native_integer(protocol.and_then(|p| native_field(Some(p), "minWriterVersion")))
                != Some(7))
    {
        return Ok(Some("Deletion vectors require protocol 3/7".into()));
    }
    for row in rows {
        ctx.charge_work(1, Utf16::default())?;
        let action = text(row, "action").unwrap_or_default();
        let value = field(row, "value").unwrap_or(&Value::Null);
        if !matches!(
            action.as_str(),
            "add" | "remove" | "protocol" | "metaData" | "txn" | "domainMetadata"
        ) {
            return Ok(Some("Unsupported or forbidden multipart action".into()));
        }
        let path = if action == "add" || action == "remove" {
            native_string(native_field(Some(value), "path"))
        } else {
            None
        };
        if matches!(action.as_str(), "add" | "remove") && path.is_none() {
            return Ok(Some("File action is missing its path identity".into()));
        }
        let dv = native_field(Some(value), "deletionVector");
        if dv.is_some_and(|dv| !native_null(dv)) && !uses_dv {
            return Ok(Some("Deletion vector requires its declared feature".into()));
        }
        let mut hash = spark_string_hash(path.as_deref(), 42);
        if uses_dv && path.is_some() {
            if let Some(dv_value @ Value::Object(_)) = dv {
                let Some(storage) = native_string(native_field(Some(dv_value), "storageType"))
                else {
                    return Ok(Some("Malformed deletion-vector identity".into()));
                };
                let Some(location) = native_string(native_field(Some(dv_value), "pathOrInlineDv"))
                else {
                    return Ok(Some("Malformed deletion-vector identity".into()));
                };
                let offset = match native_field(Some(dv_value), "offset") {
                    Some(v) if !native_null(v) => {
                        let Some(offset) =
                            native_string(Some(v)).and_then(|value| canonical_integer(&value))
                        else {
                            return Ok(Some("Malformed deletion-vector offset".into()));
                        };
                        format!("@{offset}")
                    }
                    _ => String::new(),
                };
                let mut identity = String::new();
                let len = storage
                    .encode_utf16()
                    .count()
                    .saturating_add(location.encode_utf16().count())
                    .saturating_add(offset.encode_utf16().count());
                ctx.charge_text(len, Utf16::default())?;
                identity
                    .try_reserve(len)
                    .map_err(|_| limit("Deletion-vector identity allocation refused"))?;
                identity.push_str(&storage);
                identity.push_str(&location);
                identity.push_str(&offset);
                hash = spark_string_hash(Some(&identity), hash);
            } else if dv.is_some_and(|v| !native_null(v)) {
                return Ok(Some("Malformed deletion-vector identity".into()));
            }
        }
        let expected = (hash as i64).rem_euclid(part_count as i64) as usize + 1;
        if number_field(row, "ordinal") != Some(expected as f64) {
            return Ok(Some("Action violates Spark hash partitioning".into()));
        }
    }
    Ok(None)
}

fn parse_name(name: &str) -> Option<(String, usize, usize)> {
    if name.len() != 61
        || !name.is_ascii()
        || &name[20..32] != ".checkpoint."
        || &name[42..43] != "."
        || &name[53..61] != ".parquet"
    {
        return None;
    }
    let version_token = &name[..20];
    let ordinal_token = &name[32..42];
    let count_token = &name[43..53];
    if !version_token.bytes().all(|b| b.is_ascii_digit())
        || !ordinal_token.bytes().all(|b| b.is_ascii_digit())
        || !count_token.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    Some((
        version_token.parse::<u64>().ok()?.to_string(),
        ordinal_token.parse().ok()?,
        count_token.parse().ok()?,
    ))
}
fn valid_version(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 19
        && s.bytes().all(|b| b.is_ascii_digit())
        && (s == "0" || !s.starts_with('0'))
        && s.parse::<u64>().ok().is_some_and(|n| n <= i64::MAX as u64)
}
fn native_field<'a>(v: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    let v = v?;
    field(field(v, "members").unwrap_or(v), key)
}
fn native_array(v: Option<&Value>) -> &[Value] {
    match v {
        Some(Value::Array(a)) => a,
        Some(Value::Object(_)) => native_field(v, "items").and_then(array).unwrap_or(&[]),
        _ => &[],
    }
}
fn native_string(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::String(s) => s.to_utf8().ok(),
        Value::Object(_) => match text(v?, "kind")?.as_str() {
            "string" | "number" => text(v?, "value"),
            _ => None,
        },
        _ => None,
    }
}
fn native_integer(v: Option<&Value>) -> Option<i64> {
    let text = native_string(v)?;
    text.parse().ok()
}
fn canonical_integer(value: &str) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    let negative = value.starts_with('-');
    let digits = if negative { &value[1..] } else { value };
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let digits = digits.trim_start_matches('0');
    if digits.is_empty() {
        return Some("0".to_owned());
    }
    let mut result = String::new();
    result
        .try_reserve(digits.len().saturating_add(usize::from(negative)))
        .ok()?;
    if negative {
        result.push('-');
    }
    result.push_str(digits);
    Some(result)
}
fn number_field(v: &Value, k: &str) -> Option<f64> {
    match field(v, k)? {
        Value::Number(n) if n.is_finite() && n.fract() == 0.0 => Some(*n),
        _ => None,
    }
}
fn bool_field(v: &Value, k: &str) -> Option<bool> {
    match field(v, k)? {
        Value::Bool(value) => Some(*value),
        _ => None,
    }
}
fn native_null(v: &Value) -> bool {
    matches!(v, Value::Null) || text(v, "kind").as_deref() == Some("null")
}
fn array(v: &Value) -> Option<&[Value]> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn array_field<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    array(field(v, k)?)
}
fn field<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter()
            .find(|(key, _)| key == &Utf16::from(k))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn text(v: &Value, k: &str) -> Option<String> {
    as_utf8(field(v, k)?)
}
fn as_utf8(v: &Value) -> Option<String> {
    if let Value::String(s) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn diag(code: &str, path: &str, message: &str) -> Value {
    object(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8(path)),
        ("severity", Value::string_utf8("error")),
        ("message", Value::string_utf8(message)),
    ])
}
fn warning_diag(code: &str, path: &str, message: &str) -> Value {
    object(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8(path)),
        ("severity", Value::string_utf8("warning")),
        ("message", Value::string_utf8(message)),
    ])
}
fn append_diagnostics(
    out: &mut Vec<Value>,
    rows: Option<&Value>,
    prefix: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(rows) = rows.and_then(array) {
        ctx.charge_work(rows.len(), Utf16::default())?;
        out.try_reserve(rows.len())
            .map_err(|_| limit("Diagnostic output allocation refused"))?;
        for row in rows {
            let mut d = crate::copy_json(row, ctx)?;
            let path = match field(&d, "path") {
                Some(Value::String(path)) => path.units(),
                _ => &[],
            };
            let prefix_len = prefix.encode_utf16().count();
            let total = prefix_len.saturating_add(path.len());
            ctx.charge_text(total, Utf16::default())?;
            let mut rendered = Vec::new();
            rendered
                .try_reserve_exact(total)
                .map_err(|_| limit("Diagnostic path allocation refused"))?;
            rendered.extend(prefix.encode_utf16());
            rendered.extend_from_slice(path);
            set(&mut d, "path", Value::String(Utf16::new(rendered)))?;
            out.push(d)
        }
    }
    Ok(())
}
fn set(v: &mut Value, k: &str, value: Value) -> Result<(), EngineError> {
    if let Value::Object(m) = v {
        if let Some((_, old)) = m.iter_mut().find(|(key, _)| key == &Utf16::from(k)) {
            *old = value
        } else {
            m.push((Utf16::from(k), value))
        }
        Ok(())
    } else {
        Err(request("Expected object"))
    }
}

fn remap_replay_paths(recovery: &mut Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Some(Value::Array(rows)) = field(recovery, "diagnostics") else {
        return Ok(());
    };
    let mut copied = Vec::new();
    copied
        .try_reserve_exact(rows.len())
        .map_err(|_| limit("Replay diagnostic allocation refused"))?;
    for row in rows {
        let mut row = crate::copy_json(row, ctx)?;
        if let Some(path) = text(&row, "path") {
            let mapped = if path == "/sources/0" {
                "/checkpoint".to_owned()
            } else if let Some(rest) = path.strip_prefix("/sources/0/") {
                format!("/checkpoint/{rest}")
            } else if let Some(rest) = path.strip_prefix("/sources/") {
                let (index, tail) = rest.split_once('/').unwrap_or((rest, ""));
                match index.parse::<usize>() {
                    Ok(0) => "/checkpoint".to_owned(),
                    Ok(index) if tail.is_empty() => format!("/sources/{}", index - 1),
                    Ok(index) => format!("/sources/{}/{tail}", index - 1),
                    Err(_) => path,
                }
            } else {
                path
            };
            ctx.charge_text(mapped.encode_utf16().count(), Utf16::default())?;
            set(&mut row, "path", Value::string_utf8(&mapped))?;
        }
        copied.push(row);
    }
    set(recovery, "diagnostics", Value::Array(copied))
}
fn derived_id(version: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_text(10usize.saturating_add(version.len()), Utf16::default())?;
    let s = format!("multipart-{version}");
    Ok(Utf16::from(s))
}
fn request(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn limit(message: &'static str) -> EngineError {
    EngineError::new("LIMIT", Utf16::default(), message)
}
