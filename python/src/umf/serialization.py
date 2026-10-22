# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compatibility façade over the Rust JSON/YAML 1.2 reader and writer."""

from ._rust import read_value, write_value
from .models import Document


def read_json_value(text: str, format: str = "json"):
    return read_value(text, format)


def write_json_value(value, format: str = "json") -> str:
    return write_value(value, format)


def read_document(text: str, format: str = "json") -> Document:
    return Document.model_validate(read_json_value(text, format))


def write_document(document: Document, format: str = "json") -> str:
    return write_json_value(document.checked_copy().to_dict(), format)
