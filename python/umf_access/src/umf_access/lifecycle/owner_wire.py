# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure codecs and validation for the original owner-authority wire records."""
from __future__ import annotations

import base64
import re
import uuid
from typing import Any

from ..canonical import canonical_json

OWNER_AUTHORITY_PROFILE = 'umf.configured-owner-authority/0.1'
OWNER_PURPOSES = ('production', 'native-acceptance')
OWNER_SCOPES = (
    'local-target-creation', 'local-target-registration',
    'native-principal-preparation', 'native-store-creation',
    'disabled-epoch-provision', 'generation-ingress-transition',
)
_UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
_B64URL = re.compile(r'^[A-Za-z0-9_-]+$')
_MAX_CONFIG = 1_048_576
_MAX_NODES = 100_000
_MAX_DEPTH = 48
_MAX_SAFE_INTEGER = 9_007_199_254_740_991


class OwnerWireError(ValueError):
    """Fixed validation failure for original owner wire data."""

    def __init__(self, code: str = 'owner-authority-invalid') -> None:
        super().__init__(code)
        self.code = code


def _plain_json(value: object) -> object:
    stack = [(value, 0)]
    nodes = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > _MAX_NODES or depth > _MAX_DEPTH:
            raise OwnerWireError('owner-authority-capacity')
        if item is None or type(item) is bool:
            continue
        if type(item) is int:
            if abs(item) > _MAX_SAFE_INTEGER:
                raise OwnerWireError
        elif type(item) is str:
            if '\x00' in item:
                raise OwnerWireError
            try:
                if len(item.encode('utf-8')) > _MAX_CONFIG:
                    raise OwnerWireError
            except UnicodeEncodeError:
                raise OwnerWireError from None
        elif type(item) is list:
            if len(item) > 4096:
                raise OwnerWireError('owner-authority-capacity')
            stack.extend((child, depth + 1) for child in item)
        elif type(item) is dict:
            if len(item) > 128 or any(type(key) is not str or not key.isascii()
                                      for key in item):
                raise OwnerWireError
            stack.extend((key, depth + 1) for key in item)
            stack.extend((child, depth + 1) for child in item.values())
        else:
            raise OwnerWireError
    try:
        if len(canonical_json(value).encode('utf-8')) > _MAX_CONFIG:
            raise OwnerWireError('owner-authority-config-invalid')
    except OwnerWireError:
        raise
    except (TypeError, ValueError, UnicodeError, RecursionError):
        raise OwnerWireError from None
    return value


def _closed(value: object, keys: set[str]) -> dict[str, Any]:
    if type(value) is not dict or set(value) != keys:
        raise OwnerWireError('owner-authority-config-invalid')
    return value


def _text(value: object, maximum: int = 128) -> str:
    if type(value) is not str or not value or '\x00' in value:
        raise OwnerWireError
    try:
        if len(value.encode('utf-8')) > maximum:
            raise OwnerWireError
    except UnicodeEncodeError:
        raise OwnerWireError from None
    return value


def _uuid(value: object) -> str:
    if type(value) is not str or not _UUID.fullmatch(value):
        raise OwnerWireError
    try:
        if str(uuid.UUID(value)) != value:
            raise OwnerWireError
    except ValueError:
        raise OwnerWireError from None
    return value


def _base64url(value: object, size: int) -> bytes:
    if type(value) is not str or not _B64URL.fullmatch(value):
        raise OwnerWireError
    try:
        decoded = base64.urlsafe_b64decode(value + '=' * ((4 - len(value) % 4) % 4))
    except (ValueError, TypeError):
        raise OwnerWireError from None
    if (len(decoded) != size
            or base64.urlsafe_b64encode(decoded).decode('ascii').rstrip('=') != value):
        raise OwnerWireError
    return decoded


def validate_owner_configuration(value: object) -> tuple[dict[str, Any], tuple[dict[str, Any], ...]]:
    """Validate the closed owner configuration used by both bootstrap and approval core."""
    config = _plain_json(value)
    _closed(config, {'profile', 'authorityId', 'policyRevision', 'purpose', 'keys'})
    if config['profile'] != OWNER_AUTHORITY_PROFILE:
        raise OwnerWireError('owner-authority-config-invalid')
    _uuid(config['authorityId'])
    _text(config['policyRevision'])
    if config['purpose'] not in OWNER_PURPOSES:
        raise OwnerWireError('owner-authority-config-invalid')
    keys = config['keys']
    if type(keys) is not list or not 1 <= len(keys) <= 32:
        raise OwnerWireError('owner-authority-config-invalid')
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for item in keys:
        key = _closed(item, {'keyId', 'publicKey', 'principalId', 'scopes',
                             'supervisorIds', 'providerIds', 'installationIds'})
        key_id = _text(key['keyId'])
        if key_id in seen:
            raise OwnerWireError('owner-authority-config-invalid')
        seen.add(key_id)
        principal_id = _text(key['principalId'])
        public_key = _base64url(key['publicKey'], 32)
        scopes = key['scopes']
        if (type(scopes) is not list or not scopes
                or any(type(scope) is not str or scope not in OWNER_SCOPES for scope in scopes)
                or len(scopes) != len(set(scopes))
                or scopes != [scope for scope in OWNER_SCOPES if scope in scopes]):
            raise OwnerWireError('owner-authority-config-invalid')
        bounds: dict[str, tuple[str, ...]] = {}
        for name in ('supervisorIds', 'providerIds', 'installationIds'):
            entries = key[name]
            if (type(entries) is not list or not 1 <= len(entries) <= 256
                    or any(type(entry) is not str for entry in entries)
                    or len(entries) != len(set(entries))):
                raise OwnerWireError('owner-authority-config-invalid')
            bounds[name] = tuple(_text(entry) if name == 'installationIds' else _uuid(entry)
                                 for entry in entries)
        normalized.append({'keyId': key_id, 'publicKey': public_key,
                           'principalId': principal_id, 'scopes': tuple(scopes),
                           **bounds})
    return config, tuple(normalized)
