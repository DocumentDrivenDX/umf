# R2 raw JavaScript admission boundary amendment001

Status: normative DESIGN PROPOSAL for independent peer review and implementation
owner adoption. No runtime/native/installed/release acceptance. Original source
freeze001 and its historical descriptors remain byte-identical. This amendment
is additive and changes only the initial raw own-key reflection boundary below.
It does not qualify the unfinished structural validator, replay or other F2 paths.

## Exact scope and reason

The existing object API and descriptor-safe JSON refusal rules remain. Standard
JavaScript has no bounded iterator for all own string AND symbol properties,
including nonenumerable ones. `for...in` cannot prove their absence. The native
own-key APIs return complete key arrays. A bound on accepted JSON property counts
cannot prove that an invalid raw object has only that many hidden/symbol keys.
Therefore no guessed fee or accepted-count reservation can establish a strict
before-allocation bound for that initial native result on arbitrary raw objects.

Adopt ONE narrowly named exception: initial atomic own-key reflection for each
raw object/array admission occurrence. 'Initial' is per still-unowned node, not
only the request root. Repeated original aliases follow existing admitted-copy
semantics and are accounted per actual admission; a caller identity/hash is not
a certificate. The sole primitive is the captured intrinsic `Reflect.ownKeys`.
The implementation may receive its complete native array before knowing its
extent. Immediately charge the exact returned count, or refuse on overflow,
BEFORE descriptors are walked or an owned output node/property is constructed.
No batch `getOwnPropertyDescriptors`, separate symbols/names arrays or second
`Object.keys` array may be smuggled into this exception.

This exception means arbitrary rejected raw-object attempts do NOT have a strict
total native-work, preallocation or OS heap bound. The atomic reflection can
already have exceeded the remaining logical budget/native extent when overflow
is observed. Successful admitted contexts still obey the unchanged counters and
all input/derived limits. Report this boundary explicitly in support/profile and
release documentation; do not claim full before-allocation protection for every
raw JS object. Fixed primitive interpreter overhead remains distinct from
variable application-visible arrays. This is not a larger grant, hidden limit
increase, caller-controlled budget reset or permission to truncate raw content.

## Required admission order

1. Use original primitive/numeric/depth/cycle/prototype rules first, under the
   same root meter. Custom object/array prototypes refuse. Fixed-size prototype/
   Array.isArray operations are included in the actual node event. A known array
   length may reject an impossible admitted extent early. Optional bounded own-
   enumerable counting can early-refuse ordinary oversized objects; it neither
   proves hidden/symbol absence nor replaces step2.
2. Charge `rawOwnKeysCall` immediately BEFORE the ONE native Reflect.ownKeys
   invocation on the raw node. After return, obtain the native array length and
   charge `rawOwnKeysResult` by that EXACT count in one checked operation. If the
   remaining root work or applicable original count limit cannot admit it, refuse
   at the container path immediately; no descriptor/value/copy/result processing.
   Failed accounting never becomes a successful context or a partial result.
3. Process returned keys in original native order. A symbol refuses without
   reading or serializing its description/value. For each string key, charge
   `ownPropertyDescriptor` before ONE captured getOwnPropertyDescriptor call.
   This call produces a fixed-shape record (at most six standard fields), not a
   variable descriptor map. Reject disappearance, hidden/accessor/non-data
   properties before reading descriptor.value; do not invoke a getter/toJSON/
   valueOf. Preserve the original array length exception, dense/index checks and
   safe original number/depth rules. Existing failure diagnostics stay located
   and safe; oversized keys refuse at the container rather than constructing an
   unbounded diagnostic path. Preserve valid unknown JSON/property names.
4. Once exact descriptor-safe shape is established, reserve its known owned
   object/array/property/string extent BEFORE owned construction/append/clone.
   The original jsonNode/objectKey/jsonArraySlot/text/byte/depth/node counters
   continue, in addition to reflection events. Preserve original limits per
   component and shared root; do not add an accidental aggregate100k copier or
   raise a100k component limit to1m. Each child still-unowned node repeats these
   admission steps. All processing uses the same exact admitted source inputs.
5. Retain private owner-derived shape/key-order/count metadata as nodes become
   owned. It is bound to that root and exact data; no global cache, caller flag,
   hash-only shape proof, public shape/history reader or unchecked optional
   prepared argument. Owned JSON from a bounded parser may use its actual
   scanner-derived shape counts. Internal copies propagate/reconstruct their
   actual owned shape under the same meter. No raw object may masquerade as owned.
6. Every subsequent variable allocation/enumeration of that owned graph has a
   known extent and must be admitted before expansion/retention. Reflection on
   already-owned data does not inherit the raw exception. Key arrays, canonical
   output, hash preparation, Field meanings, subject/index rows, diagnostics,
   SQL builders, whole materials and actual recursive replay remain metered by
   their own actual events and all existing caps. This amendment does not waive
   an unintegrated kernel or replace the actual structural validator with a fee.

## Normative event-table delta

`event-table.json` is the exact additive event definition. Each rawOwnKeysCall
costs1 work unit before invocation; each returned own-key slot costs1 work unit
immediately upon return; each single fixed-shape own descriptor invocation costs1
work unit before the call. Result charging includes symbols and the array's
length key even when rejection/skipping follows. These events are DISTINCT from
later property visits/owned retention: do not coalesce them to erase work.
There is no partial successful charge, negative refund or new per-node/root meter.

Retain1,000,000 root work units,99,999 retained subject slots, existing4096-byte
block accounting and all original byte/node/depth/candidate/history/material/
final-plan limits conjunctively. No subject threshold, external96MiB/history24MiB/
whole64MiB/G05 tighter limit or complete-plan24MiB ceiling is increased here.
The exact shape/byte domains still require actual implementation conformance;
this event delta does not bless existing unqualified byte accounting.

## Source/definition custody and enablement

Only this raw atomic boundary overrides earlier blanket before-expansion wording
in the new proposed source cohort. Everything else in accepted review/admission/
closure/once-only/native rules remains. No old .1 API/wire/schema validator is
broadened. These events are private accounting, not new plan/receipt/native fields.
The new descriptors bind this normative text, event table and acceptance bytes,
retain all old exact records under retained-source-freeze001 paths, and derive
new acyclic digests. Fixed provider20-table DDL and original application SQL stay
byte-identical. Old descriptors are historical evidence, not relabeled as new.
No existing store/issued authority is adopted or retrofitted from these hashes.

Independent source acceptance and actual implementation/source/type/schema/
Bun/browser/boundary controls are separate. Structural accounting and nonempty
history remain required, with located refusal until real integration qualifies.
ROOT/F3/current lifecycle/clock/holds/Weft/old-store/installed/managed/consumer/
release gates stay OPEN. This proposal runs no product or native code.
