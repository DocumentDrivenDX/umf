#!/usr/bin/env python3
"""Independent bounded replay of the Follow-up reply conformance fixture."""
import itertools
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "crates/umf-core/tests/fixtures/workflow/reply.json"


def reference_trace(definition, event_rows, blocked=False, drop_timeout=False):
    steps = {step["id"]: step for step in definition["steps"]}
    effects = {effect["id"]: effect for effect in definition["effects"]}
    trace = [definition["entry"]]
    send = steps[trace[-1]]
    effect = effects[send["effect"]]
    if blocked:
        trace.append(definition["guards"][0]["exit"])
        return trace
    routes = {route["outcome"]: route["next"] for route in send["routes"]}
    outcome_ids = {outcome["id"] for outcome in effect["outcomes"]}
    if drop_timeout:
        routes.pop("timeout")
    if routes.keys() != outcome_ids:
        raise ValueError("effect outcomes do not cover the declared set")
    trace.append(routes["accepted"])
    pause = steps[trace[-1]]
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
    trace.append(branch["cases"][0]["next"] if winner[5] == "yes" else branch["else"])
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
    try:
        reference_trace(definition, events, drop_timeout=True)
    except ValueError:
        pass
    else:
        raise AssertionError("deleted timeout route was not detected")
    print("Follow-up reply reference passed: 120 event permutations, duplicates, deadline, suppression and missing-route mutation")


if __name__ == "__main__":
    main()
