; benchmark generated from python API
(set-info :status unknown)
(declare-datatypes ((FaithfulQualifiedOpaqueLink 0)) (((link (role Int) (module Int) (element Int) (opaque Int)))))
(declare-fun original_ordered_links () (Seq FaithfulQualifiedOpaqueLink))
(declare-fun references_present () Bool)
(declare-fun source_index () Int)
(declare-fun owner_index () Int)
(declare-fun observed_present () Bool)
(declare-fun owner_ordered_links () (Seq FaithfulQualifiedOpaqueLink))
(declare-fun source_context () Int)
(declare-fun owner_context () Int)
(declare-fun original_target_path () Int)
(declare-fun owner_target_path () Int)
(declare-fun original_target_kind () Int)
(declare-fun owner_target_kind () Int)
(declare-fun original_target_kind_present () Bool)
(declare-fun owner_target_kind_present () Bool)
(declare-fun original_unknown_paths () (Seq Int))
(declare-fun owner_unknown_paths () (Seq Int))
(declare-fun source_copy () Int)
(declare-fun owner_copy () Int)
(declare-fun closed_result () Bool)
(declare-fun owner_target_element () Int)
(declare-fun owner_target_module () Int)
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
 (= observed_present references_present))
(assert
 (= owner_ordered_links original_ordered_links))
(assert
 (= owner_context source_context))
(assert
 (= owner_target_path original_target_path))
(assert
 (let (($x43 (= owner_target_kind original_target_kind)))
 (let (($x42 (= owner_target_kind_present original_target_kind_present)))
 (and $x42 (=> original_target_kind_present $x43)))))
(assert
 (= owner_unknown_paths original_unknown_paths))
(assert
 (= owner_copy source_copy))
(assert
 closed_result)
(assert
 (let ((?x26 (seq.nth original_ordered_links source_index)))
 (let ((?x50 (element ?x26)))
 (and (= owner_target_module (module ?x26)) (= owner_target_element ?x50)))))
(assert
 references_present)
(assert
 (let ((?x71 (seq.unit (link 1 2 3 4))))
 (let ((?x72 (seq.++ ?x71 ?x71)))
 (= original_ordered_links ?x72))))
(assert
 (= source_index 1))
(assert
 (= owner_index 0))
(check-sat)
