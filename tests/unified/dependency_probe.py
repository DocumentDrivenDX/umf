# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed-wheel and actual emitter compatibility proof for a pinned Pydantic."""
from decimal import Decimal
from importlib import metadata
import json
from pathlib import Path
import sys
import unittest
import zipfile

work, expected, wheel, tests = sys.argv[1:]
assert metadata.version("pydantic") == expected
import umf_access
site = Path(umf_access.__file__).parent.parent
with zipfile.ZipFile(wheel) as archive:
    for name in archive.namelist():
        if name.startswith("umf_access/") and not name.endswith("/"):
            assert (site / name).read_bytes() == archive.read(name), name
requirements = metadata.requires("umf_access")
assert any("pydantic" in item and ">=2.13" in item and "<3" in item for item in requirements)
sys.path.insert(0, work)
from compat_shop import OrderCreate, OrderPatch, OrderKey
from compat_shop.codecs import encode_Order_create, encode_Order_patch, decode_OrderSummary
from umf_access.types import MISSING

created = OrderCreate(order_id="o-1", amount=Decimal("1.200"))
assert created.amount.as_tuple() == Decimal("1.200").as_tuple()
encoded = encode_Order_create(created)
assert encoded["amount"].as_tuple() == created.amount.as_tuple()
assert "revision" not in encoded and "memo" not in encoded
assert OrderPatch().memo is MISSING
assert encode_Order_patch(OrderPatch()) == {}
assert encode_Order_patch(OrderPatch(memo=None)) == {"memo": None}
assert encode_Order_patch(OrderPatch(amount=Decimal("1.20")))["amount"].as_tuple() == Decimal("1.20").as_tuple()
summary = decode_OrderSummary(["amount", "orderId"], [Decimal("1.200"), "o-1"])
assert summary.amount.as_tuple() == Decimal("1.200").as_tuple()

refusals = []
def rejects(label, call):
    try:
        call()
    except (TypeError, ValueError) as error:
        assert "private-invalid-value" not in str(error)
        refusals.append(label)
    else:
        raise AssertionError("accepted " + label)

for label, kwargs in [
    ("string-coercion", {"amount": "private-invalid-value"}),
    ("float-coercion", {"amount": 1.2}),
    ("rounding", {"amount": Decimal("1.234")}),
    ("nonfinite", {"amount": Decimal("NaN")}),
    ("null-required", {"amount": None}),
    ("generated-write", {"revision": 1}),
    ("key-write", {"order_id": "changed"}),
    ("unknown-field", {"unknown": 1}),
]:
    rejects(label, lambda kwargs=kwargs: OrderPatch(**kwargs))
rejects("model-construct-bypass", lambda: encode_Order_patch(OrderPatch.model_construct(amount="private-invalid-value")))
rejects("model-copy-bypass", lambda: encode_Order_patch(OrderPatch().model_copy(update={"amount": Decimal("1.234")})))
rejects("sealed-subclass", lambda: type("Bypass", (OrderPatch,), {}))
rejects("frozen-assignment", lambda: setattr(created, "amount", Decimal("2.00")))
rejects("unhashable-key", lambda: hash(OrderKey(order_id="o-1")))
rejects("decode-invalid", lambda: decode_OrderSummary(["orderId", "amount"], ["o-1", "private-invalid-value"]))
sys.path.insert(0, tests)
suite = unittest.defaultTestLoader.loadTestsFromNames([
    "test_values_red", "test_dsl_runtime", "test_capture",
    "test_codec_support_red", "test_unified_binding_identity"])
result = unittest.TextTestRunner(stream=sys.stderr).run(suite)
assert result.wasSuccessful()
print(json.dumps({"runtimeTests": result.testsRun, "pydantic": expected, "pydanticCore": metadata.version("pydantic-core"),
                  "runtime": metadata.version("umf_access"), "installedPayloadVerified": True,
                  "exactDecimal": True, "absenceAndNull": True, "refusals": refusals}))
