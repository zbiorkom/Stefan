import chalk from "chalk";
import Stefan from "./index";

export const runAll = async (stefansToMerge: Stefan[]): Promise<Stefan> => {
    const master = new Stefan();
    master.sqlite.run("PRAGMA foreign_keys = OFF;");

    for (let i = 0; i < stefansToMerge.length; i++) {
        const stefan = stefansToMerge[i];
        const prefix = stefan.options.agency || `DATASET_${i}`;

        console.log(chalk.magenta(`\n📦 Running pipeline for dataset #${i + 1} (Agency: ${prefix})...`));

        await stefan.run();

        stefan.sqlite.run("PRAGMA foreign_keys = OFF;");

        const updates = [
            `DELETE FROM agency WHERE rowid NOT IN (SELECT rowid FROM agency LIMIT 1)`,
            `UPDATE agency SET agency_id = '${prefix}'`,
            `UPDATE routes SET agency_id = '${prefix}'`,

            `UPDATE stops SET stop_id = '${prefix}_' || stop_id`,
            `UPDATE stops SET parent_station = '${prefix}_' || parent_station WHERE parent_station IS NOT NULL AND parent_station != ''`,
            `UPDATE stops SET zone_id = '${prefix}_' || zone_id WHERE zone_id IS NOT NULL AND zone_id != ''`,
            `UPDATE stops SET level_id = '${prefix}_' || level_id WHERE level_id IS NOT NULL AND level_id != ''`,

            `UPDATE routes SET route_id = '${prefix}_' || route_id`,

            `UPDATE calendar SET service_id = '${prefix}_' || service_id`,
            `UPDATE calendar_dates SET service_id = '${prefix}_' || service_id`,

            `UPDATE shapes SET shape_id = '${prefix}_' || shape_id`,

            `UPDATE trips SET trip_id = '${prefix}_' || trip_id`,
            `UPDATE trips SET route_id = '${prefix}_' || route_id`,
            `UPDATE trips SET service_id = '${prefix}_' || service_id`,
            `UPDATE trips SET shape_id = '${prefix}_' || shape_id WHERE shape_id IS NOT NULL AND shape_id != ''`,
            `UPDATE trips SET block_id = '${prefix}_' || block_id WHERE block_id IS NOT NULL AND block_id != ''`,

            `UPDATE stop_times SET trip_id = '${prefix}_' || trip_id`,
            `UPDATE stop_times SET stop_id = '${prefix}_' || stop_id`,

            `UPDATE frequencies SET trip_id = '${prefix}_' || trip_id`,

            `UPDATE transfers SET from_stop_id = '${prefix}_' || from_stop_id`,
            `UPDATE transfers SET to_stop_id = '${prefix}_' || to_stop_id`,
        ];

        for (const query of updates) {
            stefan.sqlite.run(query);
        }

        stefan.sqlite.run("PRAGMA foreign_keys = ON;");

        const tables = [
            "agency",
            "stops",
            "routes",
            "calendar",
            "calendar_dates",
            "shapes",
            "trips",
            "stop_times",
            "frequencies",
            "transfers",
        ];

        for (const table of tables) {
            const tableInfo = stefan.sqlite.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
            if (tableInfo.length === 0) continue;

            const columns = tableInfo.map((c) => c.name);

            const insertStmt = master.sqlite.prepare(
                `INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((c) => `@${c}`).join(", ")})`,
            );

            const insertChunk = master.sqlite.transaction((rows: any[]) => {
                for (const row of rows) {
                    const params: Record<string, any> = {};
                    for (const col of columns) params[`@${col}`] = row[col];
                    insertStmt.run(params);
                }
            });

            let chunk: any[] = [];

            for (const row of stefan.sqlite.query(`SELECT * FROM ${table}`).iterate()) {
                chunk.push(row);

                if (chunk.length >= 50000) {
                    insertChunk(chunk);
                    chunk = [];
                }
            }

            if (chunk.length > 0) insertChunk(chunk);
        }
    }

    master.sqlite.run("PRAGMA foreign_keys = ON;");
    console.log(chalk.green(`\n✅ All datasets successfully merged into Master Stefan!`));

    return master;
};
