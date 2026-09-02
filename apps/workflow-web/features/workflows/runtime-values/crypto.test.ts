import { expect, test } from "bun:test";

import {
  RuntimeSecretConfigurationError,
  RuntimeSecretDecryptionError,
  decryptRuntimePassword,
  encryptRuntimePassword,
} from "./crypto";

const key = Buffer.alloc(32, 7).toString("base64");
const otherKey = Buffer.alloc(32, 8).toString("base64");

test("encrypts passwords with a random authenticated envelope", () => {
  const first = encryptRuntimePassword("internal-password", key);
  const second = encryptRuntimePassword("internal-password", key);

  expect(first).toStartWith("v1.");
  expect(first).not.toContain("internal-password");
  expect(first).not.toBe(second);
  expect(decryptRuntimePassword(first, key)).toBe("internal-password");
});

test("rejects malformed configuration and tampered ciphertext", () => {
  expect(() => encryptRuntimePassword("value", "not-a-32-byte-key")).toThrow(RuntimeSecretConfigurationError);
  const envelope = encryptRuntimePassword("value", key);
  expect(() => decryptRuntimePassword(envelope, otherKey)).toThrow(RuntimeSecretDecryptionError);
  expect(() => decryptRuntimePassword("v1.bad", key)).toThrow(RuntimeSecretDecryptionError);
});

test("round-trips an explicitly empty internal password", () => {
  expect(decryptRuntimePassword(encryptRuntimePassword("", key), key)).toBe("");
});
