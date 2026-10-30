# SPDX-License-Identifier: MIT OR Apache-2.0
"""Additive synchronous Rust compilation API with explicit immutable resources."""
from __future__ import annotations

import json
import sys
from collections.abc import Callable
from typing import Any

from ._rust import (
    UmfCoreError,
    _checked_envelope,
    _from_wire,
    _raise_native,
    _rust_core,
    _wire,
)


class UmfCodegenError(ValueError):
    def __init__(self, failure: dict[str, Any]) -> None:
        super().__init__(failure["message"])
        self.code = failure["code"]
        for key in ("path", "pointer"):
            if key in failure:
                setattr(self, key, failure[key])


class CodegenEngine:
    """Compile using the shared Rust engine; artifact data cannot install code."""

    def __init__(self, resources: Any, *, profile: str = "cooperative", max_work: int | None = None,
                 meter: Callable[[int], None] | None = None, is_cancelled: Callable[[], bool] | None = None,
                 now: Callable[[], int] | None = None, deadline_ms: int | None = None) -> None:
        if profile not in ("cooperative", "hard-isolated"):
            raise ValueError("Unknown resource profile")
        if profile == "hard-isolated":
            raise UmfCoreError("RESOURCE_PROFILE_UNAVAILABLE", "HardIsolated resource profile is unavailable")
        for name, value in (("max_work", max_work), ("deadline_ms", deadline_ms)):
            if value is not None and (type(value) is not int or value < 0 or value > sys.maxsize):
                raise ValueError(f"{name} must be a non-negative machine integer")
        for name, callback in (("meter", meter), ("is_cancelled", is_cancelled), ("now", now)):
            if callback is not None and not callable(callback):
                raise TypeError(f"{name} must be callable")
        if deadline_ms is not None and now is None:
            raise ValueError("now is required with deadline_ms")
        work = _host_work(max_work, meter, is_cancelled, now, deadline_ms)
        if type(resources) is not dict:
            raise TypeError("Engine resources must be a plain dict")
        names = ("coreSchema", "referenceSchema", "packageSchema", "constraints", "domainPolicy", "tablesPackage", "actionsPackage", "bindingPackage", "stableBindingPackage")
        work(1)
        if any(type(name) is not str or name not in names + ("sagaPackage",) for name in resources):
            raise TypeError("Unknown explicit codegen resource")
        for name in names:
            if name not in resources:
                raise TypeError(f"Missing explicit codegen resource {name}")
        snapshot = {name: _from_wire(_wire(resources[name], max_depth=128, max_values=1_000_000, work=work), work) for name in names}
        if "sagaPackage" in resources:
            snapshot["sagaPackage"] = _from_wire(_wire(resources["sagaPackage"], max_depth=128, max_values=1_000_000, work=work), work)
        self._resources = _wire(snapshot, max_depth=256, max_values=sys.maxsize, work=work)
        self._resource_serialization_work = _serialization_bound(self._resources, work)
        self._controls = (profile, max_work, meter, is_cancelled, now, deadline_ms)
        self._has_controls = any(value is not None for value in self._controls[1:])

    def call(self, operation: str, request: Any) -> Any:
        """Return the complete compiler outcome, including semantic refusals."""
        if type(operation) is not str:
            raise TypeError("Codegen operation must be a string")
        profile, max_work, meter, is_cancelled, now, deadline_ms = self._controls
        work = _host_work(max_work, meter, is_cancelled, now, deadline_ms)
        envelope = _wire({"op": "codegen/" + operation}, max_depth=256, max_values=sys.maxsize, work=work)
        envelope["members"].extend([
            {"key": [ord(c) for c in "resources"], "value": self._resources},
            {"key": [ord(c) for c in "request"], "value": _wire(request, max_depth=256, max_values=sys.maxsize, work=work)},
        ])
        def native_control(amount):
            try:
                work(amount)
            except UmfCoreError as error:
                return error.code, str(error), error.path
            return None

        try:
            # The shared work closure spans host admission, Rust and host result copies.
            work(self._resource_serialization_work)
            work(_serialization_bound(envelope, work, skip=self._resources))
            serialized = json.dumps(envelope, separators=(",", ":"))
            response = (_rust_core.execute_codegen_wire(serialized, profile, None, None, None, None, None, native_control)
                        if self._has_controls else _rust_core.execute_codegen_wire(serialized, profile))
        except ValueError as error:
            _raise_native(error)
        work(len(response))
        wire = _checked_envelope(response)
        work(len(wire))
        return _from_wire(json.loads(wire), work)

    def _result(self, operation: str, request: Any) -> Any:
        response = self.call(operation, request)
        if not response["ok"]:
            raise UmfCodegenError(response["error"])
        return response["result"]

    def inspect_sagas(self, source: Any) -> Any:
        return self._result("inspectSagas", {"source": source})

    def declare_saga(self, source: Any, module: str, definition: Any) -> Any:
        return self._result("declareSaga", {"source": source, "module": module, "definition": definition})

    def edit_saga(self, source: Any, identity: Any, replacement: Any) -> Any:
        return self._result("editSaga", {"source": source, "identity": identity, "replacement": replacement})

    def assess_saga(self, source: Any, identity: Any, capabilities: Any) -> Any:
        return self._result("assessSaga", {"source": source, "identity": identity, "capabilities": capabilities})

    def generate_python_client(self, request: Any) -> Any:
        return self._result("generatePythonClient", request)

    def compile_table_deployment(self, request: Any) -> Any:
        return self._result("compileTableDeployment", request)

    def verify_table_deployment(self, bundle: Any) -> Any:
        return self._result("verifyTableDeployment", {"bundle": bundle})

    def compile_table_migration(self, request: Any) -> Any:
        return self._result("compileTableMigration", request)

    def verify_table_migration(self, plan: Any) -> Any:
        return self._result("verifyTableMigration", {"plan": plan})

    def discover_table_migration_changes(self, previous: Any, next: Any) -> Any:
        return self._result("discoverTableMigrationChanges", {"previous": previous, "next": next})["changes"]

    def normalize_row_scope(self, input: Any, context: Any) -> Any:
        return self._result("normalizeRowScope", {"input": input, "context": context})

    def generate_access_package(self, request: Any, profile: Any) -> Any:
        return self._result("generateAccessPackage", {"request": request, "profile": profile})

    def diff_access_packages(self, before: Any, after: Any) -> Any:
        return self._result("diffAccessPackages", {"before": before, "after": after})


