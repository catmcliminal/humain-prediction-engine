/**
 * "In the room" marker. The big screen's QR code carries ?room=1; a phone that opens it posts predictions that
 * appear live for the rest of the event. Everyone else's predictions wait for the host's approval.
 * This is a convenience for a trusted audience, not a security control.
 */
export const ROOM_PARAM = 'room';
export const ROOM_MS = 12 * 60 * 60 * 1000;
export const roomUrl = (joinUrl: string) => `${joinUrl}?${ROOM_PARAM}=1`;
export const stillInRoom = (scannedAt: number, now: number) => scannedAt > 0 && now - scannedAt < ROOM_MS;
