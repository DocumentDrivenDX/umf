# SPDX-License-Identifier: MIT OR Apache-2.0
from datetime import date
from decimal import Decimal
from typing import Literal, assert_type
from domain_demo import SyncClient, Applied, Recovered, DemoCreateRow, ExactTimestamp


def declarations(client: SyncClient) -> None:
    result = client.modules.demo.create(id='row', owner='alice', day=date(2000, 2, 29), at=ExactTimestamp('2026-01-01T00:00:00Z'), amount=Decimal('12.30'), status='draft', rank=2, tag='é😀', active=True, idempotency_key='key')
    assert_type(result, Applied[DemoCreateRow] | Recovered)
    if result.status == 'applied':
        assert_type(result.items[0].rows[0].status, Literal['draft', 'ready'])
        assert_type(result.items[0].rows[0].rank, Literal[1, 2, 9])
        assert_type(result.items[0].rows[0].active, Literal[True])
    client.modules.demo.touch(id='row', owner='alice', day=date(2000, 2, 29), amount=Decimal('12.30'), status='ready', rank=9, tag='é😀', active=True, idempotency_key='touch')
