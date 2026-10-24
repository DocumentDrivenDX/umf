# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit trusted-install fixture for primary owner-bootstrap context0.3."""
from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from typing import Any

from umf_access.lifecycle import owner_bootstrap as bootstrap
from umf_access.lifecycle.owner_approval_core import (
    OWNER_LEDGER_PROFILE,
    _canonical_bytes,
    _digest_bytes,
    _validate_config,
)


def install_pending_owner_setup(control_home: Path, enrollment: dict[str, Any],
                                enrollment_bytes: bytes, ledger_path: Path, *,
                                generation_registry_id: str | None = None) -> dict[str, Any]:
    """Represent the original operator boundary, before any runtime factory."""
    config, _keys = _validate_config(enrollment['ownerConfiguration'])
    config_digest = _digest_bytes(_canonical_bytes(config))
    owner_body = {'profile': OWNER_LEDGER_PROFILE, 'authorityId': config['authorityId'],
                  'configurationDigest': config_digest}
    header = {**owner_body, 'digest': _digest_bytes(_canonical_bytes(owner_body))}
    header_bytes = _canonical_bytes(header) + b'\n'
    lock_path = ledger_path.with_name(ledger_path.name + '.lock')
    generation = None
    if generation_registry_id is not None:
        registry_path = control_home / 'generation-authority-registry.json'
        registry_lock = registry_path.with_name(registry_path.name + '.lock')
        roots = enrollment['generationAuthorityRoots']
        root_digest = _digest_bytes(_canonical_bytes(roots))
        anchor = {'enrollmentRecordDigest': _digest_bytes(enrollment_bytes),
                  'authorityConfigurationDigest': config_digest,
                  'generationRootPolicyDigest': root_digest,
                  'purpose': enrollment['purpose'], 'context': enrollment['context']}
        generation = {
            'rootPolicyDigest': root_digest,
            'registryBirth': {
                'registryId': generation_registry_id,
                'anchorDigest': _digest_bytes(_canonical_bytes(anchor)),
                'registryPath': str(registry_path), 'lockPath': str(registry_lock),
                'initialRegistryDigest': hashlib.sha256(
                    bootstrap._initial_generation_registry(
                        generation_registry_id, _digest_bytes(_canonical_bytes(anchor)))).hexdigest(),
            },
        }
    record = {
        'profile': bootstrap._OWNER_CONTEXT_PROFILE,
        'enrollmentId': enrollment['enrollmentId'],
        'enrollmentRecordDigest': _digest_bytes(enrollment_bytes),
        'authorityConfigurationDigest': config_digest,
        'purpose': enrollment['purpose'], 'context': enrollment['context'],
        'setupId': str(uuid.uuid4()), 'state': 'pending',
        'ownerLedger': {
            'ledgerId': str(uuid.uuid4()), 'ledgerPath': str(ledger_path),
            'lockPath': str(lock_path),
            'initialHeaderDigest': hashlib.sha256(header_bytes).hexdigest(),
        },
        'generationAuthority': generation,
    }
    bootstrap._write_private(control_home / bootstrap._OWNER_SETUP_LOCK, b'')
    bootstrap._write_private(control_home / 'owner-bootstrap-context.json',
                             bootstrap._canonical(record))
    return record
