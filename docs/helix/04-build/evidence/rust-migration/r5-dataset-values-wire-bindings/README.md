---
ddx:
  id: umf.evidence.rust-migration.r5-dataset-values-wire-bindings
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values
      kind: informed_by
---

# Full Dataset values: opt-in tagged-wire binding checkpoint

This checkpoint adds tagged-wire dispatch and opt-in Node/Bun and browser WASM
engine methods for `validateCoreDatasetValues` and
`verifyCoreDatasetValues`. It preserves the TypeScript default route. The
predecessor packet at `../r5-dataset-values/` remains unchanged and supplies
the expected complete envelopes and refusals.

The Rust wire cohort exercises seven frozen validate cases (commerce,
closed-scope refusal, duplicate instance, unknown source meaning,
supplementary/lone-surrogate data, unsupported relationship lifecycle, and
oversized input), four frozen verifier cases (valid commerce, stale source,
stale input, forged result), and host cancellation. Complete successful
envelopes are compared recursively with array order and UTF-16 object-key order
preserved. The tagged transport adds `/input` or `/source` to the corresponding
top-level refusal; the public Node/WASM wrapper removes only those exact
code/path pairs. Nested paths and host-control errors pass through unchanged.

Focused execution used Rust 1.90.0 and the isolated target directory
`/private/tmp/umf-r5-dataset-wire-target`. All nine wire tests passed as
individual filters: seven validate cases, the four-case verifier loop, and
host cancellation. Commerce complete-envelope/key-order comparison passed in
82.30s; closed scope in 6.42s; duplicate instance in 14.85s; unknown source,
surrogate, and unsupported lifecycle in about 6s each; oversized refusal in
116.41s; the four-case verify loop in 281.72s; cancellation in 0.16s. The
verifier and oversized tests were CPU-active, not stalled. Bun 1.4.3 ran both
Node and WASM wrapper factories: 6/6 tests, 16 assertions. The WASM helper
source-generation check passed with 14 synchronized helpers. During the first
typecheck the moving integrated tree had unrelated TS2769 diagnostics in the
Bit128 fixture; that fixture was corrected. Sol independently reran the
six-case wrapper suite and `bun run typecheck` on the settled source cohort;
both passed. Sol also reviewed the wrapper's exact two-code/two-path mapping.
No complete installed package or browser run is claimed by this packet.

## Qualification limits

This is tagged-wire behavior only. `execute_request` admits and decodes the
entire request before entering the Dataset operation and uses transport and
operation Context phases; it does not establish TypeScript getter/proxy
visitation order or one cumulative raw-host admission ledger. The wrapper
delegates plain values and does not add eager JavaScript cloning or stringify.
The operation verifier is frozen against four cases, not the full adversarial
receipt, budget, or refusal-order space. Node/Bun installed-package and real
Chromium/WASM qualification remain open. No default route, Python binding,
native enforcement, or full CONTRACT-049 relationship support is claimed.

TypeScript remains the default and authoritative consumer route.

## Source and test pins

The final source cohort and exact focused outcomes are recorded after the
integrated test pass. Shared wire and package files can include unrelated
operations; these hashes identify the captured cohort and do not imply that
the broader bundle was qualified here.

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/dataset_values.rs` | `92c2121a1968303c67a822e14b013a94aa65320bd0074d43f1b5ba6d7a0f1917` |
| `crates/umf-core-wire/src/lib.rs` | `2e7d73b73d6fb9b2da71defa35811a4d7fbc458c3fcb86b93ab230c2bcd185ff` |
| `crates/umf-core-wire/tests/r5_dataset_values_wire.rs` | `932232d3e0ba7c5e414e0cd5586731c5302ae591e28bff0898bbbe6907b4e80b` |
| Node and WASM `src/dataset-values.js` | `dbcde410ba098a6fabb95d194aeb23840c7937a6c5fc4abca0aef3a91ce9f3cc` (identical bytes) |
| `bindings/core/node/index.js` | `8edd73d445465003cfef4c75b20b7564577bebfb7d4f131bba0d6e443b93c7d5` |
| `bindings/core/wasm/index.js` | `4684d418811590d72bde3658fb441a5293b21dc9d63dada785bb9f595ccb4b94` |
| Node `index.d.ts` | `a0aacc502f7d152b27dc724e77d1c781057c4b6cfe44d07c3f80df549981074c` |
| WASM `index.d.ts` | `e6b50bcd8f607fce273cad8320df173c3abf5e794c8e696f7725bcf27f00f924` |
| `bindings/core/node/tests/dataset-values-wrapper.test.js` | `1db94789eb42e9d5516acef210328a4104ed6a7cd794181faae87a8506a55405` |
| Node package manifest | `a3808abf4ca470a7f606b1fa4046c9f71f2877ebfab9ff1159e21caa97dacbd8` |
| WASM source generator | `0b8374251f286ffb0d74da73254e488c64625731b3750b4cd5704f7c09db134e` |
| WASM shared-source manifest | `3b6d4563c1ab85d475332508db29073102b04749474cd017f296bf62f341b22a` |
| Frozen predecessor index | `faeb7ad54e503427b1a3d1ad7e0361088f3480992dda0d28432a774fb52f7031` |
| Dataset operation schema | `217cc3c05e10cec1bb4e93cca1205c039f596e95080cba075823a9b8b351013d` |

The seven validate vector hashes are commerce
`046e3e39f74802afd8b5612edf0c3a468d736274649cdfd24fec3e6901575850`, closed
scope `76151af72d51f8600c7c3aa45b94f5a4aff03fd0acd7636b4ac4f29757cda037`,
duplicate instance `449e4b001a6af55ac48448d0da0ff551f80664dc2d7b60824915e54ab162c985`,
unknown source `d2a32f5d7651ad3fab14f32204b642afd84ec89ace1bc764a928cf6d5373beb0`,
supplementary/surrogate `127e5593e7b1c9914bd027f1821b9bebba9f0d9c128db0ca82a00fffac2d6430`,
unsupported lifecycle `8af958503da3ebcb4e43171c92eb645b57d8dbb25d45829688818385adcaef35`,
and oversized `7dd518ddb76c494540507fe9318d5553a94aff7e12c40656d813b6cf92236f2a`.
The four verifier vector hashes are valid commerce
`3618fe8853a6acfda52866420ee7a69b77d2273d0e26903ee99cb0d0779ba9b3`, stale
source `4011beeff9fae6be61d487568b3fa55d5615246f0d64603189e4e05808474c21`,
stale input `486cff8a2fb4b2bd22b13b440ebbb1691d57a38a7e6076468579b4218e1e3020`,
and forged result `9bfb5a505895cda3756c86fa9aff8c591da44e1567893631fe541002c00a9fd0`.
