// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{
    cmp::Ordering,
    collections::{BTreeMap, BTreeSet},
};

use crate::{exact_duration::ExactDuration, rfc3339_exact_instant::Rfc3339ExactInstant};

use super::{duration, fail, find, instant, items, text, CompiledWorkflow, Json, WorkflowError};

#[derive(Clone, Debug)]
pub enum Scalar {
    Boolean(bool),
    Text(String),
    Integer(i128),
    Duration(ExactDuration),
    Instant(Rfc3339ExactInstant),
}

pub type Record = BTreeMap<String, Scalar>;

impl Scalar {
    pub(crate) fn domain(&self) -> &'static str {
        match self {
            Self::Boolean(_) => "boolean",
            Self::Text(_) => "text",
            Self::Integer(_) => "integer",
            Self::Duration(_) => "duration",
            Self::Instant(_) => "instant",
        }
    }

    fn compare(&self, other: &Self) -> Ordering {
        match (self, other) {
            (Self::Boolean(left), Self::Boolean(right)) => left.cmp(right),
            (Self::Text(left), Self::Text(right)) => left.cmp(right),
            (Self::Integer(left), Self::Integer(right)) => left.cmp(right),
            (Self::Duration(left), Self::Duration(right)) => {
                left.nanoseconds().cmp(&right.nanoseconds())
            }
            (Self::Instant(left), Self::Instant(right)) => {
                let seconds = |value: &Rfc3339ExactInstant| {
                    value
                        .utc_seconds()
                        .parse::<i64>()
                        .expect("valid RFC3339 whole seconds")
                };
                seconds(left)
                    .cmp(&seconds(right))
                    .then_with(|| left.fractional_digits().cmp(right.fractional_digits()))
            }
            _ => unreachable!("portable predicate operands have identical domains"),
        }
    }

    /// Canonical profile value for retry-body comparison and correlation.
    pub(crate) fn canonical(&self) -> Json {
        match self {
            Self::Boolean(value) => Json::from(*value),
            Self::Text(value) => Json::from(value.as_str()),
            Self::Integer(value) => Json::from(value.to_string()),
            Self::Duration(value) => Json::from(value.canonical_nanoseconds()),
            Self::Instant(value) => {
                serde_json::json!([value.utc_seconds(), value.fractional_digits()])
            }
        }
    }
}

impl CompiledWorkflow {
    /// Evaluate the first true due guard over this supplied record snapshot.
    /// At an effect step, entry guards (when due) precede step and effect guards.
    pub fn suppressed_exit(
        &self,
        step: &str,
        entering: bool,
        record: &Record,
    ) -> Result<Option<&str>, WorkflowError> {
        self.suppressed_exit_with_facts(step, entering, record, &Record::new())
    }

    pub(crate) fn suppressed_exit_with_facts(
        &self,
        step: &str,
        entering: bool,
        record: &Record,
        fresh: &Record,
    ) -> Result<Option<&str>, WorkflowError> {
        let step = super::routing::step(&self.definition, step)?;
        if entering && step["id"] != self.entry() {
            return Err(fail(
                "ENTRY",
                "/entry",
                "entry guards require the entry step",
            ));
        }
        validate_record(items(&self.definition["record"]), record, "/record")?;
        let is_effect = step["kind"] == "effect";
        if is_effect {
            let fields = self.definition.get("effectFacts").map_or(&[][..], items);
            validate_record(fields, fresh, "/effectFacts")?;
        }
        for (scope, due) in [("entry", entering), ("step", true), ("effect", is_effect)] {
            if !due {
                continue;
            }
            let combined;
            let snapshot = if scope == "effect" {
                combined = record
                    .iter()
                    .chain(fresh)
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect();
                &combined
            } else {
                record
            };
            for guard in items(&self.definition["guards"])
                .iter()
                .filter(|guard| guard["scope"] == scope)
            {
                if evaluate(&guard["when"], snapshot) {
                    return Ok(Some(text(&guard["exit"])));
                }
            }
        }
        Ok(None)
    }

    /// Select a branch successor after evaluating the due guards.
    pub fn branch_destination(
        &self,
        step_id: &str,
        entering: bool,
        record: &Record,
    ) -> Result<&str, WorkflowError> {
        let step = super::routing::step(&self.definition, step_id)?;
        if step["kind"] != "branch" {
            return Err(fail("STEP_KIND", "/steps", "selected step is not a branch"));
        }
        if let Some(exit) = self.suppressed_exit(step_id, entering, record)? {
            return Ok(exit);
        }
        for case in items(&step["cases"]) {
            if evaluate(&case["when"], record) {
                return Ok(text(&case["next"]));
            }
        }
        Ok(text(&step["else"]))
    }
}

fn validate_record(fields: &[Json], record: &Record, path: &str) -> Result<(), WorkflowError> {
    for field in fields {
        let id = text(&field["id"]);
        match record.get(id) {
            Some(value) if value.domain() == text(&field["type"]) => {}
            None if field["optional"] == true => {}
            _ => {
                return Err(fail(
                    "RECORD",
                    super::member_path(path, id),
                    "missing or mistyped value",
                ));
            }
        }
    }
    for field in record.keys() {
        if !fields.iter().any(|value| value["id"] == field.as_str()) {
            return Err(fail(
                "RECORD",
                super::member_path(path, field),
                "unknown value",
            ));
        }
    }
    Ok(())
}

