"""Conditional action-selector model; no source or native refinement theorem."""
import json
from z3 import Function, Int, IntSort, BoolSort, Solver, And, Not, sat, unsat
selected,designated,main=Int('selected'),Int('designated'),Int('main')
granted=Function('granted',IntSort(),BoolSort())
selected_granted,designated_granted=granted(selected),granted(designated)
legacy=And(selected != main,selected_granted)
bound=And(legacy,selected == designated)
queries=[('unrelated-action-legacy',And(legacy,selected != designated,Not(designated_granted)),sat),
 ('bound-excludes-unrelated',And(bound,selected != designated),unsat),
 ('bound-useful',And(bound,designated != main,designated_granted),sat)]
results=[]
for name,formula,expected in queries:
 solver=Solver();solver.add(formula);result=solver.check()
 assert result==expected
 results.append({'id':name,'result':str(result),'model':str(solver.model()) if result==sat else None})
print(json.dumps({'queries':results,'scope':'Unbounded exact integer action identities and assumed correct granted-action predicate. Equality binding only; no policy evaluation, empty-set, dependency, authentication, native or implementation correctness proof.'},indent=2))
