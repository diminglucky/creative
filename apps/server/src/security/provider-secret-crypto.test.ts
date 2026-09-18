import { describe, expect, it } from "vitest";

import { createProviderSecretCrypto } from "./provider-secret-crypto.js";

const key = Buffer.alloc(32, 7).toString("base64");

describe("provider secret crypto", () => {
  it("encrypts with authenticated random ciphertext and decrypts it", () => {
    const crypto = createProviderSecretCrypto(key);
    const first = crypto.encrypt("sk-cloud-secret");
    const second = crypto.encrypt("sk-cloud-secret");

    expect(first).toMatch(/^enc:v1:/);
    expect(first).not.toContain("sk-cloud-secret");
    expect(first).not.toBe(second);
    expect(crypto.decrypt(first)).toBe("sk-cloud-secret");
  });

  it("rejects tampered ciphertext", () => {
    const crypto = createProviderSecretCrypto(key);
    const encrypted = crypto.encrypt("sk-cloud-secret");
    expect(() => crypto.decrypt(`${encrypted.slice(0, -2)}AA`)).toThrow(
      "Unable to decrypt provider secret",
    );
  });

  it("requires a 32-byte base64 master key", () => {
    expect(() => createProviderSecretCrypto("short")).toThrow(
      "PROVIDER_SECRETS_ENCRYPTION_KEY",
    );
  });

  it("fails closed when the cloud master key is missing", () => {
    const crypto = createProviderSecretCrypto();
    expect(() => crypto.encrypt("secret")).toThrow(
      "PROVIDER_SECRETS_ENCRYPTION_KEY",
    );
  });

  it("identifies legacy plaintext without exposing it", () => {
    const crypto = createProviderSecretCrypto(key);
    expect(crypto.isEncrypted("plain-secret")).toBe(false);
    expect(crypto.mask("plain-secret")).toBe("••••cret");
    expect(crypto.mask(crypto.encrypt("plain-secret"))).toBe("已安全加密");
  });
});