/// Facts start empty for each guard or branch case. In a short-circuit AND,
/// each later clause sees facts established by earlier true clauses.
pub(crate) fn validate(predicate: &Json, fields: &Json, path: &str) -> Result<(), WorkflowError> {
    validate_with(predicate, fields, path, &BTreeSet::new()).map(|_| ())
}

fn validate_with<'a>(
    predicate: &'a Json,
    fields: &Json,
    path: &str,
    present: &BTreeSet<&'a str>,
) -> Result<BTreeSet<&'a str>, WorkflowError> {
    let mut guaranteed = present.clone();
    match text(&predicate["op"]) {
        "present" => {
            let field = text(&predicate["field"]);
            if find(fields, field).is_none() {
                return Err(fail(
                    "FIELD",
                    format!("{path}/field"),
                    "unknown record field",
                ));
            }
            guaranteed.insert(field);
        }
        "eq" | "lt" => {
            let terms = items(&predicate["terms"]);
            let left = term_domain(&terms[0], fields, present, &format!("{path}/terms/0"))?;
            let right = term_domain(&terms[1], fields, present, &format!("{path}/terms/1"))?;
            if left != right || (predicate["op"] == "lt" && left == "boolean") {
                return Err(fail(
                    "PREDICATE_TYPE",
                    path,
                    "operands must have one comparable domain",
                ));
            }
        }
        "and" => {
            for (index, clause) in items(&predicate["clauses"]).iter().enumerate() {
                guaranteed = validate_with(
                    clause,
                    fields,
                    &format!("{path}/clauses/{index}"),
                    &guaranteed,
                )?;
            }
        }
        "or" => {
            let mut common: Option<BTreeSet<_>> = None;
            for (index, clause) in items(&predicate["clauses"]).iter().enumerate() {
                let facts =
                    validate_with(clause, fields, &format!("{path}/clauses/{index}"), present)?;
                common = Some(match common {
                    Some(previous) => previous.intersection(&facts).copied().collect(),
                    None => facts,
                });
            }
            guaranteed = common.expect("validated nonempty disjunction");
        }
        "not" => {
            validate_with(
                &predicate["clause"],
                fields,
                &format!("{path}/clause"),
                present,
            )?;
        }
        _ => unreachable!("validated workflow predicate"),
    }
    Ok(guaranteed)
}

fn term_domain<'a>(
    term: &'a Json,
    fields: &'a Json,
    present: &BTreeSet<&str>,
    path: &str,
) -> Result<&'a str, WorkflowError> {
    if term["kind"] == "literal" {
        let domain = text(&term["type"]);
        literal(domain, &term["value"], &format!("{path}/value"))?;
        return Ok(domain);
    }
    let id = text(&term["id"]);
    let field = find(fields, id).ok_or_else(|| fail("FIELD", path, "unknown record field"))?;
    if field["optional"] == true && !present.contains(id) {
        return Err(fail(
            "PRESENCE",
            path,
            "optional field requires a presence test on every path",
        ));
    }
    Ok(text(&field["type"]))
}

fn literal(domain: &str, value: &Json, path: &str) -> Result<Scalar, WorkflowError> {
    Ok(match domain {
        "boolean" => Scalar::Boolean(value.as_bool().expect("validated boolean")),
        "text" => Scalar::Text(text(value).into()),
        "integer" => {
            let token = text(value);
            let integer = token
                .parse::<i128>()
                .ok()
                .filter(|integer| integer.to_string() == token)
                .ok_or_else(|| {
                    fail(
                        "INTEGER",
                        path,
                        "expected a canonical signed 128-bit integer string",
                    )
                })?;
            Scalar::Integer(integer)
        }
        "duration" => Scalar::Duration(duration(value, path)?),
        "instant" => Scalar::Instant(instant(text(value), path)?),
        _ => unreachable!("validated workflow literal domain"),
    })
}

fn evaluate(predicate: &Json, record: &Record) -> bool {
    match text(&predicate["op"]) {
        "present" => record.contains_key(text(&predicate["field"])),
        "eq" | "lt" => {
            let terms = items(&predicate["terms"]);
            let get = |term: &Json| {
                if term["kind"] == "field" {
                    record[text(&term["id"])].clone()
                } else {
                    literal(text(&term["type"]), &term["value"], "")
                        .expect("compiled predicate literal")
                }
            };
            let order = get(&terms[0]).compare(&get(&terms[1]));
            if predicate["op"] == "eq" {
                order == Ordering::Equal
            } else {
                order == Ordering::Less
            }
        }
        "and" => items(&predicate["clauses"])
            .iter()
            .all(|clause| evaluate(clause, record)),
        "or" => items(&predicate["clauses"])
            .iter()
            .any(|clause| evaluate(clause, record)),
        "not" => !evaluate(&predicate["clause"], record),
        _ => unreachable!("validated workflow predicate"),
    }
}
