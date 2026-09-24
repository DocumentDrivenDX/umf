{{ config(severity='warn') }}
select * from {{ ref('healthy') }} where id = 1
