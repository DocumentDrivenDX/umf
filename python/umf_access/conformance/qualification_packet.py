"""Repository-only validation of exact-pin engine adoption evidence.

This checks evidence integrity and coverage, not native execution or authority.
Receipt loading is supplied by the caller; this module performs no filesystem,
network, credential or engine operations. Unknown packet/receipt fields survive.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping

from .reads import READ_CASES

# Whole-story qualification includes temporal cases. A non-temporal read profile
# is deliberately named separately and cannot qualify the whole adapter.
_REQUIREMENTS = {
    ("truss", "reads-non-temporal"): (
        ("reads.parity", "reads.pin_mismatch", "reads.refusal_not_empty"),
        ("reads.native_path", "reads.read_only_statements"),
    ),
    ("ashlar", "reads-non-temporal"): (
        READ_CASES + ("protocols.no_executor",),
        (
            "reads.resolver_parity",
            "reads.empty_complete",
            "reads.replaced",
            "reads.expired",
            "reads.alias_renamed",
            "reads.alias_repointed",
            "reads.identity_after_fetch",
            "reads.publication_transition",
            "reads.retention_transition",
            "reads.policy_transition",
            "protocols.no_executor",
        ),
    ),
    ("truss", "complete"): (
        (
            "reads.parity",
            "reads.pin_mismatch",
            "reads.refusal_not_empty",
            "actions.admission",
            "actions.receipt",
            "actions.conflict",
            "actions.precommit_fault",
            "actions.commit_loss",
            "actions.replay",
            "bulk.seal_submit",
            "bulk.control_recovery",
            "values.lexical_spelling",
            "actions.validate",
        ),
        (
            "reads.native_path",
            "reads.read_only_statements",
            "actions.subjects",
            "actions.source_revision",
            "actions.twin_store",
            "actions.noop",
            "actions.conflict",
            "actions.precommit_fault",
            "actions.commit_loss",
            "actions.replay_success",
            "actions.replay_rejection",
            "actions.token_reuse",
            "bulk.twin_store",
            "bulk.lost_ack",
            "bulk.token_reuse",
            "bulk.refused_seal",
            "bulk.known_noncommit",
            "bulk.unknown_custody",
            "bulk.original_recovery",
            "values.lexical_spelling",
            "values.absent_refusal",
            "actions.preview",
        ),
    ),
}
_REQUIREMENTS[("ashlar", "complete")] = (
    _REQUIREMENTS[("ashlar", "reads-non-temporal")][0] + ("values.instant_micros",),
    _REQUIREMENTS[("ashlar", "reads-non-temporal")][1] + ("values.instant_micros",),
)


class AdoptionIncomplete(ValueError):
    code = "ADOPTION_INCOMPLETE"


def _require(condition: bool, reason: str) -> None:
    if not condition:
        raise AdoptionIncomplete(reason)


def _object(value: object, label: str) -> Mapping[str, object]:
    _require(isinstance(value, Mapping) and all(type(k) is str for k in value), label)
    return value  # type: ignore[return-value]


def _no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        _require(key not in result, "duplicate receipt member: " + key)
        result[key] = value
    return result


def check_adoption_packet(
    packet: Mapping[str, object],
    *,
    expected_engine: str,
    expected_scope: str,
    expected_pins: Mapping[str, object],
    load_receipt: Callable[[str], bytes],
) -> None:
    """Refuse a qualified claim unless every required exact-pin receipt passes.

    ``nativePins`` must equal caller-selected pins (including Weft, binding and
    catalog revisions). Each conformanceEvidence entry names kind, case,
    receiptSha256. The digest-addressed JSON receipt repeats kind/case, status
    ``passed``, and exact ``pins``. A digest proves byte custody, not truth.
    """
    _require(
        packet.get("contract") == "umf.access-adoption/1", "unknown adoption contract"
    )
    engine, scope = packet.get("engine"), packet.get("scope")
    _require(
        engine == expected_engine and scope == expected_scope,
        "engine or qualification scope differs from caller selection",
    )
    _require(
        type(engine) is str and type(scope) is str and (engine, scope) in _REQUIREMENTS,
        "unknown engine or qualification scope",
    )
    _require(
        packet.get("outcome") in ("proposed", "refused", "qualified"), "unknown outcome"
    )
    for name in ("engineVersion", "adapterVersion", "runtimeAbi"):
        _require(
            type(packet.get(name)) is str and bool(packet[name]), "missing " + name
        )
    pins = _object(packet.get("nativePins"), "nativePins object required")
    _require(bool(expected_pins) and pins == expected_pins, "exact native pins differ")
    for name in (
        "engineVersion",
        "adapterVersion",
        "runtimeAbi",
        "weftVersion",
        "bindingVersion",
        "catalogRevision",
    ):
        _require(
            type(pins.get(name)) is str and bool(pins[name]),
            "missing exact pin: " + name,
        )
    for name in ("engineVersion", "adapterVersion", "runtimeAbi"):
        _require(
            packet[name] == pins[name], "packet metadata differs from pin: " + name
        )
    for name in ("catalogTargets", "authorityRefs"):
        values = packet.get(name)
        _require(
            type(values) is list
            and bool(values)
            and all(type(v) is str and v for v in values),
            "nonempty " + name + " required",
        )
        _require(len(set(values)) == len(values), "duplicate " + name)
    evidence = packet.get("conformanceEvidence")
    _require(type(evidence) is list, "evidence list required")
    seen = set()
    for raw in evidence:
        item = _object(raw, "evidence object required")
        kind, case, digest = (
            item.get("kind"),
            item.get("case"),
            item.get("receiptSha256"),
        )
        _require(
            kind in ("conformance", "engine") and type(case) is str and bool(case),
            "invalid evidence identity",
        )
        _require((kind, case) not in seen, "duplicate evidence identity")
        seen.add((kind, case))
        _require(
            type(digest) is str
            and len(digest) == 64
            and all(c in "0123456789abcdef" for c in digest),
            "invalid receipt digest",
        )
        try:
            body = load_receipt(digest)
            _require(
                type(body) is bytes and len(body) <= 1048576,
                "bounded receipt bytes required",
            )
            _require(
                hashlib.sha256(body).hexdigest() == digest, "receipt digest differs"
            )
            receipt = _object(
                json.loads(body, object_pairs_hook=_no_duplicates),
                "receipt object required",
            )
        except AdoptionIncomplete:
            raise
        except Exception as error:
            raise AdoptionIncomplete("receipt unavailable or malformed") from error
        _require(
            receipt.get("kind") == kind and receipt.get("case") == case,
            "receipt identity differs",
        )
        _require(receipt.get("pins") == expected_pins, "receipt pins differ")
        _require(receipt.get("status") == "passed", "receipt did not pass")
    if packet.get("outcome") == "qualified":
        _require(
            packet.get("temporalQualification") in ("held", "qualified"),
            "explicit temporal status required",
        )
        _require(
            scope != "complete" or packet.get("temporalQualification") == "qualified",
            "complete adapter qualification includes held temporal cases",
        )
        cases, witnesses = _REQUIREMENTS[(engine, scope)]
        required = {("conformance", c) for c in cases} | {
            ("engine", c) for c in witnesses
        }
        _require(
            required <= seen,
            "missing passing conformance or native witness: "
            + repr(sorted(required - seen)),
        )
