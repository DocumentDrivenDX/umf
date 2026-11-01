// SPDX-License-Identifier: MIT OR Apache-2.0
//! Resolves explicitly supplied Parquet sidecars referenced by a Delta JSONL checkpoint.
use crate::{
    context::Context,
    delta_actions::{self, DeltaActionResources},
    delta_log::{self, DeltaLogResources},
    delta_parquet_actions::project_delta_parquet_actions,
    delta_reconcile,
    engine::{Capabilities, Engine},
    error::EngineError,
    native_json::NativeJsonTree,
    parquet_capture_inspection::export_parquet_capture,
    registry::Registry,
    value::{Utf16, Value},
};

const MAX_SIDECARS: usize = 1_000;
const MAX_ACTIONS: usize = 10_000;
const MAX_TEXT: usize = 1_000_000;
const MAX_BYTES: usize = 16_000_000;

pub fn reconcile_delta_jsonl_checkpoint_sidecars(
    checkpoint: &Value,
    commits: &Value,
    sidecars: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    logs: &DeltaLogResources,
    actions: &DeltaActionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let checkpoint = crate::copy_json(checkpoint, ctx)?;
    let commits = crate::copy_json(commits, ctx)?;
    let sidecars = crate::copy_json(sidecars, ctx)?;
    let mut diagnostics = Vec::new();
    let Some(version) = text(&checkpoint, "version") else {
        return report(
            checkpoint,
            commits,
            sidecars,
            diagnostics_with(
                "/checkpoint/version",
                "Expected a canonical nonnegative signed-int64 checkpoint version",
            ),
            None,
            None,
            None,
            None,
            None,
        );
    };
    if parse_version(&version).is_none() {
        return report(
            checkpoint,
            commits,
            sidecars,
            diagnostics_with(
                "/checkpoint/version",
                "Expected a canonical nonnegative signed-int64 checkpoint version",
            ),
            None,
            None,
            None,
            None,
            None,
        );
    }
    let Some(source) = field(&checkpoint, "source") else {
        return report(
            checkpoint,
            commits,
            sidecars,
            diagnostics_with(
                "/checkpoint/source",
                "Expected an authoritative Delta JSONL document",
            ),
            None,
            None,
            None,
            None,
            None,
        );
    };
    let sidecar_rows = match array(Some(&sidecars)) {
        Some(rows) if rows.len() <= MAX_SIDECARS => rows,
        _ => {
            return report(
                checkpoint,
                commits,
                sidecars,
                diagnostics_with(
                    "/sidecars",
                    "Expected at most 1000 explicit sidecar documents",
                ),
                None,
                None,
                None,
                None,
                None,
            )
        }
    };
    let Some(commit_rows) = array(Some(&commits)) else {
        return report(
            checkpoint,
            commits,
            sidecars,
            diagnostics_with("/sources", "Expected following commits"),
            None,
            None,
            None,
            None,
            None,
        );
    };
    let inspected = match delta_actions::inspect_delta_actions(source, logs, actions, ctx) {
        Ok(value) => value,
        Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
        Err(error) => {
            diagnostics.push(diag(
                "/checkpoint",
                &error
                    .message
                    .to_utf8()
                    .unwrap_or_else(|_| "Invalid Delta checkpoint source".into()),
            ));
            return report(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                None,
                None,
                None,
                None,
                None,
            );
        }
    };
    append_diagnostics(
        &mut diagnostics,
        field(&inspected, "diagnostics"),
        "/checkpoint",
        ctx,
    )?;
    if !bool_value(field(&inspected, "knownShapesValid")).unwrap_or(false) {
        return report(
            checkpoint,
            commits,
            sidecars,
            diagnostics,
            None,
            None,
            None,
            None,
            None,
        );
    }
    let mut supplied = Vec::<(Utf16, usize)>::new();
    supplied
        .try_reserve_exact(sidecar_rows.len())
        .map_err(|_| limit("Sidecar index allocation refused"))?;
    for (index, sidecar) in sidecar_rows.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let Some(Value::String(path)) = field(sidecar, "path") else {
            diagnostics.push(diag(
                &format!("/sidecars/{index}/path"),
                "Expected an exact supplied sidecar path string",
            ));
            return report(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                None,
                None,
                None,
                None,
                None,
            );
        };
        let mut duplicate = false;
        for (existing, _) in &supplied {
            ctx.charge_work(1, Utf16::default())?;
            if existing == path {
                duplicate = true;
                break;
            }
        }
        if duplicate {
            diagnostics.push(diag(
                &format!("/sidecars/{index}/path"),
                "Duplicate supplied sidecar path",
            ));
            return report(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                None,
                None,
                None,
                None,
                None,
            );
        }
        ctx.charge_text(path.len(), Utf16::default())?;
        supplied.push((path.clone(), index));
        if field(sidecar, "source").is_none() {
            diagnostics.push(diag(
                &format!("/sidecars/{index}/source"),
                "Sidecar source is required",
            ));
            return report(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                None,
                None,
                None,
                None,
                None,
            );
        }
    }
    let start = parse_version(&version).ok_or_else(|| request("Invalid checkpoint version"))?;
    if commit_rows.len() > MAX_ACTIONS.saturating_sub(1) {
        return blocked(
            checkpoint,
            commits,
            sidecars,
            diagnostics,
            "/sources",
            "At most 10000 checkpoint and commit rows are supported",
        );
    }
    for (index, commit) in commit_rows.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let expected = start
            .checked_add(index as u64 + 1)
            .filter(|value| *value <= i64::MAX as u64);
        let actual = text(commit, "version").and_then(|value| parse_version(&value));
        if actual != expected {
            diagnostics.push(diag(
                &format!("/sources/{index}/version"),
                "Commit versions must be contiguous after the checkpoint",
            ));
            return report(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                None,
                None,
                None,
                None,
                None,
            );
        }
    }
    let Some(lines) = array(field(&inspected, "lines")) else {
        return report(
            checkpoint,
            commits,
            sidecars,
            diagnostics_with("/checkpoint", "Checkpoint action lines are unavailable"),
            None,
            None,
            None,
            None,
            None,
        );
    };
    let mut marker_count = 0usize;
    let mut marker_valid = false;
    let mut protocol_valid = false;
    for line in lines {
        ctx.charge_work(1, Utf16::default())?;
        let Some(node_members) = field(line, "node").and_then(|node| field(node, "members")) else {
            continue;
        };
        match text(line, "action").as_deref() {
            Some("checkpointMetadata") => {
                marker_count += 1;
                let version = field(node_members, "checkpointMetadata")
                    .and_then(|node| field(node, "members"))
                    .and_then(|members| tagged_number(field(members, "version")))
                    .and_then(|value| parse_version(&value));
                marker_valid |= version == Some(start);
            }
            Some("protocol") => {
                if let Some(members) =
                    field(node_members, "protocol").and_then(|node| field(node, "members"))
                {
                    protocol_valid |= tagged_number(field(members, "minReaderVersion")).as_deref()
                        == Some("3")
                        && tagged_number(field(members, "minWriterVersion")).as_deref()
                            == Some("7")
                        && tagged_feature(field(members, "readerFeatures"), ctx)?
                        && tagged_feature(field(members, "writerFeatures"), ctx)?;
                }
            }
            _ => {}
        }
    }
    if marker_count != 1 || !marker_valid {
        return blocked(
            checkpoint,
            commits,
            sidecars,
            diagnostics,
            "/checkpoint",
            "Exactly one checkpointMetadata action must match the checkpoint version",
        );
    }
    if !protocol_valid {
        return blocked(
            checkpoint,
            commits,
            sidecars,
            diagnostics,
            "/checkpoint",
            "V2 checkpoints require protocol 3/7 and both v2Checkpoint features",
        );
    }
    let mut referenced = Vec::<Utf16>::new();
    referenced
        .try_reserve(sidecar_rows.len())
        .map_err(|_| limit("Reference index allocation refused"))?;
    let mut output = Vec::<u16>::new();
    let mut origins = Vec::<Value>::new();
    let mut omitted = Vec::<Value>::new();
    let mut conversions = Vec::<Value>::new();
    let mut projection_diagnostics = Vec::<Value>::new();
    let mut total_bytes = 0usize;
    let mut embedded_files = false;
    let mut derived_line_count = 0usize;
    let mut marker_lines = Vec::<bool>::new();
    for (line_index, line) in lines.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if text(line, "status").as_deref() != Some("parsed") {
            diagnostics.push(diag(
                &format!("/checkpoint/lines/{line_index}"),
                "Checkpoint must contain parsed nonblank action lines",
            ));
            return report(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                None,
                None,
                None,
                None,
                None,
            );
        }
        let node_value =
            field(line, "node").ok_or_else(|| request("Checkpoint action node is missing"))?;
        let action =
            text(line, "action").ok_or_else(|| request("Checkpoint action name is missing"))?;
        if action != "sidecar" {
            if action == "commitInfo" || action == "cdc" {
                return blocked(
                    checkpoint,
                    commits,
                    sidecars,
                    diagnostics,
                    &format!("/checkpoint/lines/{line_index}"),
                    "Checkpoint cannot contain commit provenance or CDC actions",
                );
            }
            if action == "domainMetadata"
                && field(node_value, "members")
                    .and_then(|members| field(members, "domainMetadata"))
                    .and_then(|domain| field(domain, "members"))
                    .and_then(|members| field(members, "removed"))
                    .is_some_and(|removed| {
                        text(removed, "kind").as_deref() == Some("boolean")
                            && bool_value(field(removed, "value")) == Some(true)
                    })
            {
                return blocked(
                    checkpoint,
                    commits,
                    sidecars,
                    diagnostics,
                    &format!("/checkpoint/lines/{line_index}"),
                    "Checkpoint cannot contain removed domain actions",
                );
            }
            if action == "add" || action == "remove" {
                embedded_files = true;
            }
            append_node_line(&mut output, node_value, &mut derived_line_count, ctx)?;
            marker_lines
                .try_reserve(1)
                .map_err(|_| limit("Checkpoint marker allocation refused"))?;
            marker_lines.push(action == "checkpointMetadata");
            ctx.charge_work(1, Utf16::default())?;
            origins
                .try_reserve(1)
                .map_err(|_| limit("Origin allocation refused"))?;
            origins.push(origin(derived_line_count, line_index + 1, None, None));
            continue;
        }
        let node_members = field(node_value, "members")
            .ok_or_else(|| request("Checkpoint action members are missing"))?;
        let sidecar_value = field(node_members, "sidecar")
            .ok_or_else(|| request("Sidecar action is missing its payload"))?;
        let members = field(sidecar_value, "members")
            .ok_or_else(|| request("Invalid sidecar action payload"))?;
        let Some(path) = tagged_string(field(members, "path")) else {
            return blocked(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                "/checkpoint",
                "Expected an exact sidecar reference path",
            );
        };
        let mut duplicate = false;
        for seen in &referenced {
            ctx.charge_work(1, Utf16::default())?;
            if seen == path {
                duplicate = true;
                break;
            }
        }
        if duplicate {
            return blocked(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                "/checkpoint",
                "Duplicate sidecar reference",
            );
        }
        ctx.charge_text(path.len(), Utf16::default())?;
        referenced
            .try_reserve(1)
            .map_err(|_| limit("Reference output allocation refused"))?;
        referenced.push(path.clone());
        let mut supplied_index = None;
        for (candidate, index) in &supplied {
            ctx.charge_work(1, Utf16::default())?;
            if candidate == path {
                supplied_index = Some(*index);
                break;
            }
        }
        let Some(supplied_index) = supplied_index else {
            return blocked(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                "/checkpoint",
                "No explicitly supplied sidecar matches this exact path",
            );
        };
        let sidecar = &sidecar_rows[supplied_index];
        let sidecar_source =
            field(sidecar, "source").ok_or_else(|| request("Sidecar source is missing"))?;
        let raw = match export_parquet_capture(sidecar_source, engine, registry, capabilities, ctx)
        {
            Ok(raw) => raw,
            Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
            Err(error) => {
                diagnostics.push(diag(
                    &format!("/sidecars/{supplied_index}/source"),
                    &error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Invalid Parquet sidecar".into()),
                ));
                return report(
                    checkpoint,
                    commits,
                    sidecars,
                    diagnostics,
                    None,
                    None,
                    None,
                    None,
                    None,
                );
            }
        };
        total_bytes = total_bytes
            .checked_add(raw.len())
            .ok_or_else(|| limit("Sidecar byte count overflow"))?;
        if total_bytes > MAX_BYTES {
            return blocked(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                "/sidecars",
                "Supplied sidecars exceed the 16 MB decode budget",
            );
        }
        // The checkpoint action is a tagged NativeJson tree. Compare the
        // original integer token rather than coercing it through f64.
        let expected_size = tagged_number(field(members, "sizeInBytes"))
            .and_then(|lexical| lexical.parse::<u64>().ok());
        if expected_size != Some(raw.len() as u64) {
            return blocked(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                "/checkpoint",
                "Sidecar byte size does not match reference",
            );
        }
        let projection = match project_delta_parquet_actions(
            sidecar_source,
            engine,
            registry,
            capabilities,
            logs,
            actions,
            ctx,
        ) {
            Ok(value) => value,
            Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
            Err(error) => {
                diagnostics.push(diag(
                    &format!("/sidecars/{supplied_index}"),
                    &error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Invalid Parquet sidecar".into()),
                ));
                return report(
                    checkpoint,
                    commits,
                    sidecars,
                    diagnostics,
                    None,
                    None,
                    None,
                    None,
                    None,
                );
            }
        };
        append_diagnostics(
            &mut projection_diagnostics,
            field(&projection, "diagnostics"),
            &format!("/sidecars/{supplied_index}"),
            ctx,
        )?;
        if text(&projection, "status").as_deref() != Some("projected") {
            append_values(&mut diagnostics, &projection_diagnostics, ctx)?;
            return report(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                None,
                None,
                None,
                None,
                None,
            );
        }
        // The current sidecar adapter only resolves file actions. Other
        // projector output must remain a refusal instead of being silently
        // replayed without its semantics.
        let Some(Value::Array(projected_actions)) = field(&projection, "actions") else {
            return blocked(
                checkpoint,
                commits,
                sidecars,
                diagnostics,
                &format!("/sidecars/{supplied_index}/actions"),
                "Projected sidecar actions are unavailable",
            );
        };
        for (action_index, projected_action) in projected_actions.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            let supported = matches!(
                text(projected_action, "action").as_deref(),
                Some("add" | "remove")
            );
            if !supported {
                return blocked(
                    checkpoint,
                    commits,
                    sidecars,
                    diagnostics,
                    &format!("/sidecars/{supplied_index}/actions/{action_index}"),
                    "Sidecars may project only add or remove actions",
                );
            }
        }
        let Some(projected_log) = field(&projection, "log") else {
            return Err(request("Projected sidecar log is missing"));
        };
        let projected_text = delta_log::export_delta_log(projected_log, logs, ctx)?;
        let mut row_index = 0usize;
        for projected_line in projected_text
            .units()
            .split(|unit| *unit == 10)
            .filter(|line| !line.is_empty())
        {
            if row_index >= MAX_ACTIONS || derived_line_count >= MAX_ACTIONS {
                return blocked(
                    checkpoint,
                    commits,
                    sidecars,
                    diagnostics,
                    "/sidecars",
                    "Derived checkpoint exceeds 10000 action rows",
                );
            }
            append_utf16_line(&mut output, projected_line, &mut derived_line_count, ctx)?;
            marker_lines
                .try_reserve(1)
                .map_err(|_| limit("Checkpoint marker allocation refused"))?;
            marker_lines.push(false);
            ctx.charge_work(1, Utf16::default())?;
            origins
                .try_reserve(1)
                .map_err(|_| limit("Origin output allocation refused"))?;
            origins.push(origin(
                derived_line_count,
                line_index + 1,
                Some(supplied_index),
                Some(row_index + 1),
            ));
            row_index += 1;
        }
        append_indexed(
            &mut omitted,
            field(&projection, "omittedNullFields"),
            "sidecar",
            supplied_index,
            ctx,
        )?;
        append_indexed(
            &mut conversions,
            field(&projection, "scalarConversions"),
            "sidecar",
            supplied_index,
            ctx,
        )?;
    }
    if referenced.len() != supplied.len() {
        return blocked(
            checkpoint,
            commits,
            sidecars,
            diagnostics,
            "/sidecars",
            "Every supplied sidecar must be referenced exactly once",
        );
    }
    if !referenced.is_empty() && embedded_files {
        return blocked(
            checkpoint,
            commits,
            sidecars,
            diagnostics,
            "/checkpoint",
            "Checkpoint cannot mix embedded add/remove actions with sidecar file actions",
        );
    }
    append_values(&mut diagnostics, &projection_diagnostics, ctx)?;
    let Some(checkpoint_id) = field(source, "id").and_then(|v| {
        if let Value::String(s) = v {
            Some(s)
        } else {
            None
        }
    }) else {
        return Err(request("Checkpoint source ID is required"));
    };
    let suffix = Utf16::from("-resolved");
    let id_units = checkpoint_id.len().saturating_add(suffix.len());
    ctx.charge_text(id_units, Utf16::default())?;
    let mut id = Vec::new();
    id.try_reserve_exact(id_units)
        .map_err(|_| limit("Derived ID allocation refused"))?;
    id.extend_from_slice(checkpoint_id.units());
    id.extend_from_slice(suffix.units());
    let derived_log = delta_log::capture_delta_log(&output, &Utf16::new(id), logs, ctx)?;
    if marker_lines.len() != derived_line_count {
        return Err(request("Derived checkpoint marker alignment failed"));
    }
    ctx.charge_text(output.len(), Utf16::default())?;
    let mut replay_units = Vec::new();
    replay_units
        .try_reserve_exact(output.len())
        .map_err(|_| limit("Checkpoint replay allocation refused"))?;
    let mut replay_line_origins = Vec::new();
    replay_line_origins
        .try_reserve_exact(marker_lines.len())
        .map_err(|_| limit("Checkpoint replay line allocation refused"))?;
    for (index, line) in output.split_inclusive(|unit| *unit == 10).enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if !marker_lines[index] {
            replay_units.extend_from_slice(line);
            replay_line_origins.push(index);
        }
    }
    let replay_log =
        delta_log::capture_delta_log(&replay_units, &Utf16::from("checkpoint-replay"), logs, ctx)?;
    let mut replay = Vec::new();
    replay
        .try_reserve_exact(commit_rows.len() + 1)
        .map_err(|_| limit("Replay allocation refused"))?;
    replay.push(commit(0, &replay_log, ctx)?);
    for (index, row) in commit_rows.iter().enumerate() {
        let source = field(row, "source").ok_or_else(|| request("Commit source is missing"))?;
        replay.push(commit(index + 1, source, ctx)?);
    }
    let mut recovery = delta_reconcile::reconcile_delta_checkpoint_commits(
        &Value::Array(replay),
        logs,
        actions,
        ctx,
    )?;
    remap_recovery_paths(&mut recovery, &replay_line_origins, ctx)?;
    let final_version = commit_rows
        .last()
        .and_then(|row| text(row, "version"))
        .unwrap_or_else(|| version.clone());
    if let Some(state) = field_mut(&mut recovery, "state") {
        set(
            state,
            "version",
            Value::String(Utf16::from(final_version.as_str())),
        )?;
    }
    append_diagnostics(&mut diagnostics, field(&recovery, "diagnostics"), "", ctx)?;
    let status = text(&recovery, "status").unwrap_or_else(|| "blocked".into());
    let derived_checkpoint = object(vec![
        ("version", Value::String(Utf16::from(version.as_str()))),
        ("source", crate::copy_json(&derived_log, ctx)?),
    ]);
    let state = if status == "reconciled" {
        field(&recovery, "state")
            .map(|value| crate::copy_json(value, ctx))
            .transpose()?
    } else {
        None
    };
    let mut result = report(
        checkpoint,
        commits,
        sidecars,
        diagnostics,
        Some(derived_checkpoint),
        Some(Value::Array(origins)),
        Some(Value::Array(omitted)),
        Some(Value::Array(conversions)),
        None,
    )?;
    set(&mut result, "status", Value::string_utf8(&status))?;
    if let Some(state) = state {
        set(&mut result, "state", state)?;
    }
    if let Some(Value::Array(rows)) = field_mut(&mut result, "diagnostics") {
        ctx.charge_work(1, Utf16::default())?;
        let warning = "Exact supplied reference strings and byte sizes checked; URI aliases, physical placement, modification times, and data-reader feature support remain unverified. Original checkpoint and sidecars are authoritative";
        ctx.charge_text(warning.encode_utf16().count(), Utf16::default())?;
        rows.try_reserve(1)
            .map_err(|_| limit("Scope diagnostic allocation refused"))?;
        rows.push(warning_diag("DELTA_SIDECAR_SCOPE", warning));
    }
    Ok(result)
}

