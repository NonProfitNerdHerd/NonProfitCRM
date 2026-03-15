import crypto from "crypto";

const ENCRYPTED_SECRET_PREFIX = "enc:v1";
const PLAIN_SECRET_PREFIX = "plain:v1";

function getSecretKeyMaterial() {
  return (
    process.env.INTEGRATIONS_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function deriveKey(material: string) {
  return crypto.createHash("sha256").update(material).digest();
}

export function encryptIntegrationSecret(value: string) {
  const keyMaterial = getSecretKeyMaterial();
  if (!keyMaterial) {
    return `${PLAIN_SECRET_PREFIX}:${Buffer.from(value, "utf8").toString("base64")}`;
  }
  const iv = crypto.randomBytes(12);
  const key = deriveKey(keyMaterial);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_SECRET_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptIntegrationSecret(value: string) {
  if (value.startsWith(`${PLAIN_SECRET_PREFIX}:`)) {
    const [, raw] = value.split(":");
    return Buffer.from(raw, "base64").toString("utf8");
  }
  if (!value.startsWith(`${ENCRYPTED_SECRET_PREFIX}:`)) {
    return value;
  }
  const [, ivB64, tagB64, encryptedB64] = value.split(":");
  const keyMaterial = getSecretKeyMaterial();
  if (!keyMaterial) {
    throw new Error("Missing encryption key material for integration secrets.");
  }
  const key = deriveKey(keyMaterial);
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
