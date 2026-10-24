---
ddx:
  id: umf.evidence.r5-json-schema-python.harness
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.r5-json-schema-bindings.predecessor
      kind: informed_by
    - id: umf.evidence.r5-json-schema-bindings.real-hosts
      kind: informed_by
---

# R5 JSON Schema installed Python replay harness

This harness replays the frozen 30-operation predecessor packet through the
opt-in `umf-r5-json-schema/0.1.0` Python API. It covers import, inspect, root,
resource and bundle export, copied get, schema-position walk, surrogate keys,
unknown representation refusal and copied-result isolation. It runs with the
target interpreter from an isolated installed environment and records the
loaded Python module and native extension paths and SHA-256 values.

```sh
/path/to/venv/bin/python -I scripts/rust-migration/r5/json-schema-python/replay.py \
  docs/helix/04-build/evidence/rust-migration/r5-json-schema-bindings/predecessor.json \
  /private/tmp/r5-python-replay.json installed-python
```

The comparator makes the JSON-observable projection explicit: native export
strings are parsed as JSON before comparing values, and Python `ExactJsonNumber`
carriers project to the IEEE-754 value JavaScript `JSON.parse` would observe.
Separate checks retain and test exact source lexemes and `dump_native_json`
output for `-0.000` and `9007199254740993`. The receipt retains full per-case
outcomes, projection results, exact-number checks, interpreter/profile identity,
predecessor digest, and source/artifact provenance. Python `UmfCoreError` stays
visible in raw results and is marked as a distinct host class from predecessor
TypeScript `UmfError`; refusal code and message comparison does not assert
exception-class identity. The predecessor packet does not include error paths.

`controls.py` emits a separate receipt for work-budget exhaustion ahead of a
million-character resource, cancellation and deadline preflight, meter hook
failure, and a hostile nested schema under a bounded work budget. These probes
are control evidence, not part of the frozen parity count.

Run the comparator self-tests with an environment that can import the Python
package:

```sh
/path/to/venv/bin/python scripts/rust-migration/r5/json-schema-python/replay.py --self-test
```

They prove that refusal code and message mismatches fail, tagged `get_node`
number carriers retain their exact lexeme, source and Python bundle snapshots
project to the same JSON-observable structure, and a 30-row receipt containing
an exact number carrier serializes. During replay, the script writes a
`<output>.partial.json` after each finished case; it removes that file after
writing the complete receipt.

The source-tree smoke attempt using the available dev extension reached the
final case-start marker but exceeded a 180 second watchdog before it returned.
It produced no result rows or parity count; the incomplete attempt and exact
last printed case are preserved in
[source-tree-smoke-attempt.json](source-tree-smoke-attempt.json). This remains
premerge and inconclusive. The temporary dev extension was
`33c9ceff…b032ca0`; the checkout's older extension lacked the JSON Schema
profile entrypoint (`4161d780…89ee5`). The dev extension was copied from a
separate package build; source correspondence with this worktree was not
established. An earlier unbounded run completed its case loop but failed while
serializing the receipt because a raw `ExactJsonNumber` was not JSON serializable;
that defect is fixed and covered by the self-test. The full replay has not been
rerun after the fixes. No process was left running.

Any local source-tree or premerge-wheel execution is a **premerge smoke only**.
It cannot establish final installed qualification. After package wiring is
merged, build the release-candidate wheel cohort, run both scripts in a fresh
isolated environment, retain their output JSON, and bind the result to exact
wheel and source hashes before making an installed support claim. No replay
receipt is checked in by this harness-only change.
