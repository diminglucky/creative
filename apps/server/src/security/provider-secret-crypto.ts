import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const PREFIX = "enc:v1";

export type ProviderSecretCrypto = ReturnType<typeof createProviderSecretCrypto>;

export function createProviderSecretCrypto(encodedMasterKey?: string) {
  const key = encodedMasterKey ? decodeMasterKey(encodedMasterKey) : undefined;

  return {
    encrypt(secret: string): string {
      if (!key) throw missingKeyError();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(PREFIX));
      const ciphertext = Buffer.concat([
        cipher.update(secret, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return [PREFIX, iv, tag, ciphertext]
        .map((part) =>
          Buffer.isBuffer(part) ? part.toString("base64url") : part,
        )
        .join(":");
    },

    decrypt(stored: string): string {
      if (!stored.startsWith(`${PREFIX}:`)) return stored;
      if (!key) throw missingKeyError();
      try {
        const [, , ivText, tagText, ciphertextText] = stored.split(":");
        if (!ivText || !tagText || !ciphertextText) throw new Error("invalid");
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          Buffer.from(ivText, "base64url"),
        );
        decipher.setAAD(Buffer.from(PREFIX));
        decipher.setAuthTag(Buffer.from(tagText, "base64url"));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertextText, "base64url")),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new Error("Unable to decrypt provider secret.");
      }
    },

    isEncrypted(stored: string): boolean {
      return stored.startsWith(`${PREFIX}:`);
    },

    mask(stored: string): string {
      return stored.startsWith(`${PREFIX}:`)
        ? "已安全加密"
        : `••••${stored.slice(-4)}`;
    },
  };
}

function missingKeyError() {
  return new Error(
    "PROVIDER_SECRETS_ENCRYPTION_KEY is required for encrypted provider secrets.",
  );
}

function decodeMasterKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error(
      "PROVIDER_SECRETS_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64.",
    );
  }
  return key;
}
