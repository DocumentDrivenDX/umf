; benchmark generated from python API
(set-info :status unknown)
(declare-fun source_nullability () Int)
(declare-fun owner_value () Int)
(declare-fun owner_state () Int)
(declare-fun owner_context () Int)
(declare-fun original_context () Int)
(declare-fun authenticated_owner () Bool)
(declare-fun installed_enforcement () Bool)
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
 (let (($x32 (<= source_nullability 3)))
 (let (($x24 (= source_nullability 3)))
 (let (($x23 (<= source_nullability 2)))
 (let ((?x30 (ite $x23 0 (ite $x24 1 (ite (= source_nullability 4) 2 3)))))
 (let (($x31 (= owner_state ?x30)))
 (and $x31 (=> $x32 $x33)))))))))
(assert
 (= original_context owner_context))
(assert
 (= source_nullability 0))
(assert
 (= owner_state 0))
(assert
 (not authenticated_owner))
(assert
 (not installed_enforcement))
(check-sat)
