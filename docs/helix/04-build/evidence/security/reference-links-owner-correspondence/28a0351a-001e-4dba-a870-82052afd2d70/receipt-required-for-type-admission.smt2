; benchmark generated from python API
(set-info :status unknown)
(declare-datatypes ((FaithfulQualifiedOpaqueLink 0)) (((link (role Int) (module Int) (element Int) (opaque Int)))))
(declare-fun original_ordered_links () (Seq FaithfulQualifiedOpaqueLink))
(declare-fun references_present () Bool)
(declare-fun source_index () Int)
(declare-fun owner_index () Int)
(declare-fun verified_type_receipt () Bool)
(declare-fun admitted_type () Bool)
(assert
 (let ((?x30 (seq.len original_ordered_links)))
 (let (($x32 (= ?x30 0)))
 (let (($x29 (not references_present)))
 (=> $x29 $x32)))))
(assert
 (>= source_index 0))
(assert
 (>= owner_index 0))
(assert
 (=> admitted_type verified_type_receipt))
(assert
 admitted_type)
(assert
 (not verified_type_receipt))
(check-sat)
