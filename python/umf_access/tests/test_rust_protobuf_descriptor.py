from __future__ import annotations

import pytest
from umf import rust_protobuf_descriptor


def _varint(value: int) -> bytes:
    result = bytearray()
    while value >= 0x80:
        result.append((value & 0x7F) | 0x80)
        value >>= 7
    result.append(value)
    return bytes(result)


def _valid_node() -> dict[str, object]:
    return {
        "type": "google.protobuf.FileDescriptorSet",
        "fields": {"file": [{
            "type": "google.protobuf.FileDescriptorProto",
            "fields": {
                "edition": 1000,
                "syntax": "editions",
                "message_type": [{
                    "type": "google.protobuf.DescriptorProto",
                    "fields": {"name": "M", "field": [{
                        "type": "google.protobuf.FieldDescriptorProto",
                        "fields": {"options": {
                            "type": "google.protobuf.FieldOptions",
                            "fields": {"targets": [1, 2]},
                            "unknown": [],
                        }},
                        "unknown": [],
                    }]},
                    "unknown": [],
                }],
            },
            "unknown": [],
        }]},
        "unknown": [],
    }


def test_profile_empty_round_trip_and_exact_bytes_carrier() -> None:
    assert rust_protobuf_descriptor.protobuf_descriptor_profile_version() == "umf-protobuf-descriptor/0.1.0"
    assert rust_protobuf_descriptor.read_descriptor_set(b"") == {
        "type": "google.protobuf.FileDescriptorSet",
        "fields": {},
        "unknown": [],
    }
    assert rust_protobuf_descriptor.write_descriptor_set(
        rust_protobuf_descriptor.read_descriptor_set(b"")
    ) == b""
    with pytest.raises(ValueError):
        rust_protobuf_descriptor.read_descriptor_set(bytearray())  # type: ignore[arg-type]


def test_closed_enum_unknown_retains_nonminimal_varint_wire_bytes() -> None:
    binary = bytes.fromhex("0a05420348e300")
    node = rust_protobuf_descriptor.read_descriptor_set(binary)
    options = node["fields"]["file"][0]["fields"]["options"]
    assert options["unknown"] == [{"number": 9, "wireType": 0, "data": "e300"}]
    assert rust_protobuf_descriptor.write_descriptor_set(node) == binary


@pytest.mark.parametrize(
    ("binary_hex", "targets", "unknown", "output_hex"),
    [
        ("0a0b2209120742059a01020102", [1, 2], [], "0a0c220a12084206980101980102"),
        ("0a0a2208120642049a010163", [], [{"number": 19, "wireType": 0, "data": "63"}], "0a09220712054203980163"),
        ("0a0c220a120842069a0103016302", [1, 2], [{"number": 19, "wireType": 0, "data": "63"}], "0a0f220d120b4209980101980102980163"),
        ("0a0e220c120a42089a010501e3006402", [1, 2], [{"number": 19, "wireType": 0, "data": "e300"}, {"number": 19, "wireType": 0, "data": "64"}], "0a132211120f420d9801019801029801e300980164"),
    ],
)
def test_packed_closed_enum_controls(
    binary_hex: str, targets: list[int], unknown: list[dict[str, object]], output_hex: str
) -> None:
    node = rust_protobuf_descriptor.read_descriptor_set(bytes.fromhex(binary_hex))
    options = node["fields"]["file"][0]["fields"]["message_type"][0]["fields"]["field"][0]["fields"]["options"]
    assert options["fields"].get("targets", []) == targets
    assert options["unknown"] == unknown
    assert rust_protobuf_descriptor.write_descriptor_set(node) == bytes.fromhex(output_hex)


def test_packed_enum_malformed_tail_is_rejected() -> None:
    with pytest.raises(ValueError):
        rust_protobuf_descriptor.read_descriptor_set(bytes.fromhex("0a0b2209120742059a01026380"))


