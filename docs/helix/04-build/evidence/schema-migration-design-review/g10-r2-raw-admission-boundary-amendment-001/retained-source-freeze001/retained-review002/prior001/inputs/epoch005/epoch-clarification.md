# R2-IR-F2a — exact publication epoch UUID and original association

Proposed finite source-design addendum005 to amendment004, for root and external review before adoption. It elaborates ONLY `clock-anchor.md`, section “PublicationConfirmation EXACT”, immediately after its closed record and before the existing association paragraph. Amendment004 and all predecessors remain immutable. No profile, member, signature domain, DDL, descriptor, counter, authority scope or prior acceptance obligation changes. Source-only under runtime HOLD; all controls below are UNRUN.

## Exact added normative text

`PublicationConfirmation.epoch` is a mandatory **string containing the original epoch UUID**, with the exact normal form of `ingress_store.py::_uuid` at pinned commit75f: a string accepted as UUID whose lower-case hyphenated canonical UUID rendering equals the input byte-for-byte. It is not a digest, integer, null, UUID object, alternate UUID spelling, or an embedded epoch record. No additional UUID-version restriction or new allocation rule is introduced. In particular this member is neither `epochDigest` nor `H(epochRecord)`.

The original epoch record retained privately is the COMPLETE closed `umf.native-ingress-epoch/0.1` record, not a new .2 epoch profile:

```text
{profile,providerId,enrollmentId,installationId,targetCustody,epoch,state,
 sourceDigest,bundleDigest,headDigest,principals,principalsDigest,
 custodySequence,origin,originReceipt}
```

Resolve that actual original record through the genuine original ingress store/custodian and its native row identified by `(providerId, installationId, epoch)`. The row’s `epoch` column is native `pg_catalog.uuid`; all duplicated columns, complete record and original receipt/ownership/principals/custody correspondence must verify under the original selected branch. Preserve the original record’s exact state, origin and receipt rules; data projection equality cannot issue an epoch/store capability.

For this clock projection, the following ALL agree:

- `providerId`, `installationId`, `targetCustody` equal the exact original final publication, final installed reference, private external publication confirmation and native epoch record. Their original enrollment and actual original store/custody associations agree even though enrollmentId is not added to this compact projection.
- `epoch` equals the final `umf.table-inventory-publication/0.2` record’s `ingress.epoch`, final `umf.table-inventory-installation/0.2` reference’s `ingress.epoch`, original external publication confirmation’s `epoch`, and actual original epoch row/record’s `epoch`.
- For installed mode this is the SAME signed original `umf.table-inventory-generation-ingress/0.2` request’s `newEpoch`, distinct from `oldEpoch`; for fresh mode it is the SAME originally allocated `initialEpoch` retained in the original .2 preparation request/receipt and activation request and in the actual .2 fresh ingress enrollment receipt’s `epoch`. No epoch is allocated during anchor issuance, and a fresh route never fabricates an old=new transition.
- `publicationRecordDigest` resolves the complete exact original permanent .2 publication row and its record digest; `referenceDigest` resolves its exact .2 installed reference using the original reference digest formula. Those records’ source/bundle/head/principals/preparation/request/reservation associations agree with the same actual final publication and its original native epoch/cutover. `headDigest` equals that publication’s actual history head and the actual activated epoch’s head at THAT publication.
- `requestDigest` and `reservationDigest` are the actual final publication operation (installed cutover or fresh activation), matching the original external positive publication confirmation, original request/reservation and terminal publication outcome identified by `publicationOutcomeId`. They are not substituted with the preparation digests contained in the permanent publication’s acyclic ingress member. `confirmedCustodySequence` equals that external confirmation’s actual `custodySequence`.

Publication confirmation establishes the original epoch’s genuine prepared→active cutover in the final publication transaction; a prepared row, unrelated active row, same UUID in another installation/provider, matching public JSON or later replacement row is insufficient. Retain the full original native/publication/outcome/custody evidence, not merely the UUID or its hash. Historical original epoch evidence remains historical: this clarification does not require a previously published epoch to remain active forever, nor authorize reuse of a retired epoch for new execution. Any later state is accepted only through the already required original verified current-lifecycle/history rules; unresolved/replaced/missing original evidence remains fenced/refused. No new recovery bypass is introduced.

The UUID projection has no dependency on the clock anchor or future checkpoint/certificate. Full reference and external confirmation remain predecessors of the anchor; no anchor digest is inserted into their preimages. The unchanged F3 actual issued-context/full-ROOT/installed routing gate is NOT closed by this field typing or these data associations.

## Source correspondence (inspection only)

- Pinned `ingress_store.py` lines46–49: native epoch UUID column; lines162–172: strict UUID string normal form; lines249–303: full epoch record/receipt validation; lines1379–1447: actual legacy publication swaps the SAME requested old/new rows and retains immutable epoch identity. This is evidence for the original type/association only; that code still admits legacy table-installation.3, NOT the new .2 wire.
- Pinned `owner_approval_core.py` lines525–597: provision `newEpoch` and transition `oldEpoch/newEpoch` use original UUID validation and stable scope keys.
- Adopted `native-metadata.md` permanent publication/external confirmation/final reference sections: shared ingress epoch plus acyclic preparation-versus-publication digest distinction. `native-inventory-branches.md` requires actual distinct original epoch UUIDs. `fresh-authority.md` allocates and retains original initialEpoch, prepared epoch.1 and original activation.
- Proposed `wire-adaptations.md` selects .2 inventory publication/reference/request/enrollment/fresh child variants with exact old key sets; it does not allocate epoch.2 or widen the old validator. This addendum preserves that boundary.

## Finite additional acceptance obligations — ALL UNRUN

| ID | Input/state | Required result |
|---|---|---|
| R2-A005-01 | Genuine original fresh .2 final publication; UUID equals initialEpoch, native row, enrollment receipt, publication, reference and external confirmation | Original issuer may confirm anchor only after BOTH original positive confirmations and later qualified sample; no new epoch allocation |
| R2-A005-02 | Genuine original installed .2 publication; UUID equals signed newEpoch, distinct from oldEpoch, same native row and full publication chain | Same association acceptance under actual admitted installed context; old authority remains insufficient |
| R2-A005-03 | Replace epoch with digest string, entire epoch record, UUID object, number, boolean or null | Strict type/normal-form refusal before sample/anchor CAS |
| R2-A005-04 | UUID alternative spelling (uppercase letters, no hyphens or braces) or malformed UUID | Refuse instead of normalizing input |
| R2-A005-05 | Valid canonical UUID of oldEpoch, other campaign/publication/provider/installation, or unrelated native epoch | Refuse full crossrecord lookup/correspondence even if other public hashes are recomputed |
| R2-A005-06 | Same epoch UUID but substituted head, record/reference digest, preparation/final request, reservation, principal/source/bundle or custody sequence | Refuse actual original crosspublication/terminal association; no self-asserted public reconstruction |
| R2-A005-07 | Missing/replaced native epoch/history/publication evidence; prepared-only state or unknown final COMMIT | No anchor/sample authority; retain original pending fence and recovery-only route |
| R2-A005-08 | Reobserve positively confirmed original publication with valid later original epoch history; replay existing confirmed anchor | Resolve the SAME original epoch/publication and SAME anchor without reallocating, recharging or reexecuting; historical retirement is not new execution authority |

All original88+64+10+12 obligations and their UNRUN status remain intact. This addendum adds eight obligations; it claims no SQL, driver, native, clock, Weft, old-store or installed-route qualification.
