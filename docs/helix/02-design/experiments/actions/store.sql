-- Design feasibility harness only; not a production executor or authentication layer.
CREATE TABLE grants(tenant text, actor text, kind text, allowed boolean, PRIMARY KEY(tenant,actor));
CREATE TABLE clock(tenant text PRIMARY KEY, version bigint NOT NULL);
CREATE TABLE inventory(tenant text, id text, stock integer NOT NULL CHECK(stock>=0),
 version bigint NOT NULL, PRIMARY KEY(tenant,id));
CREATE TABLE orders(tenant text,id text,status text NOT NULL, PRIMARY KEY(tenant,id));
CREATE TABLE referenced(tenant text,id text,kind text,state text,PRIMARY KEY(tenant,id,kind));
CREATE TABLE deployments(tenant text,action text,revision text,PRIMARY KEY(tenant,action));
CREATE TABLE links(tenant text,order_id text,kind text,target text,PRIMARY KEY(tenant,order_id,kind,target),
 FOREIGN KEY(tenant,order_id) REFERENCES orders(tenant,id),
 FOREIGN KEY(tenant,target,kind) REFERENCES referenced(tenant,id,kind));
CREATE TABLE sentinel(tenant text PRIMARY KEY,value text NOT NULL);
CREATE TABLE outcomes(tenant text,actor text,action text,token text,fingerprint jsonb,
 expired boolean NOT NULL DEFAULT false,result jsonb NOT NULL,
 PRIMARY KEY(tenant,actor,action,token));
CREATE TABLE outbox(tenant text,version bigint,event jsonb NOT NULL,PRIMARY KEY(tenant,version));
CREATE TABLE projection(tenant text PRIMARY KEY,watermark bigint NOT NULL);

CREATE FUNCTION invoke_action(t text,a text,act text,k text,r text,inp jsonb,
 expected bigint DEFAULT NULL,fault text DEFAULT '',variant text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE prior outcomes%ROWTYPE; fp jsonb; result jsonb; token_scope text;
 allowed_now boolean; actor_kind text; available integer; resource_version bigint;
 commit_version bigint; noop boolean := false; sentinel_before text;
BEGIN
 -- Stable key namespace; revision is a checked payload. Mutant uses revision namespace.
 token_scope:=CASE WHEN variant='revision-namespace' THEN k||':'||r ELSE k END;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(t,a,act,token_scope)::text,0));
 fp:=jsonb_build_object('revision',r,'input',inp,'expectedVersion',expected);
 SELECT * INTO prior FROM outcomes WHERE tenant=t AND actor=a AND action=act AND token=token_scope;
 -- Mutation intentionally bypasses current authorization on replay.
 IF FOUND AND variant='stale-auth' THEN RETURN prior.result; END IF;
 SELECT allowed,kind INTO allowed_now,actor_kind FROM grants WHERE tenant=t AND actor=a FOR SHARE;
 IF allowed_now IS DISTINCT FROM true OR actor_kind IS DISTINCT FROM 'person' THEN
   RETURN jsonb_build_object('status','denied','code','AUTHORIZATION');
 END IF;
 IF prior.token IS NOT NULL THEN
   IF prior.expired THEN RETURN jsonb_build_object('status','expired','code','TOKEN_EXPIRED'); END IF;
   IF prior.fingerprint<>fp THEN RETURN jsonb_build_object('status','conflict','code','TOKEN_REUSE'); END IF;
   RETURN prior.result;
 END IF;
 -- Only current r2 admits a fresh invocation after deployment; caller stores retained r1 outcome.
 IF r IS DISTINCT FROM (SELECT revision FROM deployments WHERE tenant=t AND action=act) THEN RETURN jsonb_build_object('status','unsupported','code','REVISION'); END IF;
 -- Explicit per-tenant commit sequencer makes snapshot, business writes and result atomic.
 SELECT version INTO commit_version FROM clock WHERE tenant=t FOR UPDATE;
 IF fault='pause' THEN PERFORM pg_sleep(0.25); END IF;
 SELECT value INTO sentinel_before FROM sentinel WHERE tenant=t FOR UPDATE;
 IF act='reserve' THEN
   SELECT stock,version INTO available,resource_version FROM inventory WHERE tenant=t AND id=inp->>'product' FOR UPDATE;
   IF available IS NULL THEN result:=jsonb_build_object('status','rejected','code','MISSING_PRODUCT');
   ELSIF expected IS NOT NULL AND expected<>resource_version THEN
     result:=jsonb_build_object('status','conflict','code','EXPECTED_VERSION');
   ELSIF (inp->>'quantity')::integer<=0 THEN result:=jsonb_build_object('status','rejected','code','QUANTITY');
   ELSIF available<(inp->>'quantity')::integer THEN result:=jsonb_build_object('status','rejected','code','INSUFFICIENT');
   ELSE
     UPDATE inventory SET stock=stock-(inp->>'quantity')::integer,version=version+1 WHERE tenant=t AND id=inp->>'product';
     IF fault='after-stock' THEN
       IF variant='missing-rollback' THEN RETURN jsonb_build_object('status','failed','code','EXECUTION'); END IF;
       RAISE EXCEPTION 'Injected known rollback';
     END IF;
     IF fault='outside-frame' THEN
       UPDATE sentinel SET value='forbidden' WHERE tenant=t;
     END IF;
     INSERT INTO orders VALUES(t,inp->>'order','reserved');
   END IF;
 ELSIF act='create-link' THEN
   INSERT INTO orders VALUES(t,inp->>'order','created');
   INSERT INTO links VALUES(t,inp->>'order','customer',inp->>'customer'),(t,inp->>'order','product',inp->>'product');
 ELSIF act='approve' THEN
   SELECT status='approved' INTO noop FROM orders WHERE tenant=t AND id=inp->>'order' FOR UPDATE;
   IF noop IS NULL THEN result:=jsonb_build_object('status','rejected','code','MISSING_ORDER');
   ELSIF NOT noop THEN UPDATE orders SET status='approved' WHERE tenant=t AND id=inp->>'order'; END IF;
 ELSE
   RETURN jsonb_build_object('status','unsupported','code','ACTION');
 END IF;
 -- Independent precommit check for the named protected sentinel in this bounded profile.
 IF variant<>'frame-bypass' AND (SELECT value FROM sentinel WHERE tenant=t) IS DISTINCT FROM sentinel_before THEN
   RAISE EXCEPTION 'Observed write outside permitted business frame';
 END IF;
 IF result IS NULL THEN
   IF NOT noop THEN
     UPDATE clock SET version=version+1 WHERE tenant=t RETURNING version INTO commit_version;
     INSERT INTO outbox VALUES(t,commit_version,jsonb_build_object('action',act,'order',inp->>'order','revision',r));
   END IF;
   result:=jsonb_build_object('status','committed','version',commit_version,
     'receipt',jsonb_build_object('store','isolated-postgresql','tenant',t,'watermark',commit_version),
     'identities',jsonb_build_array(inp->>'order'),'noOp',noop);
 END IF;
 -- Terminal business rejection/conflict is stable; no business mutation committed.
 INSERT INTO outcomes(tenant,actor,action,token,fingerprint,result) VALUES(t,a,act,token_scope,fp,result);
 RETURN result;
END $$;
