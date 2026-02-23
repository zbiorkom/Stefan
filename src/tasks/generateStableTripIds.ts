import type { Task } from "..";

export default () => {
    return {
        id: "generate_stable_trip_ids",
        execute: async ({ sqlite }) => {
            sqlite.run("PRAGMA foreign_keys = OFF");

            sqlite.run(`
                CREATE TEMP TABLE trip_id_mapping AS
                WITH trip_bounds AS (
                    SELECT DISTINCT
                        st.trip_id as old_trip_id,
                        t.route_id,
                        t.service_id,
                        FIRST_VALUE(st.stop_id) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence) as first_stop,
                        LAST_VALUE(st.stop_id) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as last_stop,
                        FIRST_VALUE(st.arrival_time) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence) as first_time,
                        LAST_VALUE(st.arrival_time) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as last_time
                    FROM stop_times st
                    JOIN trips t ON st.trip_id = t.trip_id
                )
                SELECT 
                    old_trip_id,
                    route_id || '_' || service_id || '_' || first_stop || '_' || last_stop || '_' ||
                    printf('%02d_%02d', first_time / 3600, (first_time % 3600) / 60) || '_' ||
                    printf('%02d_%02d', last_time / 3600, (last_time % 3600) / 60) as new_trip_id
                FROM trip_bounds
            `);

            sqlite.run("CREATE UNIQUE INDEX temp_idx_mapping_old_trip_id ON trip_id_mapping(old_trip_id)");

            sqlite.run(`
                UPDATE stop_times
                SET trip_id = (SELECT new_trip_id FROM trip_id_mapping WHERE old_trip_id = stop_times.trip_id)
                WHERE trip_id IN (SELECT old_trip_id FROM trip_id_mapping)
            `);

            sqlite.run(`
                UPDATE trips
                SET trip_id = (SELECT new_trip_id FROM trip_id_mapping WHERE old_trip_id = trips.trip_id)
                WHERE trip_id IN (SELECT old_trip_id FROM trip_id_mapping)
            `);

            sqlite.run("PRAGMA foreign_keys = ON");
        },
    } satisfies Task;
};
