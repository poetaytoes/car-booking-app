import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";
import { ApiError } from "../../shared/api-error.js";

type StoredLocation = { latitude: number | null; longitude: number | null };

/** Straight-line distance between stored coordinates, not road distance or navigation. */
export class LocationService {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  distanceTo(fromId: string, toId: string): number {
    const query = this.db.prepare("SELECT latitude, longitude FROM locations WHERE id = ?");
    const from = query.get(fromId) as StoredLocation | undefined;
    const to = query.get(toId) as StoredLocation | undefined;
    if (!from || !to) throw new ApiError(404, "Location not found");
    if (from.latitude === null || from.longitude === null || to.latitude === null || to.longitude === null) {
      throw new ApiError(409, "Both locations need coordinates to calculate distance");
    }
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const lat = radians(to.latitude - from.latitude);
    const lon = radians(to.longitude - from.longitude);
    const a = Math.sin(lat / 2) ** 2 +
      Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(lon / 2) ** 2;
    return Math.round(6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a))) * 1000) / 1000;
  }
}
