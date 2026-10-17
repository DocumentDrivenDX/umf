from collections.abc import Awaitable
from decimal import Decimal
from typing import assert_type
from umf_access.commands import CommandPlan, BulkTarget, AsyncBulkTarget
from umf_access.dsl._expressions import (
    AliasOwner, Bucket, Column, OptionalJoin, RecordAlias, RequiredJoin,
)

class Owner: pass
class Row: pass
class Tag: pass
class Key: pass
class Plan: pass

def aliases(required: RequiredJoin[Owner, Row, Key], optional: OptionalJoin[Owner, Row, Key], alias: RecordAlias[Row, Tag]) -> None:
    assert_type(required.to_alias(alias), RequiredJoin[Owner, AliasOwner[Row, Tag], Key])
    assert_type(optional.to_alias(alias), OptionalJoin[Owner, AliasOwner[Row, Tag], Key])

def commands(plan: CommandPlan, sync: BulkTarget[Plan], async_: AsyncBulkTarget[Plan]) -> None:
    assert_type(plan.run(sync, {}), Plan)
    assert_type(plan.run(async_, {}), Awaitable[Plan])

def buckets(integer: Column[Owner, int], decimal: Column[Owner, Decimal], nullable_integer: Column[Owner, int | None], nullable_decimal: Column[Owner, Decimal | None]) -> None:
    assert_type(integer.bucket_width(1), Bucket[Owner, int])
    assert_type(integer.bucket_width(Decimal('1')), Bucket[Owner, Decimal])
    assert_type(decimal.bucket_width(1), Bucket[Owner, Decimal])
    assert_type(nullable_integer.bucket_width(1), Bucket[Owner, int | None])
    assert_type(nullable_integer.bucket_width(Decimal('1')), Bucket[Owner, Decimal | None])
    assert_type(nullable_decimal.bucket_width(1), Bucket[Owner, Decimal | None])
