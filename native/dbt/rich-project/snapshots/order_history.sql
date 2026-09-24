{% snapshot order_history %}
{{ config(target_schema='main', unique_key='order_id', strategy='check', check_cols=['amount']) }}
select * from {{ ref('orders') }}
{% endsnapshot %}
