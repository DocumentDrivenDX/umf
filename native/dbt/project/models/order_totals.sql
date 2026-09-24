select customer_id, sum(amount) as total_amount
from {{ ref('orders') }}
group by customer_id
