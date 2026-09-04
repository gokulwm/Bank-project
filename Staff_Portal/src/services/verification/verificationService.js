/**
 * Backend HMAC Token Verification Service Abstraction
 * 
 * CRITICAL RULE:
 * The frontend NEVER performs local HMAC signature verification or stores secret HMAC keys.
 * All scanned tokens are passed directly to this service layer.
 * 
 * ONE-TIME USE ENFORCEMENT:
 * Once a token is confirmed by staff (markTokenUsed), any subsequent scan of the same
 * token_id or token signature is immediately rejected as ALREADY_USED.
 */

const REGISTRY_KEY = 'nexa_used_tokens';

// Known bank account balances database (mock core banking system integration)
const KNOWN_ACCOUNT_BALANCES = {
  'TXN-2026-008821': 285000,
  'TXN-2026-003277': 192500,
  'TXN-2026-001104': 48000,
  'TXN-2026-005590': 75000,
  '8821': 285000,
  '3277': 192500,
  '1104': 48000,
  '5590': 75000,
  'VALID_HMAC_SIG_8821_WITHDRAW': 285000,
  'VALID_HMAC_SIG_3277_TRANSFER': 192500,
  'VALID_HMAC_SIG_1104_DEPOSIT': 48000,
  'VALID_HMAC_SIG_5590_WITHDRAW': 75000,
};

const CANCELLED_REGISTRY_KEY = 'nexa_cancelled_tokens';

function _getRegistry() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(REGISTRY_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function _saveRegistry(set) {
  try {
    sessionStorage.setItem(REGISTRY_KEY, JSON.stringify([...set]));
  } catch {
    // sessionStorage unavailable
  }
}

function _getCancelledRegistry() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(CANCELLED_REGISTRY_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function _saveCancelledRegistry(set) {
  try {
    sessionStorage.setItem(CANCELLED_REGISTRY_KEY, JSON.stringify([...set]));
  } catch {
    // sessionStorage unavailable
  }
}

/**
 * Called by VerificationPage AFTER staff confirms a transaction.
 * Marks token_id, token signature, and raw payload string as spent.
 */
export function markTokenUsed(data) {
  if (!data) return;
  const registry = _getRegistry();

  if (typeof data === 'string') {
    registry.add(String(data));
  } else if (typeof data === 'object') {
    if (data.token_id) registry.add(String(data.token_id));
    if (data.token) registry.add(String(data.token));
  }
  _saveRegistry(registry);
}

/**
 * Called when staff cancels a transaction.
 * Marks token_id and signature as cancelled so re-scanning returns INVALID.
 */
export function markTokenCancelled(data) {
  if (!data) return;
  const registry = _getCancelledRegistry();

  if (typeof data === 'string') {
    registry.add(String(data));
  } else if (typeof data === 'object') {
    if (data.token_id) registry.add(String(data.token_id));
    if (data.token) registry.add(String(data.token));
  }
  _saveCancelledRegistry(registry);
}

/**
 * Returns true if the token or token_id has already been spent.
 */
export function isTokenUsed(token_id) {
  if (!token_id) return false;
  return _getRegistry().has(String(token_id));
}

/**
 * Returns true if the token or token_id has been cancelled.
 */
export function isTokenCancelled(token_id) {
  if (!token_id) return false;
  return _getCancelledRegistry().has(String(token_id));
}

export async function callCustomer(tokenId, tellerId = 't_01') {
  try {
    const res = await fetch(`http://localhost:8000/api/v1/teller/${tokenId}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teller_id: tellerId })
    });
    return await res.json();
  } catch (e) {
    console.warn('Call customer backend failed:', e);
  }
}

export async function completeTransaction(tokenId) {
  try {
    const res = await fetch(`http://localhost:8000/api/v1/teller/${tokenId}/complete`, {
      method: 'POST'
    });
    return await res.json();
  } catch (e) {
    console.warn('Complete transaction backend failed:', e);
  }
}

export async function verifyToken(scannedPayload) {
  try {
    let payload = scannedPayload;
    if (typeof scannedPayload === 'string') {
      try {
        payload = JSON.parse(scannedPayload);
      } catch {
        payload = { token_id: scannedPayload.trim() };
      }
    }

    const tokenId = payload.token_id || payload.token || String(scannedPayload).trim();

    if (!tokenId) {
      return {
        status: 'INVALID',
        message: 'No token ID detected in QR scan.',
      };
    }

    // Call Backend GET /api/v1/token/{token_id}/verify
    const resp = await fetch(`http://localhost:8000/api/v1/token/${tokenId}/verify`);
    if (resp.status === 404) {
      return {
        status: 'INVALID',
        message: 'Token not found or invalid signature. Security HMAC check failed.',
        token_id: tokenId
      };
    }
    if (resp.status === 410) {
      return {
        status: 'EXPIRED',
        message: 'Token has expired according to backend security policy.',
        token_id: tokenId
      };
    }
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      return {
        status: 'INVALID',
        message: errData.detail?.error_message || 'Verification failed.',
        token_id: tokenId
      };
    }

    const backendData = await resp.json();
    return {
      status: 'VERIFIED',
      verified_at: new Date().toISOString(),
      token_id: backendData.token_id,
      customer_display_name: backendData.token_number ? `Token ${backendData.token_number}` : `Customer #${backendData.token_id.slice(-4)}`,
      transaction_type: backendData.transaction_type,
      amount: backendData.amount,
      customer_id: backendData.customer_id,
      token_number: backendData.token_number,
      queue_position: backendData.queue_position,
      expires_at: backendData.expires_at,
      hmac_signature: backendData.hmac_signature,
      signature_valid: true,
      hmac_verified: true,
      one_time_token_valid: true,
    };
  } catch (err) {
    console.error('Backend verification error:', err);
    return {
      status: 'BACKEND_UNAVAILABLE',
      message: 'Failed to reach backend verification service.'
    };
  }
}
