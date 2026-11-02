// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded replay of a single Parquet checkpoint plus explicit following commits.
//! This reconstructs action state only; it is not a Delta reader or writer.

use crate::{
    context::Context,
    delta_actions::{self, DeltaActionResources},
    delta_log::{self, DeltaLogResources},
    delta_parquet_actions, delta_reconcile,
    engine::{Capabilities, Engine},
    error::{EngineError, Severity},
    registry::Registry,
    value::{Utf16, Value},
};

const MAX_COMMITS: usize = 10_000;

pub fn reconcile_delta_parquet_checkpoint(
    checkpoint: &Value,
    commits: &Value,
    spec: &str,
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
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            vec![diag(
                "DELTA_CHECKPOINT_VERSION",
                "/checkpoint/version",
                "Expected a canonical nonnegative signed-int64 version",
                Severity::Error,
            )],
            None,
            None,
        ));
    };
    let Some(source) = field(&checkpoint, "source") else {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            vec![diag(
                "DELTA_CHECKPOINT_SOURCE",
                "/checkpoint/source",
                "Expected an authoritative Parquet document",
                Severity::Error,
            )],
            None,
            None,
        ));
    };
    let Some(start) = parse_version(&version) else {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            vec![diag(
                "DELTA_CHECKPOINT_VERSION",
                "/checkpoint/version",
                "Expected a canonical nonnegative signed-int64 version",
                Severity::Error,
            )],
            None,
            None,
        ));
    };
    if spec != "v1" && spec != "v2" {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            vec![diag(
                "DELTA_CHECKPOINT_SPEC",
                "",
                "Expected v1 or v2 checkpoint spec",
                Severity::Error,
            )],
            None,
            None,
        ));
    }
    let Some(commit_rows) = array(&commits) else {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            vec![diag(
                "DELTA_HISTORY_INPUT",
                "/sources",
                "Expected an array of following commits",
                Severity::Error,
            )],
            None,
            None,
        ));
    };
    let Some(sidecar_rows) = array(&sidecars) else {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            vec![diag(
                "DELTA_SIDECAR_INPUT",
                "/sidecars",
                "Expected an array of explicit sidecar documents",
                Severity::Error,
            )],
            None,
            None,
        ));
    };
    if spec == "v1" && !sidecar_rows.is_empty() {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            vec![diag(
                "DELTA_CHECKPOINT_V1_ACTION",
                "/sidecars",
                "V1 checkpoints cannot use supplied sidecars",
                Severity::Error,
            )],
            None,
            None,
        ));
    }
    if sidecar_rows.len() > 1_000 {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            vec![diag(
                "DELTA_SIDECAR_BINDING",
                "/sidecars",
                "At most 1000 explicit sidecars are supported",
                Severity::Error,
            )],
            None,
            None,
        ));
    }
    if commit_rows.len() >= MAX_COMMITS {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            vec![diag(
                "DELTA_HISTORY_LIMIT",
                "/sources",
                "At most 10000 following commits are supported",
                Severity::Error,
            )],
            None,
            None,
        ));
    }
    if !versions_are_contiguous(start, commit_rows) {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            vec![diag(
                "DELTA_HISTORY_SEQUENCE",
                "/sources",
                "Require ascending contiguous versions immediately after the checkpoint",
                Severity::Error,
            )],
            None,
            None,
        ));
    }

    let projection = delta_parquet_actions::project_delta_parquet_actions(
        source,
        engine,
        registry,
        capabilities,
        logs,
        actions,
        ctx,
    )?;
    append_prefixed(
        &mut diagnostics,
        field(&projection, "diagnostics"),
        "/projection",
        ctx,
    )?;
    if text(&projection, "status").as_deref() != Some("projected") {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            diagnostics,
            Some(projection),
            None,
        ));
    }
    let Some(projected_log) = field(&projection, "log") else {
        return Err(EngineError::new(
            "DELTA_PARQUET_CHECKPOINT",
            Utf16::default(),
            "Projected checkpoint log is missing",
        ));
    };
    let inspected = delta_actions::inspect_delta_actions(projected_log, logs, actions, ctx)?;
    append_prefixed(
        &mut diagnostics,
        field(&inspected, "diagnostics"),
        "/projection",
        ctx,
    )?;
    if !bool_field(&inspected, "knownShapesValid").unwrap_or(false) {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            diagnostics,
            Some(projection),
            None,
        ));
    }
    let Some(lines) = array_field(&inspected, "lines") else {
        return Err(EngineError::new(
            "DELTA_PARQUET_CHECKPOINT",
            Utf16::default(),
            "Projected checkpoint action rows are missing",
        ));
    };
    let mut marker_count = 0usize;
    let mut sidecar_count = 0usize;
    let mut has_protocol = false;
    let mut has_v2_reader = false;
    let mut has_v2_writer = false;
    let mut has_reader_three = false;
    let mut has_writer_seven = false;
    let mut unsupported_checkpoint_action = None;
    for line in lines {
        let Some(action) = text(line, "action") else {
            continue;
        };
        let Some(node) = field(line, "node") else {
            continue;
        };
        match action.as_str() {
            "checkpointMetadata" => {
                marker_count += 1;
                let marker_version = number_string(
                    native_member(node, "checkpointMetadata")
                        .and_then(|v| native_member(v, "version")),
                );
                if marker_version.as_deref() != Some(version.as_str()) {
                    diagnostics.push(diag(
                        "DELTA_CHECKPOINT_METADATA",
                        "/checkpoint",
                        "checkpointMetadata version must equal the supplied checkpoint version",
                        Severity::Error,
                    ));
                }
                if spec == "v1" {
                    diagnostics.push(diag(
                        "DELTA_CHECKPOINT_V1_ACTION",
                        "/checkpoint",
                        "V1 checkpoints cannot contain checkpointMetadata",
                        Severity::Error,
                    ));
                }
            }
            "sidecar" => {
                sidecar_count += 1;
                if spec == "v1" {
                    diagnostics.push(diag(
                        "DELTA_CHECKPOINT_V1_ACTION",
                        "/checkpoint",
                        "V1 checkpoints cannot contain sidecar actions",
                        Severity::Error,
                    ));
                }
            }
            "protocol" => {
                has_protocol = true;
                if let Some(value) = native_member(node, "protocol") {
                    has_reader_three = scalar(value, "minReaderVersion").as_deref() == Some("3");
                    has_writer_seven = scalar(value, "minWriterVersion").as_deref() == Some("7");
                    has_v2_reader =
                        contains_string(native_member(value, "readerFeatures"), "v2Checkpoint");
                    has_v2_writer =
                        contains_string(native_member(value, "writerFeatures"), "v2Checkpoint");
                }
            }
            "commitInfo" | "cdc" => {
                unsupported_checkpoint_action = Some(action);
            }
            "domainMetadata" => {
                if native_member(node, "domainMetadata")
                    .is_some_and(|v| native_bool_member(v, "removed") == Some(true))
                {
                    unsupported_checkpoint_action = Some(action);
                }
            }
            _ => {}
        }
    }
    if spec == "v2" {
        if marker_count != 1 {
            diagnostics.push(diag(
                "DELTA_CHECKPOINT_METADATA",
                "/checkpoint",
                "V2 requires exactly one checkpointMetadata action",
                Severity::Error,
            ));
        }
        if !has_protocol
            || !has_reader_three
            || !has_writer_seven
            || !has_v2_reader
            || !has_v2_writer
        {
            diagnostics.push(diag(
                "DELTA_CHECKPOINT_PROTOCOL",
                "/checkpoint",
                "V2 requires protocol 3/7 and both v2Checkpoint feature declarations",
                Severity::Error,
            ));
        }
    } else if marker_count > 0 || sidecar_count > 0 {
        // Errors were emitted in the action loop; do not continue into replay.
    }
    if let Some(action) = unsupported_checkpoint_action {
        diagnostics.push(diag(
            "DELTA_CHECKPOINT_FORBIDDEN_ACTION",
            "/checkpoint",
            &format!("Checkpoint cannot contain {action} actions in this profile"),
            Severity::Error,
        ));
    }
    if diagnostics
        .iter()
        .any(|d| text(d, "severity").as_deref() == Some("error"))
    {
        return Ok(blocked(
            checkpoint,
            commits,
            sidecars,
            spec,
            diagnostics,
            Some(projection),
            None,
        ));
    }

    let log_text = delta_log::export_delta_log(projected_log, logs, ctx)?;
    let original_units = log_text.units();
    ctx.charge_text(original_units.len(), Utf16::default())?;
    let checkpoint_line_count = original_units
        .split_inclusive(|unit| *unit == b'\n' as u16)
        .count();
    ctx.charge_work(checkpoint_line_count, Utf16::default())?;
    let mut checkpoint_lines = Vec::new();
    checkpoint_lines
        .try_reserve_exact(checkpoint_line_count)
        .map_err(|_| limit("Checkpoint line index allocation refused"))?;
    checkpoint_lines.extend(original_units.split_inclusive(|unit| *unit == b'\n' as u16));
    if checkpoint_lines.len() != lines.len() {
        return Err(EngineError::new(
            "DELTA_PARQUET_CHECKPOINT",
            Utf16::default(),
            "Projected action line/source alignment failed",
        ));
    }
    let mut supplied = Vec::new();
    supplied
        .try_reserve_exact(sidecar_rows.len())
        .map_err(|_| limit("Sidecar index allocation refused"))?;
    macro_rules! sidecar_reject {
        ($extra:expr) => {{
            let mut extra = $extra;
            diagnostics
                .try_reserve(extra.len())
                .map_err(|_| limit("Checkpoint diagnostic allocation refused"))?;
            diagnostics.append(&mut extra);
            return Ok(blocked(
                checkpoint,
                commits,
                sidecars,
                spec,
                diagnostics,
                Some(projection),
                None,
            ));
        }};
    }
    for (index, row) in sidecar_rows.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let path = match field(row, "path") {
            Some(Value::String(path)) => {
                ctx.charge_text(path.len(), Utf16::default())?;
                path.clone()
            }
            _ => {
                sidecar_reject!(vec![diag(
                    "DELTA_SIDECAR_BINDING",
                    &format!("/sidecars/{index}/path"),
                    "Expected an exact supplied sidecar path string",
                    Severity::Error,
                )]);
            }
        };
        if supplied
            .iter()
            .any(|(existing, _): &(Utf16, usize)| *existing == path)
        {
            sidecar_reject!(vec![diag(
                "DELTA_SIDECAR_BINDING",
                &format!("/sidecars/{index}/path"),
                "Duplicate supplied sidecar path",
                Severity::Error,
            )]);
        }
        if field(row, "source").is_none() {
            sidecar_reject!(vec![diag(
                "DELTA_SIDECAR_BINDING",
                &format!("/sidecars/{index}/source"),
                "Expected a captured Parquet document",
                Severity::Error,
            )]);
        }
        supplied.push((path, index));
    }

    let mut resolved_units = Vec::new();
    let mut origins = Vec::new();
    let mut omitted = Vec::new();
    let mut conversions = Vec::new();
    let mut used = Vec::new();
    let mut marker_lines = Vec::new();
    used.try_reserve_exact(supplied.len())
        .map_err(|_| limit("Sidecar reference allocation refused"))?;
    let mut byte_total = 0usize;
    let mut has_embedded_file_action = false;
    let mut sidecar_projection_diagnostics = Vec::new();
    for (line_index, (action_line, raw_line)) in lines.iter().zip(checkpoint_lines).enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let action = text(action_line, "action").unwrap_or_default();
        if action != "sidecar" {
            if action == "add" || action == "remove" {
                has_embedded_file_action = true;
            }
            if !resolved_append_allowed(&resolved_units, raw_line, origins.len()) {
                sidecar_reject!(vec![diag(
                    "DELTA_SIDECAR_BINDING",
                    "/checkpoint",
                    "Resolved checkpoint exceeds the 10000-line or 1000000-code-unit profile limit",
                    Severity::Error,
                )]);
            }
            append_line(&mut resolved_units, raw_line, ctx)?;
            origins
                .try_reserve(1)
                .map_err(|_| limit("Checkpoint origin allocation refused"))?;
            marker_lines
                .try_reserve(1)
                .map_err(|_| limit("Checkpoint marker allocation refused"))?;
            origins.push(origin(origins.len() + 1, line_index + 1, None, None));
            marker_lines.push(action == "checkpointMetadata");
            continue;
        }
        let node = field(action_line, "node").ok_or_else(|| {
            EngineError::new(
                "DELTA_PARQUET_CHECKPOINT",
                Utf16::default(),
                "Sidecar action node is missing",
            )
        })?;
        let sidecar_value = native_member(node, "sidecar").ok_or_else(|| {
            EngineError::new(
                "DELTA_PARQUET_CHECKPOINT",
                Utf16::default(),
                "Sidecar action value is missing",
            )
        })?;
        let referenced_path = match native_member(sidecar_value, "path").and_then(native_string) {
            Some(path) => path,
            _ => {
                sidecar_reject!(vec![diag(
                    "DELTA_SIDECAR_BINDING",
                    &format!("/checkpoint/lines/{line_index}/sidecar/path"),
                    "Expected an exact sidecar reference path",
                    Severity::Error,
                )]);
            }
        };
        if used.iter().any(|path: &Utf16| path == referenced_path) {
            sidecar_reject!(vec![diag(
                "DELTA_SIDECAR_BINDING",
                &format!("/checkpoint/lines/{line_index}/sidecar/path"),
                "Duplicate sidecar reference",
                Severity::Error,
            )]);
        }
        ctx.charge_text(referenced_path.len(), Utf16::default())?;
        used.try_reserve(1)
            .map_err(|_| limit("Sidecar reference allocation refused"))?;
        used.push(referenced_path.clone());
        let Some((_, sidecar_index)) = supplied.iter().find(|(path, _)| path == referenced_path)
        else {
            sidecar_reject!(vec![diag(
                "DELTA_SIDECAR_BINDING",
                &format!("/checkpoint/lines/{line_index}/sidecar/path"),
                "No explicitly supplied sidecar matches this exact path",
                Severity::Error,
            )]);
        };
        let sidecar_row = &sidecar_rows[*sidecar_index];
        let sidecar_source = field(sidecar_row, "source").ok_or_else(|| {
            EngineError::new(
                "DELTA_SIDECAR_BINDING",
                Utf16::default(),
                "Sidecar source is missing",
            )
        })?;
        let bytes = match crate::parquet_capture_inspection::export_parquet_capture(
            sidecar_source,
            engine,
            registry,
            capabilities,
            ctx,
        ) {
            Ok(bytes) => bytes,
            Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
            Err(error) => {
                sidecar_reject!(vec![diag(
                    "DELTA_SIDECAR_BINDING",
                    &format!("/sidecars/{sidecar_index}/source"),
                    &error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Invalid supplied Parquet source".to_owned()),
                    Severity::Error,
                )]);
            }
        };
        byte_total = byte_total
            .checked_add(bytes.len())
            .ok_or_else(|| limit("Sidecar byte total overflow"))?;
        if byte_total > 16_000_000 {
            sidecar_reject!(vec![diag(
                "DELTA_SIDECAR_BINDING",
                "/sidecars",
                "Supplied sidecars exceed the 16 MB decode budget",
                Severity::Error,
            )]);
        }
        if number_string(native_member(sidecar_value, "sizeInBytes"))
            .and_then(|size| size.parse::<usize>().ok())
            != Some(bytes.len())
        {
            sidecar_reject!(vec![diag(
                "DELTA_SIDECAR_BINDING",
                &format!("/checkpoint/lines/{line_index}/sidecar/sizeInBytes"),
                "Sidecar byte size does not match the explicit reference",
                Severity::Error,
            )]);
        }
        let side_projection = match delta_parquet_actions::project_delta_parquet_actions(
            sidecar_source,
            engine,
            registry,
            capabilities,
            logs,
            actions,
            ctx,
        ) {
            Ok(projection) => projection,
            Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
            Err(error) => {
                sidecar_reject!(vec![diag(
                    "DELTA_SIDECAR_BINDING",
                    &format!("/sidecars/{sidecar_index}"),
                    &error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Unable to project supplied sidecar".to_owned()),
                    Severity::Error,
                )]);
            }
        };
        append_prefixed(
            &mut sidecar_projection_diagnostics,
            field(&side_projection, "diagnostics"),
            &format!("/sidecars/{sidecar_index}"),
            ctx,
        )?;
        if text(&side_projection, "status").as_deref() != Some("projected") {
            sidecar_reject!(sidecar_projection_diagnostics);
        }
        let side_log = field(&side_projection, "log").ok_or_else(|| {
            EngineError::new(
                "DELTA_PARQUET_CHECKPOINT",
                Utf16::default(),
                "Projected sidecar log is missing",
            )
        })?;
        let side_inspected = delta_actions::inspect_delta_actions(side_log, logs, actions, ctx)?;
        let side_lines = array_field(&side_inspected, "lines").ok_or_else(|| {
            EngineError::new(
                "DELTA_PARQUET_CHECKPOINT",
                Utf16::default(),
                "Projected sidecar lines are missing",
            )
        })?;
        let side_log_text = delta_log::export_delta_log(side_log, logs, ctx)?;
        let side_units = side_log_text.units();
        let side_line_count = side_units
            .split_inclusive(|unit| *unit == b'\n' as u16)
            .count();
        ctx.charge_work(side_line_count, Utf16::default())?;
        let mut side_raw_lines = Vec::new();
        side_raw_lines
            .try_reserve_exact(side_line_count)
            .map_err(|_| limit("Sidecar line index allocation refused"))?;
        side_raw_lines.extend(side_units.split_inclusive(|unit| *unit == b'\n' as u16));
        if side_raw_lines.len() != side_lines.len()
            || !bool_field(&side_inspected, "knownShapesValid").unwrap_or(false)
        {
            sidecar_reject!(vec![diag(
                "DELTA_SIDECAR_BINDING",
                &format!("/sidecars/{sidecar_index}"),
                "Sidecar actions are not a valid projected Delta action stream",
                Severity::Error,
            )]);
        }
        for (row_index, (side_line, raw)) in side_lines.iter().zip(side_raw_lines).enumerate() {
            let action = text(side_line, "action").unwrap_or_default();
            if action != "add" && action != "remove" {
                sidecar_reject!(vec![diag(
                    "DELTA_SIDECAR_BINDING",
                    &format!("/sidecars/{sidecar_index}/lines/{row_index}"),
                    "Sidecars may contain only add/remove file actions",
                    Severity::Error,
                )]);
            }
            if !resolved_append_allowed(&resolved_units, raw, origins.len()) {
                sidecar_reject!(vec![diag(
                    "DELTA_SIDECAR_BINDING",
                    &format!("/sidecars/{sidecar_index}/lines/{row_index}"),
                    "Resolved checkpoint exceeds the 10000-line or 1000000-code-unit profile limit",
                    Severity::Error,
                )]);
            }
            append_line(&mut resolved_units, raw, ctx)?;
            origins
                .try_reserve(1)
                .map_err(|_| limit("Checkpoint origin allocation refused"))?;
            marker_lines
                .try_reserve(1)
                .map_err(|_| limit("Checkpoint marker allocation refused"))?;
            origins.push(origin(
                origins.len() + 1,
                line_index + 1,
                Some(*sidecar_index),
                Some(row_index + 1),
            ));
            marker_lines.push(false);
        }
        append_indexed_rows(
            &mut omitted,
            field(&side_projection, "omittedNullFields"),
            "sidecar",
            *sidecar_index,
            ctx,
        )?;
        append_indexed_rows(
            &mut conversions,
            field(&side_projection, "scalarConversions"),
            "sidecar",
            *sidecar_index,
            ctx,
        )?;
    }
    if used.len() != supplied.len() {
        sidecar_reject!(vec![diag(
            "DELTA_SIDECAR_BINDING",
            "/sidecars",
            "Every supplied sidecar must be referenced exactly once",
            Severity::Error,
        )]);
    }
    if !used.is_empty() && has_embedded_file_action {
        sidecar_reject!(vec![diag(
            "DELTA_SIDECAR_BINDING",
            "/checkpoint",
            "Checkpoint cannot mix embedded add/remove actions with sidecar file actions",
            Severity::Error,
        )]);
    }
    let projected_id = match field(projected_log, "id") {
        Some(Value::String(id)) => id,
        _ => {
            return Err(EngineError::new(
                "DELTA_PARQUET_CHECKPOINT",
                Utf16::default(),
                "Projected checkpoint log identity is missing",
            ));
        }
    };
    let resolved_id = derived_suffix(projected_id, "-resolved", ctx)?;
    let resolved_log = delta_log::capture_delta_log(&resolved_units, &resolved_id, logs, ctx)?;
    let resolved_text = delta_log::export_delta_log(&resolved_log, logs, ctx)?;
    let resolved_units_ref = resolved_text.units();
    let resolved_line_count = resolved_units_ref
        .split_inclusive(|unit| *unit == b'\n' as u16)
        .count();
    ctx.charge_work(resolved_line_count, Utf16::default())?;
    let mut resolved_lines = Vec::new();
    resolved_lines
        .try_reserve_exact(resolved_line_count)
        .map_err(|_| limit("Resolved line index allocation refused"))?;
    resolved_lines.extend(resolved_units_ref.split_inclusive(|unit| *unit == b'\n' as u16));
    if resolved_lines.len() != marker_lines.len() {
        return Err(EngineError::new(
            "DELTA_PARQUET_CHECKPOINT",
            Utf16::default(),
            "Resolved checkpoint marker alignment failed",
        ));
    }
    let mut filtered_units = Vec::new();
    filtered_units
        .try_reserve_exact(resolved_text.len())
        .map_err(|_| limit("Filtered checkpoint allocation refused"))?;
    for (raw_line, marker) in resolved_lines.iter().zip(marker_lines.iter()) {
        ctx.charge_work(1, Utf16::default())?;
        if *marker {
            continue;
        }
        filtered_units.extend_from_slice(raw_line);
    }
    let prefix = Utf16::from("checkpoint-replay-");
    let version_unit_count = version.encode_utf16().count();
    let id_units = prefix.len().saturating_add(version_unit_count);
    ctx.charge_text(id_units, Utf16::default())?;
    let mut id_buffer = Vec::new();
    id_buffer
        .try_reserve_exact(id_units)
        .map_err(|_| limit("Derived identifier allocation refused"))?;
    id_buffer.extend_from_slice(prefix.units());
    id_buffer.extend(version.encode_utf16());
    let filtered_id = Utf16::new(id_buffer);
    let replay_log = delta_log::capture_delta_log(&filtered_units, &filtered_id, logs, ctx)?;

    let mut replay_commits = Vec::new();
    replay_commits
        .try_reserve_exact(commit_rows.len() + 1)
        .map_err(|_| limit("Replay input allocation refused"))?;
    replay_commits.push(version_zero_commit(&replay_log, ctx)?);
    for (index, row) in commit_rows.iter().enumerate() {
        let source = field(row, "source").ok_or_else(|| {
            EngineError::new(
                "DELTA_HISTORY_INPUT",
                Utf16::default(),
                "Commit source is missing",
            )
        })?;
        let synthetic_version = index + 1;
        replay_commits.push(synthetic_commit(synthetic_version, source, ctx)?);
    }
    let replay_input = Value::Array(replay_commits);
    let recovery =
        delta_reconcile::reconcile_delta_checkpoint_commits(&replay_input, logs, actions, ctx)?;
    let mut recovery = crate::copy_json(&recovery, ctx)?;
    remap_recovery_paths(&mut recovery, spec == "v2", ctx)?;
    if spec == "v2" {
        let existing = field(&recovery, "diagnostics")
            .and_then(array)
            .unwrap_or(&[]);
        let mut recovery_diagnostics = Vec::new();
        recovery_diagnostics
            .try_reserve(
                existing
                    .len()
                    .saturating_add(sidecar_projection_diagnostics.len())
                    .saturating_add(1),
            )
            .map_err(|_| limit("Recovery diagnostic allocation refused"))?;
        for item in existing {
            recovery_diagnostics.push(crate::copy_json(item, ctx)?);
        }
        for item in sidecar_projection_diagnostics {
            recovery_diagnostics.push(crate::copy_json(&item, ctx)?);
        }
        recovery_diagnostics.push(diag(
            "DELTA_SIDECAR_SCOPE",
            "",
            "Exact supplied reference strings and byte sizes checked; physical placement, aliases, modification times and data-reader support remain unverified",
            Severity::Warning,
        ));
        set_member(
            &mut recovery,
            "diagnostics",
            Value::Array(recovery_diagnostics),
        )?;
    }
    set_member(&mut recovery, "sources", crate::copy_json(&commits, ctx)?)?;
    let projected_checkpoint = crate::copy_json(
        &object(vec![
            ("version", Value::String(Utf16::from(version.as_str()))),
            ("source", crate::copy_json(projected_log, ctx)?),
        ]),
        ctx,
    )?;
    set_member(&mut recovery, "checkpoint", projected_checkpoint)?;
    if spec == "v2" || !sidecar_rows.is_empty() {
        set_member(&mut recovery, "sidecars", crate::copy_json(&sidecars, ctx)?)?;
    }
    if spec == "v2" {
        let derived_checkpoint = crate::copy_json(
            &object(vec![
                ("version", Value::String(Utf16::from(version.as_str()))),
                ("source", crate::copy_json(&resolved_log, ctx)?),
            ]),
            ctx,
        )?;
        set_member(&mut recovery, "derivedCheckpoint", derived_checkpoint)?;
        set_member(&mut recovery, "origins", Value::Array(origins))?;
        set_member(&mut recovery, "omittedNullFields", Value::Array(omitted))?;
        set_member(
            &mut recovery,
            "scalarConversions",
            Value::Array(conversions),
        )?;
    }
    if let Some(state) = field_mut(&mut recovery, "state") {
        let final_version = commit_rows
            .last()
            .and_then(|row| text(row, "version"))
            .unwrap_or(version);
        set_member(
            state,
            "version",
            Value::String(Utf16::from(final_version.as_str())),
        )?;
    }
    let status = text(&recovery, "status").unwrap_or_else(|| "blocked".into());
    append_prefixed(
        &mut diagnostics,
        field(&recovery, "diagnostics"),
        "/recovery",
        ctx,
    )?;
    Ok(blocked_with_status(
        checkpoint,
        commits,
        sidecars,
        spec,
        status,
        diagnostics,
        Some(projection),
        Some(recovery),
    ))
}

