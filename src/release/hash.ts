import createHash from 'node:crypto';
import fs from 'node:fs';

export const HASH_CONTRACT = 'SHA256_LF_NORMALIZED_V1';

export function normalizeLf(raw: Buffer | string): Buffer {
  const str = typeof raw === 'string' ? raw : raw.toString('utf-8');
  const normalized = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return Buffer.from(normalized, 'utf-8');
}

export function sha256LfNormalized(raw: Buffer | string): string {
  const normalized = normalizeLf(raw);
  return createHash.createHash('sha256').update(normalized).digest('hex');
}

export function sha256LfFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found for hash calculation: ${filePath}`);
  }
  const content = fs.readFileSync(filePath);
  return sha256LfNormalized(content);
}

export function extractBodyFromBegin(raw: Buffer | string): Buffer {
  const str = typeof raw === 'string' ? raw : raw.toString('utf-8');
  const normalizedStr = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lowerStr = normalizedStr.toLowerCase();
  const idx = lowerStr.indexOf('begin;');
  if (idx < 0) {
    throw new Error("No 'begin;' marker found in file content");
  }
  return Buffer.from(normalizedStr.slice(idx), 'utf-8');
}

export function sha256LfBody(raw: Buffer | string): string {
  const bodyBuf = extractBodyFromBegin(raw);
  return createHash.createHash('sha256').update(bodyBuf).digest('hex');
}

export function sha256LfFileBody(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found for body hash calculation: ${filePath}`);
  }
  const content = fs.readFileSync(filePath);
  return sha256LfBody(content);
}
