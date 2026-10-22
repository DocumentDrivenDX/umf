; benchmark generated from python API
(set-info :status unknown)
(declare-fun source_label () Int)
(declare-fun observed_label () Int)
(declare-fun owner_state () Int)
(declare-fun explicit_group_or_record () Bool)
(declare-fun container () Bool)
(declare-fun explicit_field () Bool)
(assert
 (>= source_label 0))
(assert
 (<= source_label 10))
(assert
 (>= observed_label 0))
(assert
 (<= observed_label 10))
(assert
 (>= owner_state 0))
(assert
 (<= owner_state 3))
(assert
 (let (($x37 (not explicit_group_or_record)))
 (let (($x38 (and (not container) $x37)))
 (let (($x35 (and (distinct source_label 0) true)))
 (=> $x35 $x38)))))
(assert
 (let (($x20 (not explicit_field)))
 (=> explicit_group_or_record $x20)))
(assert
 (not explicit_field))
(assert
 (= source_label 1))
(assert
 (= owner_state 0))
(check-sat)
