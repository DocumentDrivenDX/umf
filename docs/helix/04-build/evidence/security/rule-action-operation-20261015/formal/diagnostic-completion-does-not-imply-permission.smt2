; benchmark generated from python API
(set-info :status unknown)
(declare-fun operation_count () Int)
(declare-fun limit () Int)
(declare-fun inventory_or_snapshot_base () Int)
(declare-fun cumulative_cost () (Array Int Int))
(declare-fun nonnegative_operation_cost () (Array Int Int))
(declare-fun leaf_structural_completion () (Array Int Bool))
(declare-fun failing_index () Int)
(declare-fun is_action () (Array Int Bool))
(declare-fun leaf_actual_permission () (Array Int Bool))
(assert
 (>= operation_count 1))
(assert
 (<= operation_count 256))
(assert
 (>= limit 1))
(assert
 (>= inventory_or_snapshot_base 0))
(assert
 (= (select cumulative_cost 0) inventory_or_snapshot_base))
(assert
 (forall ((index Int) )(let ((?x37 (select nonnegative_operation_cost index)))
 (let ((?x38 (select cumulative_cost index)))
 (let (($x43 (>= ?x37 0)))
 (let (($x44 (and $x43 (= (select cumulative_cost (+ index 1)) (+ ?x38 ?x37)))))
 (let (($x46 (>= index 0)))
 (let (($x47 (and $x46 (< index operation_count))))
 (=> $x47 $x44))))))))
 )
(assert
 (let ((?x24 (select cumulative_cost operation_count)))
 (let (($x25 (<= ?x24 limit)))
 (let (($x31 (forall ((index Int) )(let (($x29 (select leaf_structural_completion index)))
 (let (($x46 (>= index 0)))
 (let (($x47 (and $x46 (< index operation_count))))
 (=> $x47 $x29)))))
 ))
 (and $x31 $x25)))))
(assert
 (let (($x32 (>= failing_index 0)))
 (and $x32 (< failing_index operation_count))))
(assert
 (select is_action failing_index))
(assert
 (not (select leaf_actual_permission failing_index)))
(check-sat)
