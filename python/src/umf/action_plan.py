# SPDX-License-Identifier: MIT OR Apache-2.0
"""Rust-owned portable Action Plan preparation and assessment transport.

This module exposes only the current first-set-action surface. Consumer
registries and selection interpreters remain explicit caller capabilities.
"""
from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls
from .registry import Registry
from .validation import validate_document

PROFILE = "umf.actions-plan-wire/1"


class ActionPlanSession:
    """A per-instance Rust continuation session for Action Plan operations."""

    def __init__(self, *, max_work=None, meter=None, is_cancelled=None,
                 now=None, deadline_ms=None):
        self._session = _rust._rust_core.ActionPlanSession()
        if self._session.profile_version() != PROFILE:
            raise RuntimeError("Action Plan session profile mismatch")
        self._charge, self._host_work = _controls(
            max_work, meter, is_cancelled, now, deadline_ms)
        self._controls_enabled = any(value is not None for value in
            (max_work, meter, is_cancelled, now, deadline_ms))

    def execute(self, operation: str, /, **fields: Any) -> Any:
        if type(operation) is not str or operation not in {
            "actions.prepareModel", "actions.prepareInspect", "actions.prepareAssess",
            "actions.completeRegistry", "actions.completeSelection", "actions.cancel",
        }:
            raise ValueError("Unknown Action Plan operation")
        if "profile" in fields or "op" in fields:
            raise TypeError("profile and op are selected by the session")
        self._host_work(1)
        request = {"profile": PROFILE, "op": operation, **fields}
        wire = json.dumps(_rust._wire(request, work=self._host_work),
                          ensure_ascii=True, separators=(",", ":"))
        response = (self._session.execute(wire, self._charge)
                    if self._controls_enabled else self._session.execute(wire))
        self._host_work(len(response))
        result = _rust._checked_envelope(response)
        self._host_work(len(result))
        return _rust._from_wire(json.loads(result), self._host_work)


def _registry_response(document, registry: Registry):
    # Every registered callback is a caller capability. Rust adds standard
    # Action meaning independently; custom constraints on the Action package
    # still run here like every other registered semantic validator.
    validation_registry = Registry()
    from dataclasses import replace
    for extension, manifest, kinds in registry.registrations():
        if manifest is not None:
            validation_registry.register_package(manifest, extension.semantics, kinds=kinds)
        else:
            validation_registry.register(replace(extension))
    validation = validate_document(document, validation_registry)
    action_registration = registry.get("umf.actions", "0.1.0")
    ddd_registration = registry.get("umf.ddd", "0.1.0")
    return {
        "source": document,
        "diagnostics": [d.__dict__ for d in validation.diagnostics],
        "actionSemantics": bool(action_registration and action_registration[0].semantics),
        "dddSemantics": bool(ddd_registration and ddd_registration[0].semantics),
    }


def _stage(session, operation, fields, registry, selection=None):
    stage = session.execute(operation, **fields)
    token = stage.get("token")
    try:
        if stage.get("stage") == "registry":
            response = _registry_response(stage["document"], registry)
            stage = session.execute("actions.completeRegistry", token=token,
                                    response=response)
        if stage.get("stage") == "selection":
            if selection is None:
                response = {"eligible": False, "dependencies": [],
                            "diagnostics": [{"code": "PAP_PROFILE",
                                             "path": "/selection/profile",
                                             "message": "Selection interpreter is required"}]}
            else:
                response = selection(stage["profile"], stage["artifact"],
                                     stage["model"], stage["target"])
            stage = session.execute("actions.completeSelection", token=token,
                                    response=response)
        return stage
    except BaseException:
        if token is not None:
            try:
                session.execute("actions.cancel", token=token)
            except BaseException:
                pass
        raise


def prepare_action_plan_model(session: ActionPlanSession, model_pin, action_pin,
                              models, actions, registry: Registry):
    return _stage(session, "actions.prepareModel", {
        "modelPin": model_pin, "actionPin": action_pin,
        "models": models, "actions": actions,
    }, registry)


def inspect_action_plan(session: ActionPlanSession, artifact, models, actions,
                        selections, registry: Registry):
    def select(profile, selected_artifact, model, target):
        matches = [item for item in selections
                   if item["profile"] == profile]
        if len(matches) != 1 or not callable(matches[0].get("inspect")):
            return {"eligible": False, "dependencies": [],
                    "diagnostics": [{"code": "PAP_PROFILE",
                                     "path": "/selection/profile",
                                     "message": "One exact installed selection interpreter required"}]}
        return matches[0]["inspect"](selected_artifact, model, target)
    return _stage(session, "actions.prepareInspect", {
        "artifact": artifact, "models": models, "actions": actions,
        "selections": [{"profile": item["profile"]} for item in selections],
    }, registry, select)


def assess_action_plan(session: ActionPlanSession, inspection, capabilities,
                       models, actions, selections, registry: Registry):
    def select(profile, selected_artifact, model, target):
        matches = [item for item in selections if item["profile"] == profile]
        if len(matches) != 1 or not callable(matches[0].get("inspect")):
            return {"eligible": False, "dependencies": [],
                    "diagnostics": [{"code": "PAP_PROFILE",
                                     "path": "/selection/profile",
                                     "message": "One exact installed selection interpreter required"}]}
        return matches[0]["inspect"](selected_artifact, model, target)
    return _stage(session, "actions.prepareAssess", {
        "inspection": inspection, "capabilities": capabilities,
        "models": models, "actions": actions,
        "selections": [{"profile": item["profile"]} for item in selections],
    }, registry, select)
