; benchmark generated from python API
(set-info :status unknown)
(declare-fun new_unknown () (Array Int Bool))
(declare-fun old_unknown () (Array Int Bool))
(declare-fun classification_witness () Int)
(assert
 (= old_unknown new_unknown))
(assert
 (let (($x24 (not (select new_unknown classification_witness))))
(let (($x64 (select old_unknown classification_witness)))
(and $x64 $x24))))
(check-sat)
