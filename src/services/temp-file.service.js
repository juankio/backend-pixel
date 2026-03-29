import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, unlink, rm } from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';

let tempRoot = null;

async function ensureTempRoot() {
  if (!tempRoot) {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'vectorizer-'));
  }
  return tempRoot;
}

export async function writeTempImage(buffer, extension = '.png') {
  const root = await ensureTempRoot();
  const filename = `${uuidv4()}${extension}`;
  const filePath = path.join(root, filename);
  await writeFile(filePath, buffer);
  return filePath;
}

export async function cleanupTempFile(filePath) {
  if (!filePath) return;

  try {
    await unlink(filePath);
  } catch {
    // Ignorar errores de limpieza para no afectar la respuesta.
  }
}

export async function cleanupTempRoot() {
  if (!tempRoot) return;

  try {
    await rm(tempRoot, { recursive: true, force: true });
  } catch {
    // Ignorar errores de limpieza en apagado.
  } finally {
    tempRoot = null;
  }
}
