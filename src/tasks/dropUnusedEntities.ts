import type { Task } from "..";

export default () => {
    return {
        id: "drop_unused_entities",
        execute: async ({ sqlite }) => {
            sqlite.run(`DELETE FROM trips WHERE trip_id NOT IN (SELECT DISTINCT trip_id FROM stop_times)`);

            sqlite.run(`DELETE FROM routes WHERE route_id NOT IN (SELECT DISTINCT route_id FROM trips)`);

            sqlite.run(`DELETE FROM agency WHERE agency_id NOT IN (SELECT DISTINCT agency_id FROM routes)`);

            sqlite.run(
                `DELETE FROM calendar WHERE service_id NOT IN (SELECT DISTINCT service_id FROM trips)`,
            );

            sqlite.run(
                `DELETE FROM calendar_dates WHERE service_id NOT IN (SELECT DISTINCT service_id FROM trips)`,
            );

            sqlite.run(
                `DELETE FROM shapes WHERE shape_id NOT IN (SELECT DISTINCT shape_id FROM trips WHERE shape_id IS NOT NULL)`,
            );

            sqlite.run(`
                WITH RECURSIVE used_stops AS (
                    SELECT DISTINCT stop_id FROM stop_times
                    UNION
                    SELECT s.parent_station FROM stops s JOIN used_stops u ON s.stop_id = u.stop_id WHERE s.parent_station IS NOT NULL
                )
                DELETE FROM stops WHERE stop_id NOT IN used_stops
            `);
        },
    } satisfies Task;
};
