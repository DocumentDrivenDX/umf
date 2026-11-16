// SPDX-License-Identifier: MIT OR Apache-2.0
//! Pure decisions over a single explicit consumer snapshot or observation.

use std::collections::{BTreeMap, BTreeSet};

use crate::{
    exact_duration::{Deadline, DurationUnit, ExactDuration},
    rfc3339_exact_instant::Rfc3339ExactInstant,
};

use super::{
    digest, fail, find, instant, items, nonnegative_duration, routing, text, CompiledWorkflow,
    Json, Record, Scalar, WorkflowError,
};

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct Enrollment {
    pub workflow: String,
    pub version: String,
    pub definition_digest: String,
    pub record: String,
    pub id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetryIdentity {
    parts: Vec<(String, Json)>,
}

impl RetryIdentity {
    pub fn encoded(&self) -> String {
        serde_json::to_string(&self.parts).expect("canonical effect identity parts")
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Replay {
    DifferentIdentity,
    SameBody,
    ConflictingBody,
}

pub enum EffectDecision<'a> {
    Suppressed(&'a str),
    Invocation(EffectInvocation<'a>),
}

pub struct EffectInvocation<'a> {
    identity: RetryIdentity,
    body: BTreeMap<String, Scalar>,
    body_digest: String,
    declaration: &'a Json,
    step: &'a Json,
}

impl EffectInvocation<'_> {
    pub fn identity(&self) -> &RetryIdentity {
        &self.identity
    }
    pub fn body(&self) -> &BTreeMap<String, Scalar> {
        &self.body
    }
    pub fn effect(&self) -> &str {
        text(&self.declaration["id"])
    }
    pub fn await_mode(&self) -> &str {
        text(&self.declaration["await"])
    }
    pub fn body_digest(&self) -> &str {
        &self.body_digest
    }
    pub fn action_revision(&self) -> &str {
        text(&self.declaration["binding"]["revision"])
    }
    pub fn action(&self) -> &str {
        text(&self.declaration["binding"]["action"])
    }
    pub fn idempotency_enforcement(&self) -> &str {
        text(&self.declaration["idempotency"]["enforcement"])
    }

    /// A consumer may explicitly propose a retry after reconciling its ledger.
    /// This is an admission check, never a request to dispatch.
    pub fn permits_retry(
        &self,
        original: &Self,
        outcome: &str,
        retries_so_far: u16,
        reconciled: bool,
        was_accepted: bool,
    ) -> Result<bool, WorkflowError> {
        let declared = self.declared_outcome(outcome)?;
        let retry = &self.declaration["retry"];
        let limit: u16 = text(&retry["maxRetries"])
            .parse()
            .expect("compiled retry bound");
        Ok(!was_accepted
            && self.against(original) == Replay::SameBody
            && matches!(
                text(&declared["class"]),
                "unknown" | "engine-timeout" | "retriable"
            )
            && retries_so_far < limit
            && (retry["class"] == "idempotent"
                || (retry["class"] == "reconcile-first" && reconciled)))
    }

    /// Begin the consumer's observation window at durable intent time.
    pub fn begin_await(
        &self,
        at: &Rfc3339ExactInstant,
    ) -> Result<EffectAwait<'_, '_>, WorkflowError> {
        if self.await_mode() == "none" {
            return Err(fail(
                "AWAIT",
                "/effect",
                "unawaited effect has no resolution window",
            ));
        }
        let deadline = nonnegative_duration(&self.declaration["timeout"], "/timeout")?
            .deadline(at)
            .map_err(|error| fail("DEADLINE", "/timeout", error.to_string()))?;
        Ok(EffectAwait {
            invocation: self,
            deadline,
            resolved: false,
            accepted: false,
            last: instant_key(at),
        })
    }

    fn declared_outcome(&self, outcome: &str) -> Result<&Json, WorkflowError> {
        find(&self.declaration["outcomes"], outcome)
            .ok_or_else(|| fail("OUTCOME", "/outcome", "undeclared effect outcome"))
    }

    pub fn against(&self, original: &Self) -> Replay {
        if self.identity != original.identity {
            Replay::DifferentIdentity
        } else if self.body_digest == original.body_digest
            && self.action() == original.action()
            && self.action_revision() == original.action_revision()
        {
            Replay::SameBody
        } else {
            Replay::ConflictingBody
        }
    }

    pub fn dispatch_destination(&self) -> Option<&str> {
        self.step["next"].as_str()
    }

    /// Check one observed, typed outcome. Unawaited outcomes have no route.
    pub fn outcome_destination(
        &self,
        outcome: &str,
        output: &Scalar,
    ) -> Result<Option<&str>, WorkflowError> {
        let declared = self.declared_outcome(outcome)?;
        if declared["type"] != output.domain() {
            return Err(fail(
                "OUTCOME",
                "/output",
                "effect outcome has the wrong type",
            ));
        }
        Ok(self.step.get("routes").and_then(|routes| {
            items(routes)
                .iter()
                .find(|route| route["outcome"] == outcome)
                .map(|route| text(&route["next"]))
        }))
    }
}

pub struct EffectAwait<'invocation, 'definition> {
    invocation: &'invocation EffectInvocation<'definition>,
    deadline: Deadline,
    resolved: bool,
    accepted: bool,
    last: Deadline,
}

pub enum EffectObservation<'a> {
    Acceptance,
    Outcome { id: &'a str, output: &'a Scalar },
    Watermark,
}

#[derive(Debug, Eq, PartialEq)]
pub enum EffectResolution<'a> {
    Pending,
    Resolved {
        outcome: &'a str,
        next: &'a str,
        was_accepted: bool,
    },
    Late,
}

