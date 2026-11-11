"""Fixed safe errors for the compiler-free generated executor."""

from typing import Literal

GeneratedExecutionErrorCode = Literal[
    "ARTIFACT_REFUSED", "INVALID", "LIMIT_EXCEEDED", "UNSUPPORTED"
]


class GeneratedExecutionError(Exception):
    """Stable code only; diagnostic text never contains artifact or input bytes."""

    __slots__ = ("code", "safe_reference")

    code: GeneratedExecutionErrorCode
    safe_reference: str | None

    def __init__(
        self, code: GeneratedExecutionErrorCode, safe_reference: str | None = None
    ) -> None:
        if code not in {"ARTIFACT_REFUSED", "INVALID", "LIMIT_EXCEEDED", "UNSUPPORTED"}:
            raise ValueError("invalid generated execution error code")
        if safe_reference is not None and (
            type(safe_reference) is not str
            or not safe_reference
            or "\x00" in safe_reference
        ):
            raise ValueError("invalid safe reference")
        self.code = code
        self.safe_reference = safe_reference
        super().__init__(code)

    def __str__(self) -> str:
        return self.code
