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
    let redelivery = || event("replied", "first", &key, registered_pin, &first, 17);
    assert_eq!(
        wait.resolve(&tie, &[redelivery(), b(), a()]).unwrap(),
        WaitDecision::Event {
            id: "first".into(),
            next: "check"
        }
    );
    assert!(wait.conflicting_event_ids().is_empty());
    assert!(wait.resolve(&tie, &[redelivery()]).is_err());

    let mut wait = start_wait();
    let conflicting = || event("replied", "first", &other, registered_pin, &first, 11);
    assert_eq!(
        wait.resolve(&tie, &[a(), conflicting(), b()]).unwrap(),
        WaitDecision::Event {
            id: "next".into(),
            next: "check"
        }
    );
    assert_eq!(
        wait.conflicting_event_ids()
            .iter()
            .cloned()
            .collect::<Vec<_>>(),
        vec!["first"]
    );
    let mut wait = start_wait();
    assert_eq!(
        wait.resolve(&tie, &[b(), conflicting(), a()]).unwrap(),
        WaitDecision::Event {
            id: "next".into(),
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
        .prepare_intervention("operator-1@record-a", &enrolled, Some(&new), true)
        .unwrap();
    let replay = old
        .prepare_intervention("operator-1@record-a", &enrolled, Some(&new), true)
        .unwrap();
    let changed = old
        .prepare_intervention("operator-1@record-a", &enrolled, None, true)
        .unwrap();
    assert_eq!(repinned.against(&replay), Replay::SameBody);
    assert_eq!(repinned.against(&changed), Replay::ConflictingBody);
    assert!(old
        .prepare_intervention("operator-1@record-a", &enrolled, Some(&new), false)
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
    equivalent["steps"][1]["for"] = json!({"kind":"elapsed","text":"PT2160H"});
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

#[test]
fn result_mode_keeps_acceptance_and_unawaited_effects_use_only_next() {
    let mut source = fixture();
    source["effects"][0]["await"] = json!("result");
    source["effects"][0]["outcomes"][0]["id"] = json!("finished");
    source["steps"][0]["routes"][0]["outcome"] = json!("finished");
    let workflow = built(&source);
    let pin = enroll(&workflow, "new");
    let EffectDecision::Invocation(intent) = workflow
        .prepare_effect("send", true, &record("text"), &facts(false), &pin)
        .unwrap()
    else {
        panic!("expected effect intent")
    };
    let start = at("2026-01-01T00:00:00Z");
    let accepted = at("2026-01-01T00:00:03Z");
    let mut window = intent.begin_await(&start).unwrap();
    assert!(window
        .observe(&at("2025-12-31T23:59:59Z"), EffectObservation::Acceptance)
        .is_err());
    assert_eq!(
        window
            .observe(&accepted, EffectObservation::Acceptance)
            .unwrap(),
        EffectResolution::Pending
    );
    assert!(window
        .observe(
            &accepted,
            EffectObservation::Outcome {
                id: "rejected",
                output: &Scalar::Text("contradiction".into()),
            }
        )
        .is_err());
    assert_eq!(
        window
            .observe(&at("2026-01-01T00:00:05Z"), EffectObservation::Watermark)
            .unwrap(),
        EffectResolution::Resolved {
            outcome: "timeout",
            next: "held",
            was_accepted: true
        }
    );

    source["effects"][0]["await"] = json!("none");
    source["effects"][0]
        .as_object_mut()
        .unwrap()
        .remove("timeout");
    source["effects"][0]["outcomes"]
        .as_array_mut()
        .unwrap()
        .remove(3);
    source["steps"][0].as_object_mut().unwrap().remove("routes");
    source["steps"][0]["next"] = json!("pause");
    source["steps"].as_array_mut().unwrap().remove(6);
    let workflow = built(&source);
    let pin = enroll(&workflow, "new");
    let EffectDecision::Invocation(intent) = workflow
        .prepare_effect("send", true, &record("text"), &facts(false), &pin)
        .unwrap()
    else {
        panic!("expected effect intent")
    };
    assert_eq!(intent.dispatch_destination(), Some("pause"));
    assert!(intent.begin_await(&start).is_err());
    assert_eq!(
        intent
            .outcome_destination("finished", &Scalar::Text("result".into()))
            .unwrap(),
        None
    );
}

#[test]
fn base_profile_handles_absolute_pauses_and_reports_replacement_intents() {
    let mut source = fixture();
    source["profile"] = json!(PROFILE);
    let wait = source["steps"][1].as_object_mut().unwrap();
    wait.remove("for");
    wait.remove("event");
    wait.insert("until".into(), json!("2026-05-01T00:00:00Z"));
    source["steps"][1]["timeout"] = json!("check");
    source["steps"].as_array_mut().unwrap().remove(4);
    source.as_object_mut().unwrap().remove("reentry");
    let older = built(&source);
    let existing = enroll(&older, "old");
    let start = at("2026-01-01T00:00:00Z");
    let mut new_source = source;
    new_source["version"] = json!("2.0.0");
    new_source["inFlight"] = json!("reenroll");
    let newer = built(&new_source);
    let candidates = &[Candidate {
        record: "record-a",
        enrollment_id: "new",
    }];
    let active = [History {
        enrollment: &existing,
        terminal_at: None,
    }];
    let finished = [History {
        enrollment: &existing,
        terminal_at: Some(&start),
    }];
    let decisions = newer.admit_batch(candidates, &active, &start).unwrap();
    assert!(
        matches!(&decisions[0], Admission::Replace { previous, next }
        if previous == &existing && next.version == newer.version() && next.id == "new")
    );
    assert_eq!(
        newer.admit_batch(candidates, &finished, &start).unwrap(),
        vec![Admission::ReentryDenied]
    );
    let RegisterWait::Registered(mut wait) = older
        .register_wait(
            "pause",
            false,
            &record("text"),
            &existing,
            1,
            &start,
            &start,
        )
        .unwrap()
    else {
        panic!("expected pause")
    };
    assert_eq!(wait.resolve(&start, &[]).unwrap(), WaitDecision::Pending);
    assert_eq!(
        wait.resolve(&at("2026-05-01T00:00:00Z"), &[]).unwrap(),
        WaitDecision::Deadline("check")
    );

    new_source["version"] = json!(older.version());
    let conflicting = built(&new_source);
    assert!(conflicting
        .admit_batch(candidates, &active, &start)
        .is_err());
}

#[test]
fn evidence_serializes_as_a_scoped_versioned_record() {
    let workflow = built(&fixture());
    let evidence = Evidence {
        property: "wait-resolution".into(),
        kind: EvidenceKind::BoundedModelCheck,
        tool: "bounded comparator".into(),
        tool_version: "1.0.0".into(),
        definition_digest: workflow.lowered_digest().into(),
        profile: workflow.profile().into(),
        bounds: "five events, one enrollment".into(),
        assumptions: vec!["complete watermark set".into()],
        outcome: EvidenceOutcome::Failed {
            counterexample: "event 2 duplicated".into(),
        },
    };
    let result = evidence.to_json().unwrap();
    let schema = serde_json::from_str(umf_core::workflow::EVIDENCE_SCHEMA).unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    assert!(validator.is_valid(&result));
    assert_eq!(result["outcome"]["counterexample"], "event 2 duplicated");
    let mut evidence = evidence;
    evidence.outcome = EvidenceOutcome::Inconclusive {
        reason: "state cap reached".into(),
    };
    let result = evidence.to_json().unwrap();
    assert!(validator.is_valid(&result));
    assert_eq!(result["outcome"]["status"], "inconclusive");
    assert!(matches!(
        evidence.assess(&workflow),
        Ok(EvidenceStatus::Current(
            EvidenceOutcome::Inconclusive { .. }
        ))
    ));
    evidence.outcome = EvidenceOutcome::Inconclusive { reason: " ".into() };
    assert!(evidence.to_json().is_err());
}

#[test]
fn total_predicates_compare_exact_instants_and_elapsed_spans() {
    let mut source = fixture();
    source["steps"][2]["cases"][0]["when"] = json!({"op":"and","clauses":[
        {"op":"eq","terms":[
            {"kind":"literal","type":"instant","value":"2026-01-01T00:00:00.0000000001Z"},
            {"kind":"literal","type":"instant","value":"2025-12-31T19:00:00.000000000100-05:00"}
        ]},
        {"op":"lt","terms":[
            {"kind":"literal","type":"duration","value":{"kind":"elapsed","text":"PT1S"}},
            {"kind":"literal","type":"duration","value":{"kind":"count","count":"1000000001","unit":"ns"}}
        ]}
    ]});
    let workflow = built(&source);
    assert_eq!(
        workflow
            .branch_destination("check", false, &record("text"))
            .unwrap(),
        "complete"
    );
    source["steps"][2]["cases"][0]["when"]["clauses"][0]["terms"][1]["value"] =
        json!("2025-12-31T19:00:00.000000000101-05:00");
    let workflow = built(&source);
    assert_eq!(
        workflow
            .branch_destination("check", false, &record("text"))
            .unwrap(),
        "held"
    );
}

#[test]
fn suppression_events_and_operator_rights_are_declared_and_checked() {
    let workflow = built(&fixture());
    let account = Scalar::Text("account-1".into());
    for event in ["hardBounce", "stop"] {
        let write = workflow
            .suppression_write(event, &account)
            .unwrap()
            .unwrap();
        assert_eq!(write.store, "account-suppression");
        assert_eq!(write.scope, "account");
        assert_eq!(write.reason, event);
        assert_eq!(write.fact, "blocked");
        assert_eq!(write.max_staleness.nanoseconds(), 2_000_000_000);
    }
    assert!(workflow
        .suppression_write("replied", &account)
        .unwrap()
        .is_none());
    assert!(workflow
        .suppression_write("stop", &Scalar::Integer(1))
        .is_err());

    let pin = enroll(&workflow, "current");
    assert!(workflow
        .prepare_intervention("cancel@other-record", &pin, None, false)
        .is_err());
    let mut source = fixture();
    source.as_object_mut().unwrap().remove("interventions");
    let restricted = built(&source);
    let pin = enroll(&restricted, "current");
    assert!(restricted
        .prepare_intervention("cancel@record-a", &pin, None, false)
        .is_err());

    for edit in ["store", "guard", "staleness", "day"] {
        let mut source = fixture();
        let expected = match edit {
            "store" => {
                source["events"][1]["disposition"]["store"] = json!("missing");
                "SUPPRESSION"
            }
            "guard" => {
                source["guards"][0]["when"]["terms"][1]["value"] = json!(false);
                "SUPPRESSION"
            }
            "staleness" => {
                source["suppressionStores"][0]["maxStaleness"]["text"] = json!("-PT1S");
                "DURATION"
            }
            "day" => {
                source["steps"][1]["for"] = json!({"kind":"elapsed","text":"P3D"});
                "DURATION"
            }
            _ => unreachable!(),
        };
        let error = inspect(
            &serde_json::to_vec(&source).unwrap(),
            &mut Context::ordinary(),
        )
        .err()
        .unwrap();
        assert_eq!(error.0[0].code, expected);
    }
}

#[test]
fn typed_run_state_supports_checked_updates_and_branching() {
    use umf_core::workflow::{compile_source, inspect_source, SetDecision, WorkflowProfile};

    let mut source = fixture();
    source["runState"] = json!([
        {"id":"attempts","initial":{"kind":"literal","type":"integer","value":"0"}}
    ]);
    source["entry"] = json!("count");
    source["steps"].as_array_mut().unwrap().push(json!({
        "kind":"set","id":"count","target":"attempts","operation":"increment",
        "value":{"kind":"literal","type":"integer","value":"1"},"next":"send"
    }));
    source["steps"][2]["cases"][0]["when"] = json!({
        "op":"eq","terms":[{"kind":"field","id":"attempts"},
            {"kind":"literal","type":"integer","value":"1"}]
    });
    let bytes = serde_json::to_vec(&source).unwrap();
    let inspected = inspect_source(&bytes).unwrap();
    assert_eq!(inspected.source(), bytes);
    assert!(compile_source(&bytes, WorkflowProfile::Base).is_err());
    let workflow = compile_source(&bytes, WorkflowProfile::Correlated).unwrap();
    let input = record("body");
    let mut state = workflow.initial_run_state();
    let snapshot = workflow.snapshot_with_run_state(&input, &state).unwrap();
    let decision = workflow.prepare_set("count", true, &snapshot).unwrap();
    let SetDecision::Update {
        target,
        value,
        next,
    } = decision
    else {
        panic!("expected prepared state update");
    };
    assert_eq!((target, next), ("attempts", "send"));
    assert!(matches!(value, Scalar::Integer(1)));
    assert!(matches!(state["attempts"], Scalar::Integer(0)));
    state.insert(target.into(), value);
    let snapshot = workflow.snapshot_with_run_state(&input, &state).unwrap();
    assert_eq!(
        workflow
            .branch_destination("check", false, &snapshot)
            .unwrap(),
        "complete"
    );
    assert_eq!(
        workflow
            .matching_guard("send", false, &snapshot, &facts(true))
            .unwrap()
            .unwrap()
            .index,
        0
    );
    assert!(workflow.prepare_set("count", true, &input).is_err());

    state.insert(target.into(), Scalar::Integer(i128::MAX));
    let snapshot = workflow.snapshot_with_run_state(&input, &state).unwrap();
    assert_eq!(
        workflow
            .prepare_set("count", true, &snapshot)
            .unwrap_err()
            .0[0]
            .code,
        "STATE_OVERFLOW"
    );
    assert!(matches!(state["attempts"], Scalar::Integer(i128::MAX)));
    state.insert(target.into(), Scalar::Boolean(true));
    assert!(workflow.snapshot_with_run_state(&input, &state).is_err());

    source["guards"].as_array_mut().unwrap().push(json!({
        "scope":"entry","when":{"op":"eq","terms":[
            {"kind":"field","id":"attempts"},{"kind":"literal","type":"integer","value":"0"}
        ]},"exit":"suppressed"
    }));
    let guarded = built(&source);
    let snapshot = guarded
        .snapshot_with_run_state(&input, &guarded.initial_run_state())
        .unwrap();
    assert!(matches!(
        guarded.prepare_set("count", true, &snapshot).unwrap(),
        SetDecision::Suppressed { exit: "suppressed" }
    ));

    let steps = source["steps"].as_array_mut().unwrap();
    steps.last_mut().unwrap()["target"] = json!("recipient");
    let bytes = serde_json::to_vec(&source).unwrap();
    let Err(error) = compile_source(&bytes, WorkflowProfile::Correlated) else {
        panic!("set wrote a record field");
    };
    assert_eq!(error.0[0].code, "STATE");
}
