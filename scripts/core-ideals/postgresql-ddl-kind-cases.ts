export const ddlKindCases=[
 {id:'qualified',sql:'-- retained comment\nCREATE TABLE sales.simple (id pg_catalog.int8, payload pg_catalog.text);\n',name:'simple',relation:'sales.simple',names:['id','payload'],namespace:'sales',expansion:false,nativeAccepted:true},
 {id:'domain-and-later-alter',sql:'CREATE DOMAIN sales.token AS integer;\nCREATE TABLE sales.changing (id sales.token, items integer[]);\nALTER TABLE sales.changing ADD COLUMN later text;\n',name:'changing',relation:'sales.changing',names:['id','items'],finalNames:['id','items','later'],namespace:'sales',expansion:false,nativeAccepted:true},
 {id:'schema-context',sql:'CREATE SCHEMA staged CREATE TABLE child (id integer);\n',name:'child',relation:'staged.child',names:['id'],namespace:'staged',expansion:false,nativeAccepted:true},
 {id:'search-path',sql:'CREATE TABLE local_table (id integer);\n',name:'local_table',relation:'sales.local_table',names:['id'],namespace:'',expansion:false,nativeAccepted:true},
 {id:'inheritance',sql:'CREATE TABLE sales.base (id integer); CREATE TABLE sales.child (extra text) INHERITS (sales.base);\n',name:'child',relation:'sales.child',names:['extra'],finalNames:['id','extra'],namespace:'sales',expansion:true,nativeAccepted:true},
 {id:'like',sql:'CREATE TABLE sales.like_copy (LIKE sales.simple);\n',name:'like_copy',relation:'sales.like_copy',names:[],finalNames:['id','payload'],namespace:'sales',expansion:true,nativeAccepted:true},
 {id:'duplicate',sql:'CREATE TABLE sales.duplicate (id integer, id text);\n',name:'duplicate',relation:'sales.duplicate',names:['id','id'],namespace:'sales',expansion:false,nativeAccepted:false},
];
