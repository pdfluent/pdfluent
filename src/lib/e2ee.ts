// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
const PBKDF2_ITERATIONS = 200_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

interface EncryptedEnvelopeV1 {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const passphraseKey = await crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations,
    },
    passphraseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(
  bytes: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  if (!passphrase) {
    throw new Error("A passphrase is required for encryption.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(bytes),
  );

  const encrypted = new Uint8Array(encryptedBuffer);
  const envelope: EncryptedEnvelopeV1 = {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    saltBase64: toBase64(salt),
    ivBase64: toBase64(iv),
    ciphertextBase64: toBase64(encrypted),
  };

  return TEXT_ENCODER.encode(JSON.stringify(envelope));
}

export async function decryptBytes(
  bytes: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  if (!passphrase) {
    throw new Error("A passphrase is required for decryption.");
  }

  let envelope: EncryptedEnvelopeV1;
  try {
    const parsed: unknown = JSON.parse(TEXT_DECODER.decode(bytes));
    envelope = parsed as EncryptedEnvelopeV1;
  } catch {
    throw new Error("Invalid encrypted payload format.");
  }

  if (
    envelope.version !== 1 ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    typeof envelope.iterations !== "number" ||
    typeof envelope.saltBase64 !== "string" ||
    typeof envelope.ivBase64 !== "string" ||
    typeof envelope.ciphertextBase64 !== "string"
  ) {
    throw new Error("Unsupported encrypted payload version.");
  }

  const salt = fromBase64(envelope.saltBase64);
  const iv = fromBase64(envelope.ivBase64);
  const ciphertext = fromBase64(envelope.ciphertextBase64);
  const key = await deriveKey(passphrase, salt, envelope.iterations);

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
      },
      key,
      toArrayBuffer(ciphertext),
    );

    return new Uint8Array(decrypted);
  } catch {
    throw new Error("Unable to decrypt payload. Check your passphrase.");
  }
}
