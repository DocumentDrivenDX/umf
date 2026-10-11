; benchmark generated from python API
(set-info :status unknown)
(declare-fun generation () Int)
(declare-fun next_generation () Int)
(declare-fun shared_lock_held () Bool)
(declare-fun captured_generation () Int)
(assert
 (let (($x29 (and (distinct next_generation generation) true)))
(let (($x15 (and (> generation 0) (> captured_generation 0) (> next_generation 0))))
(and $x15 shared_lock_held $x29))))
(check-sat)