impl EffectAwait<'_, '_> {
    /// After resolution, later observations are audit inputs only. Acceptance
    /// remains visible even if a result-mode window later times out.
    pub fn observe(
        &mut self,
        at: &Rfc3339ExactInstant,
        observation: EffectObservation<'_>,
    ) -> Result<EffectResolution<'_>, WorkflowError> {
        if self.resolved {
            return Ok(EffectResolution::Late);
        }
        let at = instant_key(at);
        if at < self.last {
            return Err(fail(
                "OBSERVATION_ORDER",
                "/time",
                "effect observation precedes prior admitted logical time",
            ));
        }
        if at >= self.deadline {
            let timeout = items(&self.invocation.declaration["outcomes"])
                .iter()
                .find(|outcome| outcome["class"] == "engine-timeout")
                .expect("compiled timeout");
            self.resolved = true;
            let id = text(&timeout["id"]);
            let next = self
                .invocation
                .outcome_destination(id, &Scalar::Text("deadline".into()))?
                .expect("compiled timeout route");
            return Ok(EffectResolution::Resolved {
                outcome: id,
                next,
                was_accepted: self.accepted,
            });
        }

        match observation {
            EffectObservation::Acceptance if self.invocation.await_mode() == "result" => {
                self.last = at;
                self.accepted = true;
                Ok(EffectResolution::Pending)
            }
            EffectObservation::Outcome { id, output } => {
                let outcome = self.invocation.declared_outcome(id)?;
                if outcome["class"] == "engine-timeout" {
                    return Err(fail(
                        "OUTCOME",
                        "/outcome",
                        "engine timeout is produced only by the deadline",
                    ));
                }
                if self.accepted && id == "rejected" {
                    return Err(fail(
                        "OUTCOME",
                        "/outcome",
                        "acceptance may not be downgraded to rejection",
                    ));
                }
                let next = self
                    .invocation
                    .outcome_destination(id, output)?
                    .expect("compiled outcome route");
                self.last = at;
                self.resolved = true;
                Ok(EffectResolution::Resolved {
                    outcome: text(&outcome["id"]),
                    next,
                    was_accepted: self.accepted || id == "accepted",
                })
            }
            EffectObservation::Watermark => {
                self.last = at;
                Ok(EffectResolution::Pending)
            }
            EffectObservation::Acceptance => Err(fail(
                "OUTCOME",
                "/outcome",
                "accepted await requires a typed acceptance outcome",
            )),
        }
    }
}

pub enum RegisterWait<'a> {
    Suppressed(&'a str),
    Registered(WaitRegistration<'a>),
}

pub struct WaitRegistration<'a> {
    enrollment: &'a Enrollment,
    deadline: Deadline,
    registration: Deadline,
    ordinal: u64,
    timeout: &'a str,
    event: Option<WaitEvent<'a>>,
    conflicts: BTreeSet<String>,
    resolved: bool,
}

struct WaitEvent<'a> {
    kind: &'a str,
    key: Json,
    domain: &'static str,
    next: &'a str,
}

