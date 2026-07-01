import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PASSWORD_HASH_VERSION = "scrypt-v1";
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = {
  n: 16_384,
  r: 8,
  p: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derivePasswordHash(password, salt);

  return [
    PASSWORD_HASH_VERSION,
    `n=${SCRYPT_PARAMS.n}`,
    `r=${SCRYPT_PARAMS.r}`,
    `p=${SCRYPT_PARAMS.p}`,
    `len=${KEY_LENGTH}`,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;

  const candidate = await derivePasswordHash(password, parsed.salt);
  if (candidate.length !== parsed.hash.length) return false;

  return timingSafeEqual(candidate, parsed.hash);
}

async function derivePasswordHash(password: string, salt: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, {
      N: SCRYPT_PARAMS.n,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
    }, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Buffer.from(derivedKey));
    });
  });
}

function parseStoredHash(storedHash: string): { salt: Buffer; hash: Buffer } | null {
  const parts = storedHash.split("$");
  if (parts.length !== 7) return null;

  const [version, n, r, p, len, encodedSalt, encodedHash] = parts;
  if (version !== PASSWORD_HASH_VERSION) return null;
  if (n !== `n=${SCRYPT_PARAMS.n}`) return null;
  if (r !== `r=${SCRYPT_PARAMS.r}`) return null;
  if (p !== `p=${SCRYPT_PARAMS.p}`) return null;
  if (len !== `len=${KEY_LENGTH}`) return null;
  if (!encodedSalt || !encodedHash) return null;

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const hash = Buffer.from(encodedHash, "base64url");
    if (salt.length !== 16 || hash.length !== KEY_LENGTH) return null;
    return { salt, hash };
  } catch {
    return null;
  }
}
