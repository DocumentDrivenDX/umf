; benchmark generated from python API
(set-info :status unknown)
(declare-fun source_state () Int)
(declare-fun owner_state () Int)
(declare-fun source_card () Int)
(declare-fun owner_card () Int)
(assert
 (>= source_state 0))
(assert
 (<= source_state 5))
(assert
 (>= owner_state 0))
(assert
 (<= owner_state 5))
(assert
 (>= source_card 0))
(assert
 (<= source_card 5))
(assert
 (>= owner_card 0))
(assert
 (<= owner_card 5))
(assert
 (let (($x48 (= source_state 1)))
 (let (($x47 (= source_state 0)))
 (let (($x49 (or $x47 $x48)))
 (let (($x45 (= owner_state 1)))
 (let (($x43 (= owner_state 0)))
 (let (($x46 (or $x43 $x45)))
 (=> $x46 $x49))))))))
(assert
 (= source_state 0))
(assert
 (= owner_state 2))
(assert
 (let (($x45 (= owner_state 1)))
(let (($x43 (= owner_state 0)))
(let (($x46 (or $x43 $x45)))
(not $x46)))))
(check-sat)
