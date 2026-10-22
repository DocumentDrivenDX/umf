; benchmark generated from python API
(set-info :status unknown)
(declare-fun blind_granted () Bool)
(declare-fun blind_declared () Bool)
(declare-fun effective_original_read () Bool)
(declare-fun ordinary_Field () Bool)
(declare-fun ordinary_update () Bool)
(assert
 (let (($x14 (or effective_original_read (and blind_declared blind_granted))))
(let (($x15 (and ordinary_update ordinary_Field $x14)))
(let (($x56 (not blind_declared)))
(let (($x16 (not effective_original_read)))
(and ordinary_update ordinary_Field $x16 blind_granted $x56 (= (ite $x15 1 0) 1)))))))
(check-sat)
