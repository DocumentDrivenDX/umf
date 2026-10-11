; benchmark generated from python API
(set-info :status unknown)
(declare-sort FaithfulOrderedQualifiedMemberList 0)
(declare-fun owner_state () Int)
(declare-fun explicit_record () Bool)
(declare-fun members_present () Bool)
(declare-fun opaque_member_qualifier () Bool)
(declare-fun original_context () Int)
(declare-fun owner_context () Int)
(declare-fun observed_members () FaithfulOrderedQualifiedMemberList)
(declare-fun original_members () FaithfulOrderedQualifiedMemberList)
(declare-fun owner_source_carrier () Int)
(declare-fun original_source_carrier () Int)
(declare-fun closed_owner_result () Bool)
(assert
 (>= owner_state 0))
(assert
 (<= owner_state 3))
(assert
 (=> members_present explicit_record))
(assert
 (=> opaque_member_qualifier members_present))
(assert
 (let ((?x17 (ite opaque_member_qualifier 1 0)))
 (let (($x14 (not members_present)))
 (let (($x13 (not explicit_record)))
 (= owner_state (ite $x13 3 (ite $x14 2 ?x17)))))))
(assert
 (= owner_context original_context))
(assert
 (let (($x33 (= original_members observed_members)))
 (=> members_present $x33)))
(assert
 (= original_source_carrier owner_source_carrier))
(assert
 closed_owner_result)
(assert
 (not explicit_record))
(assert
 (= owner_state 0))
(check-sat)
