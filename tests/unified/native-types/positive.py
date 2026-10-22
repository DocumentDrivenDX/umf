# SPDX-License-Identifier: MIT OR Apache-2.0
from typing import assert_type
from native_demo import (Client, SyncClient, Applied, Recovered, NotObserved, Page,
                         DemoCreateRow, DemoReadManyRow, DemoReadPageRow, DemoCreateBatchInput)


def sync(client: SyncClient) -> None:
    module = client.modules.demo
    assert_type(module.read_many(owner='alice'), tuple[DemoReadManyRow, ...])
    assert_type(module.read_count(owner='alice'), int)
    assert_type(module.read_page(owner='alice'), Page[DemoReadPageRow])
    result = module.create(id='key', owner='alice', idempotency_key='key')
    assert_type(result, Applied[DemoCreateRow] | Recovered)
    if result.status == 'applied':
        assert_type(result.items[0].rows[0], DemoCreateRow)
    assert_type(module.create_observe(id='key', owner='alice', idempotency_key='key'), Recovered | NotObserved)
    module.create_batch_batch(items=(DemoCreateBatchInput(id='key', owner='alice'),), idempotency_key='key')


async def asynchronous(client: Client) -> None:
    assert_type(await client.modules.demo.read_count(owner='alice'), int)
    assert_type(await client.modules.demo.create(id='key', owner='alice', idempotency_key='key'), Applied[DemoCreateRow] | Recovered)
