; benchmark generated from python API
(set-info :status unknown)
(declare-fun operation_count () Int)
(declare-fun limit () Int)
(declare-fun inventory_or_snapshot_base () Int)
(declare-fun cumulative_cost () (Array Int Int))
(declare-fun nonnegative_operation_cost () (Array Int Int))
(declare-fun operation_cut () (Array Int Int))
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
 (let ((?x102 (select operation_cut 1)))
(let ((?x106 (select operation_cut 0)))
(and (distinct ?x106 ?x102) true))))
(check-sat)
