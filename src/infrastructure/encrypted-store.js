// Persistencia del estado: un único archivo JSON cifrado, o memoria pura.
//
// Los dos almacenes cumplen el mismo contrato implícito —load() y save()— y por
// eso elegir entre uno y otro es una decisión de una línea en el arranque.
//
// La escritura es atómica: se cifra en memoria, se escribe en un temporal cuyo
// nombre incluye el PID —para que dos procesos no colisionen en él— y el último
// paso es un rename, que en el mismo sistema de archivos no se interrumpe a
// medias. Si el proceso muere durante la escritura, sobrevive el estado anterior
// íntegro.
//
// En la lectura, la ÚNICA condición que se convierte en "empieza de cero" es que
// el archivo no exista. Un fallo de descifrado o un JSON corrupto se propagan y
// detienen el arranque: caer a un estado vacío tras un fallo de descifrado
// equivaldría a borrar el inventario del operador en silencio.
//
// MemoryStore clona en ambas direcciones para que el modo de demostración se
// comporte igual que el persistente y las pruebas signifiquen lo mismo.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";

export function decodeDataKey(value) {
  if (!value) throw new Error("A data-encryption key is required.");
  if (Buffer.isBuffer(value)) {
    if (value.length !== 32) {
      throw new Error("ROOTCAUSE_DATA_KEY must decode to exactly 32 bytes.");
    }
    return Buffer.from(value);
  }
  const input = String(value).trim();
  const key = /^[0-9a-f]{64}$/i.test(input)
    ? Buffer.from(input, "hex")
    : Buffer.from(input, "base64");
  if (key.length !== 32) {
    throw new Error("ROOTCAUSE_DATA_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function encryptJson(value, keyInput) {
  const key = Buffer.isBuffer(keyInput) ? keyInput : decodeDataKey(keyInput);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decryptJson(envelope, keyInput) {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== ALGORITHM) {
    throw new Error("Unsupported encrypted state envelope.");
  }
  const key = Buffer.isBuffer(keyInput) ? keyInput : decodeDataKey(keyInput);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(envelope.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

export class MemoryStore {
  constructor(initialState) {
    this.state = structuredClone(initialState);
  }

  async load() {
    return structuredClone(this.state);
  }

  async save(nextState) {
    this.state = structuredClone(nextState);
  }
}

export class EncryptedFileStore {
  constructor(filePath, dataKey, initialState) {
    this.filePath = filePath;
    this.key = decodeDataKey(dataKey);
    this.initialState = structuredClone(initialState);
  }

  async load() {
    try {
      return decryptJson(JSON.parse(await fs.readFile(this.filePath, "utf8")), this.key);
    } catch (error) {
      if (error.code === "ENOENT") return structuredClone(this.initialState);
      throw error;
    }
  }

  async save(nextState) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const envelope = encryptJson(nextState, this.key);
    const temporaryPath = this.filePath + "." + process.pid + ".tmp";
    await fs.writeFile(temporaryPath, JSON.stringify(envelope, null, 2), {
      encoding: "utf8",
      mode: 0o600
    });
    await fs.rename(temporaryPath, this.filePath);
  }
}
