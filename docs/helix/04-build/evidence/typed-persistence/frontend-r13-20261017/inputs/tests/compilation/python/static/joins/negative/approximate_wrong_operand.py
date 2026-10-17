from umf_access.dsl import approx_count_distinct

def invalid():
    return approx_count_distinct("column-name")
