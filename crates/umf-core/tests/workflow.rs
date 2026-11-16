// SPDX-License-Identifier: MIT OR Apache-2.0

use serde_json::{json, Value as Json};
use umf_core::{
    rfc3339_exact_instant::{parse_rfc3339_exact_instant, Rfc3339ExactInstant},
    workflow::{
        compile, inspect, Admission, Candidate, CompiledWorkflow, EffectDecision,
        EffectObservation, EffectResolution, Enrollment, Event, Evidence, EvidenceKind,
        EvidenceOutcome, EvidenceStatus, History, Record, RegisterWait, Replay, Scalar,
        WaitDecision, CORRELATED_PROFILE, PROFILE,
    },
    Context, Value,
};

const REPLY: &[u8] = include_bytes!("fixtures/workflow/reply.json");

fn fixture() -> Json {
    serde_json::from_slice(REPLY).unwrap()
}

fn built(source: &Json) -> CompiledWorkflow {
    compile(
        &serde_json::to_vec(source).unwrap(),
        source["profile"].as_str().unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn at(text: &str) -> Rfc3339ExactInstant {
    parse_rfc3339_exact_instant(&Value::string_utf8(text)).unwrap()
}

fn enroll(workflow: &CompiledWorkflow, id: &str) -> Enrollment {
    let mut results = workflow
        .admit_batch(
            &[Candidate {
                record: "record-a",
                enrollment_id: id,
            }],
            &[],
            &at("2026-01-01T00:00:00Z"),
        )
        .unwrap();
    let Admission::Admitted(enrollment) = results.remove(0) else {
        panic!("expected admission")
    };
    enrollment
}

fn record(body: &str) -> Record {
    Record::from([
        ("recipient".into(), Scalar::Text("sample".into())),
        ("body".into(), Scalar::Text(body.into())),
    ])
}

fn facts(blocked: bool) -> Record {
    Record::from([("blocked".into(), Scalar::Boolean(blocked))])
}

#[test]
fn interchange_keeps_exact_source_and_compile_names_the_unknown_member() {
    let source = std::str::from_utf8(REPLY).unwrap().replacen(
        "\"kind\": \"count\"",
        "\"kind\": \"count\", \"unknown/~\": 900719925474099300001",
        1,
    );
    let inspected = inspect(source.as_bytes(), &mut Context::ordinary()).unwrap();
    assert_eq!(inspected.source(), source.as_bytes());
    assert_eq!(inspected.unchecked().len(), 1);
    assert_eq!(inspected.unchecked()[0].path, "/steps/1/for/unknown~1~0");
    let error = compile(
        source.as_bytes(),
        CORRELATED_PROFILE,
        &mut Context::ordinary(),
    )
    .err()
    .unwrap();
    assert_eq!(error.0, inspected.unchecked());

    let duplicate = source.replacen(
        "\"id\": \"follow-up\"",
        "\"id\": \"other\", \"id\": \"follow-up\"",
        1,
    );
    assert!(inspect(duplicate.as_bytes(), &mut Context::ordinary()).is_err());
    assert!(compile(REPLY, PROFILE, &mut Context::ordinary()).is_err());
}

#[test]
fn static_checks_cover_graph_types_presence_and_total_routes() {
    let mut cases: Vec<(&str, Json)> = Vec::new();
    let mut source = fixture();
    source["steps"][1]["timeout"] = json!("absent");
    cases.push(("SUCCESSOR", source));
    let mut source = fixture();
    source["steps"][1]["timeout"] = json!("send");
    cases.push(("CYCLE", source));
    let mut source = fixture();
    source["steps"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"orphan","kind":"exit","disposition":"complete"}));
    cases.push(("UNREACHABLE", source));
    let mut source = fixture();
    source["steps"][4]["id"] = json!("complete");
    cases.push(("DUPLICATE", source));
    let mut source = fixture();
    source["steps"][2].as_object_mut().unwrap().remove("else");
    cases.push(("SHAPE", source));
    let mut source = fixture();
    source["steps"][0]["routes"][2]["outcome"] = json!("bogus");
    cases.push(("OUTCOME", source));
    let mut source = fixture();
    source["effects"][0]["outcomes"]
        .as_array_mut()
        .unwrap()
        .remove(2);
    cases.push(("OUTCOME", source));
    let mut source = fixture();
    source["steps"][1]["until"] = json!("2026-01-01T00:00:00Z");
    cases.push(("WAIT", source));
    let mut source = fixture();
    source["steps"][2]["cases"][0]["when"] =
        source["steps"][2]["cases"][0]["when"]["clauses"][1].clone();
    cases.push(("PRESENCE", source));
    let mut source = fixture();
    source["steps"][2]["cases"][0]["when"]["clauses"][1]["terms"][1] =
        json!({"kind":"literal","type":"integer","value":"1"});
    cases.push(("PREDICATE_TYPE", source));
    let mut source = fixture();
    source["guards"][0]["scope"] = json!("entry");
    cases.push(("FIELD", source));
    let mut source = fixture();
    source["profile"] = json!(PROFILE);
    cases.push(("PROFILE", source));

    for (expected, source) in cases {
        let error = inspect(
            &serde_json::to_vec(&source).unwrap(),
            &mut Context::ordinary(),
        )
        .err()
        .unwrap_or_else(|| panic!("expected failure {expected}"));
        assert!(
            error.0.iter().any(|finding| finding.code == expected),
            "{expected}: {error}"
        );
    }
}

