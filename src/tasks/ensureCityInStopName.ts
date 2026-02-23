import type { Task } from "..";
import { stops } from "../schema";
import { eq } from "drizzle-orm";
import { booleanPointInPolygon, booleanIntersects, point, buffer } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon, Position } from "geojson";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export interface EnsureCityInStopNameOptions {
    exclude?: string[];
    formatStopName?: (stopName: string, cityName: string) => string;
    nearbyRadiusMeters?: number;
}

export default ({
    exclude = [],
    formatStopName = (stopName, cityName) => `${cityName} ${stopName}`,
    nearbyRadiusMeters = 500,
}: EnsureCityInStopNameOptions) => {
    return {
        id: "ensure_city_in_stop_name",
        execute: async ({ db }) => {
            const allStops = await db.select().from(stops);
            if (allStops.length === 0) return;

            let minLat = 90,
                maxLat = -90,
                minLon = 180,
                maxLon = -180;

            for (const stop of allStops) {
                minLat = Math.min(minLat, stop.stop_lat);
                maxLat = Math.max(maxLat, stop.stop_lat);
                minLon = Math.min(minLon, stop.stop_lon);
                maxLon = Math.max(maxLon, stop.stop_lon);
            }

            const query = `
                [out:json][timeout:90];
                (
                  relation["boundary"="administrative"]["admin_level"="8"]
                  (${minLat},${minLon},${maxLat},${maxLon});
                );
                out geom;
            `;

            const data = await fetchOverpassData(query);

            const cityFeatures = data.elements
                .filter((el) => !exclude.includes(el.tags!.name))
                .map(osmRelationToGeoJSON)
                .filter((f): f is Feature<Polygon | MultiPolygon> => !!f);

            for (const stop of allStops) {
                const stopPt = point([stop.stop_lon, stop.stop_lat]);
                const currentNameLower = stop.stop_name.toLowerCase();

                const nearbyCities = cityFeatures.filter((city) =>
                    booleanIntersects(buffer(stopPt, nearbyRadiusMeters, { units: "meters" })!, city),
                );

                const matchesNearby = nearbyCities.some((city) =>
                    currentNameLower.includes(city.properties!.name.toLowerCase()),
                );

                if (matchesNearby) continue;

                const containingCity = nearbyCities.find((city) => booleanPointInPolygon(stopPt, city));

                if (containingCity) {
                    const cityName = containingCity.properties!.name;

                    if (!currentNameLower.includes(cityName.toLowerCase())) {
                        db.update(stops)
                            .set({ stop_name: formatStopName(stop.stop_name, cityName) })
                            .where(eq(stops.stop_id, stop.stop_id));
                    }
                }
            }
        },
    } satisfies Task;
};

interface OSMRelation {
    type: "relation";
    id: number;
    members: {
        type: string;
        ref: number;
        role: string;
        geometry?: { lat: number; lon: number }[];
    }[];
    tags?: Record<string, string>;
}

const fetchOverpassData = async (query: string, retries = MAX_RETRIES) => {
    try {
        return fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: `data=${encodeURIComponent(query)}`,
        }).then((res) => res.json() as Promise<{ elements: OSMRelation[] }>);
    } catch (error) {
        if (retries > 0) {
            await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
            return fetchOverpassData(query, retries - 1);
        }

        throw error;
    }
};

const isSamePoint = (p1: Position, p2: Position) => p1[0] === p2[0] && p1[1] === p2[1];

const osmRelationToGeoJSON = (relation: OSMRelation) => {
    const outerWays: Position[][] = relation.members
        .filter((m) => m.type === "way" && m.role === "outer" && m.geometry)
        .map((m) => m.geometry!.map((c) => [c.lon, c.lat]));

    if (outerWays.length === 0) return;

    const rings: Position[][] = [];
    const pool = [...outerWays];

    while (pool.length > 0) {
        let currentRing = pool.shift()!;
        let added = true;

        while (added) {
            added = false;
            const start = currentRing[0];
            const end = currentRing[currentRing.length - 1];

            for (let i = 0; i < pool.length; i++) {
                const seg = pool[i];
                const sStart = seg[0];
                const sEnd = seg[seg.length - 1];

                if (isSamePoint(end, sStart)) {
                    currentRing = currentRing.concat(seg.slice(1));
                } else if (isSamePoint(end, sEnd)) {
                    currentRing = currentRing.concat([...seg].reverse().slice(1));
                } else if (isSamePoint(start, sEnd)) {
                    currentRing = seg.concat(currentRing.slice(1));
                } else if (isSamePoint(start, sStart)) {
                    currentRing = [...seg].reverse().concat(currentRing.slice(1));
                } else {
                    continue;
                }

                pool.splice(i, 1);
                added = true;
                break;
            }
        }

        if (!isSamePoint(currentRing[0], currentRing[currentRing.length - 1])) {
            currentRing.push([...currentRing[0]]);
        }
        rings.push(currentRing);
    }

    const isMulti = rings.length > 1;

    return {
        type: "Feature",
        properties: { name: relation.tags?.name },
        geometry: {
            type: isMulti ? "MultiPolygon" : "Polygon",
            coordinates: isMulti ? rings.map((r) => [r]) : [rings[0]],
        },
    } as Feature<Polygon | MultiPolygon>;
};