def test_malformed_eleven_byte_unknown_varint_is_rejected_on_read_and_write() -> None:
    binary = bytes.fromhex("80b5188080808080808080808000")
    with pytest.raises(ValueError):
        rust_protobuf_descriptor.read_descriptor_set(binary)
    node = {
        "type": "google.protobuf.FileDescriptorSet",
        "fields": {},
        "unknown": [{"number": 50000, "wireType": 0, "data": "8080808080808080808000"}],
    }
    with pytest.raises(ValueError):
        rust_protobuf_descriptor.write_descriptor_set(node)


def test_four_megabyte_unknown_field_round_trips_despite_expanded_hex() -> None:
    # 3-byte tag + 4-byte length + payload = the contract's exact input cap.
    payload_size = 3_999_993
    body = bytes(payload_size)
    length = _varint(payload_size)
    tag = _varint(50_000 * 8 + 2)
    binary = tag + length + body
    assert len(binary) == 4_000_000
    node = rust_protobuf_descriptor.read_descriptor_set(binary)
    assert len(node["unknown"][0]["data"]) == 7_999_994
    assert rust_protobuf_descriptor.write_descriptor_set(node) == binary


@pytest.mark.parametrize("value", [2**53 + 1, float("nan"), float("inf"), -0.0])
def test_writer_accepts_valid_numeric_control_before_rejecting_json_number(value: object) -> None:
    node = _valid_node()
    assert rust_protobuf_descriptor.write_descriptor_set(node)
    node["fields"]["file"][0]["fields"]["edition"] = value  # type: ignore[index]
    with pytest.raises(ValueError):
        rust_protobuf_descriptor.write_descriptor_set(node)


def test_writer_rejects_signed_zero_integer_text() -> None:
    node = _valid_node()
    file_node = node["fields"]["file"][0]  # type: ignore[index]
    file_node["fields"]["options"] = {
        "type": "google.protobuf.FileOptions",
        "fields": {"uninterpreted_option": [{
            "type": "google.protobuf.UninterpretedOption",
            "fields": {"name": [{
                "type": "google.protobuf.UninterpretedOption.NamePart",
                "fields": {"name_part": "x", "is_extension": False},
                "unknown": [],
            }], "negative_int_value": "-0"},
            "unknown": [],
        }]},
        "unknown": [],
    }
    with pytest.raises(ValueError):
        rust_protobuf_descriptor.write_descriptor_set(node)


def test_writer_requires_proto2_required_name_part_fields() -> None:
    node = _valid_node()
    file_node = node["fields"]["file"][0]  # type: ignore[index]
    file_node["fields"]["options"] = {
        "type": "google.protobuf.FileOptions",
        "fields": {"uninterpreted_option": [{
            "type": "google.protobuf.UninterpretedOption",
            "fields": {"name": [{
                "type": "google.protobuf.UninterpretedOption.NamePart",
                "fields": {}, "unknown": [],
            }]},
            "unknown": [],
        }]},
        "unknown": [],
    }
    with pytest.raises(ValueError):
        rust_protobuf_descriptor.write_descriptor_set(node)


def test_writer_refuses_closed_enum_values_and_wide_wire_type() -> None:
    node = _valid_node()
    field_node = node["fields"]["file"][0]["fields"]["message_type"][0]["fields"]["field"][0]  # type: ignore[index]
    field_node["fields"]["options"]["fields"]["targets"] = [99]  # type: ignore[index]
    with pytest.raises(ValueError):
        rust_protobuf_descriptor.write_descriptor_set(node)
    node = _valid_node()
    node["unknown"] = [{"number": 50_000, "wireType": 256, "data": "00"}]
    with pytest.raises(ValueError):
        rust_protobuf_descriptor.write_descriptor_set(node)


def test_writer_known_fields_follow_ascending_wire_number() -> None:
    node = {
        "type": "google.protobuf.FileDescriptorSet",
        "fields": {"file": [{
            "type": "google.protobuf.FileDescriptorProto",
            "fields": {
                "public_dependency": [7],
                "message_type": [{
                    "type": "google.protobuf.DescriptorProto",
                    "fields": {"name": "M"},
                    "unknown": [],
                }],
                "weak_dependency": [8],
            },
            "unknown": [],
        }]},
        "unknown": [],
    }
    assert rust_protobuf_descriptor.write_descriptor_set(node) == bytes.fromhex("0a0922030a014d50075808")
