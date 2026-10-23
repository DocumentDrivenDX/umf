# Binding UTF-16 and callback review

The first frozen public control changes matching logical document identities to
raw UTF-16 containing an unpaired surrogate. The predecessor yields a candidate;
the former Rust inspector synthesized ACCESS_REFERENCE after a lossy UTF-8
conversion. `index-names/frozen.json` keeps two distinct raw UTF-16 index names;
identity comparison must preserve their distinction. These now match natively.

The repair borrows UTF-16 identities, retains source duplicate/unknown/storage
phase order, uses ordered target identities and precharges diagnostic growth and
candidate scans through the live Context. A private bounded callback test aborts
at 75% work with semantic-looking host codes and checks terminal provenance.
The legacy callback entry without an invocation Context fails closed.

`identities/frozen.json` adds two independent identity controls: the raw module
case preserves the INPUT refusal, and a raw field identity with an explicit Python
name remains a candidate with client-checked field dispositions. These exposed
separate access generation differences, reported to that owner; they are not
claimed passing in the repair checkpoint. PostgreSQL/raw profile boundary
controls are independently owned under `sol-generation-binding-pg-boundary-review`.

No source approval or final installed-host qualification is established here.
