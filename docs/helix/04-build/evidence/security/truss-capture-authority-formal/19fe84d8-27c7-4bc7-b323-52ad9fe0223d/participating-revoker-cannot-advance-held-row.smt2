; benchmark generated from python API
(set-info :status unknown)
(declare-fun generation () Int)
(declare-fun next_generation () Int)
(declare-fun shared_lock_held () Bool)
(declare-fun captured_generation () Int)
(assert
 (let (($x30 (> next_generation generation)))
(let (($x15 (and (> generation 0) (> captured_generation 0) (> next_generation 0))))
(and $x15 shared_lock_held (=> shared_lock_held (= next_generation generation)) $x30))))
(check-sat)
