from collections.abc import Awaitable
from decimal import Decimal
from typing import assert_type

from search_docs import queries
from search_docs.models import Doc
from umf_access.dsl import SearchResult
from umf_access.search_catalog import AsyncSearchTarget, SearchTarget


def sync(target: SearchTarget) -> None:
    assert_type(queries.string_list(target, term="cats", values=[None, "é%\\"]), SearchResult[Doc])
    assert_type(queries.string_not_list(target, term="cats", values=[]), SearchResult[Doc])
    assert_type(queries.integer_list(target, term="cats", values=[None, 9223372036854775807]), SearchResult[Doc])
    assert_type(queries.decimal_list(target, term="cats", values=[None, Decimal("1")]), SearchResult[Doc])
    assert_type(queries.boolean_list(target, term="cats", values=[None, True]), SearchResult[Doc])
    assert_type(queries.nullable_scalar(target, term="cats", value=None), SearchResult[Doc])


def async_call(target: AsyncSearchTarget) -> None:
    assert_type(queries.string_list(target, term="cats", values=[None, "x"]), Awaitable[SearchResult[Doc]])
    assert_type(queries.nullable_scalar(target, term="cats", value=None), Awaitable[SearchResult[Doc]])
