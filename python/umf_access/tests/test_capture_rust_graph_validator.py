# SPDX-License-Identifier: MIT OR Apache-2.0
"""The private graph-validator seam is opt-in and translates closed replies."""

import json
from copy import deepcopy
from datetime import datetime
from typing import ClassVar
from unittest.mock import patch

import pytest
from pydantic import BaseModel
from umf import _rust
from umf_access import rust_catalog_render
from umf_access.capture import CaptureError, _validate_node, capture
from umf_access.dsl import (
    Column,
    FieldRef,
    KeywordIndex,
    ManyNavigation,
    Param,
    Query,
    RecordRef,
    RequiredJoin,
    SearchLeg,
    Terminal,
    VectorIndex,
    avg_,
    command,
    hybrid,
    if_present,
    query,
    rrf,
    sum_,
)
from umf_access.dsl._nodes import GeneratedSource, Node
from umf_access.dsl._expressions import operand
from umf_access.dsl.navigation import RequiredNavigation
from umf_access.rust_catalog_render import (
    _encode_capture,
    _EncodingBudget,
    _validate_graph_variant,
)
from umf_access.types import MISSING, ActionRef, ActionSource, StrictModel, Vector

_ID = FieldRef(module="demo", element="Thing", field="id")
_QUERY = Query(RecordRef(module="demo", element="Thing", key=(_ID,)))


_GRAPH_SOURCE = GeneratedSource(
    "graph-validator-test", "0.10.0", "a" * 64, "b" * 64, "umf-access-runtime/0.1"
)


class ThingKey(BaseModel):
    id: int
    KEY_IDENTITY: ClassVar[dict[str, str]] = {
        "documentId": "graph-validator-test",
        "coreVersion": "0.10.0",
        "module": "demo",
        "element": "Thing",
        "key": "thing_id",
    }
    UMF_SOURCE: ClassVar[GeneratedSource] = _GRAPH_SOURCE


class OtherThingKey(BaseModel):
    id: int
    KEY_IDENTITY: ClassVar[dict[str, str]] = {
        **ThingKey.KEY_IDENTITY,
        "key": "other_id",
    }
    UMF_SOURCE: ClassVar[GeneratedSource] = _GRAPH_SOURCE


def test_private_opt_in_capture_accepts_closed_rust_response():
    @query
    def declaration():
        return _QUERY.limit(1).all()

    response = {
        "profile": "umf-access-captured-graph-validation/0.1.0",
        "outcome": "accepted",
    }
    with patch.object(
        _rust._rust_core,
        "access_validate_captured_graph_variant",
        return_value=response,
        create=True,
    ) as validate, patch.object(
            _rust._rust_core,
            "access_orchestrate_capture_pair",
            side_effect=(
                {"profile": "umf-access-capture-orchestration/0.1.0", "outcome": "scheduled", "presences": [[]]},
                {"profile": "umf-access-capture-orchestration/0.1.0", "outcome": "accepted", "presences": []},
            ),
            create=True,
    ) as orchestrate:
        captured = rust_catalog_render.capture_with_rust_graph_validator(declaration)
    assert len(captured.variants) == 1
    assert validate.call_count == 4
    assert orchestrate.call_count == 2


def test_private_opt_in_capture_maps_rust_signature_refusal():
    @query
    def declaration():
        return _QUERY.limit(1).all()

    response = {
        "profile": "umf-access-captured-graph-validation/0.1.0",
        "outcome": "refused",
        "kind": "capture-error",
        "code": "CAPTURE_SIGNATURE",
        "rule": "expression references an undeclared parameter",
    }
    with patch.object(
        _rust._rust_core,
        "access_validate_captured_graph_variant",
        return_value=response,
        create=True,
    ), pytest.raises(CaptureError) as caught:
        rust_catalog_render.capture_with_rust_graph_validator(declaration)
    assert caught.value.code == "CAPTURE_SIGNATURE"
    assert (
        str(caught.value)
        == "CAPTURE_SIGNATURE: expression references an undeclared parameter"
    )


