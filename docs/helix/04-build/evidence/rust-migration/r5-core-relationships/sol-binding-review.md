---
ddx:
  id: umf.evidence.rust-migration.r5-core-relationships-sol-binding-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-core-relationships
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Sol review: opt-in relationship binding

I independently reviewed the four relationship dispatch routes, Node/WASM
facade attachment, exact frozen wire assertions and the clean installed
Node/Bun replay. I reproduced the extracted archive replay with bare
`@umf/core-rust-native` imports on Node 26.12.1 and Bun 1.4.3. Both passed
17 frozen operations, JSON/YAML receipt verification, copy isolation,
structural and aggregate limits, and zero-work/cancellation/deadline controls.
The archive SHA-256 is
`02c37836664fe954312e9af431ad4076219d7b3cda1dee882970092be70572d0`;
its 16 members comprise 15 byte-identical allowlisted Node package source
files and one native addon. The extracted addon SHA-256 is
`979c40b62b9c43246279e3823090bd6aed088249e72053669996c57d45038f5b`.

At the reviewed checkpoint, I checked all 33 source pins in each installed
receipt against the then-live source tree. The Node receipt SHA-256 was
`655177fae1cdac5378cc77363daa9b00af05248dd5b10480c46ce10aef9ddc42`;
the Bun receipt SHA-256 was
`d636602031cc4a0992cabb97d0bb01f27430bb6179a0299966f682aac9fe9986`.
The first receipts became stale when the agent added wire-level copy-isolation
and aggregate-refusal nonmutation assertions. I rejected those earlier pins;
the final receipts pin the frozen wire test at
`646730597e36cf9084301c7ffcba56d2bc17466c309d90719633b2c4a1877b6c`.
The agent reran the final wire test, 2/2 passing, after that edit. The
duplicate-aware comparator preserves UTF-16 values, duplicate object members,
array order, and exact error envelopes without imposing JSON object order.

**Later source drift:** The live metamodel fixed-point regeneration changed
five resource/generated paths pinned by each Node/Bun receipt. These receipts
remain valid historical package-cohort evidence but no longer describe the
current source tree. A fresh installed replay and repinned receipts are required
before this binding can join the final source-coherent release cohort. The
separate Chromium receipt also needs explicit hashes for its resource inputs.

No P1/P2 remained in that bounded historical Node/Bun behavior review. At
that checkpoint, the Chromium browser replay passed on a separate installed
WASM package while its resource-source closure awaited renewal and review. The package remains private
and opt-in. The four relationship APIs still use TypeScript at the production
SDK root, and native database relationship enforcement, full R5 graduation,
and R8 retirement remain open.

## Fixed-point source cohort review — 2026-10-24

The refreshed Node and Bun receipts have SHA-256
`f170c25468c1c7d9958cfd7f2301062459433e7db853b1a8d4ce9edbdcf41dc4`
and `4ec6a38ba7c3533a9cb8bdde33377aa9778b6849db34789e187ed5cbf55eea51`.
I independently checked all 33 source hashes in each against the live fixed-point
tree (zero mismatches), then ran the clean installed package-name replay under
Node 26.12.1 and Bun 1.4.3. Both newly produced receipts are byte-identical
to the checked-in receipts: 17 frozen operations, two receipt verifiers, seven
copy/limit/control assertions, and resource, cancellation, and deadline
refusals pass. The refreshed native archive SHA-256 is
`83d21d3d9bb0220d2992fbe4e4927d4d38f52c2c5960edaf1a8dae83212a40a5`;
the extracted addon SHA-256 is
`0f480f640860c416e6f3728ef1bbf9caa36e2fe08d97416e15a4b613fc776afe`.
I inspected all 16 archive members: its 15 text members match the allowlisted
source files byte-for-byte.

The refreshed Chromium receipt SHA-256 is
`863e3542d192e2dd046f97a026edccd7144692b3c81f32e3bc78eee0e511ca4e`.
Its 18 source pins match the live tree, including the five actual resource
inputs. The referenced 16-member standalone WASM archive SHA-256 is
`66ed1b6a3cc6806a176fd8f07fe976d726ca4a317fb017a7f1ccb2ba140fa2af`.
I independently ran the extracted archive in Chromium 153.0.8010.12: all 17
frozen operations, two receipt verifiers, forged-receipt rejection, copy
isolation, and zero-work/cancellation/deadline controls passed. This closes
the earlier source-cohort and browser-resource review gaps for this bounded
opt-in binding. The private archives and these replays do not establish
production SDK default routing, native database enforcement, or full R5/R8
release qualification.
