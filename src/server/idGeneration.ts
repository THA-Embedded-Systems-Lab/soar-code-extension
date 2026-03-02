import * as crypto from 'crypto';

export function generateVertexId(existingIds: Iterable<string>): string {
  const existing = new Set(existingIds);
  let id: string;

  do {
    id = crypto.randomBytes(16).toString('hex');
  } while (existing.has(id));

  return id;
}
