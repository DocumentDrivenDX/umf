; benchmark generated from python API
(set-info :status unknown)
(declare-fun nested_0 () String)
(declare-fun direct_0 () String)
(declare-fun nested_1 () String)
(declare-fun direct_1 () String)
(declare-fun nested_2 () String)
(declare-fun direct_2 () String)
(declare-fun nested_3 () String)
(declare-fun direct_3 () String)
(declare-fun nested_4 () String)
(declare-fun direct_4 () String)
(declare-fun nested_5 () String)
(declare-fun direct_5 () String)
(declare-fun nested_6 () String)
(declare-fun direct_6 () String)
(declare-fun nested_7 () String)
(declare-fun direct_7 () String)
(declare-fun nested_8 () String)
(declare-fun direct_8 () String)
(declare-fun nested_equal_extra_state () String)
(declare-fun direct_equal_extra_state () String)
(declare-fun decide_post_tuple_and_state (String String String String String String String String String String) Bool)
(assert
 (= direct_0 nested_0))
(assert
 (= direct_1 nested_1))
(assert
 (= direct_2 nested_2))
(assert
 (= direct_3 nested_3))
(assert
 (= direct_4 nested_4))
(assert
 (= direct_5 nested_5))
(assert
 (= direct_6 nested_6))
(assert
 (= direct_7 nested_7))
(assert
 (= direct_8 nested_8))
(assert
 (= direct_equal_extra_state nested_equal_extra_state))
(assert
 (decide_post_tuple_and_state direct_0 direct_1 direct_2 direct_3 direct_4 direct_5 direct_6 direct_7 direct_8 direct_equal_extra_state))
(assert
 (let (($x68 (decide_post_tuple_and_state nested_0 nested_1 nested_2 nested_3 nested_4 nested_5 nested_6 nested_7 nested_8 nested_equal_extra_state)))
(not $x68)))
(check-sat)
