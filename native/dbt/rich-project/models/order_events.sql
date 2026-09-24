select order_id, customer_id, amount, cast('2026-01-01' as date) as ordered_at
from {{ ref('orders') }}
