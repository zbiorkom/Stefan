import type { Task } from "..";
import { stringify } from "csv-stringify";
import yazl from "yazl";
import { createWriteStream, renameSync } from "fs";
import { gtfsConfig } from "../gtfsConfig";
import { Readable } from "stream";
import { calendar } from "../schema";
import { min, max } from "drizzle-orm";

type Options = {
    outputPath: string;
    agencyId?: string;
};

export default ({ outputPath, agencyId }: Options) => {
    return {
        id: "export_gtfs",
        execute: async ({ sqlite, db }) => {
            const zipfile = new yazl.ZipFile();
            const writeStream = createWriteStream(outputPath + ".tmp");

            zipfile.outputStream.pipe(writeStream);

            for (const config of gtfsConfig) {
                const filter = agencyId ? getAgencyFilter(config.tableName, agencyId) : "";

                const fields = Object.keys(config.fields);

                const countResult = sqlite
                    .query(`SELECT COUNT(*) as count FROM ${config.tableName}${filter}`)
                    .get() as { count: number };
                if (!countResult || countResult.count === 0) continue;

                const stringifier = stringify({
                    header: true,
                    columns: fields,
                    cast: {
                        boolean: (value) => (value ? "1" : "0"),
                    },
                });

                const query = sqlite.query(`SELECT ${fields.join(", ")} FROM ${config.tableName}${filter}`);
                const iterator = query.iterate();

                const rowStream = new Readable({
                    objectMode: true,
                    read() {
                        let pushing = true;

                        while (pushing) {
                            const result = iterator.next();
                            if (result.done) return this.push(null);

                            const row = result.value as any;
                            const formattedRow: Record<string, any> = {};

                            for (const field of fields) {
                                let val = row[field];

                                const outputFormatter = config.fields[field]?.output;
                                if (val !== null && val !== undefined && outputFormatter) {
                                    val = outputFormatter(val);
                                }

                                formattedRow[field] = val;
                            }

                            pushing = this.push(formattedRow);
                        }
                    },
                });

                rowStream.pipe(stringifier);
                zipfile.addReadStream(stringifier, config.fileName);
            }

            const [{ feed_start_date, feed_end_date }] = await db
                .select({
                    feed_start_date: min(calendar.start_date),
                    feed_end_date: max(calendar.end_date),
                })
                .from(calendar);

            zipfile.addBuffer(
                Buffer.from(
                    `feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version,feed_contact_email\n` +
                        `zbiorkom.live,https://zbiorkom.live/,pl,${feed_start_date},${feed_end_date},${Date.now()},admin@zbiorkom.live\n`,
                ),
                "feed_info.txt",
            );

            await new Promise<void>((resolve, reject) => {
                writeStream.on("close", resolve);
                writeStream.on("error", reject);
                zipfile.end();
            });

            renameSync(outputPath + ".tmp", outputPath);
        },
    } satisfies Task;
};

const getAgencyFilter = (tableName: string, agencyId: string): string => {
    const routesSubquery = `SELECT route_id FROM routes WHERE agency_id = '${agencyId}'`;
    const tripsSubquery = `SELECT trip_id FROM trips WHERE route_id IN (${routesSubquery})`;
    const servicesSubquery = `SELECT DISTINCT service_id FROM trips WHERE route_id IN (${routesSubquery})`;
    const shapesSubquery = `SELECT DISTINCT shape_id FROM trips WHERE route_id IN (${routesSubquery})`;
    const stopsSubquery = `SELECT DISTINCT stop_id FROM stop_times WHERE trip_id IN (${tripsSubquery})`;

    switch (tableName) {
        case "agency":
        case "routes":
            return ` WHERE agency_id = '${agencyId}'`;
        case "trips":
            return ` WHERE route_id IN (${routesSubquery})`;
        case "stop_times":
            return ` WHERE trip_id IN (${tripsSubquery})`;
        case "stops":
            return ` WHERE stop_id IN (${stopsSubquery})`;
        case "calendar":
        case "calendar_dates":
            return ` WHERE service_id IN (${servicesSubquery})`;
        case "shapes":
            return ` WHERE shape_id IN (${shapesSubquery})`;
        case "frequencies":
            return ` WHERE trip_id IN (${tripsSubquery})`;
        case "transfers":
            return ` WHERE from_stop_id IN (${stopsSubquery}) OR to_stop_id IN (${stopsSubquery})`;
        default:
            return "";
    }
};