def test_live_rust_validator_matches_get_page_selected_key_preflight_order():
    identifier = FieldRef("demo", "Thing", "id", source=_GRAPH_SOURCE)
    foreign_field = FieldRef("foreign", "Elsewhere", "value")
    owner = RecordRef(
        "demo", "Thing", (identifier,), source=_GRAPH_SOURCE, key_id="thing_id"
    )

    @query
    def get_valid(key: Param[ThingKey]):
        return Query(owner).get(key)

    @query
    def page_valid(key: Param[ThingKey | None]):
        return Query(owner).page(size=10, after=key)

    for declaration in (get_valid, page_valid):
        assert rust_catalog_render.capture_with_rust_graph_validator(
            declaration
        ) == capture(declaration)

    wrong_selected_identity = tuple(
        sorted({**ThingKey.KEY_IDENTITY, "key": "other_id"}.items())
    )
    foreign_identity = tuple(
        sorted({**ThingKey.KEY_IDENTITY, "element": "Elsewhere"}.items())
    )

    def crossed(variant, op: str, key_node: Node):
        args = variant.node.args
        steps = args[1] + (
            Node(
                "filter",
                (
                    Node(
                        "=",
                        (Node("column", (foreign_field,)), Node("literal", ("x",))),
                    ),
                ),
            ),
        )
        if op == "get":
            node_args = (args[0], steps, key_node)
        else:
            node_args = (
                args[0],
                steps,
                args[2],
                key_node,
            )
        return Node(op, node_args)

    for declaration, op in ((get_valid, "get"), (page_valid, "page")):
        variant = capture(declaration).variants[0]
        params = variant.parameters
        for key_node, code, message in (
            (
                Node("key_param", ("key", ("id",), wrong_selected_identity)),
                "CAPTURE_SIGNATURE",
                "Key differs from selected Record Key",
            ),
            (
                Node("key_param", ("key", ("id",), foreign_identity)),
                "CAPTURE_SIGNATURE",
                "Key belongs to another Record",
            ),
            (
                operand(OtherThingKey(id=7)),
                "CAPTURE_SIGNATURE",
                "Key differs from selected Record Key",
            ),
        ):
            node = crossed(variant, op, key_node)
            dto = _encode_capture(
                type(variant)(variant.presence, node, params), _EncodingBudget()
            )
            failures = []
            for validate in (
                lambda: _validate_node(node, params),
                lambda: _validate_graph_variant(dto),
            ):
                with pytest.raises(CaptureError) as caught:
                    validate()
                failures.append((caught.value.code, str(caught.value)))
            assert failures[0] == failures[1] == (code, f"{code}: {message}")


def test_live_rust_validator_matches_python_capture_for_join_and_many_navigation():
    source = GeneratedSource(
        "graph-validator-test", "0.10.0", "a" * 64, "b" * 64, "umf-access-runtime/0.1"
    )

    def record(name: str, key_name: str) -> RecordRef:
        field = FieldRef("demo", name, key_name, source=source)
        return RecordRef("demo", name, (field,), source=source, key_id=key_name)

    owner = record("Owner", "owner_id")
    target = record("Target", "target_id")
    ref = FieldRef("demo", "Owner", "target_id", source=source)
    inverse_key = record("Owner", "inverse_owner_id")

    join = RequiredNavigation(
        ref,
        target,
        source_query=owner,
        target_query=target,
        inverse_key_target=inverse_key,
    )
    many = ManyNavigation(
        ref,
        key_target=target,
        source_query=owner,
        target_query=target,
        inverse_key_target=inverse_key,
    )

    def declaration_for(selected, relationship, inverse):
        @query
        def declaration():
            navigation = relationship.inverse() if inverse else relationship
            return Query(selected).related(navigation).limit(1).all()

        return declaration

    for selected, relationship in (
        (owner, join),
        (target, join),
        (owner, many),
        (target, many),
    ):
        inverse = selected == target

        declaration = declaration_for(selected, relationship, inverse)

        assert rust_catalog_render.capture_with_rust_graph_validator(
            declaration
        ) == capture(declaration)


