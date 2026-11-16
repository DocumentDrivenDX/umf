// SPDX-License-Identifier: MIT OR Apache-2.0
use std::collections::{BTreeMap, BTreeSet, VecDeque};

use super::{
    fail, find, instant, items, nonnegative_duration, predicates, text, Json, WorkflowError,
};

pub(crate) fn step<'a>(definition: &'a Json, id: &str) -> Result<&'a Json, WorkflowError> {
    find(&definition["steps"], id).ok_or_else(|| fail("STEP", "/steps", "unknown step"))
}

pub(crate) fn validate(definition: &Json) -> Result<(), WorkflowError> {
    for member in ["record", "effects", "events", "steps"] {
        unique(&definition[member], "id", &format!("/{member}"))?;
    }

    let entry = text(&definition["entry"]);
    if find(&definition["steps"], entry).is_none() {
        return Err(fail("ENTRY", "/entry", "entry step does not exist"));
    }
    let fields = &definition["record"];
    let fresh = definition
        .get("effectFacts")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));
    unique(&fresh, "id", "/effectFacts")?;
    for field in items(&fresh) {
        if find(fields, text(&field["id"])).is_some() {
            return Err(fail(
                "FIELD",
                "/effectFacts",
                "fresh field shadows a record field",
            ));
        }
    }
    let effect_fields = Json::Array(items(fields).iter().chain(items(&fresh)).cloned().collect());
    for (index, effect) in items(&definition["effects"]).iter().enumerate() {
        validate_effect(definition, effect, &format!("/effects/{index}"))?;
    }

    let mut guards = Vec::new();
    for (index, guard) in items(&definition["guards"]).iter().enumerate() {
        let path = format!("/guards/{index}");
        let guard_fields = if guard["scope"] == "effect" {
            &effect_fields
        } else {
            fields
        };
        predicates::validate(&guard["when"], guard_fields, &format!("{path}/when"))?;
        let exit = text(&guard["exit"]);
        let suppressed = find(&definition["steps"], exit)
            .is_some_and(|step| step["kind"] == "exit" && step["disposition"] == "suppressed");
        if !suppressed {
            return Err(fail(
                "GUARD_EXIT",
                format!("{path}/exit"),
                "guard requires a declared suppressed exit",
            ));
        }
        guards.push((text(&guard["scope"]), exit));
    }

    let mut graph = BTreeMap::new();
    for (index, step) in items(&definition["steps"]).iter().enumerate() {
        let path = format!("/steps/{index}");
        let id = text(&step["id"]);
        let mut successors = validate_step(definition, step, &path)?;
        for (scope, exit) in &guards {
            // Guard targets are terminal even when the suppressed exit is the
            // current step. Track these separately from ordinary routing.
            let due = match *scope {
                "entry" => id == entry,
                "step" => true,
                "effect" => step["kind"] == "effect",
                _ => unreachable!("validated guard scope"),
            };
            if due && id != *exit {
                successors.push((*exit, String::new()));
            }
        }
        for (target, path) in &successors {
            if find(&definition["steps"], target).is_none() {
                return Err(fail("SUCCESSOR", path, "successor step does not exist"));
            }
        }
        graph.insert(
            id,
            successors.into_iter().map(|(id, _)| id).collect::<Vec<_>>(),
        );
    }

    // A suppressed exit is a terminal disposition. Guards may also run before
    // an ordinary exit, but a chosen suppressed exit is never evaluated again.
    // Omit terminal-to-terminal guard relationships from cycle detection.
    acyclic(&graph, definition)?;
    let mut reachable = BTreeSet::new();
    let mut pending = vec![entry];
    while let Some(id) = pending.pop() {
        if reachable.insert(id) {
            pending.extend(graph[id].iter().copied());
        }
    }
    if let Some((index, _)) = items(&definition["steps"])
        .iter()
        .enumerate()
        .find(|(_, step)| !reachable.contains(text(&step["id"])))
    {
        return Err(fail(
            "UNREACHABLE",
            format!("/steps/{index}/id"),
            "step is unreachable",
        ));
    }
    if definition["reentry"]["mode"] == "after" {
        nonnegative_duration(&definition["reentry"]["minimum"], "/reentry/minimum")?;
    }
    Ok(())
}

fn acyclic(graph: &BTreeMap<&str, Vec<&str>>, definition: &Json) -> Result<(), WorkflowError> {
    let mut inbound: BTreeMap<_, usize> = graph.keys().map(|id| (*id, 0)).collect();
    let is_exit = |id| find(&definition["steps"], id).is_some_and(|step| step["kind"] == "exit");
    for (id, successors) in graph {
        if !is_exit(id) {
            for target in successors {
                *inbound.get_mut(target).expect("validated successor") += 1;
            }
        }
    }
    let mut available: VecDeque<_> = inbound
        .iter()
        .filter(|(_, degree)| **degree == 0)
        .map(|(id, _)| *id)
        .collect();
    let mut visited = 0;
    while let Some(id) = available.pop_front() {
        visited += 1;
        if !is_exit(id) {
            for target in &graph[id] {
                let degree = inbound.get_mut(target).expect("validated successor");
                *degree -= 1;
                if *degree == 0 {
                    available.push_back(target);
                }
            }
        }
    }
    if visited != graph.len() {
        return Err(fail("CYCLE", "/steps", "routing contains a cycle"));
    }
    Ok(())
}

