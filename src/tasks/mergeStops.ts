import type { Task } from "..";

type Options = {
    locationPrecision?: number;
    nameMatchThresholdMeters?: number;
};

type Stop = {
    stop_id: string;
    stop_lat: number;
    stop_lon: number;
    stop_name: string;
    stop_code: string | null;
};

export default ({ locationPrecision = 6, nameMatchThresholdMeters = 20 }: Options = {}) => {
    return {
        id: "merge_duplicate_stops",
        execute: async ({ sqlite }) => {
            sqlite.run("PRAGMA foreign_keys = OFF;");

            const thresholdDegrees = nameMatchThresholdMeters / 111111;
            const thresholdSq = thresholdDegrees * thresholdDegrees;

            const stops = sqlite
                .query<Stop, []>("SELECT stop_id, stop_lat, stop_lon, stop_name, stop_code FROM stops")
                .all();

            if (stops.length === 0) {
                sqlite.run("PRAGMA foreign_keys = ON;");
                return;
            }

            const parent = new Map<string, string>(stops.map((s) => [s.stop_id, s.stop_id]));

            const find = (id: string): string => {
                let root = id;
                while (parent.get(root) !== root) root = parent.get(root)!;
                let cur = id;
                while (cur !== root) {
                    const next = parent.get(cur)!;
                    parent.set(cur, root);
                    cur = next;
                }
                return root;
            };

            const union = (a: string, b: string) => {
                const ra = find(a),
                    rb = find(b);
                if (ra !== rb) ra < rb ? parent.set(rb, ra) : parent.set(ra, rb);
            };

            const locBuckets = new Map<string, string[]>();

            for (const s of stops) {
                const key = `${s.stop_lat.toFixed(locationPrecision)},${s.stop_lon.toFixed(locationPrecision)}`;
                let b = locBuckets.get(key);
                if (!b) {
                    b = [];
                    locBuckets.set(key, b);
                }
                b.push(s.stop_id);
            }

            for (const ids of locBuckets.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);

            const nameBuckets = new Map<string, Stop[]>();

            for (const s of stops) {
                const codeKey = s.stop_code === null ? "\x01" : `\x02${s.stop_code}`;
                const key = `${s.stop_name}\0${codeKey}`;
                let b = nameBuckets.get(key);
                if (!b) {
                    b = [];
                    nameBuckets.set(key, b);
                }
                b.push(s);
            }

            for (const group of nameBuckets.values()) {
                if (group.length < 2) continue;
                for (let i = 0; i < group.length - 1; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        const dlat = group[i].stop_lat - group[j].stop_lat;
                        const dlon = group[i].stop_lon - group[j].stop_lon;
                        if (dlat * dlat + dlon * dlon <= thresholdSq)
                            union(group[i].stop_id, group[j].stop_id);
                    }
                }
            }

            const toMerge: [string, string][] = [];
            for (const s of stops) {
                const root = find(s.stop_id);
                if (root !== s.stop_id) toMerge.push([s.stop_id, root]);
            }

            if (toMerge.length === 0) {
                sqlite.run("PRAGMA foreign_keys = ON;");
                return;
            }

            sqlite.run(`CREATE TEMP TABLE to_merge (remove_id TEXT PRIMARY KEY, keep_id TEXT) WITHOUT ROWID`);

            const insertStmt = sqlite.prepare(`INSERT INTO to_merge VALUES (?, ?)`);
            const insertAll = sqlite.transaction((rows: [string, string][]) => {
                for (const [removeId, keepId] of rows) insertStmt.run(removeId, keepId);
            });

            insertAll(toMerge);

            sqlite.run(
                `UPDATE stop_times SET stop_id = (SELECT keep_id FROM to_merge WHERE remove_id = stop_times.stop_id LIMIT 1) WHERE stop_id IN (SELECT remove_id FROM to_merge)`,
            );
            sqlite.run(
                `UPDATE transfers SET from_stop_id = (SELECT keep_id FROM to_merge WHERE remove_id = transfers.from_stop_id LIMIT 1) WHERE from_stop_id IN (SELECT remove_id FROM to_merge)`,
            );
            sqlite.run(
                `UPDATE transfers SET to_stop_id = (SELECT keep_id FROM to_merge WHERE remove_id = transfers.to_stop_id LIMIT 1) WHERE to_stop_id IN (SELECT remove_id FROM to_merge)`,
            );
            sqlite.run(
                `UPDATE stops SET parent_station = (SELECT keep_id FROM to_merge WHERE remove_id = stops.parent_station LIMIT 1) WHERE parent_station IN (SELECT remove_id FROM to_merge)`,
            );
            sqlite.run(`DELETE FROM stops WHERE stop_id IN (SELECT remove_id FROM to_merge)`);

            sqlite.run(`DROP TABLE to_merge`);
            sqlite.run("PRAGMA foreign_keys = ON;");
        },
    } satisfies Task;
};
