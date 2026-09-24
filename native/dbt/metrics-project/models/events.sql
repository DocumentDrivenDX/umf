select * from (values (1, 10, 12.5, date '2026-01-01'), (2, 10, -2.5, date '2026-01-02'), (3, 20, 0.0, date '2026-01-03')) as rows(order_id, customer_id, amount, ordered_at)