fn versions_are_contiguous(start: u64, rows: &[Value]) -> bool {
    rows.iter().enumerate().all(|(index, row)| {
        text(row, "version").and_then(|version| parse_version(&version))
            == start.checked_add(index as u64 + 1)
    })
}
fn derived_id(prefix: &str, version: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let units = prefix
        .encode_utf16()
        .count()
        .saturating_add(version.encode_utf16().count());
    ctx.charge_text(units, Utf16::default())?;
    let mut output = Vec::new();
    output
        .try_reserve_exact(units)
        .map_err(|_| limit("Derived identifier allocation refused"))?;
    output.extend(prefix.encode_utf16());
    output.extend(version.encode_utf16());
    Ok(Utf16::new(output))
}
fn derived_suffix(base: &Utf16, suffix: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let suffix_units = suffix.encode_utf16().count();
    let units = base.len().saturating_add(suffix_units);
    ctx.charge_text(units, Utf16::default())?;
    let mut output = Vec::new();
    output
        .try_reserve_exact(units)
        .map_err(|_| limit("Derived identifier allocation refused"))?;
    output.extend_from_slice(base.units());
    output.extend(suffix.encode_utf16());
    Ok(Utf16::new(output))
}
fn append_line(
    output: &mut Vec<u16>,
    line: &[u16],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_text(line.len(), Utf16::default())?;
    output
        .try_reserve(line.len())
        .map_err(|_| limit("Resolved checkpoint allocation refused"))?;
    output.extend_from_slice(line);
    Ok(())
}
fn resolved_append_allowed(output: &[u16], line: &[u16], line_count: usize) -> bool {
    line_count < 10_000
        && output
            .len()
            .checked_add(line.len())
            .is_some_and(|size| size <= 1_000_000)
}
fn origin(
    line: usize,
    checkpoint_line: usize,
    sidecar: Option<usize>,
    row: Option<usize>,
) -> Value {
    let mut fields = vec![
        ("line", Value::Number(line as f64)),
        ("checkpointLine", Value::Number(checkpoint_line as f64)),
    ];
    if let Some(sidecar) = sidecar {
        fields.push(("sidecar", Value::Number(sidecar as f64)));
    }
    if let Some(row) = row {
        fields.push(("row", Value::Number(row as f64)));
    }
    object(fields)
}
fn append_indexed_rows(
    output: &mut Vec<Value>,
    source: Option<&Value>,
    index_key: &str,
    index: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(source) = source else { return Ok(()) };
    let Some(rows) = array(source) else {
        return Ok(());
    };
    ctx.charge_work(rows.len(), Utf16::default())?;
    output
        .try_reserve(rows.len())
        .map_err(|_| limit("Projection metadata allocation refused"))?;
    for row in rows {
        let mut copy = crate::copy_json(row, ctx)?;
        set_member(&mut copy, index_key, Value::Number(index as f64))?;
        output.push(copy);
    }
    Ok(())
}
fn remap_recovery_paths(
    recovery: &mut Value,
    sidecar_mode: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(rows) = field_mut(recovery, "diagnostics").and_then(|value| match value {
        Value::Array(rows) => Some(rows),
        _ => None,
    }) else {
        return Ok(());
    };
    for row in rows {
        let Some(Value::String(path)) = field(row, "path") else {
            continue;
        };
        let Ok(path_text) = path.to_utf8() else {
            continue;
        };
        let Some(rest) = path_text.strip_prefix("/sources/") else {
            continue;
        };
        let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 {
            continue;
        }
        let Ok(index) = rest[..digits].parse::<usize>() else {
            continue;
        };
        let tail = &rest[digits..];
        let remapped = if index == 0 && sidecar_mode {
            format!("/derivedCheckpoint{tail}")
        } else if index == 0 {
            format!("/checkpoint{tail}")
        } else {
            format!("/sources/{}{tail}", index - 1)
        };
        ctx.charge_text(remapped.encode_utf16().count(), Utf16::default())?;
        set_member(row, "path", Value::String(Utf16::from(remapped.as_str())))?;
    }
    Ok(())
}
fn parse_version(text: &str) -> Option<u64> {
    if text.is_empty()
        || (text.len() > 1 && text.starts_with('0'))
        || !text.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let value = text.parse::<u64>().ok()?;
    (value <= i64::MAX as u64).then_some(value)
}
fn version_zero_commit(log: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    synthetic_commit(0, log, ctx)
}
fn synthetic_commit(
    version: usize,
    source: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut version_text = Vec::new();
    let version = version.to_string();
    ctx.charge_text(version.encode_utf16().count(), Utf16::default())?;
    version_text
        .try_reserve_exact(version.len())
        .map_err(|_| limit("Version allocation refused"))?;
    version_text.extend(version.encode_utf16());
    crate::copy_json(
        &object(vec![
            ("version", Value::String(Utf16::new(version_text))),
            ("source", crate::copy_json(source, ctx)?),
        ]),
        ctx,
    )
}
fn number_string(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::Number(number) if number.is_finite() && number.fract() == 0.0 && *number >= 0.0 => {
            Some(format!("{number:.0}"))
        }
        Value::Object(_) if text(value?, "kind").as_deref() == Some("number") => {
            text(value?, "value")
        }
        _ => None,
    }
}
fn contains_string(value: Option<&Value>, wanted: &str) -> bool {
    let Some(value) = value else { return false };
    let items = match value {
        Value::Array(items) => Some(items.as_slice()),
        Value::Object(_) if text(value, "kind").as_deref() == Some("array") => {
            array_field(value, "items")
        }
        _ => None,
    };
    items.is_some_and(|items| {
        items.iter().any(|item| {
            text_value(item).as_deref() == Some(wanted)
                || (text(item, "kind").as_deref() == Some("string")
                    && text(item, "value").as_deref() == Some(wanted))
        })
    })
}
fn native_member<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    field(value, key).or_else(|| field(value, "members").and_then(|members| field(members, key)))
}
fn native_string(value: &Value) -> Option<&Utf16> {
    match value {
        Value::String(value) => Some(value),
        Value::Object(_) if text(value, "kind").as_deref() == Some("string") => {
            match field(value, "value") {
                Some(Value::String(value)) => Some(value),
                _ => None,
            }
        }
        _ => None,
    }
}
fn native_bool_member(value: &Value, key: &str) -> Option<bool> {
    let value = native_member(value, key)?;
    match value {
        Value::Bool(value) => Some(*value),
        Value::Object(_) if text(value, "kind").as_deref() == Some("boolean") => {
            match field(value, "value") {
                Some(Value::Bool(value)) => Some(*value),
                _ => None,
            }
        }
        _ => None,
    }
}
fn append_prefixed(
    out: &mut Vec<Value>,
    source: Option<&Value>,
    prefix: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(Value::Array(rows)) = source else {
        return Ok(());
    };
    ctx.charge_work(rows.len(), Utf16::default())?;
    out.try_reserve(rows.len())
        .map_err(|_| limit("Diagnostic allocation refused"))?;
    let prefix_len = prefix.encode_utf16().count();
    for row in rows {
        let mut copy = crate::copy_json(row, ctx)?;
        if let Some(Value::String(path)) = field(&copy, "path") {
            let path_units = path.units();
            let total = prefix_len.saturating_add(path_units.len());
            ctx.charge_text(total, Utf16::default())?;
            let mut combined = Vec::new();
            combined
                .try_reserve_exact(total)
                .map_err(|_| limit("Diagnostic path allocation refused"))?;
            combined.extend(prefix.encode_utf16());
            combined.extend_from_slice(path_units);
            set_member(&mut copy, "path", Value::String(Utf16::new(combined)))?;
        }
        out.push(copy);
    }
    Ok(())
}
fn blocked(
    checkpoint: Value,
    commits: Value,
    sidecars: Value,
    spec: &str,
    diagnostics: Vec<Value>,
    projection: Option<Value>,
    recovery: Option<Value>,
) -> Value {
    blocked_with_status(
        checkpoint,
        commits,
        sidecars,
        spec,
        "blocked".into(),
        diagnostics,
        projection,
        recovery,
    )
}
fn blocked_with_status(
    checkpoint: Value,
    commits: Value,
    sidecars: Value,
    spec: &str,
    status: String,
    diagnostics: Vec<Value>,
    projection: Option<Value>,
    recovery: Option<Value>,
) -> Value {
    let mut fields = vec![
        ("status", Value::string_utf8(&status)),
        ("complete", Value::Bool(false)),
        ("spec", Value::string_utf8(spec)),
        ("checkpoint", checkpoint),
        ("sources", commits),
        ("sidecars", sidecars),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    if let Some(projection) = projection {
        fields.push(("projection", projection));
    }
    if let Some(recovery) = recovery {
        fields.push(("recovery", recovery));
    }
    object(fields)
}
fn diag(code: &str, path: &str, message: &str, severity: Severity) -> Value {
    object(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8(path)),
        ("message", Value::string_utf8(message)),
        (
            "severity",
            Value::string_utf8(if severity == Severity::Error {
                "error"
            } else {
                "warning"
            }),
        ),
    ])
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn field_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn set_member(value: &mut Value, key: &str, replacement: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(EngineError::new(
            "DELTA_CHECKPOINT_REPORT",
            Utf16::default(),
            "Expected result object",
        ));
    };
    if let Some((_, current)) = fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
    {
        *current = replacement;
    } else {
        fields.push((Utf16::from(key), replacement));
    }
    Ok(())
}
fn array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(rows) = value {
        Some(rows)
    } else {
        None
    }
}
fn array_field<'a>(value: &'a Value, key: &str) -> Option<&'a [Value]> {
    array(field(value, key)?)
}
fn text(value: &Value, key: &str) -> Option<String> {
    text_value(field(value, key)?)
}
fn text_value(value: &Value) -> Option<String> {
    if let Value::String(value) = value {
        value.to_utf8().ok()
    } else {
        None
    }
}
fn bool_field(value: &Value, key: &str) -> Option<bool> {
    if let Value::Bool(value) = field(value, key)? {
        Some(*value)
    } else {
        None
    }
}
fn scalar(value: &Value, key: &str) -> Option<String> {
    let value = native_member(value, key)?;
    match value {
        Value::String(s) => s.to_utf8().ok(),
        Value::Number(n) => Some(n.to_string()),
        Value::Object(_)
            if text(value, "kind").as_deref() == Some("number")
                || text(value, "kind").as_deref() == Some("string") =>
        {
            text(value, "value")
        }
        _ => None,
    }
}
fn limit(message: &str) -> EngineError {
    EngineError::new("LIMIT", Utf16::default(), message)
}
