from typing import Callable, Generic, TypeVar, overload, reveal_type
from pydantic import MISSING
T_co=TypeVar('T_co',covariant=True)
T=TypeVar('T')
N=TypeVar('N',bound=str|int|None)
O=TypeVar('O')
class Param(Generic[T_co]): pass
class Predicate(Generic[O]): pass
class InvalidOptionalFilter: pass
@overload
def if_present(p:Param[N], build:Callable[[Param[N]],Predicate[O]])->InvalidOptionalFilter: ...
@overload
def if_present(p:Param[T|MISSING], build:Callable[[Param[T]],Predicate[O]])->Predicate[O]: ...
def if_present(p:object,build:object)->object: raise NotImplementedError

def pred(p:object)->Predicate[int]: return Predicate()
def consume(p:Predicate[int])->None: pass
reveal_type(if_present(Param[str|None](),pred))
reveal_type(if_present(Param[str|MISSING](),pred))
reveal_type(if_present(Param[str|None|MISSING](),pred))
consume(if_present(Param[str|None](),pred))
consume(if_present(Param[str|MISSING](),pred))
consume(if_present(Param[str|None|MISSING](),pred))
