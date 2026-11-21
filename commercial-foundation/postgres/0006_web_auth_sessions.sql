-- Encrypted, persistent OAuth transactions and opaque web sessions.
-- Tables are owner-only; commercial_runtime can use only the narrow functions below.
CREATE TABLE commercial_auth_transactions (
  state_digest text PRIMARY KEY,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  tag text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state_digest ~ '^[A-Za-z0-9_-]{43}$')
);
CREATE INDEX commercial_auth_transactions_expiry ON commercial_auth_transactions(expires_at);

CREATE TABLE commercial_web_sessions (
  cookie_digest text PRIMARY KEY,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  tag text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cookie_digest ~ '^[0-9a-f]{64}$')
);
CREATE INDEX commercial_web_sessions_expiry ON commercial_web_sessions(expires_at);

REVOKE ALL ON commercial_auth_transactions,commercial_web_sessions FROM PUBLIC,commercial_runtime;

CREATE FUNCTION commercial_auth_transaction_put(p_state text,p_ciphertext text,p_iv text,p_tag text,p_expires timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  INSERT INTO commercial_auth_transactions(state_digest,ciphertext,iv,tag,expires_at)
  VALUES(p_state,p_ciphertext,p_iv,p_tag,p_expires)
$$;
CREATE FUNCTION commercial_auth_transaction_consume(p_state text)
RETURNS TABLE(ciphertext text,iv text,tag text) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DELETE FROM commercial_auth_transactions
  WHERE state_digest=p_state AND expires_at>now()
  RETURNING commercial_auth_transactions.ciphertext,commercial_auth_transactions.iv,commercial_auth_transactions.tag
$$;
CREATE FUNCTION commercial_web_session_put(p_digest text,p_ciphertext text,p_iv text,p_tag text,p_expires timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  INSERT INTO commercial_web_sessions(cookie_digest,ciphertext,iv,tag,expires_at)
  VALUES(p_digest,p_ciphertext,p_iv,p_tag,p_expires)
$$;
CREATE FUNCTION commercial_web_session_get(p_digest text)
RETURNS TABLE(ciphertext text,iv text,tag text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT s.ciphertext,s.iv,s.tag FROM commercial_web_sessions s
  WHERE s.cookie_digest=p_digest AND s.expires_at>now()
$$;
CREATE FUNCTION commercial_web_session_delete(p_digest text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DELETE FROM commercial_web_sessions WHERE cookie_digest=p_digest
$$;

REVOKE ALL ON FUNCTION commercial_auth_transaction_put(text,text,text,text,timestamptz),commercial_auth_transaction_consume(text),commercial_web_session_put(text,text,text,text,timestamptz),commercial_web_session_get(text),commercial_web_session_delete(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial_auth_transaction_put(text,text,text,text,timestamptz),commercial_auth_transaction_consume(text),commercial_web_session_put(text,text,text,text,timestamptz),commercial_web_session_get(text),commercial_web_session_delete(text) TO commercial_runtime;