fn unique(values: &Json, key: &str, path: &str) -> Result<(), WorkflowError> {
    let mut seen = BTreeSet::new();
    for (index, value) in items(values).iter().enumerate() {
        if !seen.insert(text(&value[key])) {
            return Err(fail(
                "DUPLICATE",
                format!("{path}/{index}/{key}"),
                "identifier must be unique",
            ));
        }
    }
    Ok(())
}

fn validate_effect(definition: &Json, effect: &Json, path: &str) -> Result<(), WorkflowError> {
    unique(&effect["inputs"], "id", &format!("{path}/inputs"))?;
    unique(&effect["outcomes"], "id", &format!("{path}/outcomes"))?;
    let outcomes = &effect["outcomes"];
    let mut classes = BTreeSet::new();
    for outcome in items(outcomes) {
        let class = text(&outcome["class"]);
        if matches!(class, "unknown" | "engine-timeout") {
            if !classes.insert(class) || outcome["type"] != "text" {
                return Err(fail(
                    "OUTCOME",
                    format!("{path}/outcomes"),
                    "unknown and engine timeout are unique text outcomes",
                ));
            }
        } else {
            classes.insert(class);
        }
    }
    if !["success", "definitive-failure", "unknown"]
        .iter()
        .all(|class| classes.contains(class))
    {
        return Err(fail(
            "OUTCOME",
            format!("{path}/outcomes"),
            "success, definitive failure and unknown outcomes are required",
        ));
    }
    let awaits = effect["await"] != "none";
    if awaits != classes.contains("engine-timeout") || awaits != effect.get("timeout").is_some() {
        return Err(fail(
            "AWAIT",
            path,
            "awaited effects require a deadline and one engine timeout outcome",
        ));
    }
    if awaits {
        nonnegative_duration(&effect["timeout"], &format!("{path}/timeout"))?;
    }
    let accepts = find(outcomes, "accepted").is_some_and(|outcome| outcome["class"] == "success");
    let success_count = items(outcomes)
        .iter()
        .filter(|outcome| outcome["class"] == "success")
        .count();
    if (effect["await"] == "accepted" && (!accepts || success_count != 1))
        || (effect["await"] == "result" && find(outcomes, "accepted").is_some())
    {
        return Err(fail(
            "OUTCOME",
            path,
            "accepted mode has an accepted success outcome and result mode has final outcomes",
        ));
    }
    let retry = &effect["retry"];
    if (retry["class"] == "none") != (retry["maxRetries"] == "0") {
        return Err(fail(
            "RETRY",
            format!("{path}/retry"),
            "retry class requires a positive retry bound and none requires zero",
        ));
    }
    let idempotency = &effect["idempotency"];
    let mut parts = BTreeSet::new();
    for part in items(&idempotency["parts"]) {
        let source = text(&part["source"]);
        let field = part["field"].as_str();
        if (source == "field") != field.is_some() || !parts.insert((source, field)) {
            return Err(fail(
                "IDENTITY",
                format!("{path}/idempotency/parts"),
                "invalid or duplicate identity part",
            ));
        }
        if let Some(field) = field {
            let value =
                find(&definition["record"], field).filter(|field| field["optional"] == false);
            if value.is_none() {
                return Err(fail(
                    "IDENTITY",
                    format!("{path}/idempotency/parts"),
                    "identity field must be a required record field",
                ));
            }
        }
    }
    let has_source = |source| parts.contains(&(source, None));
    if !["workflow", "record", "step"].into_iter().all(has_source)
        || has_source("enrollment") != (idempotency["scope"] == "enrollment")
    {
        return Err(fail(
            "IDENTITY",
            format!("{path}/idempotency/parts"),
            "identity must contain workflow, record and step and match its enrollment scope",
        ));
    }
    let mut emitted = BTreeSet::new();
    for event in items(&effect["emits"]) {
        let name = text(event);
        if !emitted.insert(name) || find(&definition["events"], name).is_none() {
            return Err(fail(
                "EVENT",
                format!("{path}/emits"),
                "emitted event must be declared once",
            ));
        }
    }
    Ok(())
}

