; benchmark generated from python API
(set-info :status unknown)
(declare-fun operation_count () Int)
(declare-fun limit () Int)
(declare-fun inventory_or_snapshot_base () Int)
(declare-fun cumulative_cost () (Array Int Int))
(declare-fun nonnegative_operation_cost () (Array Int Int))
(declare-fun leaf_structural_completion () (Array Int Bool))
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
 (= operation_count 2))
(assert
 (= inventory_or_snapshot_base 1))
(assert
 (= limit 10))
(assert
 (let ((?x67 (select nonnegative_operation_cost 0)))
 (= ?x67 2)))
(assert
 (let ((?x70 (select nonnegative_operation_cost 1)))
 (= ?x70 3)))
(assert
 (forall ((index Int) )(let (($x29 (select leaf_structural_completion index)))
 (let (($x46 (>= index 0)))
 (let (($x47 (and $x46 (< index operation_count))))
 (=> $x47 $x29)))))
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
 (let ((?x24 (select cumulative_cost operation_count)))
(let (($x25 (<= ?x24 limit)))
(let (($x31 (forall ((index Int) )(let (($x29 (select leaf_structural_completion index)))
(let (($x46 (>= index 0)))
(let (($x47 (and $x46 (< index operation_count))))
(=> $x47 $x29)))))
))
(let (($x26 (and $x31 $x25)))
(let ((?x27 (ite $x26 operation_count 0)))
(= ?x27 2)))))))
(check-sat)
