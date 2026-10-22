; benchmark generated from python API
(set-info :status unknown)
(declare-sort Project 0)
(declare-sort Resource 0)
(declare-fun ownership (Resource Project) Bool)
(declare-fun resource () Resource)
(assert
 (let (($x13 (forall ((project Project) )(let (($x14 (ownership resource project)))
(not $x14)))
))
(and $x13 true)))
(check-sat)
