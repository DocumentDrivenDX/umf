---
ddx:
  id: umf.evidence.rust-migration.r8-schema-properties-host-native-typeerror-decision
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-schema-properties-installed
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-field-value
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# Schema Properties host-native TypeError boundary decision

The installed replay isolates 11 remaining Field Value mismatches to malformed
string carriers. The reference route throws the active JavaScript host's native
`TypeError`; the Rust route returns an `UmfError` with `TYPE_ERROR` and a Bun
message captured in the portable Rust layer. Node 26 and Chromium 153 report
`Cannot read properties of null (reading 'length')` for a null carrier and Node
reports `value.charCodeAt is not a function` for a positive-length non-string
carrier. The archived Bun packet records different wording. This confirms at
least one cross-host message difference; host wording is runtime behavior, not
a portable Rust diagnostic. Chromium's full 11-case message matrix remains to
be captured by the final installed replay.

## Predecessor stage and boundary

`src/validation/literal-kernel.ts` runs `unicodeCount(value)` at two semantic
checkpoints: during literal identity admission and later when computing the
length used by refinements. It reads `value.length`, compares the loop index,
then calls `value.charCodeAt(i)`. The R5 packet documents the unusual accepted
JSON carrier cases and TypeErrors at these call sites. Schema Properties
already routes inputs through the synchronous `umf.host-json/1` dispatcher.
That dispatcher keeps original host objects behind opaque handles and stores
any callback-thrown value in invocation-local `hasThrown` / `thrown` state,
rethrowing the same value after the Rust call.

Do not revisit an original handle to reproduce the semantic operation: that
would rerun Proxy/getter behavior after admission. Instead, add one private
host operation for the specific Unicode-count step. Rust supplies the already
admitted copied carrier; the host reconstructs a fresh plain JSON value from
that payload and executes the predecessor's native `length`/comparison/
`charCodeAt` sequence at the same semantic checkpoint. A native exception from
this private copy is retained by the existing thrown-value channel and
re-thrown unchanged. A successful result returns the count to Rust, which
continues its existing semantic validation. Rust must not encode host message
text or a single host's wording.

This callback is limited to reproducing ECMAScript behavior on the Rust-owned
copy. It must not expose a public API or resource, call user code, reread the
caller object, reorder admission, or replace Rust diagnostics for valid strings
and unpaired-surrogate semantics. Node, Bun and browser adapters must use their
own native `TypeError` constructors and messages. The existing immediate
`hasThrown` propagation for exceptions from original input reflection remains
unchanged.

## File-level implementation and qualification

1. Extend `crates/umf-core/src/host_json.rs` with a private request/reply for
   native Unicode counting over a Rust `Value` copy. Encode all JSON value
   cases without losing UTF-16 code units or conflating numbers; return the
   count as a reply. Rust invokes it only at the two predecessor checkpoints
   and retains existing behavior for ordinary strings.
2. Implement the event in `bindings/core/node/src/host_json.rs` and
   `bindings/core/wasm/src/host_json.rs`, plus the matching `dispatch` case in
   `bindings/core/node/src/host-json.js` and
   `bindings/core/wasm/src/host-json.js`. Reconstruct only a private plain copy,
   run the native operation there, and use the existing thrown-value path for
   exceptions. No host may pass through an original input handle here.
3. Keep `crates/umf-core/src/literal.rs` portable: it may request the host
   primitive through an explicit host-aware entry point, but must not contain
   Node, Bun, Chromium error text or claim a single message is canonical.
4. Add source-level Node/Bun/WASM browser tests for null, zero/odd/coercible
   `length`, positive-length arrays/objects, and hostile `length` coercion.
   Compare error `name` and `message` within each runtime against that runtime's
   `./reference`; assert the instance is a native `TypeError`. Keep separate
   proxy/accessor tests asserting original thrown-object identity and exact
   trap counts, proving the new operation never revisits caller input.
5. Rebuild a fixed-point SDK and rerun the installed 83 frozen outcomes plus
   the eight crossed-order cases on Node, Bun and real Chromium. Preserve old
   receipts as historical cohorts. Qualification requires all 11 carrier
   cases to match host-local reference envelopes and all previously passing
   outcomes and order controls to stay unchanged.

The installed mismatch log and R5 evidence are diagnostic inputs, not a new
semantic contract. Chromium-specific message strings still need to be captured
against its own `./reference`; do not infer them from Node or Bun. This packet
selects a boundary for review and does not claim implementation or qualification.
