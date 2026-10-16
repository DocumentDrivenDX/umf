from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class TargetIdentity:
    kind: str
    backend_id: str
    backend_version: str
    target_profile: str
    binding_sha256: str
    platform: tuple[tuple[str, str], ...]

    def digest(self) -> str:
        value = {"kind":self.kind,"backendId":self.backend_id,"backendVersion":self.backend_version,
                 "targetProfile":self.target_profile,"bindingSha256":self.binding_sha256,
                 "platform":[{"name":name,"version":version} for name,version in self.platform]}
        return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False).encode()).hexdigest()

