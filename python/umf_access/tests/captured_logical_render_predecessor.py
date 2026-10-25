# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit logical identities for the positive pre-Weft renderer cohort."""

from umf_access import Column, FieldRef, Param, Query, RecordRef, if_present, query
from umf_access.types import MISSING


class Invoice:
    pass


IDENTIFIER = FieldRef(
    "billing", "Invoice", "id", logical_name="invoiceId"
)
STATUS = FieldRef(
    "billing", "Invoice", "status", logical_name="status"
)
INVOICES = Query[Invoice, Invoice, int](
    RecordRef(
        "billing",
        "Invoice",
        (IDENTIFIER,),
        logical_namespace="com.example.billing",
        logical_name="Invoice",
    )
)
status = Column[Invoice, str](STATUS)


@query
def direct():
    return INVOICES.limit(4).all()


@query
def filtered(value: Param[str]):
    return INVOICES.filter(status == value).limit(4).all()


@query
def optional(value: Param[str | MISSING]):
    return INVOICES.filter(if_present(value, lambda item: status == item)).limit(4).all()


@query
def unsupported_result():
    return {"sql": "SELECT * FROM Invoice"}
