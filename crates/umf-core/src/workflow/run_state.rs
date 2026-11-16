// SPDX-License-Identifier: MIT OR Apache-2.0
use std::collections::BTreeSet;

use serde_json::json;

use super::{
    fail, find, items, member_path,
    predicates::{literal, term_domain, term_value, validate_record},
    routing, text, CompiledWorkflow, Json, Record, Scalar, WorkflowError,
};

#[derive(Debug)]
pub enum SetDecision<'a> {
    Suppressed {
        exit: &'a str,
    },
    Update {
        target: &'a str,
        value: Scalar,
        next: &'a str,
    },
}

pub(super) fn validate_fields(definition: &Json) -> Result<Json, WorkflowError> {
    let mut fields = items(&definition["record"]).to_vec();
    let mut names: BTreeSet<_> = fields
        .iter()
        .map(|field| text(&field["id"]).to_owned())
        .collect();
    if let Some(state) = definition.get("runState") {
        for (index, field) in items(state).iter().enumerate() {
            let id = text(&field["id"]);
            let path = format!("/runState/{index}");
            if !names.insert(id.to_owned()) {
                return Err(fail("STATE", format!("{path}/id"), "duplicate field"));
            }
            let initial = &field["initial"];
            let domain = text(&initial["type"]);
            literal(domain, &initial["value"], &format!("{path}/initial/value"))?;
            fields.push(json!({"id": id, "type": domain, "optional": false}));
        }
    }
    Ok(Json::Array(fields))
}

pub(super) fn validate_set(
    definition: &Json,
    snapshot_fields: &Json,
    step: &Json,
    path: &str,
) -> Result<(), WorkflowError> {
    let target = text(&step["target"]);
    let state = definition
        .get("runState")
        .and_then(|fields| find(fields, target))
        .ok_or_else(|| {
            fail(
                "STATE",
                format!("{path}/target"),
                "set requires a declared run-state field",
            )
        })?;
    let target_type = text(&state["initial"]["type"]);
    let value_type = term_domain(
        &step["value"],
        snapshot_fields,
        &BTreeSet::new(),
        &format!("{path}/value"),
    )?;
    if target_type != value_type || (step["operation"] == "increment" && target_type != "integer") {
        return Err(fail(
            "STATE",
            format!("{path}/value"),
            "set requires matching scalar domains and increment requires integers",
        ));
    }
    Ok(())
}

impl CompiledWorkflow {
    /// Initialize the host-owned state of one newly admitted enrollment.
    pub fn initial_run_state(&self) -> Record {
        let empty = Record::new();
        self.definition
            .get("runState")
            .into_iter()
            .flat_map(items)
            .map(|field| {
                (
                    text(&field["id"]).to_owned(),
                    term_value(&field["initial"], &empty),
                )
            })
            .collect()
    }

    /// Validate and combine the host's record and run-state snapshots.
    pub fn snapshot_with_run_state(
        &self,
        record: &Record,
        state: &Record,
    ) -> Result<Record, WorkflowError> {
        validate_record(items(&self.definition["record"]), record, "/record")?;
        self.validate_run_state(state)?;
        Ok(record
            .iter()
            .chain(state)
            .map(|(id, value)| (id.clone(), value.clone()))
            .collect())
    }

    pub(super) fn validate_snapshot(&self, snapshot: &Record) -> Result<(), WorkflowError> {
        let Some(fields) = self.definition.get("runState") else {
            return validate_record(items(&self.definition["record"]), snapshot, "/record");
        };
        let (state, record) = snapshot
            .iter()
            .map(|(id, value)| (id.clone(), value.clone()))
            .partition(|(id, _)| find(fields, id).is_some());
        validate_record(items(&self.definition["record"]), &record, "/record")?;
        self.validate_run_state(&state)
    }

    fn validate_run_state(&self, state: &Record) -> Result<(), WorkflowError> {
        let fields = self.definition.get("runState").map_or(&[][..], items);
        for field in fields {
            let id = text(&field["id"]);
            let domain = text(&field["initial"]["type"]);
            if !state.get(id).is_some_and(|value| value.domain() == domain) {
                return Err(fail(
                    "STATE",
                    member_path("/runState", id),
                    "missing or mistyped value",
                ));
            }
        }
        for id in state.keys() {
            if !fields.iter().any(|field| field["id"] == id.as_str()) {
                return Err(fail("STATE", member_path("/runState", id), "unknown value"));
            }
        }
        Ok(())
    }

    /// Prepare the update and successor for the host to commit atomically.
    pub fn prepare_set(
        &self,
        step: &str,
        entering: bool,
        snapshot: &Record,
    ) -> Result<SetDecision<'_>, WorkflowError> {
        let declaration = routing::step(&self.definition, step)?;
        if declaration["kind"] != "set" {
            return Err(fail("STEP_KIND", "/steps", "selected step is not a set"));
        }
        if let Some(exit) = self.suppressed_exit(step, entering, snapshot)? {
            return Ok(SetDecision::Suppressed { exit });
        }
        let target = text(&declaration["target"]);
        let mut value = term_value(&declaration["value"], snapshot);
        if declaration["operation"] == "increment" {
            let (Scalar::Integer(current), Scalar::Integer(delta)) = (&snapshot[target], value)
            else {
                unreachable!("validated integer increment");
            };
            value = Scalar::Integer(current.checked_add(delta).ok_or_else(|| {
                fail(
                    "STATE_OVERFLOW",
                    member_path("/runState", target),
                    "integer increment exceeds i128",
                )
            })?);
        }
        Ok(SetDecision::Update {
            target,
            value,
            next: text(&declaration["next"]),
        })
    }
}