#[test]
fn effect_intent_retry_and_outcomes_preserve_ambiguity() {
    let workflow = built(&fixture());
    let enrollment = enroll(&workflow, "one");
    let other = enroll(&workflow, "two");
    let first = record("first");
    let changed = record("changed");
    assert!(matches!(
        workflow
            .prepare_effect("send", true, &first, &facts(true), &enrollment)
            .unwrap(),
        EffectDecision::Suppressed("suppressed"),
    ));
    assert!(workflow
        .prepare_effect("send", true, &first, &Record::new(), &enrollment)
        .is_err());

    let invocation = |record, enrollment| {
        let EffectDecision::Invocation(intent) = workflow
            .prepare_effect("send", true, record, &facts(false), enrollment)
            .unwrap()
        else {
            panic!("unexpected suppression")
        };
        intent
    };
    let intent = invocation(&first, &enrollment);
    assert_eq!(
        intent.against(&invocation(&first, &enrollment)),
        Replay::SameBody
    );
    assert_eq!(
        intent.against(&invocation(&changed, &enrollment)),
        Replay::ConflictingBody
    );
    assert_eq!(
        intent.against(&invocation(&first, &other)),
        Replay::DifferentIdentity
    );
    assert!(!intent
        .permits_retry(&intent, "unknown", 0, false, false)
        .unwrap());
    assert!(intent
        .permits_retry(&intent, "unknown", 1, true, false)
        .unwrap());
    assert!(!intent
        .permits_retry(&intent, "unknown", 2, true, false)
        .unwrap());
    assert!(!intent
        .permits_retry(&intent, "timeout", 0, true, true)
        .unwrap());
    assert!(!intent
        .permits_retry(&intent, "rejected", 0, true, false)
        .unwrap());

    let mut window = intent.begin_await(&at("2026-01-01T00:00:00Z")).unwrap();
    let payload = Scalar::Text("receipt".into());
    let outcome = |id| EffectObservation::Outcome {
        id,
        output: &payload,
    };
    assert!(window
        .observe(&at("2026-01-01T00:00:01Z"), outcome("undeclared"))
        .is_err());
    assert!(window
        .observe(&at("2026-01-01T00:00:01Z"), outcome("timeout"))
        .is_err());
    assert_eq!(
        window
            .observe(&at("2026-01-01T00:00:05Z"), outcome("accepted"))
            .unwrap(),
        EffectResolution::Resolved {
            outcome: "timeout",
            next: "held",
            was_accepted: false
        }
    );
    assert_eq!(
        window
            .observe(&at("2026-01-01T00:00:06Z"), outcome("accepted"))
            .unwrap(),
        EffectResolution::Late
    );

    let mut window = intent.begin_await(&at("2026-01-01T00:00:00Z")).unwrap();
    assert_eq!(
        window
            .observe(&at("2026-01-01T00:00:01Z"), outcome("unknown"))
            .unwrap(),
        EffectResolution::Resolved {
            outcome: "unknown",
            next: "held",
            was_accepted: false
        }
    );
}

