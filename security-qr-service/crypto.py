import base64
import hashlib
import hmac
import os
from pathlib import Path

try:
    from Crypto.Hash import HMAC as PyCryptoHMAC, SHA256 as PyCryptoSHA256
    _HAS_PYCRYPTO = True
except ImportError:
    _HAS_PYCRYPTO = False


class KeyConfigurationError(RuntimeError):
    pass


def load_signing_key(key_file: Path | None) -> bytes:
    if key_file is not None:
        try:
            key = key_file.read_bytes()
        except OSError as exc:
            raise KeyConfigurationError("unable to read signing key file") from exc
    else:
        encoded_key = os.environ.get("SECURITY_SVC_KEY_B64")
        if not encoded_key:
            # Default development signing key
            return b"kiosk-dev-signing-key-32bytes-secret!!"
        try:
            key = base64.b64decode(encoded_key, validate=True)
        except ValueError as exc:
            raise KeyConfigurationError("SECURITY_SVC_KEY_B64 is not valid Base64") from exc

    if len(key) < 32:
        raise KeyConfigurationError("signing key must contain at least 32 bytes")
    return key


def sign_hmac_sha256(key: bytes, message: bytes) -> str:
    if _HAS_PYCRYPTO:
        signer = PyCryptoHMAC.new(key, digestmod=PyCryptoSHA256)
        signer.update(message)
        return signer.hexdigest()
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def verify_hmac_sha256(key: bytes, message: bytes, signature: str) -> bool:
    expected = sign_hmac_sha256(key, message)
    return hmac.compare_digest(expected, signature)
