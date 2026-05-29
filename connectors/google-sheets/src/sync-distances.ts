import { prisma } from '@lp-ai/lib-db';

// 801 Market St, Philadelphia, PA 19107
const OFFICE_LAT = 39.9517;
const OFFICE_LNG = -75.1502;

const GEOCODE_SLEEP_MS = 150;
const GEOCODE_TIMEOUT_MS = 5000;

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeZip(zip: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { places?: Array<{ latitude: string; longitude: string }> };
    const place = data.places?.[0];
    if (!place) return null;
    return { lat: parseFloat(place.latitude), lng: parseFloat(place.longitude) };
  } catch {
    return null;
  }
}

export async function syncDistances(): Promise<{ updated: number; skipped: number }> {
  const rows = await prisma.student.findMany({
    where: { zip: { not: null }, distanceToOffice: null },
    select: { id: true, zip: true },
  });

  const zipCache = new Map<string, { lat: number; lng: number } | null>();
  for (const row of rows) {
    if (row.zip && !zipCache.has(row.zip)) zipCache.set(row.zip, null);
  }

  for (const zip of zipCache.keys()) {
    const coords = await geocodeZip(zip);
    zipCache.set(zip, coords);
    await new Promise((r) => setTimeout(r, GEOCODE_SLEEP_MS));
  }

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.zip) { skipped += 1; continue; }
    const coords = zipCache.get(row.zip) ?? null;
    if (!coords) { skipped += 1; continue; }

    const miles = Number(haversineMiles(coords.lat, coords.lng, OFFICE_LAT, OFFICE_LNG).toFixed(2));
    await prisma.student.update({
      where: { id: row.id },
      data: { distanceToOffice: miles },
    });
    updated += 1;
  }

  return { updated, skipped };
}