#[test]
fn full_trace_uses_previous_completion_and_a_complete_unordered_event_set() {
    let workflow = built(&fixture());
    let enrollment = enroll(&workflow, "current");
    let old = enroll(&workflow, "previous");
    let initial = record("first");
    let EffectDecision::Invocation(intent) = workflow
        .prepare_effect("send", true, &initial, &facts(false), &enrollment)
        .unwrap()
    else {
        panic!("expected effect")
    };
    let accepted = at("2026-01-01T00:00:01Z");
    let mut effect = intent.begin_await(&at("2026-01-01T00:00:00Z")).unwrap();
    assert_eq!(
        effect
            .observe(
                &accepted,
                EffectObservation::Outcome {
                    id: "accepted",
                    output: &Scalar::Text("receipt".into())
                }
            )
            .unwrap(),
        EffectResolution::Resolved {
            outcome: "accepted",
            next: "pause",
            was_accepted: true
        }
    );

    let registered = at("2026-01-02T00:00:00Z");
    let start_wait = || {
        let RegisterWait::Registered(wait) = workflow
            .register_wait(
                "pause",
                false,
                &initial,
                &enrollment,
                10,
                &accepted,
                &registered,
            )
            .unwrap()
        else {
            panic!("expected wait")
        };
        wait
    };
    let key = Scalar::Text("sample".into());
    let other = Scalar::Text("other".into());
    let wrong_domain = Scalar::Integer(1);
    let early = at("2026-01-01T12:00:00Z");
    let first = at("2026-01-03T00:00:00Z");
    let next = at("2026-01-04T00:00:00Z");
    let tie = at("2026-04-01T00:00:01Z");
    let event = |kind, id, key, pin, time, ordinal| Event {
        kind,
        id,
        key,
        enrollment: pin,
        at: time,
        ordinal,
    };
    let registered_pin = Some(&enrollment);
    let a = || event("replied", "first", &key, registered_pin, &first, 11);
    let b = || event("replied", "next", &key, registered_pin, &next, 12);
    let mut wait = start_wait();
    assert_eq!(wait.deadline().utc_seconds().to_string(), tie.utc_seconds());
    assert_eq!(
        wait.resolve(&tie, &[b(), a(), b(), a()]).unwrap(),
        WaitDecision::Event {
            id: "first".into(),
            next: "check"
        }
    );
    assert!(wait.resolve(&tie, &[]).is_err());
    let mut wait = start_wait();
    assert_eq!(
        wait.resolve(&tie, &[a(), b()]).unwrap(),
        WaitDecision::Event {
            id: "first".into(),
            next: "check"
        }
    );

    let mut wait = start_wait();
    assert_eq!(
        wait.resolve(
            &tie,
            &[
                event("replied", "tie", &key, registered_pin, &tie, 13),
                event("replied", "early", &key, registered_pin, &early, 9),
                event("replied", "stale", &key, Some(&old), &first, 11),
                event("replied", "record-only", &key, None, &first, 11),
                event("other", "wrong-type", &key, registered_pin, &first, 11),
                event("replied", "wrong-key", &other, registered_pin, &first, 11),
                event(
                    "replied",
                    "wrong-key-domain",
                    &wrong_domain,
                    registered_pin,
                    &first,
                    11
                ),
            ]
        )
        .unwrap(),
        WaitDecision::Deadline("expired")
    );

    assert_eq!(
        workflow
            .branch_destination("check", false, &initial)
            .unwrap(),
        "held"
    );
    let mut with_reply = initial;
    with_reply.insert("response".into(), Scalar::Text("yes".into()));
    assert_eq!(
        workflow
            .branch_destination("check", false, &with_reply)
            .unwrap(),
        "complete"
    );
}

