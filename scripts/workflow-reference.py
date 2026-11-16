#!/usr/bin/env python3
"""Independent bounded replay of the Follow-up reply conformance fixture."""
import itertools
from copy import deepcopy
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "crates/umf-core/tests/fixtures/workflow/reply.json"


def evaluate(predicate, fields):
    def operand(term):
        return fields[term["id"]] if term["kind"] == "field" else term["value"]

    op = predicate["op"]
    if op == "present":
        return predicate["field"] in fields
    if op == "eq":
        left, right = predicate["terms"]
        return operand(left) == operand(right)
    if op == "and":
        return all(evaluate(clause, fields) for clause in predicate["clauses"])
    raise ValueError(f"predicate outside fixture scope: {op}")


def reference_trace(definition, event_rows, blocked=False, outcome="accepted"):
    steps = {step["id"]: step for step in definition["steps"]}
    effects = {effect["id"]: effect for effect in definition["effects"]}
    trace = [definition["entry"]]
    send = steps[trace[-1]]
    effect = effects[send["effect"]]
    for guard in definition["guards"]:
        if guard["scope"] == "effect" and evaluate(guard["when"], {"blocked": blocked}):
            trace.append(guard["exit"])
            return trace
    routes = {route["outcome"]: route["next"] for route in send["routes"]}
    outcome_ids = {outcome["id"] for outcome in effect["outcomes"]}
    if len(routes) != len(send["routes"]) or routes.keys() != outcome_ids:
        raise ValueError("effect outcomes do not cover the declared set")
    trace.append(routes[outcome])
    pause = steps[trace[-1]]
    if pause["kind"] == "exit":
        return trace
    anchor = datetime(2026, 1, 1, 0, 0, 1, tzinfo=timezone.utc)
    registered = anchor + timedelta(days=1)
    span = pause["for"]
    assert span["unit"] == "fixed-day"
    cutoff = anchor + timedelta(days=int(span["count"]))
    correlation = pause["event"]
    candidates = {
        row for row in event_rows
        if row[0] == correlation["event"] and row[1] == "sample"
        and row[2] == "current" and registered <= row[3] < cutoff and row[4] > 10
    }
    if not candidates:
        trace.append(pause["timeout"])
        return trace
    winner = min(candidates, key=lambda row: row[3:])
    trace.append(correlation["next"])
    branch = steps[trace[-1]]
    trace.append(next(
        (case["next"] for case in branch["cases"]
         if evaluate(case["when"], {"response": winner[5]})),
        branch["else"],
    ))
    return trace


def main():
    definition = json.loads(SOURCE.read_bytes())
    utc = timezone.utc
    events = [
        ("replied", "sample", "current", datetime(2026, 1, 3, tzinfo=utc), 11, "yes"),
        ("replied", "sample", "current", datetime(2026, 1, 4, tzinfo=utc), 12, "no"),
        ("replied", "sample", "previous", datetime(2026, 1, 2, tzinfo=utc), 11, "no"),
        ("replied", "sample", None, datetime(2026, 1, 2, tzinfo=utc), 11, "no"),
        ("replied", "sample", "current", datetime(2026, 4, 1, 0, 0, 1, tzinfo=utc), 13, "no"),
    ]
    expected = ["send", "pause", "check", "complete"]
    for order in itertools.permutations(events):
        assert reference_trace(definition, order + (order[0],)) == expected
    assert reference_trace(definition, events[2:]) == ["send", "pause", "expired"]
    assert reference_trace(definition, events, blocked=True) == ["send", "suppressed"]
    assert reference_trace(definition, events, outcome="unknown") == ["send", "held"]
    assert reference_trace(definition, events, outcome="rejected") == ["send", "failed"]
    assert reference_trace(definition, events, outcome="timeout") == ["send", "held"]
    mutation = deepcopy(definition)
    routes = mutation["steps"][0]["routes"]
    routes[:] = [route for route in routes if route["outcome"] != "timeout"]
    try:
        reference_trace(mutation, events)
    except ValueError:
        pass
    else:
        raise AssertionError("deleted timeout route was not detected")
    print("Follow-up reply reference passed: 120 event permutations, duplicates, deadline, suppression and missing-route mutation")


if __name__ == "__main__":
    main()
