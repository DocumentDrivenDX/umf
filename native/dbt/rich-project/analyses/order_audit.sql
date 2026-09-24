select * from {{ source('seed_alias', 'orders') }} where amount < 0