def test_live_rust_validator_matches_two_hop_aliased_join_owner_order():
    root = RecordRef("demo", "Owner", (FieldRef("demo", "Owner", "id"),))
    middle_alias = "demo:test:middle"
    middle = RecordRef(
        "demo",
        "Middle",
        (FieldRef("demo", "Middle", "id", alias=middle_alias),),
        alias=middle_alias,
    )
    leaf = RecordRef("demo", "Leaf", (FieldRef("demo", "Leaf", "id"),))
    first = RequiredJoin(
        FieldRef("demo", "Owner", "middle_id"), middle, key_target=middle
    )
    second = RequiredJoin(
        FieldRef("demo", "Middle", "leaf_id", alias=middle_alias), leaf
    )
    leaf_field = FieldRef("demo", "Leaf", "name")

    @query
    def two_hop(status: Param[str]):
        return Terminal(
            Node(
                "all",
                (
                    root,
                    (
                        Node("join", (first,)),
                        Node("join", (second,)),
                        Node(
                            "filter",
                            (
                                Node(
                                    "=",
                                    (Node("column", (leaf_field,)), Node("param", ("status",))),
                                ),
                            ),
                        ),
                        Node("limit", (1,)),
                    ),
                ),
            )
        )

    assert rust_catalog_render.capture_with_rust_graph_validator(two_hop) == capture(
        two_hop
    )

    absent_source = RequiredJoin(
        FieldRef("demo", "Middle", "leaf_id"), leaf
    )

    @query
    def crossed_fault(status: Param[str]):
        return Terminal(
            Node(
                "all",
                (
                    root,
                    (
                        Node("join", (first,)),
                        Node("join", (absent_source,)),
                        Node(
                            "filter",
                            (
                                Node(
                                    "=",
                                    (
                                        Node("column", (FieldRef("other", "Foreign", "x"),)),
                                        Node("param", ("status",)),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            )
        )

    errors = []
    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(crossed_fault)
        errors.append((caught.value.code, str(caught.value)))
    assert errors[0] == errors[1] == (
        "CAPTURE_UNSUPPORTED",
        "CAPTURE_UNSUPPORTED: join source is absent",
    )


def test_live_rust_validator_matches_python_search_leg_capture_and_refusals():
    source = GeneratedSource(
        "search-graph-test", "0.10.0", "c" * 64, "d" * 64, "umf-access-runtime/0.1"
    )

    def record(name: str) -> RecordRef:
        field = FieldRef("demo", name, "id", source=source)
        return RecordRef("demo", name, (field,), source=source, key_id="id")

    owner = record("Owner")
    foreign = record("Other")
    keyword_index = KeywordIndex(owner, '{"kind":"keyword"}')
    vector_index = VectorIndex(owner, '{"kind":"vector"}')

    @query
    def accepted(text: Param[str]):
        return Query(owner).search(keyword_index.matches(text)).top(5)

    assert rust_catalog_render.capture_with_rust_graph_validator(accepted) == capture(
        accepted
    )
    accepted_variant = capture(accepted).variants[0]
    accepted_dto = _encode_capture(accepted_variant, _EncodingBudget())

    @query
    def accepted_vector(vector: Param[Vector]):
        return Query(owner).search(vector_index.near_vector(vector)).top(5)

    assert rust_catalog_render.capture_with_rust_graph_validator(
        accepted_vector
    ) == capture(accepted_vector)
    vector_dto = _encode_capture(
        capture(accepted_vector).variants[0], _EncodingBudget()
    )
    vector_carrier = vector_dto["fields"]["parameters"]["$tuple"][0]["fields"][
        "carrier"
    ]
    assert vector_carrier == {
        "$typing": "builtins.tuple",
        "args": [{"$typeRef": "builtins.float"}, {"$ellipsis": True}],
    }

    @query
    def accepted_nested(text: Param[str]):
        leg = hybrid(
            keyword_index.matches(text),
            vector_index.near(text),
            fusion=rrf(),
        )
        return Query(owner).search(leg).top(5)

    assert rust_catalog_render.capture_with_rust_graph_validator(
        accepted_nested
    ) == capture(accepted_nested)

    @query
    def foreign_precedes_unbound():
        leg = SearchLeg(foreign, "keyword", None, Node("literal", ("x",)))
        return Terminal(Node("search_top", (owner, (), leg, 5, False)))

    @query
    def unbound():
        leg = SearchLeg(owner, "keyword", None, Node("literal", ("x",)))
        return Terminal(Node("search_top", (owner, (), leg, 5, False)))

    @query
    def carrier_mismatch(text: Param[str]):
        return Query(owner).search(vector_index.near_vector(text)).top(5)

    python_errors = []
    for declaration, code, message in (
        (foreign_precedes_unbound, "SEARCH_DECLARATION", "foreign search Record"),
        (unbound, "SEARCH_DECLARATION", "search requires bound parameters"),
        (
            carrier_mismatch,
            "CAPTURE_SIGNATURE",
            "search parameter carrier differs from selected leg",
        ),
    ):
        with pytest.raises(CaptureError) as python_error:
            capture(declaration)
        python_errors.append(python_error.value)

    # Exercise the Rust seam directly with minimally mutated captured DTOs;
    # the orchestration helper correctly runs Python capture first.
    mutations = []
    for change in ("foreign", "unbound", "vector-carrier"):
        dto = deepcopy(accepted_dto)
        node_args = dto["fields"]["node"]["fields"]["args"]["$tuple"]
        leg_fields = node_args[2]["fields"]
        if change == "foreign":

            @query
            def foreign_owner_valid(text: Param[str]):
                return (
                    Query(foreign)
                    .search(KeywordIndex(foreign, '{"kind":"keyword"}').matches(text))
                    .top(5)
                )

            foreign_dto = _encode_capture(
                capture(foreign_owner_valid).variants[0], _EncodingBudget()
            )
            leg_fields["record"] = foreign_dto["fields"]["node"]["fields"]["args"][
                "$tuple"
            ][2]["fields"]["record"]
        elif change == "unbound":
            leg_fields["value"]["fields"]["op"] = "literal"
        else:
            leg_fields["kind"] = "vector"
        mutations.append(dto)

    for dto, python_error, code, message in zip(
        mutations,
        python_errors,
        ("SEARCH_DECLARATION", "SEARCH_DECLARATION", "CAPTURE_SIGNATURE"),
        (
            "foreign search Record",
            "search requires bound parameters",
            "search parameter carrier differs from selected leg",
        ),
    ):
        with pytest.raises(CaptureError) as rust_error:
            _validate_graph_variant(dto)
        assert (rust_error.value.code, str(rust_error.value)) == (
            python_error.code,
            str(python_error),
        )
        assert rust_error.value.code == code
        assert str(rust_error.value).endswith(message)


def test_live_rust_validator_matches_optional_filter_placement_refusal():
    source = GeneratedSource(
        "optional-filter-test", "0.10.0", "e" * 64, "f" * 64, "umf-access-runtime/0.1"
    )
    identifier = FieldRef("demo", "Owner", "id", source=source)
    status = Column(FieldRef("demo", "Owner", "status", source=source))
    owner = RecordRef("demo", "Owner", (identifier,), source=source, key_id="id")

    @query
    def accepted_optional(value: Param[str | MISSING]):
        return (
            Query(owner)
            .filter(if_present(value, lambda item: status == item))
            .limit(1)
            .all()
        )

    assert rust_catalog_render.capture_with_rust_graph_validator(
        accepted_optional
    ) == capture(accepted_optional)

    @query
    def nested_optional(value: Param[str | MISSING]):
        optional = if_present(value, lambda item: status == item)
        return Query(owner).filter(optional & (status == "fixed")).limit(1).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(nested_optional)
        assert caught.value.code == "CAPTURE_UNSUPPORTED"
        assert str(caught.value) == (
            "CAPTURE_UNSUPPORTED: optional filters must be top-level filter arguments"
        )


def test_live_rust_validator_matches_temporal_parameter_profile_refusal():
    instant = Column(FieldRef("demo", "Owner", "instant", temporal="instant"))
    local = Column(FieldRef("demo", "Owner", "local", temporal="local"))
    owner = RecordRef("demo", "Owner", (FieldRef("demo", "Owner", "id"),), key_id="id")

    @query
    def accepted(value: Param[datetime]):
        return Query(owner).filter(instant == value, instant == value).limit(1).all()

    assert rust_catalog_render.capture_with_rust_graph_validator(accepted) == capture(
        accepted
    )

    @query
    def incompatible(value: Param[datetime]):
        return Query(owner).filter(instant == value, local == value).limit(1).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(incompatible)
        assert caught.value.code == "CAPTURE_UNSUPPORTED"
        assert str(caught.value) == (
            "CAPTURE_UNSUPPORTED: parameter spans incompatible temporal profiles"
        )


def test_live_rust_validator_matches_aggregate_and_bucket_checks():
    source = GeneratedSource(
        "scalar-graph-test", "0.10.0", "9" * 64, "8" * 64, "umf-access-runtime/0.1"
    )
    owner = RecordRef(
        "demo",
        "Owner",
        (FieldRef("demo", "Owner", "id", source=source),),
        source=source,
    )
    amount = Column(FieldRef("demo", "Owner", "amount", source=source))
    instant = Column(
        FieldRef("demo", "Owner", "instant", temporal="instant", source=source)
    )

    @query
    def accepted_scalars():
        return (
            Query(owner)
            .select(sum_(amount), avg_(amount, scale=2), amount.bucket_width(10))
            .limit(1)
            .all()
        )

    assert rust_catalog_render.capture_with_rust_graph_validator(
        accepted_scalars
    ) == capture(accepted_scalars)

    def manual_scalar(expression: Node):
        @query
        def declaration():
            return Terminal(
                Node(
                    "all",
                    (owner, (Node("select", (expression,)), Node("limit", (1,)))),
                )
            )

        return declaration

    cases = (
        (
            Node("aggregate", ("unknown", amount.ref)),
            "CAPTURE_UNSUPPORTED: unknown scalar expression",
        ),
        (
            Node("aggregate", ("unknown", instant.ref, None)),
            "CAPTURE_UNSUPPORTED: unknown aggregate operation",
        ),
        (
            Node("aggregate", ("avg", instant.ref, 1001)),
            "CAPTURE_UNSUPPORTED: temporal aggregate qualification is held",
        ),
        (
            Node("aggregate", ("avg", amount.ref, 1001)),
            "CAPTURE_UNSUPPORTED: average requires bounded literal scale",
        ),
        (
            Node("bucket_width", (None, 1)),
            "CAPTURE_UNSUPPORTED: unknown scalar expression",
        ),
    )
    for expression, expected_message in cases:
        declaration = manual_scalar(expression)
        errors = []
        for capture_fn in (
            capture,
            rust_catalog_render.capture_with_rust_graph_validator,
        ):
            with pytest.raises(CaptureError) as caught:
                capture_fn(declaration)
            errors.append((caught.value.code, str(caught.value)))
        assert errors[0] == errors[1]
        assert errors[0] == ("CAPTURE_UNSUPPORTED", expected_message)


def test_live_rust_validator_matches_read_terminal_shapes_and_precedence():
    source = GeneratedSource(
        "read-terminal-test", "0.10.0", "7" * 64, "6" * 64, "umf-access-runtime/0.1"
    )
    owner = RecordRef(
        "demo",
        "Owner",
        (FieldRef("demo", "Owner", "id", source=source),),
        source=source,
    )
    category = Column(FieldRef("demo", "Owner", "category", source=source))

    @query
    def first():
        return Query(owner).first()

    @query
    def one():
        return Query(owner).one()

    @query
    def count():
        return Query(owner).count()

    @query
    def exists():
        return Query(owner).exists()

    @query
    def group_count():
        return Query(owner).group_by(category).limit(5).count()

    for declaration in (first, one, count, exists, group_count):
        assert rust_catalog_render.capture_with_rust_graph_validator(
            declaration
        ) == capture(declaration)

    @query
    def scalar_count_precedence():
        # The scalar-terminal restriction runs before aggregate validation.
        return Terminal(
            Node(
                "count",
                (
                    owner,
                    (
                        Node(
                            "select",
                            (Node("aggregate", ("unknown", category.ref, None)),),
                        ),
                    ),
                ),
            )
        )

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(scalar_count_precedence)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_UNSUPPORTED",
            "CAPTURE_UNSUPPORTED: scalar aggregate/bucket projection does not admit this terminal",
        )

    @query
    def unsupported_terminal():
        return Terminal(Node("mystery", (owner, ())))

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(unsupported_terminal)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_UNSUPPORTED",
            "CAPTURE_UNSUPPORTED: unsupported terminal form",
        )


def test_live_rust_validator_matches_update_assignment_walk():
    source = GeneratedSource(
        "update-graph-test", "0.10.0", "5" * 64, "4" * 64, "umf-access-runtime/0.1"
    )
    owner = RecordRef(
        "demo",
        "Owner",
        (FieldRef("demo", "Owner", "id", source=source),),
        source=source,
    )
    mutable_status = FieldRef("demo", "Owner", "status", source=source)

    class UpdateQuery(Query):
        UMF_UPDATE_FIELDS: ClassVar[dict[str, FieldRef]] = {"status": mutable_status}

        def update(self, **values):
            return self._update(values)

    class UpdateInput(StrictModel):
        status: str

    action = ActionRef(
        module="demo",
        action="set-status",
        input_type=UpdateInput,
        output_type=type(None),
        source=ActionSource(
            "update-graph-test",
            "0.10.0",
            "demo",
            "set-status",
            "5" * 64,
            "/modules/0/extensions/umf.actions/actions/0",
            "umf.actions.tx",
            "1",
        ),
    )

    @command(action=action)
    def accepted(status: Param[str]):
        return UpdateQuery(owner).update(status=status)

    assert rust_catalog_render.capture_with_rust_graph_validator(accepted) == capture(
        accepted
    )

    def manual_update(field: FieldRef, value: Node):
        @query
        def declaration():
            return Terminal(Node("update", (owner, (), ((field, value),))))

        return declaration

    undeclared = manual_update(mutable_status, Node("param", ("missing",)))
    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(undeclared)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_SIGNATURE",
            "CAPTURE_SIGNATURE: expression references an undeclared parameter",
        )

    foreign_before_missing = manual_update(
        FieldRef("demo", "Other", "status", source=source),
        Node("param", ("missing",)),
    )
    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(TypeError) as caught:
            capture_fn(foreign_before_missing)
        assert str(caught.value) == "expression column belongs to another Record"


def test_rust_capture_orchestration_matches_python_precedence_and_call_counts():
    owner = RecordRef("demo", "Owner", (FieldRef("demo", "Owner", "id"),))
    status = Column(FieldRef("demo", "Owner", "status"))
    calls = {"nondeterministic": 0}

    @query
    def ordered(first: Param[str | MISSING], second: Param[str | MISSING]):
        return Query(owner).filter(
            if_present(second, lambda _item: status == "second"),
            if_present(first, lambda _item: status == "first"),
        ).limit(1).all()

    assert rust_catalog_render.capture_with_rust_graph_validator(ordered) == capture(
        ordered
    )
    assert [variant.presence for variant in capture(ordered).variants] == [
        (),
        ("first",),
        ("second",),
        ("first", "second"),
    ]

    calls["limit"] = 0

    @query
    def over_limit(
        a: Param[str | MISSING],
        b: Param[str | MISSING],
        c: Param[str | MISSING],
        d: Param[str | MISSING],
        e: Param[str | MISSING],
    ):
        calls["limit"] += 1
        return Query(owner).filter(
            if_present(a, lambda _item: status == "a"),
            if_present(b, lambda _item: status == "b"),
            if_present(c, lambda _item: status == "c"),
            if_present(d, lambda _item: status == "d"),
            if_present(e, lambda _item: status == "e"),
        ).limit(1).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        calls["limit"] = 0
        with pytest.raises(CaptureError) as caught:
            capture_fn(over_limit)
        assert (caught.value.code, str(caught.value)) == (
            "VARIANT_LIMIT",
            "VARIANT_LIMIT: optional filters exceed 16 variants",
        )
        assert calls["limit"] == 2

    @query
    def nondeterministic():
        calls["nondeterministic"] += 1
        return Query(owner).limit(calls["nondeterministic"]).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        calls["nondeterministic"] = 0
        with pytest.raises(CaptureError) as caught:
            capture_fn(nondeterministic)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_NONDETERMINISTIC",
            "CAPTURE_NONDETERMINISTIC: two captures differ",
        )
        assert calls["nondeterministic"] == 2

    @query
    def topology(value: Param[str | MISSING]):
        calls["topology"] += 1
        predicate = (
            if_present(value, lambda _item: status == "fixed")
            if calls["topology"] <= 2
            else status == "fixed"
        )
        return Query(owner).filter(predicate).limit(1).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        calls["topology"] = 0

        with pytest.raises(CaptureError) as caught:
            capture_fn(topology)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_UNSUPPORTED",
            "CAPTURE_UNSUPPORTED: optional-filter topology changes across variants",
        )
        assert calls["topology"] == 4

    action = ActionRef(
        module="demo", action="read-mismatch", input_type=StrictModel,
        output_type=type(None), source=ActionSource("doc", "0.10.0", "demo", "read-mismatch", "a" * 64, "/modules/0/extensions/umf.actions/actions/0", "umf.actions.tx", "1"),
    )
    calls["topology_precedence"] = 0

    @command(action=action)
    def topology_before_write_read_check(value: Param[str | MISSING]):
        calls["topology_precedence"] += 1
        predicate = (
            if_present(value, lambda _item: status == "fixed")
            if calls["topology_precedence"] <= 2
            else status == "fixed"
        )
        return Query(owner).filter(predicate).limit(1).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        calls["topology_precedence"] = 0
        with pytest.raises(CaptureError) as caught:
            capture_fn(topology_before_write_read_check)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_UNSUPPORTED",
            "CAPTURE_UNSUPPORTED: optional-filter topology changes across variants",
        )
        assert calls["topology_precedence"] == 4

    calls["mismatch"] = 0

    @command(action=action)
    def mismatch():
        calls["mismatch"] += 1
        return Query(owner).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        calls["mismatch"] = 0
        with pytest.raises(CaptureError) as caught:
            capture_fn(mismatch)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_UNSUPPORTED",
            "CAPTURE_UNSUPPORTED: writes require command and reads require query",
        )
        assert calls["mismatch"] == 4


