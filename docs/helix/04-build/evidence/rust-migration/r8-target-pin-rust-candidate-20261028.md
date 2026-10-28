---
ddx:
  id: umf.evidence.rust-migration.r8-target-pin-rust-candidate-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: umf.evidence.rust-migration.target-pin-python-predecessor-20261028
      kind: extends
---

# Opt-in Rust target-pin matcher and Python candidate

CONTRACT-072 now requires unique platform component names in both pin and
observation. The existing Python `TargetPin.matches` boundary rejects repeated
names. Its 13-case [predecessor packet](target-pin-python-predecessor-20261028/packet.json)
remains unchanged: one duplicate-name case records the old accepted behavior.
The current policy reverses only that case. The historical packet SHA-256 is
`bbaa2cb7fa0504a853e353a9adb3df5df0b5f699a91e0e90eaf6b5d05e54392f`;
the current Python matcher source SHA-256 is
`00f464e929843b0fc3b711cefdcd90f29ac7d4996d3af3a3d273879811646f70`.

The shared Rust core matches the five identity strings exactly, requires
equal platform-component counts and unique names on each side, then checks
every observed version against its named qualified set. Its source SHA-256 is
`45309fb10bc0f696b9e0332dde38d1335bf91dc34fc14b5313ecf8f1d8c9d854`.
The opt-in PyO3 binding accepts exact tuple/string carriers; the separate
Python candidate wrapper refuses malformed carriers and an absent or wrong
native profile. The wrapper source SHA-256 is
`005083efaf755003bddb3518477b04279dbf20a31e38efb2c6432557839ab3f2`.
The Python default route remains `TargetPin.matches`.

Rust 1.90.0 offline `cargo test -p umf-core --locked --offline --test
r5_target_pin` passed 2/2, including all 13 packet identities and duplicate
pin/observation controls. The candidate PyO3 library built offline for Darwin
arm64; its SHA-256 is
`cb0d0615debf7512f517f8cf912554b51170617aee24c0f417cd5a398c965967`.
With `UMF_TARGET_PIN_RUST_LIBRARY` set to that library,
`python/.venv/bin/python -m unittest python/umf_access/tests/test_rust_target_pin.py`
passed 6/6 on CPython 3.13.16. The test asserts packet format, source pin,
case inventory, current Python/Rust parity, and malformed carrier refusal.
Sol independently reran both focused suites. Ruff check/format, Rust source
format checks, and `git diff --check` passed.

This candidate does not yet select the Rust matcher from public Python
`TargetPin.matches`, prove the entire `ReadPlan.bind` host-call sequence, or
qualify installed wheels across the release matrix. It is not a default-route
retirement or release claim.
