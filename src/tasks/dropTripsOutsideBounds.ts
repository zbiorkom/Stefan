import type { Task } from "..";

export interface Bounds {
    bottomLeft: [number, number];
    topRight: [number, number];
}

export default ({ bottomLeft: [$minLon, $minLat], topRight: [$maxLon, $maxLat] }: Bounds) => {
    return {
        id: "drop_trips_outside_bounds",
        execute: async ({ sqlite }) => {
            sqlite
                .query(
                    `DELETE FROM trips WHERE trip_id NOT IN (
                        SELECT DISTINCT st.trip_id 
                        FROM stop_times st
                        JOIN stops s ON st.stop_id = s.stop_id
                        WHERE s.stop_lat >= $minLat 
                        AND s.stop_lat <= $maxLat 
                        AND s.stop_lon >= $minLon 
                        AND s.stop_lon <= $maxLon
                    )`,
                )
                .run({ $minLat, $maxLat, $minLon, $maxLon });
        },
    } satisfies Task;
};