def test_rust_pair_comparison_precedes_terminal_dto_admission():
    owner = RecordRef("demo", "Owner", (FieldRef("demo", "Owner", "id"),))
    count = 0

    class UnsupportedNode(Node):
        pass

    @query
    def changing_shape():
        nonlocal count
        count += 1
        return Terminal(UnsupportedNode("all", (owner, (Node("limit", (count,)),))))

    # Isolate orchestration precedence from the preceding per-invocation graph
    # validator. Once a pair reaches Rust, differing canonical bytes win before
    # terminal shape inspection.
    with patch.object(
        rust_catalog_render, "_validate_graph_variant", return_value=None
    ), pytest.raises(CaptureError) as caught:
        rust_catalog_render.capture_with_rust_graph_validator(changing_shape)
    assert (caught.value.code, str(caught.value)) == (
        "CAPTURE_NONDETERMINISTIC",
        "CAPTURE_NONDETERMINISTIC: two captures differ",
    )
    assert count == 2


def test_graph_validator_admits_real_subclasses_with_canonical_trusted_tags():
    class FieldSubclass(FieldRef):
        pass

    class RecordSubclass(RecordRef):
        pass

    class NodeSubclass(Node):
        pass

    class JoinSubclass(RequiredJoin):
        pass

    class SearchLegSubclass(SearchLeg):
        pass

    owner_field = FieldSubclass("demo", "Owner", "id")
    owner = RecordSubclass("demo", "Owner", (owner_field,))
    target_field = FieldSubclass("demo", "Target", "id")
    target = RecordSubclass("demo", "Target", (target_field,))
    relation_ref = FieldSubclass("demo", "Owner", "target_id")
    relation = JoinSubclass(relation_ref, target)

    @query
    def joined():
        return Query(owner).join(relation).all()

    assert rust_catalog_render.capture_with_rust_graph_validator(joined) == capture(joined)
    dto = _encode_capture(capture(joined).variants[0], _EncodingBudget())
    joined_wire = json.dumps(dto)
    assert '"$type": "umf_access.dsl._nodes.Node"' in joined_wire
    assert '"$type": "umf_access.dsl._nodes.RecordRef"' in joined_wire
    assert '"$type": "umf_access.dsl._nodes.FieldRef"' in joined_wire
    assert '"$type": "umf_access.dsl._expressions.Join"' in joined_wire

    @query
    def search(text: Param[str]):
        ordinary = KeywordIndex(owner, '{"kind":"keyword"}').matches(text)
        leg = SearchLegSubclass(
            ordinary.record,
            ordinary.kind,
            ordinary.index_json,
            ordinary.value,
            ordinary.legs,
            ordinary.fusion,
        )
        return Query(owner).search(leg).top(5)

    assert rust_catalog_render.capture_with_rust_graph_validator(search) == capture(search)
    search_dto = _encode_capture(capture(search).variants[0], _EncodingBudget())
    assert "umf_access.dsl.search.SearchLeg" in json.dumps(search_dto)

    @query
    def node_subclass():
        return Terminal(NodeSubclass("all", (owner, ())))

    assert rust_catalog_render.capture_with_rust_graph_validator(node_subclass) == capture(node_subclass)

    Spoof = type(
        "Node",
        (),
        {"__module__": "umf_access.dsl._nodes", "__qualname__": "Node"},
    )
    from dataclasses import dataclass

    Spoof = dataclass(Spoof)
    spoof = Spoof()
    with pytest.raises(TypeError, match="not backed by a trusted base class"):
        _encode_capture(spoof, _EncodingBudget())

    class AmbiguousGraphValue(Node, FieldRef):
        pass

    ambiguous = AmbiguousGraphValue("all", ())
    with pytest.raises(TypeError, match="inherits unrelated trusted bases"):
        _encode_capture(ambiguous, _EncodingBudget())