pub struct Event<'a> {
    pub kind: &'a str,
    pub id: &'a str,
    pub key: &'a Scalar,
    pub enrollment: Option<&'a Enrollment>,
    pub at: &'a Rfc3339ExactInstant,
    pub ordinal: u64,
}

#[derive(Debug, Eq, PartialEq)]
pub enum WaitDecision<'a> {
    Pending,
    Event { id: String, next: &'a str },
    Deadline(&'a str),
}

impl<'a> WaitRegistration<'a> {
    pub fn deadline(&self) -> &Deadline {
        &self.deadline
    }

    /// Conflicting delivery IDs to record in the consumer audit.
    pub fn conflicting_event_ids(&self) -> &BTreeSet<String> {
        &self.conflicts
    }

    /// The host supplies the complete set up to its watermark. The first
    /// matching event in logical order wins strictly before the deadline.
    pub fn resolve(
        &mut self,
        watermark: &Rfc3339ExactInstant,
        events: &[Event<'_>],
    ) -> Result<WaitDecision<'a>, WorkflowError> {
        if self.resolved {
            return Err(fail("WAIT_RESOLVED", "/wait", "wait already resolved"));
        }
        let through = instant_key(watermark);
        if through < self.registration {
            return Err(fail(
                "OBSERVATION_ORDER",
                "/watermark",
                "watermark precedes wait registration",
            ));
        }
        if let Some(rule) = &self.event {
            let mut seen = BTreeMap::new();
            let mut conflicts = BTreeSet::new();
            for event in events
                .iter()
                .filter(|event| event.enrollment == Some(self.enrollment))
            {
                let at = instant_key(event.at);
                if at > through {
                    continue;
                }
                if event.id.is_empty() {
                    return Err(fail(
                        "EVENT_ID",
                        "/events",
                        "a correlated observation requires an event ID",
                    ));
                }
                let payload = (at, event.kind, event.key.domain(), event.key.canonical());
                let (previous, ordinal) = seen
                    .entry(event.id)
                    .or_insert_with(|| (payload.clone(), event.ordinal));
                if previous == &payload {
                    *ordinal = (*ordinal).min(event.ordinal);
                } else {
                    conflicts.insert(event.id.to_owned());
                }
            }
            self.conflicts.extend(conflicts);
            let first = seen
                .into_iter()
                .filter(|(id, _)| !self.conflicts.contains(*id))
                .filter_map(|(id, ((at, kind, domain, key), ordinal))| {
                    (ordinal > self.ordinal
                        && at >= self.registration
                        && at < self.deadline
                        && kind == rule.kind
                        && domain == rule.domain
                        && key == rule.key)
                        .then_some((at, ordinal, id))
                })
                .min();
            if let Some((_, _, id)) = first {
                self.resolved = true;
                return Ok(WaitDecision::Event {
                    id: id.into(),
                    next: rule.next,
                });
            }
        }
        if through >= self.deadline {
            self.resolved = true;
            return Ok(WaitDecision::Deadline(self.timeout));
        }
        Ok(WaitDecision::Pending)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InterventionKind {
    Cancel,
    Repin(Enrollment),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Intervention {
    pub id: String,
    pub original: Enrollment,
    pub kind: InterventionKind,
}

impl Intervention {
    /// Durable intervention replay uses the same id and exact disposition.
    pub fn against(&self, original: &Self) -> Replay {
        if self.id != original.id
            || self.original.workflow != original.original.workflow
            || self.original.record != original.original.record
        {
            Replay::DifferentIdentity
        } else if self == original {
            Replay::SameBody
        } else {
            Replay::ConflictingBody
        }
    }
}

/// Portable intent to monotonically set account or record suppression.
pub struct SuppressionWrite<'a> {
    pub store: &'a str,
    pub scope: &'a str,
    pub fact: &'a str,
    /// Declared event type ID for this suppression reason.
    pub reason: &'a str,
    pub key: &'a Scalar,
    pub max_staleness: ExactDuration,
}

pub struct Candidate<'a> {
    pub record: &'a str,
    pub enrollment_id: &'a str,
}

pub struct History<'a> {
    pub enrollment: &'a Enrollment,
    /// Absence denotes an active enrollment. Terminal outcomes all count.
    pub terminal_at: Option<&'a Rfc3339ExactInstant>,
}

#[derive(Debug, Eq, PartialEq)]
pub enum Admission {
    Admitted(Enrollment),
    Replace {
        previous: Enrollment,
        next: Enrollment,
    },
    DuplicateRecord,
    DuplicateEnrollment,
    Active,
    ReentryDenied,
}

impl CompiledWorkflow {
    fn verify_enrollment(&self, enrollment: &Enrollment) -> Result<(), WorkflowError> {
        if enrollment.workflow != self.id()
            || enrollment.version != self.version()
            || enrollment.definition_digest != self.digest()
            || enrollment.record.is_empty()
            || enrollment.id.is_empty()
        {
            return Err(fail(
                "PIN",
                "/enrollment",
                "enrollment requires its exact pinned definition and identity",
            ));
        }
        Ok(())
    }

    /// Prepare an explicitly idempotent cancellation or queued-only repin.
    /// The host sets `queued` only before entry starts. Once started, cancellation
    /// retires routing while preserving durable effect observations for reconciliation.
    /// Authorization and atomic intervention custody belong to the consumer.
    pub fn prepare_intervention(
        &self,
        id: &str,
        enrollment: &Enrollment,
        target: Option<&CompiledWorkflow>,
        queued: bool,
    ) -> Result<Intervention, WorkflowError> {
        self.verify_enrollment(enrollment)?;
        if !id
            .split_once('@')
            .is_some_and(|(name, key)| !name.is_empty() && key == enrollment.record)
        {
            return Err(fail(
                "INTERVENTION",
                "/id",
                "expected id@key with the enrollment's record key",
            ));
        }
        let disposition = if target.is_some() { "repin" } else { "cancel" };
        let permitted = self.definition.get("interventions").is_some_and(|rule| {
            items(&rule["dispositions"])
                .iter()
                .any(|value| value == disposition)
        });
        if !permitted {
            return Err(fail(
                "INTERVENTION",
                "/disposition",
                "operator disposition is not declared",
            ));
        }
        let kind = match target {
            None => InterventionKind::Cancel,
            Some(target)
                if queued && target.id() == self.id() && target.version() != self.version() =>
            {
                InterventionKind::Repin(Enrollment {
                    version: target.version().into(),
                    definition_digest: target.digest().into(),
                    ..enrollment.clone()
                })
            }
            Some(_) => {
                return Err(fail(
                    "INTERVENTION",
                    "/target",
                    "repin requires a queued enrollment and a new version of the same workflow",
                ))
            }
        };
        Ok(Intervention {
            id: id.into(),
            original: enrollment.clone(),
            kind,
        })
    }

    /// Resolve the declared write for a typed event. Store I/O and durable
    /// acknowledgment are consumer responsibilities.
    pub fn suppression_write<'a>(
        &'a self,
        event: &str,
        key: &'a Scalar,
    ) -> Result<Option<SuppressionWrite<'a>>, WorkflowError> {
        let event = find(&self.definition["events"], event)
            .ok_or_else(|| fail("EVENT", "/event", "undeclared event type"))?;
        if event["keyType"] != key.domain() {
            return Err(fail(
                "EVENT",
                "/key",
                "event correlation key type differs from declaration",
            ));
        }
        if event["disposition"]["kind"] == "none" {
            return Ok(None);
        }
        let store = find(
            &self.definition["suppressionStores"],
            text(&event["disposition"]["store"]),
        )
        .expect("compiled suppression store reference");
        Ok(Some(SuppressionWrite {
            store: text(&store["id"]),
            scope: text(&store["scope"]),
            fact: text(&store["fact"]),
            reason: text(&event["id"]),
            key,
            max_staleness: nonnegative_duration(
                &store["maxStaleness"],
                "/suppressionStores/maxStaleness",
            )?,
        }))
    }

    /// Resolved action revisions covered by this definition's immutable digest.
    pub fn effect_revisions(&self) -> BTreeSet<(&str, &str)> {
        items(&self.definition["effects"])
            .iter()
            .map(|effect| {
                let binding = &effect["binding"];
                (text(&binding["action"]), text(&binding["revision"]))
            })
            .collect()
    }

    pub fn prepare_effect<'a>(
        &'a self,
        step_id: &str,
        entering: bool,
        record: &Record,
        fresh: &Record,
        enrollment: &Enrollment,
    ) -> Result<EffectDecision<'a>, WorkflowError> {
        self.verify_enrollment(enrollment)?;
        let step = checked_step(&self.definition, step_id, "effect")?;
        if let Some(exit) = self.suppressed_exit_with_facts(step_id, entering, record, fresh)? {
            return Ok(EffectDecision::Suppressed(exit));
        }
        let declaration = find(&self.definition["effects"], text(&step["effect"]))
            .expect("compiled effect reference");
        let body: BTreeMap<_, _> = items(&step["input"])
            .iter()
            .filter_map(|binding| {
                record
                    .get(text(&binding["field"]))
                    .map(|value| (text(&binding["parameter"]).to_owned(), value.clone()))
            })
            .collect();
        let canonical: BTreeMap<_, _> = body
            .iter()
            .map(|(key, value)| (key, serde_json::json!([value.domain(), value.canonical()])))
            .collect();
        let body_digest = digest(&serde_json::to_vec(&canonical).expect("canonical scalar body"));
        Ok(EffectDecision::Invocation(EffectInvocation {
            identity: retry_identity(declaration, enrollment, step_id, record),
            body,
            body_digest,
            declaration,
            step,
        }))
    }

    pub fn register_wait<'a>(
        &'a self,
        step_id: &str,
        entering: bool,
        record: &Record,
        enrollment: &'a Enrollment,
        ordinal: u64,
        previous: &Rfc3339ExactInstant,
        registered: &Rfc3339ExactInstant,
    ) -> Result<RegisterWait<'a>, WorkflowError> {
        self.verify_enrollment(enrollment)?;
        let step = checked_step(&self.definition, step_id, "wait")?;
        if let Some(exit) = self.suppressed_exit(step_id, entering, record)? {
            return Ok(RegisterWait::Suppressed(exit));
        }
        let registration = instant_key(registered);
        if instant_key(previous) > registration {
            return Err(fail(
                "ANCHOR",
                "/previous",
                "previous step completion is after registration",
            ));
        }
        let deadline = match step.get("for") {
            Some(duration) => nonnegative_duration(duration, "/for")?
                .deadline(previous)
                .map_err(|error| fail("DEADLINE", "/for", error.to_string()))?,
            None => instant_key(&instant(text(&step["until"]), "/until")?),
        };
        let event = step.get("event").map(|rule| {
            let key = &record[text(&rule["keyField"])];
            WaitEvent {
                kind: text(&rule["event"]),
                key: key.canonical(),
                next: text(&rule["next"]),
                domain: key.domain(),
            }
        });
        Ok(RegisterWait::Registered(WaitRegistration {
            enrollment,
            deadline,
            registration,
            ordinal,
            timeout: text(&step["timeout"]),
            event,
            conflicts: BTreeSet::new(),
            resolved: false,
        }))
    }

    /// Determine admission from a complete snapshot of this workflow's history.
    /// Results are returned in candidate order. The consumer commits them with
    /// its own concurrency control before starting any enrollment.
    pub fn admit_batch(
        &self,
        candidates: &[Candidate<'_>],
        history: &[History<'_>],
        now: &Rfc3339ExactInstant,
    ) -> Result<Vec<Admission>, WorkflowError> {
        let mut counts = BTreeMap::new();
        for candidate in candidates {
            if candidate.record.is_empty() || candidate.enrollment_id.is_empty() {
                return Err(fail(
                    "ADMISSION",
                    "/candidates",
                    "record and enrollment identity are required",
                ));
            }
            *counts.entry(candidate.record).or_insert(0_usize) += 1;
        }
        let mut index: BTreeMap<&str, Vec<&History<'_>>> = BTreeMap::new();
        let mut unique = BTreeSet::new();
        let mut versions = BTreeMap::from([(self.version(), self.digest())]);
        let now_key = instant_key(now);
        for row in history
            .iter()
            .filter(|row| row.enrollment.workflow == self.id())
        {
            let pin = row.enrollment;
            if pin.record.is_empty()
                || pin.id.is_empty()
                || pin.version.is_empty()
                || pin.definition_digest.is_empty()
                || !unique.insert((pin.record.as_str(), pin.id.as_str()))
                || row
                    .terminal_at
                    .is_some_and(|time| instant_key(time) > now_key)
            {
                return Err(fail(
                    "HISTORY",
                    "/history",
                    "invalid or duplicate workflow history",
                ));
            }
            if versions
                .insert(&pin.version, &pin.definition_digest)
                .is_some_and(|old| old != pin.definition_digest)
            {
                return Err(fail(
                    "HISTORY",
                    "/history",
                    "one definition version label binds exactly one digest",
                ));
            }
            index.entry(&pin.record).or_default().push(row);
        }
        candidates
            .iter()
            .map(|candidate| {
                if counts[candidate.record] > 1 {
                    return Ok(Admission::DuplicateRecord);
                }
                let records = index.get(candidate.record).map_or(&[][..], Vec::as_slice);
                if records
                    .iter()
                    .any(|row| row.enrollment.id == candidate.enrollment_id)
                {
                    return Ok(Admission::DuplicateEnrollment);
                }
                let next = Enrollment {
                    workflow: self.id().into(),
                    version: self.version().into(),
                    definition_digest: self.digest().into(),
                    record: candidate.record.into(),
                    id: candidate.enrollment_id.into(),
                };
                let mut active = records.iter().filter(|row| row.terminal_at.is_none());
                if let Some(row) = active.next() {
                    if active.next().is_some() {
                        return Err(fail(
                            "HISTORY",
                            "/history",
                            "more than one live enrollment for a record",
                        ));
                    }
                    if self.definition["inFlight"] == "reenroll"
                        && row.enrollment.version != self.version()
                    {
                        return Ok(Admission::Replace {
                            previous: row.enrollment.clone(),
                            next,
                        });
                    }
                    return Ok(Admission::Active);
                }
                if !records.is_empty() && !self.permits_reentry(records, &now_key)? {
                    return Ok(Admission::ReentryDenied);
                }
                Ok(Admission::Admitted(next))
            })
            .collect()
    }

    fn permits_reentry(
        &self,
        records: &[&History<'_>],
        now: &Deadline,
    ) -> Result<bool, WorkflowError> {
        let reentry = &self.definition["reentry"];
        match reentry["mode"].as_str().unwrap_or("never") {
            "never" => Ok(false),
            "once" => Ok(records.len() == 1),
            "always" => Ok(true),
            "after" => {
                let terminal = records
                    .iter()
                    .filter_map(|record| record.terminal_at)
                    .max_by_key(|instant| instant_key(instant))
                    .expect("terminal history");
                let minimum = nonnegative_duration(&reentry["minimum"], "/reentry/minimum")?;
                let deadline = minimum
                    .deadline(terminal)
                    .map_err(|error| fail("DEADLINE", "/reentry/minimum", error.to_string()))?;
                Ok(now >= &deadline)
            }
            _ => unreachable!("validated workflow re-entry mode"),
        }
    }

    /// Versions still required by active enrollments of this workflow.
    pub fn retained_versions<'a>(
        &self,
        history: &'a [History<'a>],
    ) -> BTreeSet<(&'a str, &'a str)> {
        history
            .iter()
            .filter(|row| row.enrollment.workflow == self.id() && row.terminal_at.is_none())
            .map(|row| {
                (
                    row.enrollment.version.as_str(),
                    row.enrollment.definition_digest.as_str(),
                )
            })
            .collect()
    }
}

