import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class RuntimeSecretConfigurationError extends Error {
  constructor(message = "WORKFLOW_RUNTIME_SECRET_KEY must be a base64-encoded 32-byte key") {
    super(message);
    this.name = "RuntimeSecretConfigurationError";
  }
}

export class RuntimeSecretDecryptionError extends Error {
  constructor() {
    super("Saved credentials cannot be decrypted");
    this.name = "RuntimeSecretDecryptionError";
  }
}

function keyFromEnvironment(encodedKey = process.env.WORKFLOW_RUNTIME_SECRET_KEY): Buffer {
  if (!encodedKey) throw new RuntimeSecretConfigurationError();
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new RuntimeSecretConfigurationError();
  return key;
}

function decodeEnvelopePart(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new RuntimeSecretDecryptionError();
  }
}

export function encryptRuntimePassword(plaintext: string, encodedKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromEnvironment(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptRuntimePassword(envelope: string, encodedKey?: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = envelope.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || encodedCiphertext === undefined || extra !== undefined) {
    throw new RuntimeSecretDecryptionError();
  }

  const iv = decodeEnvelopePart(encodedIv);
  const tag = decodeEnvelopePart(encodedTag);
  const ciphertext = decodeEnvelopePart(encodedCiphertext);
  if (iv.length !== 12 || tag.length !== 16) throw new RuntimeSecretDecryptionError();

  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFromEnvironment(encodedKey), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof RuntimeSecretConfigurationError) throw error;
    throw new RuntimeSecretDecryptionError();
  }
}
