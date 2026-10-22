; benchmark generated from python API
(set-info :status unknown)
(declare-fun physical_minimum () Int)
(declare-fun physical_has_finite_maximum () Bool)
(declare-fun physical_maximum () Int)
(assert
 (= physical_minimum 0))
(assert
 (not physical_has_finite_maximum))
(assert
 (let (($x41 (forall ((participation_count Int) )(let (($x38 (and (>= participation_count physical_minimum) (or (not physical_has_finite_maximum) (<= participation_count physical_maximum)))))
(let (($x39 (>= participation_count 0)))
(=> $x39 $x38))))
))
(not $x41)))
(check-sat)
