# Saga proposal examples

`allocation.json` is a fabricated complete current-core Document. The shared
Field/Key/action declarations use existing UMF shapes. The new saga payload is
proposed by CONTRACT-908; its inert handler profile is not installed or qualified.
`submit.json` contains a closed logical request with a host-issued revision
placeholder. Neither fixture grants provider, tenant or execution authority.

Run `verify.py` from any directory with Python 3.9+ and jsonschema 4.25.1.
It loads all referenced JSON Schemas from explicit local sources and performs
no network resolution. It validates the action and saga payload structures,
request/result examples and negative structural controls. The containing core
Document's full semantics, reference/type compatibility, safe edits, native
profiles and browser interpretation remain implementation tests in STP-906/905.
Unknown-member examples prove retention shape only, never semantic eligibility.

The report is retained in `../../experiments/saga/evidence/schema-results.json`
with source hashes and precise validation limits. This verifier is a design
example check and introduces no runtime package or production API.
