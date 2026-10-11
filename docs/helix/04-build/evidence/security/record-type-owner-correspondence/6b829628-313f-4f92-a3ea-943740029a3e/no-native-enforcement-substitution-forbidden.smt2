; benchmark generated from python API
(set-info :status unknown)
(declare-datatypes ((FaithfulTypeLink 0)) (((link (role Int) (module Int) (element Int) (opaque Int)))))
(declare-fun authored_reference () FaithfulTypeLink)
(declare-fun source_links () (Seq FaithfulTypeLink))
(declare-fun authored_target_links () (Seq FaithfulTypeLink))
(declare-fun receipt_recomputed () Bool)
(declare-fun both_kind_receipts_verified () Bool)
(declare-fun current_links () (Seq FaithfulTypeLink))
(declare-fun receipt_target_context () Int)
(declare-fun current_context () Int)
(declare-fun authored_field_element () Int)
(declare-fun requested_element () Int)
(declare-fun authored_field_module () Int)
(declare-fun requested_module () Int)
(declare-fun observed_context () Int)
(declare-fun input_receipt () Int)
(declare-fun observed_receipt () Int)
(declare-fun observed_link () FaithfulTypeLink)
(declare-fun authored_path () Int)
(declare-fun observed_path () Int)
(declare-fun authored_record_path () Int)
(declare-fun observed_record_path () Int)
(declare-fun observed_target_element () Int)
(declare-fun observed_target_module () Int)
(declare-fun observed_index () Int)
(declare-fun closed_result () Bool)
(declare-fun receipt_consistency () Bool)
(declare-fun issuer_authority () Bool)
(declare-fun native_enforcement () Bool)
(declare-fun generic_type_assertion () Bool)
(assert
 (= (role authored_reference) 1))
(assert
 (= authored_target_links (seq.++ source_links (seq.unit authored_reference))))
(assert
 receipt_recomputed)
(assert
 both_kind_receipts_verified)
(assert
 (let (($x40 (= current_links authored_target_links)))
 (let (($x39 (= current_context receipt_target_context)))
 (and $x39 $x40))))
(assert
 (let (($x43 (= requested_element authored_field_element)))
 (let (($x42 (= requested_module authored_field_module)))
 (and $x42 $x43))))
(assert
 (= observed_context current_context))
(assert
 (= observed_receipt input_receipt))
(assert
 (= observed_link authored_reference))
(assert
 (= observed_path authored_path))
(assert
 (= observed_record_path authored_record_path))
(assert
 (let (($x53 (= observed_target_element (element authored_reference))))
 (let ((?x50 (module authored_reference)))
 (let (($x51 (= observed_target_module ?x50)))
 (and $x51 $x53)))))
(assert
 (let ((?x55 (seq.len source_links)))
 (= observed_index ?x55)))
(assert
 closed_result)
(assert
 receipt_consistency)
(assert
 (not issuer_authority))
(assert
 (not native_enforcement))
(assert
 (not generic_type_assertion))
(assert
 native_enforcement)
(check-sat)
