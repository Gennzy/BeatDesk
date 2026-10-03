import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const secret = process.env.PLATFORM_TOKEN_SECRET;

  if (!secret) {
    throw new Error("PLATFORM_TOKEN_SECRET не задан: токены площадок нельзя шифровать");
  }

  // любой длины секрет приводим к 32 байтам через sha256
  return createHash("sha256").update(secret).digest();
}

/** Шифрование токена площадки для хранения в БД. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

/** Расшифровка токена площадки. */
export function decryptSecret(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Повреждённый токен площадки");
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

export function isSecretConfigured(): boolean {
  return Boolean(process.env.PLATFORM_TOKEN_SECRET);
}
