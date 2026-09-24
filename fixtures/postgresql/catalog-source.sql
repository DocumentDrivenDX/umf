--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4 (Debian 17.4-1.pgdg120+2)
-- Dumped by pg_dump version 17.4 (Debian 17.4-1.pgdg120+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: sales; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA sales;


ALTER SCHEMA sales OWNER TO postgres;

--
-- Name: code_order; Type: COLLATION; Schema: sales; Owner: postgres
--

CREATE COLLATION sales.code_order (provider = libc, locale = 'C');


ALTER COLLATION sales.code_order OWNER TO postgres;

--
-- Name: address; Type: TYPE; Schema: sales; Owner: postgres
--

CREATE TYPE sales.address AS (
	street text,
	postcode text
);


ALTER TYPE sales.address OWNER TO postgres;

--
-- Name: money_amount; Type: DOMAIN; Schema: sales; Owner: postgres
--

CREATE DOMAIN sales.money_amount AS numeric(38,9)
	CONSTRAINT money_amount_check CHECK ((VALUE >= (0)::numeric));


ALTER DOMAIN sales.money_amount OWNER TO postgres;

--
-- Name: order_state; Type: TYPE; Schema: sales; Owner: postgres
--

CREATE TYPE sales.order_state AS ENUM (
    'new',
    'paid',
    'cancelled'
);


ALTER TYPE sales.order_state OWNER TO postgres;

--
-- Name: price_span; Type: TYPE; Schema: sales; Owner: postgres
--

CREATE TYPE sales.price_span AS RANGE (
    subtype = numeric,
    multirange_type_name = sales.price_spans
);


ALTER TYPE sales.price_span OWNER TO postgres;

--
-- Name: text; Type: DOMAIN; Schema: sales; Owner: postgres
--

CREATE DOMAIN sales.text AS integer
	CONSTRAINT text_check CHECK ((VALUE >= 0));


ALTER DOMAIN sales.text OWNER TO postgres;

--
-- Name: echo_text(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.echo_text(value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$ SELECT value $$;


ALTER FUNCTION public.echo_text(value text) OWNER TO postgres;

--
-- Name: normalize_inventory(); Type: FUNCTION; Schema: sales; Owner: postgres
--

CREATE FUNCTION sales.normalize_inventory() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 NEW.normalized := upper(NEW.code);
 RETURN NEW;
END
$$;


ALTER FUNCTION sales.normalize_inventory() OWNER TO postgres;

SET default_tablespace = '';

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    at timestamp with time zone NOT NULL,
    payload jsonb
)
PARTITION BY RANGE (at);


ALTER TABLE public.events OWNER TO postgres;

SET default_table_access_method = heap;

--
-- Name: events_2026; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events_2026 (
    at timestamp with time zone NOT NULL,
    payload jsonb
);


ALTER TABLE public.events_2026 OWNER TO postgres;

--
-- Name: recent_events; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.recent_events AS
 SELECT at,
    payload
   FROM public.events
  WHERE (at > (now() - '1 day'::interval));


ALTER VIEW public.recent_events OWNER TO postgres;

--
-- Name: inventory; Type: TABLE; Schema: sales; Owner: postgres
--

CREATE TABLE sales.inventory (
    code text NOT NULL COLLATE sales.code_order,
    address sales.address,
    prices sales.price_span,
    history sales.price_spans,
    normalized text
);


ALTER TABLE sales.inventory OWNER TO postgres;

--
-- Name: inventory_totals; Type: MATERIALIZED VIEW; Schema: sales; Owner: postgres
--

CREATE MATERIALIZED VIEW sales.inventory_totals AS
 SELECT count(*) AS total
   FROM sales.inventory
  WITH NO DATA;


ALTER MATERIALIZED VIEW sales.inventory_totals OWNER TO postgres;

--
-- Name: order_lines; Type: TABLE; Schema: sales; Owner: postgres
--

CREATE TABLE sales.order_lines (
    order_id bigint NOT NULL,
    line_no integer NOT NULL,
    quantity integer,
    CONSTRAINT order_lines_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE sales.order_lines OWNER TO postgres;

--
-- Name: orders; Type: TABLE; Schema: sales; Owner: postgres
--

CREATE TABLE sales.orders (
    id bigint NOT NULL,
    external_id uuid NOT NULL,
    state sales.order_state DEFAULT 'new'::sales.order_state NOT NULL,
    total sales.money_amount DEFAULT 9007199254740993.123456789,
    details jsonb,
    tags text[] DEFAULT ARRAY[]::text[],
    created_at timestamp with time zone DEFAULT now(),
    subtotal numeric GENERATED ALWAYS AS (((total)::numeric / 1.2)) STORED,
    CONSTRAINT positive_total CHECK (((total)::numeric >= (0)::numeric))
);


ALTER TABLE sales.orders OWNER TO postgres;

--
-- Name: COLUMN orders.total; Type: COMMENT; Schema: sales; Owner: postgres
--

COMMENT ON COLUMN sales.orders.total IS 'Exact amount — café';


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: sales; Owner: postgres
--

ALTER TABLE sales.orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME sales.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: row_encodings; Type: TABLE; Schema: sales; Owner: postgres
--

CREATE TABLE sales.row_encodings (
    id integer NOT NULL,
    active boolean NOT NULL,
    optional_flag boolean,
    nullable_json jsonb,
    required_json jsonb NOT NULL,
    label text,
    small_value smallint NOT NULL
);


ALTER TABLE sales.row_encodings OWNER TO postgres;

--
-- Name: scalar_types; Type: TABLE; Schema: sales; Owner: postgres
--

CREATE TABLE sales.scalar_types (
    flag boolean,
    small smallint,
    ordinary integer,
    large bigint,
    exact numeric(20,4),
    single real,
    wide double precision,
    words text,
    bounded character varying(20),
    padded character(4),
    data bytea,
    day date,
    clock time(3) without time zone,
    zoned_clock time with time zone,
    local_stamp timestamp(6) without time zone,
    instant timestamp with time zone,
    items integer[],
    domain_value sales.text,
    document jsonb,
    identifier uuid
);


ALTER TABLE sales.scalar_types OWNER TO postgres;

--
-- Name: COLUMN scalar_types.exact; Type: COMMENT; Schema: sales; Owner: postgres
--

COMMENT ON COLUMN sales.scalar_types.exact IS 'Exact amount with native precision and scale';


--
-- Name: ticket_numbers; Type: SEQUENCE; Schema: sales; Owner: postgres
--

CREATE SEQUENCE sales.ticket_numbers
    START WITH 9007199254740993
    INCREMENT BY 3
    NO MINVALUE
    NO MAXVALUE
    CACHE 2;


ALTER SEQUENCE sales.ticket_numbers OWNER TO postgres;

--
-- Name: events_2026; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events ATTACH PARTITION public.events_2026 FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: sales; Owner: postgres
--

ALTER TABLE ONLY sales.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (code);


--
-- Name: order_lines order_lines_pkey; Type: CONSTRAINT; Schema: sales; Owner: postgres
--

ALTER TABLE ONLY sales.order_lines
    ADD CONSTRAINT order_lines_pkey PRIMARY KEY (order_id, line_no);


--
-- Name: orders orders_external_id_key; Type: CONSTRAINT; Schema: sales; Owner: postgres
--

ALTER TABLE ONLY sales.orders
    ADD CONSTRAINT orders_external_id_key UNIQUE (external_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: sales; Owner: postgres
--

ALTER TABLE ONLY sales.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: row_encodings row_encodings_pkey; Type: CONSTRAINT; Schema: sales; Owner: postgres
--

ALTER TABLE ONLY sales.row_encodings
    ADD CONSTRAINT row_encodings_pkey PRIMARY KEY (id);


--
-- Name: inventory_totals_unique; Type: INDEX; Schema: sales; Owner: postgres
--

CREATE UNIQUE INDEX inventory_totals_unique ON sales.inventory_totals USING btree (total);


--
-- Name: paid_orders; Type: INDEX; Schema: sales; Owner: postgres
--

CREATE INDEX paid_orders ON sales.orders USING btree (created_at DESC) WHERE (state = 'paid'::sales.order_state);


--
-- Name: inventory normalize_inventory; Type: TRIGGER; Schema: sales; Owner: postgres
--

CREATE TRIGGER normalize_inventory BEFORE INSERT OR UPDATE OF code ON sales.inventory FOR EACH ROW EXECUTE FUNCTION sales.normalize_inventory();


--
-- Name: TRIGGER normalize_inventory ON inventory; Type: COMMENT; Schema: sales; Owner: postgres
--

COMMENT ON TRIGGER normalize_inventory ON sales.inventory IS 'Normalize display code — retain trigger intent';


--
-- Name: order_lines order_lines_order_id_fkey; Type: FK CONSTRAINT; Schema: sales; Owner: postgres
--

ALTER TABLE ONLY sales.order_lines
    ADD CONSTRAINT order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES sales.orders(id) ON DELETE CASCADE;


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events visible_events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY visible_events ON public.events FOR SELECT USING (((payload ->> 'tenant'::text) = CURRENT_USER));


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.events TO PUBLIC;


--
-- PostgreSQL database dump complete
--

