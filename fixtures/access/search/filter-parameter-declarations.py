from decimal import Decimal
from umf_access import Param, query
from search_docs.models import Doc

@query
def string_list(term: Param[str], values: Param[list[str | None]]):
    return Doc.objects.filter(Doc.c.tag.is_in(values)).search(Doc.s.text.matches(term)).top(10)

@query
def string_not_list(term: Param[str], values: Param[list[str | None]]):
    return Doc.objects.filter(Doc.c.tag.not_in(values)).search(Doc.s.text.matches(term)).top(10)

@query
def integer_list(term: Param[str], values: Param[list[int | None]]):
    return Doc.objects.filter(Doc.c.count.is_in(values)).search(Doc.s.text.matches(term)).top(10)

@query
def decimal_list(term: Param[str], values: Param[list[Decimal | None]]):
    return Doc.objects.filter(Doc.c.amount.is_in(values)).search(Doc.s.text.matches(term)).top(10)

@query
def boolean_list(term: Param[str], values: Param[list[bool | None]]):
    return Doc.objects.filter(Doc.c.flag.is_in(values)).search(Doc.s.text.matches(term)).top(10)

@query
def nullable_scalar(term: Param[str], value: Param[str | None]):
    return Doc.objects.filter(Doc.c.tag == value).search(Doc.s.text.matches(term)).top(10)

@query
def all_terms(term: Param[str], words: Param[str]):
    return Doc.objects.filter(Doc.c.body.matches_all_terms(words)).search(Doc.s.text.matches(term)).top(10)

@query
def any_terms(term: Param[str], words: Param[str]):
    return Doc.objects.filter(Doc.c.body.matches_any_term(words)).search(Doc.s.text.matches(term)).top(10)

@query
def literal_empty(term: Param[str]):
    return Doc.objects.filter(Doc.c.tag.is_in([])).search(Doc.s.text.matches(term)).top(10)

@query
def literal_nulls(term: Param[str]):
    return Doc.objects.filter(Doc.c.tag.is_in([None, 'é%\\'])).search(Doc.s.text.matches(term)).top(10)