fn checked_step<'a>(definition: &'a Json, id: &str, kind: &str) -> Result<&'a Json, WorkflowError> {
    let step = routing::step(definition, id)?;
    if step["kind"] != kind {
        return Err(fail(
            "STEP_KIND",
            "/steps",
            format!("selected step is not a {kind} step"),
        ));
    }
    Ok(step)
}

fn instant_key(instant: &Rfc3339ExactInstant) -> Deadline {
    ExactDuration::from_count("0", DurationUnit::Nanosecond)
        .expect("zero duration")
        .deadline(instant)
        .expect("RFC3339 instant fits deadline range")
}

fn retry_identity(
    declaration: &Json,
    enrollment: &Enrollment,
    step: &str,
    record: &Record,
) -> RetryIdentity {
    let parts = items(&declaration["idempotency"]["parts"])
        .iter()
        .map(|part| {
            let source = text(&part["source"]);
            let value = match source {
                "workflow" => Json::from(enrollment.workflow.as_str()),
                "record" => Json::from(enrollment.record.as_str()),
                "enrollment" => Json::from(enrollment.id.as_str()),
                "step" => Json::from(step),
                "effect" => declaration["id"].clone(),
                "field" => {
                    let value = &record[text(&part["field"])];
                    serde_json::json!([value.domain(), value.canonical()])
                }
                _ => unreachable!("compiled effect identity part"),
            };
            let label = part["field"]
                .as_str()
                .map_or_else(|| source.to_owned(), |field| format!("field:{field}"));
            (label, value)
        })
        .collect();
    RetryIdentity { parts }
}