fn validate_step<'a>(
    definition: &'a Json,
    step: &'a Json,
    path: &str,
) -> Result<Vec<(&'a str, String)>, WorkflowError> {
    let fields = &definition["record"];
    let mut successors = Vec::new();
    match text(&step["kind"]) {
        "exit" => {}
        "effect" => {
            let effect = find(&definition["effects"], text(&step["effect"])).ok_or_else(|| {
                fail(
                    "EFFECT",
                    format!("{path}/effect"),
                    "unknown external effect",
                )
            })?;
            validate_bindings(fields, effect, step, path)?;
            if effect["await"] == "none" {
                let next = step["next"]
                    .as_str()
                    .filter(|_| step.get("routes").is_none())
                    .ok_or_else(|| {
                        fail(
                            "AWAIT",
                            path,
                            "none mode requires only an unconditional successor",
                        )
                    })?;
                successors.push((next, format!("{path}/next")));
            } else {
                if step.get("next").is_some() || step.get("routes").is_none() {
                    return Err(fail(
                        "AWAIT",
                        path,
                        "awaited effects require only explicit outcome routes",
                    ));
                }
                unique(&step["routes"], "outcome", &format!("{path}/routes"))?;
                for (index, route) in items(&step["routes"]).iter().enumerate() {
                    if find(&effect["outcomes"], text(&route["outcome"])).is_none() {
                        return Err(fail(
                            "OUTCOME",
                            format!("{path}/routes/{index}/outcome"),
                            "undeclared outcome",
                        ));
                    }
                    successors.push((text(&route["next"]), format!("{path}/routes/{index}/next")));
                }
                if items(&step["routes"]).len() != items(&effect["outcomes"]).len() {
                    return Err(fail(
                        "OUTCOME",
                        format!("{path}/routes"),
                        "every declared outcome requires a route",
                    ));
                }
            }
        }
        "branch" => {
            for (index, route) in items(&step["cases"]).iter().enumerate() {
                predicates::validate(
                    &route["when"],
                    fields,
                    &format!("{path}/cases/{index}/when"),
                )?;
                successors.push((text(&route["next"]), format!("{path}/cases/{index}/next")));
            }
            successors.push((text(&step["else"]), format!("{path}/else")));
        }
        "wait" => {
            match (step.get("for"), step["until"].as_str()) {
                (Some(value), None) => {
                    nonnegative_duration(value, &format!("{path}/for"))?;
                }
                (None, Some(value)) => {
                    instant(value, &format!("{path}/until"))?;
                }
                _ => {
                    return Err(fail(
                        "WAIT",
                        path,
                        "wait requires exactly one of for or until",
                    ));
                }
            }
            successors.push((text(&step["timeout"]), format!("{path}/timeout")));
            if let Some(correlation) = step.get("event") {
                if definition["profile"] != super::CORRELATED_PROFILE {
                    return Err(fail(
                        "PROFILE",
                        format!("{path}/event"),
                        "event waits require the correlated profile",
                    ));
                }
                let event =
                    find(&definition["events"], text(&correlation["event"])).ok_or_else(|| {
                        fail("EVENT", format!("{path}/event/event"), "undeclared event")
                    })?;
                find(fields, text(&correlation["keyField"]))
                    .filter(|field| field["type"] == event["keyType"] && field["optional"] == false)
                    .ok_or_else(|| {
                        fail(
                            "FIELD",
                            format!("{path}/event/keyField"),
                            "correlation requires a required field of the event key type",
                        )
                    })?;
                successors.push((text(&correlation["next"]), format!("{path}/event/next")));
            }
        }
        _ => unreachable!("validated step kind"),
    }
    Ok(successors)
}

fn validate_bindings(
    fields: &Json,
    effect: &Json,
    step: &Json,
    path: &str,
) -> Result<(), WorkflowError> {
    let mappings = &step["input"];
    unique(mappings, "parameter", &format!("{path}/input"))?;
    for (index, binding) in items(mappings).iter().enumerate() {
        let parameter = find(&effect["inputs"], text(&binding["parameter"])).ok_or_else(|| {
            fail(
                "INPUT",
                format!("{path}/input/{index}/parameter"),
                "unknown effect parameter",
            )
        })?;
        find(fields, text(&binding["field"]))
            .filter(|field| {
                field["type"] == parameter["type"]
                    && (parameter["optional"] == true || field["optional"] == false)
            })
            .ok_or_else(|| {
                fail(
                    "INPUT",
                    format!("{path}/input/{index}/field"),
                    "field is missing, optional for a required parameter, or mistyped",
                )
            })?;
    }
    for parameter in items(&effect["inputs"])
        .iter()
        .filter(|parameter| parameter["optional"] == false)
    {
        if !items(mappings)
            .iter()
            .any(|binding| binding["parameter"] == parameter["id"])
        {
            return Err(fail(
                "INPUT",
                format!("{path}/input"),
                "required effect parameter is unmapped",
            ));
        }
    }
    Ok(())
}
