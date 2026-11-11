"""Structural and cryptographic checks for final generated manifests."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping

from umf_access_generated_executor._canonical import canonical_json
from umf_access_generated_executor._values import (
    GeneratedFiles,
    GeneratedManifest,
    TargetBinding,
    TrustedArtifactRef,
    _hash,
    normalized_path,
)

TOP_LEVEL = frozenset(
    {
        "version",
        "artifactId",
        "artifactDigest",
        "source",
        "generator",
        "executor",
        "target",
        "algebra",
        "programs",
        "inventory",
        "provenance",
    }
)
SOURCE = frozenset(
    {"documentId", "coreVersion", "sha256", "moduleIds", "bundleInputDigest"}
)
GENERATOR = frozenset(
    {
        "umfDistribution",
        "umfVersion",
        "umfSourceDigest",
        "weftDistribution",
        "weftVersion",
        "weftSourceDigest",
        "abi",
    }
)
EXECUTOR = frozenset({"abiMajor", "minMinor", "maxMinor", "packageId"})
TARGET = frozenset({"id", "profile", "version", "bindingDigest"})
PROVENANCE = frozenset({"receiptDigest", "issuer", "buildId"})


def _object(value: object, members: frozenset[str], name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or set(value) != members:
        raise ValueError(name + " has missing or unknown members")
    return value


def _string(value: object, name: str, maximum: int | None = None) -> str:
    if type(value) is not str or not value or (maximum and len(value) > maximum):
        raise ValueError(name + " must be a nonempty string")
    value.encode("utf-8", errors="strict")
    return value


def _digest(value: object, name: str) -> str:
    if type(value) is not str:
        raise ValueError(name + " must be SHA-256 hex")
    _hash(value, name)
    return value


def _integer(value: object, name: str) -> int:
    if type(value) is not int or value < 0:
        raise ValueError(name + " must be a nonnegative integer")
    return value


def validate_manifest_shape(value: object) -> Mapping[str, object]:
    manifest = _object(value, TOP_LEVEL, "manifest")
    if manifest["version"] != "weft.generated-execution/1":
        raise ValueError("manifest version is unsupported")
    _string(manifest["artifactId"], "artifact ID", 256)
    _digest(manifest["artifactDigest"], "artifact digest")

    source = _object(manifest["source"], SOURCE, "source")
    _string(source["documentId"], "source document ID")
    _string(source["coreVersion"], "core version")
    _digest(source["sha256"], "source digest")
    _digest(source["bundleInputDigest"], "bundle input digest")
    modules = source["moduleIds"]
    if (
        not isinstance(modules, (list, tuple))
        or not modules
        or any(type(module) is not str or not module for module in modules)
        or len(set(modules)) != len(modules)
    ):
        raise ValueError("source module IDs must be nonempty and unique")

    generator = _object(manifest["generator"], GENERATOR, "generator")
    for field in ("umfDistribution", "umfVersion", "weftDistribution", "weftVersion"):
        _string(generator[field], field)
    _digest(generator["umfSourceDigest"], "UMF generator source digest")
    _digest(generator["weftSourceDigest"], "Weft generator source digest")
    if generator["abi"] != "weft.generated-execution/1":
        raise ValueError("generator ABI is unsupported")

    executor = _object(manifest["executor"], EXECUTOR, "executor")
    if executor["abiMajor"] != 1 or type(executor["abiMajor"]) is not int:
        raise ValueError("executor ABI major is unsupported")
    minimum = _integer(executor["minMinor"], "minimum executor ABI minor")
    maximum = _integer(executor["maxMinor"], "maximum executor ABI minor")
    if minimum > maximum or not any(
        minimum <= minor <= maximum for minor in (0, 1, 2, 3, 4, 5, 6, 7, 8)
    ):
        raise ValueError("executor ABI interval is incompatible")
    if executor["packageId"] != "umf-access-generated-executor":
        raise ValueError("executor package identity is unsupported")

    target = _object(manifest["target"], TARGET, "target")
    for field in ("id", "profile", "version"):
        _string(target[field], "target " + field)
    _digest(target["bindingDigest"], "target binding digest")

    algebra = manifest["algebra"]
    algebra_profile: str | None
    if not isinstance(algebra, Mapping):
        raise TypeError("algebra must be an object")
    if len(algebra) == 0:
        algebra_path = None
        algebra_profile = None
    else:
        algebra = _object(algebra, frozenset({"profile", "algebraPath"}), "algebra")
        algebra_profile = _string(algebra["profile"], "read algebra profile")
        if (
            algebra_profile
            not in {
                "weft.generated-read-algebra/1",
                "weft.generated-read-algebra/2",
                "weft.generated-read-algebra/3",
                "weft.generated-read-algebra/4",
                "weft.generated-read-algebra/5",
                "weft.generated-read-algebra/6",
                "weft.generated-read-algebra/7",
                "weft.generated-read-algebra/8",
            }
            or algebra["algebraPath"] != "algebra/read.json"
        ):
            raise ValueError("generated read algebra profile is unsupported")
        algebra_path = "algebra/read.json"
    expected_interval = {
        None: (0, 0),
        "weft.generated-read-algebra/1": (1, 1),
        "weft.generated-read-algebra/2": (2, 2),
        "weft.generated-read-algebra/3": (3, 3),
        "weft.generated-read-algebra/4": (4, 4),
        "weft.generated-read-algebra/5": (5, 5),
        "weft.generated-read-algebra/6": (6, 6),
        "weft.generated-read-algebra/7": (7, 7),
        "weft.generated-read-algebra/8": (8, 8),
    }[algebra_profile]
    if (minimum, maximum) != expected_interval:
        raise ValueError("artifact executor ABI does not match its execution profile")
    programs = manifest["programs"]
    if not isinstance(programs, Mapping) or (not programs and algebra_path is None):
        raise ValueError("programs must be nonempty without a read algebra")
    for operation_id, program in programs.items():
        _string(operation_id, "program operation ID")
        descriptor = _object(
            program, frozenset({"kind", "programPath"}), "program descriptor"
        )
        if descriptor["kind"] != "query":
            raise ValueError("generated program kind is unsupported")
        path = _string(descriptor["programPath"], "generated program path")
        normalized_path(path)
        if re.fullmatch(r"programs/[A-Za-z0-9._-]+\.json", path) is None:
            raise ValueError("generated program path profile is unsupported")

    inventory = manifest["inventory"]
    if not isinstance(inventory, Mapping) or not inventory:
        raise ValueError("inventory must be a nonempty object")
    if len(inventory) > 4096:
        raise ValueError("artifact file-count limit exceeded")
    for path, digest in inventory.items():
        normalized_path(path)
        _digest(digest, "inventory digest")
    for descriptor in programs.values():
        assert isinstance(descriptor, Mapping)
        if descriptor["programPath"] not in inventory:
            raise ValueError("generated program path is not inventoried")
    if algebra_path is not None and algebra_path not in inventory:
        raise ValueError("generated read algebra is not inventoried")

    provenance = _object(manifest["provenance"], PROVENANCE, "provenance")
    _digest(provenance["receiptDigest"], "receipt digest")
    _string(provenance["issuer"], "receipt issuer")
    _string(provenance["buildId"], "receipt build ID")
    return manifest


def verify_digests_and_trust(
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    trusted: TrustedArtifactRef,
    target: TargetBinding,
) -> Mapping[str, object]:
    value = manifest.copied_value()
    data = validate_manifest_shape(value)
    final_preimage = dict(data)
    del final_preimage["artifactDigest"]
    artifact_digest = hashlib.sha256(canonical_json(final_preimage)).hexdigest()
    if artifact_digest != data["artifactDigest"]:
        raise ValueError("artifact digest mismatch")

    payload = dict(data)
    del payload["artifactDigest"]
    del payload["provenance"]
    payload_digest = hashlib.sha256(canonical_json(payload)).hexdigest()

    manifest_target = data["target"]
    assert isinstance(manifest_target, Mapping)
    target_tuple = (
        manifest_target["id"],
        manifest_target["profile"],
        manifest_target["version"],
        manifest_target["bindingDigest"],
    )
    if target_tuple != (
        target.id,
        target.profile,
        target.version,
        target.binding_digest,
    ):
        raise ValueError("target binding mismatch")

    source = data["source"]
    provenance = data["provenance"]
    inventory = data["inventory"]
    assert isinstance(source, Mapping) and isinstance(provenance, Mapping)
    assert isinstance(inventory, Mapping)
    manifest_inventory = tuple(
        sorted((path, digest) for path, digest in inventory.items())
    )
    if files.inventory != manifest_inventory:
        raise ValueError("generated file inventory mismatch")

    pinned = (
        data["artifactId"],
        data["artifactDigest"],
        provenance["receiptDigest"],
        payload_digest,
        source["sha256"],
        manifest_target["bindingDigest"],
        manifest_inventory,
        provenance["issuer"],
        provenance["buildId"],
    )
    trusted_facts = (
        trusted.artifact_id,
        trusted.artifact_digest,
        trusted.receipt_digest,
        trusted.payload_digest,
        trusted.source_digest,
        trusted.target_binding_digest,
        trusted.inventory,
        trusted.issuer,
        trusted.build_id,
    )
    if pinned != trusted_facts:
        raise ValueError("external trusted artifact reference mismatch")
    return data
