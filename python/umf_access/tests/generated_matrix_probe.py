# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed-wheel probe of actual generated golden models; never emits models."""

import hashlib
import importlib
import importlib.metadata
import json
import sys
import zipfile
from decimal import Decimal
from pathlib import Path


def primitive(value):
    if value is None:
        return None
    kind, inner = next(iter(value.items()))
    if kind == "integerToken":
        return int(inner)
    if kind == "decimalToken":
        return Decimal(inner)
    if kind == "binaryHex":
        try:
            return bytes.fromhex(inner)
        except ValueError:
            # Malformed hex has no bytes carrier; retain it as a wrong carrier
            # rather than repairing or dropping the invalid input.
            return inner
    if kind == "array":
        return [primitive(item) for item in inner]
    if kind == "map":
        return {key: primitive(item) for key, item in inner.items()}
    return inner


def exact(left, right):
    if isinstance(left, Decimal):
        assert isinstance(right, Decimal) and left.as_tuple() == right.as_tuple()
    elif isinstance(left, list):
        assert isinstance(right, list) and len(left) == len(right)
        for x, y in zip(left, right, strict=True):
            exact(x, y)
    elif isinstance(left, dict):
        assert isinstance(right, dict) and left.keys() == right.keys()
        for key in left:
            exact(left[key], right[key])
    else:
        assert type(left) is type(right) and left == right


def refuses(call):
    try:
        call()
    except (ValueError, TypeError):
        return
    raise AssertionError("invalid generated model/codec accepted")


def main():
    generated, wheel, vectors_file = map(Path, sys.argv[1:])
    import umf_access
    from pydantic import MISSING

    assert sys.version_info[:2] in {(3, 11), (3, 14)}
    assert importlib.metadata.version("pydantic") == "2.14.1"
    site = Path(umf_access.__file__).parent.parent
    checked = []
    with zipfile.ZipFile(wheel) as archive:
        for name in archive.namelist():
            if name.startswith("umf_access/") and not name.endswith("/"):
                assert (site / name).read_bytes() == archive.read(name), name
                checked.append(name)
    sys.path.insert(0, str(generated))
    models = importlib.import_module("golden_matrix.models")
    codecs = importlib.import_module("golden_matrix.codecs")
    observations = []
    for vector in json.loads(vectors_file.read_text()):
        model = getattr(models, vector["record"] + "Create")
        encode = getattr(codecs, "encode_" + vector["record"] + "_create")
        decode = getattr(codecs, "decode_" + vector["record"])
        value = primitive(vector["literal"])
        data = {vector["key"]: "identity", vector["field"]: value}
        if vector["expected"]:
            result = encode(model(**data))
            exact(result[vector["field"]], value)
            row = decode(list(result), list(result.values()))
            exact(getattr(row, vector["field"]), value)
        else:
            refuses(lambda model=model, data=data: model(**data))
            refuses(
                lambda encode=encode, model=model, data=data: encode(
                    model.model_construct(**data)
                )
            )
            refuses(
                lambda decode=decode, data=data: decode(list(data), list(data.values()))
            )
        observations.append(
            {
                "id": vector["id"],
                "expected": vector["expected"],
                "modelCodecAgreement": True,
                "carrierAdaptation": "malformed binaryHex has no bytes carrier; original token tested as rejected string carrier"
                if isinstance(vector["literal"], dict)
                and "binaryHex" in vector["literal"]
                and type(value) is str
                else "literal converted without repair",
            }
        )
    model = models.ContainerEvidenceCreate
    encode = codecs.encode_ContainerEvidence_create
    base = {
        "evidence_id": "evidence",
        "nullable_array": [None, "present"],
        "nullable_map": {"present": None},
    }
    value = model(**base)
    assert value.defaulted is MISSING
    result = encode(value)
    assert (
        result
        == {
            "evidenceId": base["evidence_id"],
            "nullableArray": base["nullable_array"],
            "nullableMap": base["nullable_map"],
        }
        and "defaulted" not in result
    )
    assert "absent" not in result["nullableMap"]
    refuses(lambda: model(**(base | {"nullable_array": [MISSING]})))
    refuses(lambda: model(**(base | {"nullable_map": {"present": MISSING}})))
    value.nullable_array.append(MISSING)
    refuses(lambda: encode(value))
    assert len(observations) == 69
    print(
        json.dumps(
            {
                "vectors": observations,
                "presenceControls": [
                    "nullable-array-item",
                    "nullable-map-value",
                    "missing-array-refusal",
                    "missing-map-refusal",
                    "absent-map-key",
                    "authored-default-not-executed",
                    "nested-mutation-revalidated",
                ],
                "installedPayloadCount": len(checked),
                "wheelSha256": hashlib.sha256(wheel.read_bytes()).hexdigest(),
                "python": sys.version.split()[0],
                "runtime": umf_access.__file__,
            }
        )
    )


if __name__ == "__main__":
    main()
