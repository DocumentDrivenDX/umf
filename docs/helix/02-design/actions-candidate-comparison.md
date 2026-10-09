# Candidate action models: same scenarios, explicit losses

2026-10-08. Compare the initial ordered graph-write recipe against the selected
semantic contract plus recipe/handler binding. Both use the same public requests
and business expectations from the history corpus. The sketches below are
semantic encodings, not full core documents or public-validator fixtures.

## Create and link an order — H01

Request: order key, customer key and product key. Expect one new order and two
associations; existing endpoints and unrelated records remain unchanged.

Ordered recipe: `create(order, explicit input key); link(created order, customer);
link(created order, product)`. This directly represents the required effects and
ordering. No handler is needed.

Contract plus binding: frozen read selections for customer/product; write
selection for the explicit absent order key and its two associations; recipe
binding contains the same three primitives. A qualified rule profile can also
state postconditions identifying the created order and exact endpoints. It
preserves the useful recipe while making its read/write obligations explicit.

## Approve an existing order — H03/H19

Request: order key. Expect approved status. Approving an already-approved order is
a business no-op; an identical-token retry returns the original outcome.

Ordered recipe: `set(order.status, literal approved)`. A qualified executor can
recognize unchanged value and avoid a business-change version/event. Therefore
this case alone does **not** establish the need for a branching handler. Replay
versus a fresh-key no-op still requires the protocol contract outside this recipe.

Contract plus binding: read order; permit order.status change; require
`post.order.status == approved`. Either the same recipe or an exact handler can
implement it. The handler may branch, but this is an implementation choice rather
than an expressiveness win for this particular case.

## Reserve the last unit — H02/H04/H10/H18

Request: order key, product key and quantity. Expect
`post.stock = pre.stock - quantity`, stock nonnegative and the new reserved order,
or a durable insufficient-stock rejection with no business change.

Ordered graph-write/1 recipe attempt: `set(product.stock, ?); create(order)`.
Its ValueBinding allows only an input parameter or an admitted literal. It has
no read-state arithmetic expression or computed-value binding. Supplying a
literal does not express variable quantity. Adding a caller `newStock` parameter
and a rule `newStock == pre.stock - quantity` changes the API and requires the
caller to know state; using a different opaque effect would leave the stated
recipe subset. Claiming that a generic named handler will infer the subtraction
silently invents meaning absent from the recipe. This candidate cannot represent
the original request faithfully in its selected subset.

Contract plus handler: read the frozen product selection; permit stock mutation
and creation at the explicit order key; precondition `pre.stock >= quantity`;
postconditions `post.stock == pre.stock - quantity`, nonnegative stock and the
reserved order; exact versioned reservation handler binding. The rule language
must define integer arithmetic/state binding; UMF retains it without evaluating
it. PostgreSQL native histories exercise this specific handler behavior, not a
general rule engine or FrameEntry interpreter.

## Decision and stop condition

Select the contract-plus-binding model. Preserve graph-write/1 as the simple
closed primitive recipe; use separately qualified handlers for input/pre-state
computed changes and branching contracts. Reservation is the deciding case;
approval no-op alone is not. Do not add arbitrary expression execution or
identity allocation merely to make the recipe universally expressive.

This completes the same-scenario comparison stop condition. Full normative
core fixtures, selector/rule interpretation, arbitrary handler instrumentation
and public schema validation remain separate library/executor gates.