#[test]
fn admission_and_evidence_keep_cross_version_identity() {
    let source = fixture();
    let old = built(&source);
    let enrolled = enroll(&old, "old");
    let mut new_source = source;
    new_source["version"] = json!("2.0.0");
    new_source["effects"][0]["binding"]["revision"] =
        json!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    let new = built(&new_source);
    let now = at("2026-01-02T00:00:00Z");
    let done = at("2026-01-01T00:00:00Z");
    let a = || Candidate {
        record: "record-a",
        enrollment_id: "new",
    };
    let b = || Candidate {
        record: "record-b",
        enrollment_id: "new",
    };
    let finished = [History {
        enrollment: &enrolled,
        terminal_at: Some(&done),
    }];
    let active = [History {
        enrollment: &enrolled,
        terminal_at: None,
    }];

    let combined = new.admit_batch(&[b(), a()], &finished, &now).unwrap();
    let mut separate = new.admit_batch(&[b()], &finished, &now).unwrap();
    separate.extend(new.admit_batch(&[a()], &finished, &now).unwrap());
    assert_eq!(combined, separate);
    assert_eq!(
        new.admit_batch(&[a(), a()], &finished, &now).unwrap(),
        vec![Admission::DuplicateRecord, Admission::DuplicateRecord]
    );
    assert_eq!(
        new.admit_batch(&[a()], &active, &now).unwrap(),
        vec![Admission::Active]
    );
    assert!(new
        .retained_versions(&active)
        .contains(&(old.version(), old.digest())));
    assert!(new.retained_versions(&finished).is_empty());
    assert_ne!(old.effect_revisions(), new.effect_revisions());
    assert!(new
        .prepare_effect("send", true, &record("hello"), &facts(false), &enrolled)
        .is_err());

    let repinned = old
        .prepare_intervention("operator-1", &enrolled, Some(&new), true)
        .unwrap();
    let replay = old
        .prepare_intervention("operator-1", &enrolled, Some(&new), true)
        .unwrap();
    let changed = old
        .prepare_intervention("operator-1", &enrolled, None, true)
        .unwrap();
    assert_eq!(repinned.against(&replay), Replay::SameBody);
    assert_eq!(repinned.against(&changed), Replay::ConflictingBody);
    assert!(old
        .prepare_intervention("operator-1", &enrolled, Some(&new), false)
        .is_err());

    let evidence = Evidence {
        property: "acyclic".into(),
        kind: EvidenceKind::MutationControl,
        tool: "test".into(),
        tool_version: "1".into(),
        definition_digest: old.lowered_digest().into(),
        profile: old.profile().into(),
        bounds: "one workflow with eight steps".into(),
        assumptions: vec![],
        outcome: EvidenceOutcome::Failed {
            counterexample: "cycle in control".into(),
        },
    };
    assert_eq!(
        evidence.assess(&old).unwrap(),
        EvidenceStatus::Current(&evidence.outcome)
    );
    assert_eq!(
        evidence.assess(&new).unwrap(),
        EvidenceStatus::Stale(&evidence.outcome)
    );
}

#[test]
fn lowered_identity_normalizes_fixed_spans_without_changing_source_pins() {
    let base = built(&fixture());
    let mut equivalent = fixture();
    equivalent["steps"][1]["for"] = json!({"kind":"elapsed","text":"P90D"});
    equivalent["edges"] = json!([{"from":"held","to":"send"}]);
    let equivalent = built(&equivalent);
    assert_ne!(base.source(), equivalent.source());
    assert_ne!(base.digest(), equivalent.digest());
    assert_eq!(base.lowered_source(), equivalent.lowered_source());
    assert_eq!(base.lowered_digest(), equivalent.lowered_digest());

    let mut changed = fixture();
    changed["effects"][0]["binding"]["revision"] =
        json!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    let changed = built(&changed);
    assert_ne!(base.lowered_digest(), changed.lowered_digest());
}
