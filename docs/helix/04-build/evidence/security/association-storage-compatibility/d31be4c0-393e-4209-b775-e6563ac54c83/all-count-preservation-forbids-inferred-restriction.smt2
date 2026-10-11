; benchmark generated from python API
(set-info :status unknown)
(declare-fun physical_maximum () Int)
(declare-fun physical_has_finite_maximum () Bool)
(declare-fun physical_minimum () Int)
(assert
 (forall ((participation_count Int) )(let (($x38 (and (>= participation_count physical_minimum) (or (not physical_has_finite_maximum) (<= participation_count physical_maximum)))))
 (let (($x39 (>= participation_count 0)))
 (=> $x39 $x38))))
 )
(assert
 (let (($x62 (> physical_minimum 0)))
(or $x62 physical_has_finite_maximum)))
(check-sat)
