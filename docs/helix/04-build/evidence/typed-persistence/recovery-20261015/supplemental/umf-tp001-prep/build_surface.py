from pathlib import Path
p = Path('/private/tmp/umf-tp001-prep/compatibility/surface.py')
s=p.read_text()
s=s.replace('K = TypeVar("K")', 'K = TypeVar("K")\n'+'\n'.join(f'T{i} = TypeVar("T{i}")' for i in range(1,9)))
methods=[]
for count in range(1,9):
    args=', '.join(f'c{i}: Column[O, T{i}]' for i in range(1,count+1))
    types=', '.join(f'T{i}' for i in range(1,count+1))
    methods.append(f'    @overload\n    def select(self, {args}, /) -> Query[O, tuple[{types}], K]: ...')
methods.append('    def select(self, *cols: Column[O, Any]) -> Any: raise NotImplementedError')
s=s.replace('    def all(self)', '\n'.join(methods)+'\n    def all(self)')
p.write_text(s)