def _host_work(max_work, meter, is_cancelled, now, deadline_ms):
    charged = 0

    def work(amount):
        nonlocal charged
        charged += amount
        if max_work is not None and charged > max_work:
            raise UmfCoreError("RESOURCE_LIMIT", "Host work budget exceeded")
        if amount > 0 and meter is not None:
            try:
                meter(amount)
            except Exception as error:
                raise UmfCoreError("METER_FAILURE", str(error)) from error
        if is_cancelled is not None:
            try:
                cancelled = is_cancelled()
                if type(cancelled) is not bool:
                    raise TypeError("is_cancelled must return bool")
            except Exception as error:
                raise UmfCoreError("CANCELLATION_CAPABILITY", str(error)) from error
            if cancelled:
                raise UmfCoreError("CANCELLED", "Operation cancelled by host")
        if deadline_ms is not None:
            try:
                time = now()
                if type(time) is not int or time < 0 or time > 2**64 - 1:
                    raise TypeError("now must return an unsigned 64-bit millisecond integer")
            except Exception as error:
                raise UmfCoreError("CLOCK_CAPABILITY", str(error)) from error
            if time > deadline_ms:
                raise UmfCoreError("DEADLINE", "Deadline elapsed")

    return work


def _serialization_bound(value, work, *, skip=None):
    """Bound compact ensure_ascii JSON growth before its serializer allocates.

    Only binding-created wire containers reach this helper. Cached resources
    keep their construction-time bound; each invocation still charges that
    bound before serializing them again.
    """
    pending = [value]
    bound = 0
    while pending:
        item = pending.pop()
        work(1)
        if skip is not None and item is skip:
            continue
        if type(item) is dict:
            work(len(item) * 2)
            bound += 2 + len(item) * 2
            for key, child in item.items():
                work(len(key))
                bound += 2 + 6 * len(key)
                pending.append(child)
        elif type(item) is list:
            work(len(item))
            bound += 2 + len(item)
            pending.extend(item)
        elif type(item) is str:
            work(len(item))
            bound += 2 + 6 * len(item)
        else:
            # Wire numbers are u16 units or finite IEEE carriers; this upper
            # bound also covers JSON booleans and null.
            bound += 32
    return bound
