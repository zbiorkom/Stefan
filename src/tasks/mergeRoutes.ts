import type { Task } from "..";

export default () => {
    return {
        id: "merge_routes",
        execute: async ({ sqlite }) => {
            sqlite.run("PRAGMA foreign_keys = OFF");

            sqlite.run(`CREATE TEMP TABLE to_merge(remove_id TEXT, keep_id TEXT);`);

            sqlite.run(`
                INSERT INTO to_merge(remove_id, keep_id)
                SELECT r.route_id, grp.keep_id FROM routes r
                JOIN (
                    SELECT route_short_name, route_type, agency_id, MIN(route_id) AS keep_id
                    FROM routes
                    GROUP BY route_short_name, route_type, agency_id
                    HAVING COUNT(*) > 1
                ) grp ON r.route_short_name = grp.route_short_name AND r.route_type = grp.route_type AND r.agency_id = grp.agency_id
                WHERE r.route_id != grp.keep_id
            `);

            sqlite.run(`
                UPDATE trips
                SET route_id = (
                    SELECT keep_id FROM to_merge WHERE remove_id = trips.route_id
                )
                WHERE route_id IN (SELECT remove_id FROM to_merge)
            `);

            sqlite.run(`DELETE FROM routes WHERE route_id IN (SELECT remove_id FROM to_merge)`);
            sqlite.run(`DROP TABLE to_merge`);

            sqlite.run("PRAGMA foreign_keys = ON");
        },
    } satisfies Task;
};
