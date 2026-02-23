import type { Task } from "..";

export default () => {
    return {
        id: "generate_route_long_names",
        execute: async ({ sqlite }) => {
            sqlite.run(`
                CREATE TEMP TABLE trip_bounds AS
                SELECT
                    t.trip_id,
                    t.route_id,
                    FIRST_VALUE(st.stop_id) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence) as first_stop,
                    LAST_VALUE(st.stop_id) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as last_stop
                FROM stop_times st
                JOIN trips t ON st.trip_id = t.trip_id
            `);

            sqlite.run(`
                CREATE TEMP TABLE best_pattern AS
                SELECT route_id, first_stop, last_stop FROM (
                    SELECT route_id, first_stop, last_stop, COUNT(*) AS cnt,
                        ROW_NUMBER() OVER (PARTITION BY route_id ORDER BY COUNT(*) DESC) as rn
                    FROM trip_bounds
                    GROUP BY route_id, first_stop, last_stop
                ) WHERE rn = 1
            `);

            sqlite.run(`
                UPDATE routes
                SET route_long_name = (
                    SELECT s1.stop_name || ' – ' || s2.stop_name
                    FROM best_pattern bp
                    JOIN stops s1 ON s1.stop_id = bp.first_stop
                    JOIN stops s2 ON s2.stop_id = bp.last_stop
                    WHERE bp.route_id = routes.route_id
                )
                WHERE route_id IN (SELECT route_id FROM best_pattern)
            `);
        },
    } satisfies Task;
};
