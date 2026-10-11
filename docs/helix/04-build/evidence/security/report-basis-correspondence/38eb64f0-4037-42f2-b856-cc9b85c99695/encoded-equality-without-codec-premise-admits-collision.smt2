; benchmark generated from python API
(set-info :status unknown)
(declare-sort OriginalBytes 0)
(declare-fun encoded_basis_after () OriginalBytes)
(declare-fun encoded_basis_before () OriginalBytes)
(declare-fun documents_after () OriginalBytes)
(declare-fun documents_before () OriginalBytes)
(declare-fun binding_after () OriginalBytes)
(declare-fun binding_before () OriginalBytes)
(declare-fun input_after () OriginalBytes)
(declare-fun input_before () OriginalBytes)
(assert
 (= encoded_basis_before encoded_basis_after))
(assert
 (let (($x39 (and (distinct documents_before documents_after) true)))
(let (($x38 (and (distinct binding_before binding_after) true)))
(let (($x37 (and (distinct input_before input_after) true)))
(or $x37 $x38 $x39)))))
(check-sat)
