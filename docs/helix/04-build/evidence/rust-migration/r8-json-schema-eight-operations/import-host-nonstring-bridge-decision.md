---
ddx:
  id: umf.evidence.r8-json-schema-eight-operations.import-host-nonstring-bridge-decision
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.evidence.r8-json-schema-eight-operations
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R8 `importJsonSchema` non-string host bridge decision

The existing private staged `importJsonSchema` method remains string-only. The public/default TypeScript route accepts observable non-string inputs and remains unchanged. An additive `importJsonSchemaHostCoercion` method exists in the Node and WASM facades as a bounded private seam. It is qualified only for the admitted profile and captured runtimes below, not for production or default routing.

The bounded profile preserves current JavaScript host effects for sources whose effective `ToString` result is exactly `{}` or `{`. The host performs the source's observed length check, native string coercion, and—after a successful Rust parse—the second `length` read required by the source's YAML/type refusal. Rust owns JSON parsing and its refusal. For ToString exceptions, Rust receives `{` so the source's native `JSON.parse` catch/refusal remains ordered after the host conversion effect. The bridge rejects other successfully coerced text with `JSON_SCHEMA_HOST_INPUT_PROFILE` before dispatch; the exclusions are not parity claims.

The separate direct-source baseline captured 25 cases in Bun 1.4.3 and Node v26.12.1. A bridge-comparison runner captured 29 cases and executed current TypeScript beside the actual Node addon in each host. Across both hosts, 20 cases were eligible and all 20 matched host-effect order and exact outcome; 9 cases were explicitly excluded. Four excluded cases preserve effects through the point of refusal; the other five show the deliberate fail-closed early refusal, including skipping the source's second length read when coercion returns non-allowlisted text. Exact excluded IDs and counts are in [`import-host-nonstring-boundary-matrix.json`](import-host-nonstring-boundary-matrix.json). Bun and Node differ in native TypeError wording for null/undefined `length` access; each host's bridge matches its own TypeScript oracle.

The focused Bun-driven Node binding suite passed 13 tests and 30 expectations with a fresh addon. The [fresh WASM Chromium receipt](import-host-nonstring-chromium-bridge.json) runs direct TypeScript and the private WASM bridge together in Chromium 153.0.8010.12. All 20 admitted cases match ordered host effects and exact outcomes; nine cases are explicit profile exclusions, and the page reports no errors. The earlier browser launch, loopback and local-file attempts failed in the sandbox; a narrowly approved local Playwright run with Blob-loaded fresh wasm-bindgen glue produced this receipt. The receipt pins the Rust 1.90 build, wasm-bindgen 0.2.100, browser entry, source case matrix and shared helper hashes. It does not qualify arbitrary non-string input, installed package routing, or the public/default method.

The fixed 4,000,000-UTF-16-unit bound is a profile exclusion boundary. Cases over the limit intentionally do not claim predecessor error parity. The bridge covers only the observed object and primitive cases in the admitted matrix; it does not claim general object or primitive input parity, scalar coercion results, duplicate-key JSON, or other coercion strings. In particular, Rust's JSON parser can reject a text that the source's native parser would accept before the source's later non-string/YAML refusal; the allowlist avoids claiming parity for those cases.
