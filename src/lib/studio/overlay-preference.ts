export const OVERLAY_PREFERENCE_KEY = 'olfx-editor-overlay-visible';

export function readOverlayPreference(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    const value = storage.getItem(OVERLAY_PREFERENCE_KEY);
    return value === 'false' ? false : true;
  } catch {
    return true;
  }
}

export function writeOverlayPreference(
  storage: Pick<Storage, 'setItem'>,
  visible: boolean
): boolean {
  try {
    storage.setItem(OVERLAY_PREFERENCE_KEY, String(visible));
    return true;
  } catch {
    return false;
  }
}
