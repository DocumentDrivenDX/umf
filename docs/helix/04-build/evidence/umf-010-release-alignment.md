# UMF 0.10 release-alignment candidate

Owner direction on 2026-10-29 keeps action and saga semantics coupled to UMF and
selects the 0.10 development baseline. SDK candidate 0.10.0 uses core schema
0.10.0; the existing Python core candidate remains 0.10.3. No Python downgrade,
new action wire vocabulary, protocol identity change or release publication follows.

This PR separates version/code/CI alignment from saga design PR #70. All 71 current
extension packages already depend on core 0.10.0. Correct current action contracts
and their feature/story/design/test dependencies to match existing schemas and
implementation; historical receipts and published artifacts remain immutable.

The release consistency check runs before build and in fast PR CI. Six mutation
controls exercise the current tuple and SDK, extension, plan, Python and normative
contract drift. The action-plan producer identity is generated from this source
cohort. Identical source changes passed 109 selected portable action regressions
in the earlier combined source revision; installed SDK/Chromium/native release
qualification remains pending. No earlier native certificate is requalified by
updating contract prose.

The split branch reran all six release tests successfully and passed the release
consistency check. All 17 extracted release-only files were byte-compared against
the reviewed combined revision before publication. The split adds no new runtime
behavior beyond those already reviewed changes.
