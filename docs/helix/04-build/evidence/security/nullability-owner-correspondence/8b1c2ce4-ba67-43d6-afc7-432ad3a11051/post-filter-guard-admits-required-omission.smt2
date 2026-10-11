; benchmark generated from python API
(set-info :status unknown)
(declare-fun source_nullability () Int)
(declare-fun owner_value () Int)
(declare-fun owner_state () Int)
(assert
 (>= source_nullability 0))
(assert
 (<= source_nullability 5))
(assert
 (>= owner_value 0))
(assert
 (<= owner_value 5))
(assert
 (>= owner_state 0))
(assert
 (<= owner_state 3))
(assert
 (let (($x33 (= owner_value source_nullability)))
 (let (($x23 (<= source_nullability 2)))
 (let (($x49 (and $x23 $x33)))
 (let (($x37 (= owner_state 0)))
 (=> $x37 $x49))))))
(assert
 (= source_nullability 0))
(assert
 (= owner_state 2))
(assert
 (let (($x37 (= owner_state 0)))
(not $x37)))
(check-sat)
