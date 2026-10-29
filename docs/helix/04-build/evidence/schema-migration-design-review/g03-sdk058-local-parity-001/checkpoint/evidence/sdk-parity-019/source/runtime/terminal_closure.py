"""Small pure helpers for receipt sizing and canonical evidence roots."""
from __future__ import annotations
import json
import pathlib


def owner_receipt_payload(result, files, base_bytes, receipt_path, evidence_cap, guard=None):
    """Render a receipt whose recorded physical size is part of its own payload."""
    owner = {
        'path': str(receipt_path),
        'sizeBytes': 0,
        'sha256': None,
        'selfHashOmitted': True,
    }
    result['inclusiveFiles'] = list(files) + [owner]
    candidate = 0
    for _ in range(16):
        if guard is not None:
            guard()
        owner['sizeBytes'] = candidate
        result['inclusiveBytesIncludingOwnerReceipt'] = base_bytes + candidate
        payload = (json.dumps(result, sort_keys=True, indent=2) + '\n').encode()
        actual = len(payload)
        if base_bytes + actual > evidence_cap:
            raise ValueError('inclusive owner receipt closure exceeds evidence cap')
        if actual == candidate:
            return payload
        candidate = actual
    raise ValueError('owner receipt size did not converge')


def dedupe_roots(roots):
    """Resolve exact roots and overlapping ancestors once, rejecting symlinks."""
    unique = {}
    for item in roots:
        path = pathlib.Path(item)
        if not path.is_absolute() or path.absolute() != path or path.is_symlink():
            raise ValueError('noncanonical evidence root')
        resolved = path.resolve(strict=True)
        if resolved != path or resolved.is_symlink() or not resolved.is_dir():
            raise ValueError('non-directory or symlinked evidence root')
        unique[str(resolved)] = resolved
    ordered = sorted(unique.values(), key=lambda p: (len(p.parts), str(p)))
    kept = []
    for path in ordered:
        if any(parent == path or parent in path.parents for parent in kept):
            continue
        kept.append(path)
    return kept


def replace_with_failure_receipt(receipt, payload, atomic_write):
    """Remove any old PASS before writing and verifying the fail-only payload."""
    receipt = pathlib.Path(receipt)
    try:
        receipt.unlink()
    except FileNotFoundError:
        pass
    for temporary in receipt.parent.glob('.' + receipt.name + '.*.tmp'):
        try:
            temporary.unlink()
        except OSError:
            pass
    atomic_write(receipt, payload)
    if receipt.read_bytes() != payload:
        raise OSError('failure receipt readback mismatch')
