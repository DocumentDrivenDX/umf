# SPDX-License-Identifier: MIT OR Apache-2.0
"""Stable errors shared by the catalog model and its Rust bind adapter."""


class CatalogError(ValueError):
    __module__ = "umf_access.catalog"


class NotCompiledForTarget(CatalogError):
    __module__ = "umf_access.catalog"


class QueryNotFound(LookupError):
    __module__ = "umf_access.catalog"


class QueryNotUnique(ValueError):
    __module__ = "umf_access.catalog"
