# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused parity and capability checks for the opt-in R6 crypto shard."""

import hashlib
import hmac
from types import SimpleNamespace

import pytest
from umf import rust_outcome_values


def test_profile_and_capability_handshake() -> None:
    assert rust_outcome_values.profile_version() == "umf-r6-outcome-crypto/0.1.0"
    rust_outcome_values.require_outcome_values_profile()

    class WrongCore:
        @staticmethod
        def outcome_values_profile_version() -> str:
            return "umf-r6-outcome-crypto/0.0.0"

        @staticmethod
        def outcome_values_capabilities() -> list[str]:
            return ["hmac_sha256", "slot_sha256", "signature_matches"]

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(rust_outcome_values, "_rust", SimpleNamespace(_rust_core=WrongCore()))
        with pytest.raises(RuntimeError, match="profile mismatch"):
            rust_outcome_values.require_outcome_values_profile()

    class IncompleteCore:
        @staticmethod
        def outcome_values_profile_version() -> str:
            return "umf-r6-outcome-crypto/0.1.0"

        @staticmethod
        def outcome_values_capabilities() -> list[str]:
            return ["hmac_sha256", "slot_sha256"]

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(rust_outcome_values, "_rust", SimpleNamespace(_rust_core=IncompleteCore()))
        with pytest.raises(RuntimeError, match="capability set mismatch"):
            rust_outcome_values.require_outcome_values_profile()

    class ExtraCore:
        @staticmethod
        def outcome_values_profile_version() -> str:
            return "umf-r6-outcome-crypto/0.1.0"

        @staticmethod
        def outcome_values_capabilities() -> list[str]:
            return ["hmac_sha256", "slot_sha256", "signature_matches", "unreviewed"]

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(rust_outcome_values, "_rust", SimpleNamespace(_rust_core=ExtraCore()))
        with pytest.raises(RuntimeError, match="capability set mismatch"):
            rust_outcome_values.require_outcome_values_profile()


def test_hmac_matches_rfc4231_and_hashlib_at_block_boundaries() -> None:
    vectors = [
        (bytes([0x0B]) * 20, b"Hi There", "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"),
        (b"Jefe", b"what do ya want for nothing?", "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"),
        (bytes([0xAA]) * 20, bytes([0xDD]) * 50, "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe"),
        (bytes([0xAA]) * 131, b"Test Using Larger Than Block-Size Key - Hash Key First", "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"),
        (b"", b"", "b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad"),
    ]
    for key, message, expected in vectors:
        assert rust_outcome_values.hmac_sha256(key, message).hex() == expected
        assert rust_outcome_values.hmac_sha256(key, message) == hmac.new(key, message, hashlib.sha256).digest()

    for key_length in (0, 1, 63, 64, 65, 131):
        key = bytes(index % 256 for index in range(key_length))
        for message_length in (0, 1, 55, 56, 63, 64, 65, 127, 128, 129):
            message = bytes((index * 17) % 256 for index in range(message_length))
            assert rust_outcome_values.hmac_sha256(key, message) == hmac.new(key, message, hashlib.sha256).digest()

    # Long single-call inputs exercise the native streaming implementation
    # without introducing an application-level streaming protocol.
    long_key = bytes((index * 13) % 256 for index in range(4097))
    long_message = bytes((index * 29) % 256 for index in range(2 * 1024 * 1024 + 17))
    assert rust_outcome_values.hmac_sha256(long_key, long_message) == hmac.new(
        long_key, long_message, hashlib.sha256
    ).digest()


def test_sha256_and_constant_time_signature_surface() -> None:
    assert rust_outcome_values.slot_sha256(b"abc") == hashlib.sha256(b"abc").digest()
    signature = bytes(range(32))
    assert rust_outcome_values.signature_matches(signature, signature)
    for position in (0, 15, 31):
        mismatch = bytearray(signature)
        mismatch[position] ^= 1
        assert not rust_outcome_values.signature_matches(signature, bytes(mismatch))
    for wrong_width in (signature[:-1], signature + b"x"):
        with pytest.raises(ValueError, match="32 bytes"):
            rust_outcome_values.signature_matches(wrong_width, signature)


def test_native_hmac_carriers_require_bytes() -> None:
    with pytest.raises(TypeError):
        rust_outcome_values.hmac_sha256(bytearray(b"key"), b"message")  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        rust_outcome_values.hmac_sha256(b"key", memoryview(b"message"))  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        rust_outcome_values.slot_sha256(bytearray(b"message"))  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        rust_outcome_values.signature_matches(bytearray(32), bytes(32))  # type: ignore[arg-type]
