import type { Task } from "..";

type Options = {
    locationPrecision?: number;
    nameMatchThresholdMeters?: number;
}

export default ({ locationPrecision = 6, nameMatchThresholdMeters = 20 }: Options = {}) => {
    return {
        id: "merge_duplicate_stops",
        execute: async ({ sqlite }) => {
            sqlite.run("PRAGMA foreign_keys = OFF;");

            const thresholdDegrees = nameMatchThresholdMeters / 111111
            const thresholdSq = thresholdDegrees * thresholdDegrees;

            sqlite.run(`
                CREATE TEMP TABLE to_merge AS
                SELECT s2.stop_id AS remove_id, s1.stop_id AS keep_id
                FROM stops s1
                JOIN stops s2 ON s1.stop_id < s2.stop_id
                WHERE 
                    -- WARUNEK 1: Identyczna lokalizacja (hard match)
                    (
                        ROUND(s1.stop_lat, ${locationPrecision}) = ROUND(s2.stop_lat, ${locationPrecision}) 
                        AND 
                        ROUND(s1.stop_lon, ${locationPrecision}) = ROUND(s2.stop_lon, ${locationPrecision})
                    )
                    OR
                    (
                        s1.stop_name = s2.stop_name
                        AND (
                            (s1.stop_code IS NULL AND s2.stop_code IS NULL) OR 
                            (s1.stop_code = s2.stop_code)
                        )
                        AND (
                            (s1.stop_lat - s2.stop_lat) * (s1.stop_lat - s2.stop_lat) +
                            (s1.stop_lon - s2.stop_lon) * (s1.stop_lon - s2.stop_lon)
                        ) <= ${thresholdSq}
                    )
            `);

            sqlite.run(`UPDATE stop_times SET stop_id = (SELECT keep_id FROM to_merge WHERE remove_id = stop_times.stop_id LIMIT 1) WHERE stop_id IN (SELECT remove_id FROM to_merge)`);
            
            sqlite.run(`UPDATE transfers SET from_stop_id = (SELECT keep_id FROM to_merge WHERE remove_id = transfers.from_stop_id LIMIT 1) WHERE from_stop_id IN (SELECT remove_id FROM to_merge)`);
            sqlite.run(`UPDATE transfers SET to_stop_id = (SELECT keep_id FROM to_merge WHERE remove_id = transfers.to_stop_id LIMIT 1) WHERE to_stop_id IN (SELECT remove_id FROM to_merge)`);
            
            sqlite.run(`UPDATE stops SET parent_station = (SELECT keep_id FROM to_merge WHERE remove_id = stops.parent_station LIMIT 1) WHERE parent_station IN (SELECT remove_id FROM to_merge)`);

            sqlite.run(`DELETE FROM stops WHERE stop_id IN (SELECT remove_id FROM to_merge)`);
            
            sqlite.run(`DROP TABLE to_merge`);
            sqlite.run("PRAGMA foreign_keys = ON;");
        },
    } satisfies Task;
};