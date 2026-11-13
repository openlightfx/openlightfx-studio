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
    const message =
      typeof body === 'string' ? body : (body.message ?? body.Message ?? body.error ?? body.Error);
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
