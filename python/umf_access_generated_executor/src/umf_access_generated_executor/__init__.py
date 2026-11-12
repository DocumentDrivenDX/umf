"""Compiler-free verifier for trusted UMF/Weft generated execution artifacts.

The package is standard-library only. Artifact admission does not grant native
or application authority; live execution remains the host and provider's job.
"""

from umf_access_generated_executor._canonical import (
    canonical_json,
    freeze_json,
    parse_json,
)
from umf_access_generated_executor._codec import run_issued_codec
from umf_access_generated_executor._errors import (
    GeneratedExecutionError,
    GeneratedExecutionErrorCode,
)
from umf_access_generated_executor._executor import (
    is_verified_executor_for,
    prepare_generated,
)
from umf_access_generated_executor._native import AdmittedNativeTable
from umf_access_generated_executor._ordinary_page import (
    GeneratedOrdinaryPageCall,
    GeneratedOrdinaryPagePosition,
    GeneratedOrdinaryPageRoot,
    PreparedOrdinaryPage,
    _bounded_canonical_json_size as bounded_canonical_json_size,
)
from umf_access_generated_executor._result_values import (
    decode_result_literal,
    fits_native_type,
)
from umf_access_generated_executor._values import (
    BoundJoinedReadProgram,
    BoundForwardConnectionProgram,
    BoundKeyBatchProgram,
    BoundProgram,
    BoundReadProgram,
    BoundReadProgramV2,
    BoundReadProgramV3,
    ExecutionScope,
    GeneratedCall,
    GeneratedExecutor,
    GeneratedFiles,
    GeneratedForwardConnectionCall,
    GeneratedGetManyCall,
    GeneratedJoinedAnd,
    GeneratedJoinedAtom,
    GeneratedJoinedField,
    GeneratedJoinedNot,
    GeneratedJoinedOr,
    GeneratedJoinedOrder,
    GeneratedJoinedReadCall,
    GeneratedJoinedReadResult,
    GeneratedJoinedReadRoot,
    GeneratedManifest,
    GeneratedReadAnd,
    GeneratedReadAtom,
    GeneratedReadCall,
    GeneratedReadCallV2,
    GeneratedReadFilter,
    GeneratedReadNot,
    GeneratedReadOr,
    GeneratedReadWhere,
    TargetBinding,
    TrustedArtifactRef,
    normalized_path,
)

__version__ = "0.1.0a11"

__all__ = [
    "AdmittedNativeTable",
    "BoundJoinedReadProgram",
    "BoundForwardConnectionProgram",
    "BoundKeyBatchProgram",
    "BoundProgram",
    "BoundReadProgram",
    "BoundReadProgramV2",
    "BoundReadProgramV3",
    "ExecutionScope",
    "GeneratedCall",
    "GeneratedExecutionError",
    "GeneratedExecutionErrorCode",
    "GeneratedExecutor",
    "GeneratedFiles",
    "GeneratedForwardConnectionCall",
    "GeneratedGetManyCall",
    "GeneratedJoinedAnd",
    "GeneratedJoinedAtom",
    "GeneratedJoinedField",
    "GeneratedJoinedNot",
    "GeneratedJoinedOr",
    "GeneratedJoinedOrder",
    "GeneratedJoinedReadCall",
    "GeneratedJoinedReadResult",
    "GeneratedJoinedReadRoot",
    "GeneratedManifest",
    "GeneratedOrdinaryPageCall",
    "GeneratedOrdinaryPagePosition",
    "GeneratedOrdinaryPageRoot",
    "GeneratedReadAnd",
    "GeneratedReadAtom",
    "GeneratedReadCall",
    "GeneratedReadCallV2",
    "GeneratedReadFilter",
    "GeneratedReadNot",
    "GeneratedReadOr",
    "GeneratedReadWhere",
    "PreparedOrdinaryPage",
    "TargetBinding",
    "TrustedArtifactRef",
    "__version__",
    "canonical_json",
    "freeze_json",
    "decode_result_literal",
    "fits_native_type",
    "bounded_canonical_json_size",
    "normalized_path",
    "run_issued_codec",
    "is_verified_executor_for",
    "parse_json",
    "prepare_generated",
]
