---
ddx:
  id: umf.evidence.r8-json-schema-eight-operations.import-host-nonstring-decision
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.evidence.r8-json-schema-eight-operations.import-host-observation-decision
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R8 JSON Schema import non-string boundary decision

## Decision

Do not extend the staged Rust binding to accept non-string root or resource
sources in this cut. Keep the staged opt-in facade's explicit string-only
boundary and keep the TypeScript implementation as the default route. The
source observation is frozen in the [direct-source matrix](import-host-nonstring-observation.json).

The new matrix matches across Bun 1.4.3, Node 26.12.1, and real Chromium
153.0.8010.12 for nine root/resource probes. Chromium needed an approved
browser-launch sandbox escalation after the initial `MachPortRendezvousServer`
denial. Node ran a Bun bundle derived from the same current TypeScript source
graph; this comparison is not installed-package parity.

## Why no staged interface was added

The direct source has a two-parser boundary for non-string values. It reads
`text.length`, calls native `JSON.parse(text)` (which performs string-hint
coercion), then passes the original value to the YAML parser. Successful object
coercion therefore has observable effects before a later parser TypeError.
`Symbol` and coercion-hook exceptions are caught by the `JSON.parse` try/catch
and become `JSON_SCHEMA_SYNTAX`; the earlier `length` getter exception escapes
unchanged. Resource parsing completes or refuses before the root stage.

A Rust request can carry the string produced by a host ToString operation, but
that alone cannot reproduce the subsequent TypeError on the original object,
the repeated `length` read, native `JSON.parse`'s Symbol failure, or caught
coercion-exception mapping. A JS `JSON.parse` call in the bridge would perform
the source JSON parse outside Rust, contrary to the existing parser ownership
decision. A bridge that manually synthesizes the source parser's later TypeError
and syntax mapping would also need a broader, complete inventory of coercion,
length comparison, limit, and exception cases before it could claim fidelity.
No such bounded contract or stage protocol is established by the nine cases.

This is an evidence blocker, not a claim that emulation is impossible. A future
proposal must add direct-source traces for coercion return types, thrown
primitives/objects, length values and comparison coercions, text-limit ordering,
root/resource sequencing, and errors after successful native JSON parsing. It
must then show that the host performs only unavoidable reflection/coercion,
Rust still parses each source and owns tree/diagnostic semantics, and Node plus
real Chromium match the source trace and outcome. Until then, non-string inputs
remain outside the staged opt-in profile, and no TypeScript default route
changes.

## Reproduction and evidence limits

The receipt records exact source hashes and test commands. Bun, Node, and real
Chromium case arrays were byte-for-byte equal (9/9). The stage binding itself
was not modified; this direct-source observation does not claim staged
non-string parity or close any default-route gate.