fn report(
    checkpoint: Value,
    commits: Value,
    sidecars: Value,
    diagnostics: Vec<Value>,
    derived: Option<Value>,
    origins: Option<Value>,
    omitted: Option<Value>,
    conversions: Option<Value>,
    _recovery: Option<Value>,
) -> Result<Value, EngineError> {
    let mut out = object(vec![
        ("status", Value::string_utf8("blocked")),
        ("complete", Value::Bool(false)),
        ("checkpoint", checkpoint),
        ("sources", commits),
        ("sidecars", sidecars),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if let Some(v) = derived {
        let _ = set(&mut out, "derivedCheckpoint", v);
    }
    if let Some(v) = origins {
        let _ = set(&mut out, "origins", v);
    }
    if let Some(v) = omitted {
        let _ = set(&mut out, "omittedNullFields", v);
    }
    if let Some(v) = conversions {
        let _ = set(&mut out, "scalarConversions", v);
    }
    Ok(out)
}
fn blocked(
    checkpoint: Value,
    commits: Value,
    sidecars: Value,
    mut diagnostics: Vec<Value>,
    path: &str,
    message: &str,
) -> Result<Value, EngineError> {
    diagnostics.push(diag(path, message));
    report(
        checkpoint,
        commits,
        sidecars,
        diagnostics,
        None,
        None,
        None,
        None,
        None,
    )
}
fn diagnostics_with(path: &str, message: &str) -> Vec<Value> {
    vec![diag(path, message)]
}
fn append_node_line(
    out: &mut Vec<u16>,
    node: &Value,
    count: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let tree = NativeJsonTree::from_tagged_value(node, ctx)?;
    append_utf16_line(out, tree.render_compact(ctx)?.units(), count, ctx)
}
fn append_utf16_line(
    out: &mut Vec<u16>,
    line: &[u16],
    count: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let added = line.len().saturating_add(1);
    if count.saturating_add(1) > MAX_ACTIONS
        || out.len().checked_add(added).is_none_or(|n| n > MAX_TEXT)
    {
        return Err(limit("Derived checkpoint exceeds JSONL limits"));
    }
    ctx.charge_text(added, Utf16::default())?;
    out.try_reserve(added)
        .map_err(|_| limit("Derived checkpoint allocation refused"))?;
    out.extend_from_slice(line);
    out.push(10);
    *count += 1;
    Ok(())
}
fn append_diagnostics(
    out: &mut Vec<Value>,
    rows: Option<&Value>,
    prefix: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(Value::Array(rows)) = rows {
        ctx.charge_work(rows.len(), Utf16::default())?;
        out.try_reserve(rows.len())
            .map_err(|_| limit("Diagnostic allocation refused"))?;
        for row in rows {
            let mut copy = crate::copy_json(row, ctx)?;
            if let Some(Value::String(path)) = field(&copy, "path") {
                let prefix = Utf16::from(prefix);
                let length = prefix.len().saturating_add(path.len());
                ctx.charge_text(length, Utf16::default())?;
                let mut units = Vec::new();
                units
                    .try_reserve_exact(length)
                    .map_err(|_| limit("Diagnostic path allocation refused"))?;
                units.extend_from_slice(prefix.units());
                units.extend_from_slice(path.units());
                set(&mut copy, "path", Value::String(Utf16::new(units)))?;
            }
            out.push(copy);
        }
    }
    Ok(())
}
fn append_values(
    out: &mut Vec<Value>,
    rows: &[Value],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(rows.len(), Utf16::default())?;
    out.try_reserve(rows.len())
        .map_err(|_| limit("Diagnostic allocation refused"))?;
    for row in rows {
        out.push(crate::copy_json(row, ctx)?);
    }
    Ok(())
}
fn append_indexed(
    out: &mut Vec<Value>,
    rows: Option<&Value>,
    key: &str,
    index: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(Value::Array(rows)) = rows else {
        return Ok(());
    };
    ctx.charge_work(rows.len(), Utf16::default())?;
    out.try_reserve(rows.len())
        .map_err(|_| limit("Projection metadata allocation refused"))?;
    for row in rows {
        let mut copy = crate::copy_json(row, ctx)?;
        set(&mut copy, key, Value::Number(index as f64))?;
        out.push(copy);
    }
    Ok(())
}
fn commit(version: usize, source: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let text = version.to_string();
    ctx.charge_text(text.encode_utf16().count(), Utf16::default())?;
    Ok(object(vec![
        ("version", Value::string_utf8(&text)),
        ("source", crate::copy_json(source, ctx)?),
    ]))
}
fn remap_recovery_paths(
    value: &mut Value,
    replay_line_origins: &[usize],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(Value::Array(rows)) = field_mut(value, "diagnostics") else {
        return Ok(());
    };
    for row in rows {
        let Some(Value::String(path)) = field(row, "path") else {
            continue;
        };
        let units = path.units();
        let prefix = Utf16::from("/sources/");
        if !units.starts_with(prefix.units()) {
            continue;
        }
        let rest = &units[prefix.len()..];
        let digits = rest
            .iter()
            .take_while(|unit| (b'0' as u16..=b'9' as u16).contains(unit))
            .count();
        if digits == 0 {
            continue;
        }
        let Some(index) = rest[..digits].iter().try_fold(0usize, |value, unit| {
            value
                .checked_mul(10)?
                .checked_add(usize::from(*unit - b'0' as u16))
        }) else {
            continue;
        };
        let tail = &rest[digits..];
        let line_prefix = Utf16::from("/lines/");
        let (replacement, suffix) = if index == 0 && tail.starts_with(line_prefix.units()) {
            let after_prefix = &tail[line_prefix.len()..];
            let line_digits = after_prefix
                .iter()
                .take_while(|unit| (b'0' as u16..=b'9' as u16).contains(unit))
                .count();
            let line = after_prefix[..line_digits]
                .iter()
                .try_fold(0usize, |value, unit| {
                    value
                        .checked_mul(10)?
                        .checked_add(usize::from(*unit - b'0' as u16))
                });
            if let Some(original) = line.and_then(|line| replay_line_origins.get(line)) {
                (
                    Utf16::from(format!("/derivedCheckpoint/lines/{original}")),
                    &after_prefix[line_digits..],
                )
            } else {
                (Utf16::from("/derivedCheckpoint"), tail)
            }
        } else if index == 0 {
            (Utf16::from("/derivedCheckpoint"), tail)
        } else {
            (Utf16::from(format!("/sources/{}", index - 1)), tail)
        };
        let length = replacement.len().saturating_add(suffix.len());
        ctx.charge_text(length, Utf16::default())?;
        let mut remapped = Vec::new();
        remapped
            .try_reserve_exact(length)
            .map_err(|_| limit("Diagnostic path allocation refused"))?;
        remapped.extend_from_slice(replacement.units());
        remapped.extend_from_slice(suffix);
        set(row, "path", Value::String(Utf16::new(remapped)))?;
    }
    Ok(())
}
fn origin(
    line: usize,
    checkpoint_line: usize,
    sidecar: Option<usize>,
    row: Option<usize>,
) -> Value {
    let mut values = vec![
        ("line", Value::Number(line as f64)),
        ("checkpointLine", Value::Number(checkpoint_line as f64)),
    ];
    if let Some(v) = sidecar {
        values.push(("sidecar", Value::Number(v as f64)));
    }
    if let Some(v) = row {
        values.push(("row", Value::Number(v as f64)));
    }
    object(values)
}
fn diag(path: &str, message: &str) -> Value {
    object(vec![
        ("code", Value::string_utf8("DELTA_SIDECAR_BINDING")),
        ("path", Value::string_utf8(path)),
        ("severity", Value::string_utf8("error")),
        ("message", Value::string_utf8(message)),
    ])
}
fn warning_diag(code: &str, message: &str) -> Value {
    object(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8("")),
        ("severity", Value::string_utf8("warning")),
        ("message", Value::string_utf8(message)),
    ])
}
fn set(value: &mut Value, key: &str, member: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("Expected report object"));
    };
    let key = Utf16::from(key);
    if let Some((_, existing)) = fields.iter_mut().find(|(name, _)| name == &key) {
        *existing = member;
    } else {
        fields.push((key, member));
    }
    Ok(())
}
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = value {
        fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn field_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    if let Value::Object(fields) = value {
        fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn text(value: &Value, key: &str) -> Option<String> {
    match field(value, key) {
        Some(Value::String(s)) => s.to_utf8().ok(),
        _ => None,
    }
}
fn tagged_number(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if text(value, "kind").as_deref() == Some("number") {
        text(value, "value")
    } else {
        None
    }
}
fn tagged_feature(value: Option<&Value>, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let Some(value) = value else {
        return Ok(false);
    };
    if text(value, "kind").as_deref() != Some("array") {
        return Ok(false);
    }
    let Some(items) = array(field(value, "items")) else {
        return Ok(false);
    };
    for item in items {
        ctx.charge_work(1, Utf16::default())?;
        if tagged_string(Some(item)).is_some_and(|string| {
            string
                .units()
                .iter()
                .copied()
                .eq("v2Checkpoint".encode_utf16())
        }) {
            return Ok(true);
        }
    }
    Ok(false)
}
fn tagged_string(value: Option<&Value>) -> Option<&Utf16> {
    let value = value?;
    if text(value, "kind").as_deref() == Some("string") {
        match field(value, "value") {
            Some(Value::String(string)) => Some(string),
            _ => None,
        }
    } else {
        None
    }
}
fn bool_value(value: Option<&Value>) -> Option<bool> {
    if let Some(Value::Bool(b)) = value {
        Some(*b)
    } else {
        None
    }
}
fn array(value: Option<&Value>) -> Option<&Vec<Value>> {
    if let Some(Value::Array(v)) = value {
        Some(v)
    } else {
        None
    }
}
fn parse_version(value: &str) -> Option<u64> {
    if value.is_empty()
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let n = value.parse::<u64>().ok()?;
    (n <= i64::MAX as u64).then_some(n)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn limit(message: &str) -> EngineError {
    EngineError::new("LIMIT", Utf16::default(), message)
}
