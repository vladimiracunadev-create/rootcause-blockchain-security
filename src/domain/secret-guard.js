const EXTENDED_PRIVATE_KEY = /\b(?:xprv|tprv)[1-9A-HJ-NP-Za-km-z]{40,}\b/;
const WIF_PRIVATE_KEY = /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/;
const PEM_PRIVATE_KEY = /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/;
const CREDENTIAL_URL = /https?:\/\/[^\s/:]+:[^\s/@]+@/i;

function compactKey(key) {
  return String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isForbiddenKey(key) {
  const compact = compactKey(key);
  return [
    "privatekey",
    "signingkey",
    "secret",
    "password",
    "mnemonic",
    "seed",
    "seedphrase",
    "recoveryphrase",
    "recoverywords",
    "keystore",
    "walletbackup",
    "xprv",
    "tprv",
    "wif",
    "rawsignedtransaction",
    "rpcpassword",
    "authorization",
    "authtoken",
    "accesstoken",
    "refreshtoken",
    "clientsecret",
    "apikey"
  ].some((token) => compact.includes(token));
}

function containsSecretLikeString(value) {
  return [EXTENDED_PRIVATE_KEY, WIF_PRIVATE_KEY, PEM_PRIVATE_KEY, CREDENTIAL_URL].some(
    (pattern) => pattern.test(value)
  );
}

export class SecretMaterialError extends Error {
  constructor(message = "Secret material is not accepted by this application.") {
    super(message);
    this.name = "SecretMaterialError";
    this.statusCode = 422;
    this.code = "SECRET_MATERIAL_REJECTED";
  }
}

export function assertNoSecretMaterial(value, path = "request") {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (containsSecretLikeString(value)) {
      throw new SecretMaterialError("Private or credential-like material was rejected.");
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretMaterial(entry, path + "[" + index + "]"));
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (isForbiddenKey(key)) {
        throw new SecretMaterialError("Forbidden secret field rejected at " + path + "." + key);
      }
      assertNoSecretMaterial(entry, path + "." + key);
    }
  }
}

export function redactForAudit(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (containsSecretLikeString(value)) return "[REDACTED]";
    return value.length > 512 ? value.slice(0, 512) + "…" : value;
  }
  if (Array.isArray(value)) return value.map(redactForAudit);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        isForbiddenKey(key) ? "[REDACTED]" : redactForAudit(entry)
      ])
    );
  }
  return value;
}
