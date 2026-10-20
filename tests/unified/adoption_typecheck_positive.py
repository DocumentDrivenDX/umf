# SPDX-License-Identifier: MIT OR Apache-2.0
from adoption import (Actions, Client, SyncActions, SyncClient, CustomerKey,
                      ProjectKey, OpenProjectInput, OpenProjectPrecondition,
                      BatchReceipt, ValidationResult, PreconditionFailed)

async def asynchronous(client: Client) -> BatchReceipt[ProjectKey, None]:
    actions = Actions(client)
    validation: ValidationResult = await actions.open_project_validate(
        code='P1', title='Project', client=CustomerKey(code='C1'))
    assert validation.valid
    try:
        return await actions.open_project_batch(
            (OpenProjectInput(code='P1', title='Project', client=CustomerKey(code='C1')),),
            atomic=True, idempotency_key='batch-1')
    except PreconditionFailed as error:
        if error.precondition == OpenProjectPrecondition.FRESH:
            raise
        raise

def synchronous(client: SyncClient) -> BatchReceipt[ProjectKey, None]:
    return SyncActions(client).open_project_batch(
        (OpenProjectInput(code='P2', title='Project', note=None, client=CustomerKey(code='C1')),))
