; benchmark generated from python API
(set-info :status unknown)
(declare-fun physical_minimum () Int)
(declare-fun participation_count () Int)
(assert
 (> physical_minimum 0))
(assert
 (>= participation_count 0))
(assert
 (let (($x33 (= participation_count 0)))
(and $x33 (< participation_count physical_minimum))))
(check-sat)
