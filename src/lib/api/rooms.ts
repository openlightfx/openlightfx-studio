import { studioAuthHeaders } from './client';

export const positions = [
  'left',
  'center',
  'right',
  'surround-left',
  'surround-right',
  'ambient',
] as const;
export type Position = (typeof positions)[number];
export interface RoomBulb {
  id: string;
  name: string;
  protocol: string;
  model?: string;
  ipAddress?: string;
  roomId?: string | null;
  position?: Position | null;
  follows?: Position | null;
  lastSeenAt?: string;
}
export interface Room {
  id: string;
  name: string;
  screen: { deviceId: string; deviceName: string; appName: string };
  bulbs: { id: string; position: Position | null; follows: Position | null }[];
  updatedAt: string;
  suggestedLayout?: string;
}
export interface EmbyDevice {
  deviceId: string;
  name: string;
  appName: string;
  lastUserName?: string;
  lastActivity?: string;
  roomId?: string | null;
  roomName?: string;
}
export interface Setup {
  roomCount: number;
  isAdmin: boolean;
}
export interface RoomRouting {
  layout?: string | null;
  channels: {
    channelId: string;
    position: Position | null;
    bulbIds: string[];
    foldedInto: string[];
  }[];
  bulbs: {
    bulbId: string;
    sources: { channelId: string; kind: 'native' | 'fold' | 'fill' }[];
  }[];
}
export interface PreviewChannelState {
  channelId: string;
  r: number;
  g: number;
  b: number;
  brightness: number;
  transitionMs: number;
}
export async function roomApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/OpenLightFX/Studio/${path}`, {
    ...init,
    headers: {
      ...(await studioAuthHeaders()),
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let body: Record<string, unknown> | string = text;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Emby error responses are not always JSON.
    }
    const record = typeof body === 'string' ? null : body;
    const responseStatus = record?.ResponseStatus as Record<string, unknown> | undefined;
    const message =
      typeof body === 'string'
        ? body
        : (record?.message ??
          record?.Message ??
          record?.error ??
          record?.Error ??
          responseStatus?.Message ??
          responseStatus?.ErrorCode);
    throw new Error(typeof message === 'string' ? message : `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export async function loadSetup(): Promise<Setup> {
  const setup = await roomApi<{ roomCount: number }>('Setup');
  const response = await fetch('/OpenLightFX/Studio/CanManageRooms', {
    headers: await studioAuthHeaders(),
  });
  if (response.status === 401 || response.status === 403) {
    return { ...setup, isAdmin: false };
  }
  if (!response.ok) throw new Error(`Room permissions ${response.status}`);
  return { ...setup, isAdmin: true };
}
export const loadRooms = () => roomApi<Room[]>('Rooms');
export const loadRoomRouting = (
  roomId: string,
  channels: { id: string; spatialHint: string; displayName: string }[]
) =>
  roomApi<RoomRouting>(`Rooms/${encodeURIComponent(roomId)}/Routing`, {
    method: 'POST',
    body: JSON.stringify({ channels }),
  });
export const startRoomPreview = (
  roomId: string,
  channels: { id: string; spatialHint: string; displayName: string }[],
  takeover = false
) =>
  roomApi<{ status: string; active: boolean }>('Preview/Start', {
    method: 'POST',
    body: JSON.stringify({ roomId, channels, takeover }),
  });
export const sendRoomPreviewFrame = (states: PreviewChannelState[]) =>
  roomApi<{ status: string; active: boolean }>('Preview/Frame', {
    method: 'POST',
    body: JSON.stringify({ states }),
  });
export const stopRoomPreview = () =>
  roomApi<{ status: string; active: boolean }>('Preview/Stop', { method: 'POST', body: '{}' });
export const loadDevices = () => roomApi<EmbyDevice[]>('Devices');
export const loadBulbs = () => roomApi<RoomBulb[]>('Bulbs');
export const discoverBulbs = () =>
  roomApi<{
    bulbs: RoomBulb[];
    foundCount: number;
  }>('Discover', { method: 'POST', body: '{}' });
export const identifyBulb = (id: string) =>
  roomApi(`Bulbs/${encodeURIComponent(id)}/Identify`, { method: 'POST', body: '{}' });
export const renameBulb = (id: string, name: string) =>
  roomApi(`Bulbs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const saveRoom = (roomId: string | null, data: unknown, updatedAt?: string) =>
  roomApi<Room>(`Rooms${roomId ? `/${encodeURIComponent(roomId)}` : ''}`, {
    method: roomId ? 'PUT' : 'POST',
    headers: roomId && updatedAt ? { 'If-Match': updatedAt } : {},
    body: JSON.stringify(data),
  });
export const deleteRoom = (id: string) =>
  roomApi<void>(`Rooms/${encodeURIComponent(id)}`, { method: 'DELETE' });
