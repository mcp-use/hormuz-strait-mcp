const BASE_URL = "https://www.vesselfinder.com/api/pub/mp2";
const CACHE_TTL_MS = 30 * 1000;

const SHIP_TYPE_NAMES: Record<number, string> = {
  0: "Unknown",
  1: "Fishing",
  2: "Tug",
  3: "Passenger",
  4: "Cargo",
  5: "Tanker",
  6: "Pleasure",
  7: "High-speed",
  8: "Special",
  9: "Yacht",
};

export interface LiveShip {
  mmsi: number;
  name: string;
  lat: number;
  lon: number;
  heading: number | null;
  shipType: string;
  shipTypeCode: number;
  stale: boolean;
}

interface CacheEntry {
  fetchedAt: number;
  ships: LiveShip[];
  totalShips: number;
  raw: ArrayBuffer;
}

const cache = new Map<string, CacheEntry>();

function bboxToParam(minLat: number, minLon: number, maxLat: number, maxLon: number): string {
  const scale = 6e5;
  return [
    Math.floor(minLon * scale),
    Math.floor(minLat * scale),
    Math.floor(maxLon * scale),
    Math.floor(maxLat * scale),
  ].join(",");
}

export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export async function fetchLiveShips(
  bbox: BBox,
  zoom = 9,
): Promise<{ ships: LiveShip[]; totalShips: number; fetchedAt: number; cached: boolean }> {
  const key = `${zoom}:${bbox.minLat}:${bbox.minLon}:${bbox.maxLat}:${bbox.maxLon}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return { ships: hit.ships, totalShips: hit.totalShips, fetchedAt: hit.fetchedAt, cached: true };
  }

  const bboxParam = bboxToParam(bbox.minLat, bbox.minLon, bbox.maxLat, bbox.maxLon);
  const url = `${BASE_URL}?bbox=${bboxParam}&zoom=${zoom}&mmsi=0&mcbe=1`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; hormuz-ships-mcp/1.0)",
      Referer: "https://www.vesselfinder.com/",
      Accept: "*/*",
    },
  });
  if (!res.ok) {
    throw new Error(`VesselFinder mp2 request failed: ${res.status} ${res.statusText}`);
  }
  const raw = await res.arrayBuffer();
  const decoded = decode(raw, zoom > 12);

  const entry: CacheEntry = {
    fetchedAt: Date.now(),
    ships: decoded.ships,
    totalShips: decoded.totalShips,
    raw,
  };
  cache.set(key, entry);
  return { ships: decoded.ships, totalShips: decoded.totalShips, fetchedAt: entry.fetchedAt, cached: false };
}

interface DecodeResult {
  ships: LiveShip[];
  totalShips: number;
  refMmsi: number;
}

function decode(buffer: ArrayBuffer, bigZoom: boolean): DecodeResult {
  const dv = new DataView(buffer);
  const P = dv.byteLength;
  if (P < 12) return { ships: [], totalShips: 0, refMmsi: 0 };

  const Y = dv.getUint16(1);
  const totalShips = Y >= 8 && P >= 12 ? dv.getInt32(8) : 0;

  let I = 4 + Y;
  const refMmsi = dv.getInt32(I - 4);
  const ships: LiveShip[] = [];
  const An = 6e5;

  while (I < P) {
    if (I + 2 > P) break;
    const w = dv.getInt16(I);
    I += 2;
    const ht = (w & 0xf0) >> 4;
    const W = (w & 0x3f00) >> 8;
    const ne = (w & 2) !== 0;
    const isOld = (w & 4) !== 0;

    if (I + 12 > P) break;
    const mmsi = dv.getInt32(I);
    I += 4;
    const R = mmsi === refMmsi;
    const lat = dv.getInt32(I) / An;
    I += 4;
    const lon = dv.getInt32(I) / An;
    I += 4;

    if (R) {
      if (I + 6 > P) break;
      I += 6;
    }

    if (I + 2 > P) break;
    I += 1;
    const nameLen = dv.getInt8(I);
    I += 1;
    if (I + nameLen > P) break;
    const name = new TextDecoder().decode(
      new Uint8Array(buffer, I, nameLen),
    );
    I += nameLen;

    if (R) {
      if (I + 4 > P) break;
      I += 4;
    }

    if (bigZoom) {
      if (I + 10 > P) break;
      I += 10;
    }
    if (ne && !bigZoom) {
      if (I + 2 > P) break;
      I += 2;
    }

    const heading = W < 32 ? Math.round(W * 11.25) : null;
    const typeCode = ht & 0xf;

    ships.push({
      mmsi,
      name: name.trim(),
      lat,
      lon,
      heading,
      shipTypeCode: typeCode,
      shipType: SHIP_TYPE_NAMES[typeCode] ?? "Unknown",
      stale: isOld,
    });
  }

  return { ships, totalShips, refMmsi };
}

export function bboxAround(lat: number, lon: number, radiusKm: number): BBox {
  const latDelta = radiusKm / 111.0;
  const lonDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

export function filterByRadius(
  ships: LiveShip[],
  lat: number,
  lon: number,
  radiusKm: number,
): LiveShip[] {
  return ships.filter((s) => {
    const dLat = (s.lat - lat) * 111.0;
    const dLon = (s.lon - lon) * 111.0 * Math.cos((lat * Math.PI) / 180);
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    return dist <= radiusKm;
  });
}
