select * from {{ ref('gated_parent') }} where id = 1
