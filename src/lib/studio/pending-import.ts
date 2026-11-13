let pending: { itemId: string; fileName: string; bytes: Uint8Array } | null = null;

export function setPendingImport(itemId: string, fileName: string, bytes: Uint8Array): void {
  pending = { itemId, fileName, bytes };
}

export function takePendingImport(itemId: string): { fileName: string; bytes: Uint8Array } | null {
  if (!pending || pending.itemId !== itemId) return null;
  const result = { fileName: pending.fileName, bytes: pending.bytes };
  pending = null;
  return result;
}
