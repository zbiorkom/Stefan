import type { Task } from "..";
import yauzl from "yauzl";
import csv from "csv-parser";
import * as schema from "../schema";

type TransformFn = (val: string) => any;

interface FileDef {
    tableName: keyof typeof schema;
    dbName?: string;
    supportsCustomFields: boolean;
    fields: Record<string, true | TransformFn>;
}

const toNumber = (v: string) => (Number.isNaN(+v) ? null : +v);

const toTimeSeconds = (v: string) => {
    let totalSeconds = 0;

    const timeParts = v.split(":");
    if (timeParts[0]) totalSeconds += parseInt(timeParts[0], 10) * 3600;
    if (timeParts[1]) totalSeconds += parseInt(timeParts[1], 10) * 60;
    if (timeParts[2]) totalSeconds += parseInt(timeParts[2], 10);

    return totalSeconds;
};

const gtfsMapping: Record<string, FileDef> = {
    "agency.txt": {
        tableName: "agency",
        supportsCustomFields: true,
        fields: {
            agency_id: true,
            agency_name: true,
            agency_url: true,
            agency_timezone: true,
            agency_lang: true,
            agency_phone: true,
            agency_fare_url: true,
            agency_email: true,
        },
    },
    "stops.txt": {
        tableName: "stops",
        supportsCustomFields: true,
        fields: {
            stop_id: true,
            stop_code: true,
            stop_name: true,
            stop_desc: true,
            stop_lat: toNumber,
            stop_lon: toNumber,
            zone_id: true,
            stop_url: true,
            location_type: toNumber,
            parent_station: true,
            stop_timezone: true,
            wheelchair_boarding: toNumber,
            level_id: true,
            platform_code: true,
        },
    },
    "routes.txt": {
        tableName: "routes",
        supportsCustomFields: true,
        fields: {
            route_id: true,
            agency_id: true,
            route_short_name: true,
            route_long_name: true,
            route_desc: true,
            route_type: toNumber,
            route_url: true,
            route_color: true,
            route_text_color: true,
            route_sort_order: toNumber,
        },
    },
    "trips.txt": {
        tableName: "trips",
        supportsCustomFields: true,
        fields: {
            route_id: true,
            service_id: true,
            trip_id: true,
            trip_headsign: true,
            trip_short_name: true,
            direction_id: toNumber,
            block_id: true,
            shape_id: true,
            wheelchair_accessible: toNumber,
            bikes_allowed: toNumber,
        },
    },
    "calendar.txt": {
        tableName: "calendar",
        supportsCustomFields: false,
        fields: {
            service_id: true,
            monday: toNumber,
            tuesday: toNumber,
            wednesday: toNumber,
            thursday: toNumber,
            friday: toNumber,
            saturday: toNumber,
            sunday: toNumber,
            start_date: true,
            end_date: true,
        },
    },
    "calendar_dates.txt": {
        tableName: "calendarDates",
        dbName: "calendar_dates",
        supportsCustomFields: false,
        fields: {
            service_id: true,
            date: true,
            exception_type: toNumber,
        },
    },
    "shapes.txt": {
        tableName: "shapes",
        supportsCustomFields: false,
        fields: {
            shape_id: true,
            shape_pt_lat: toNumber,
            shape_pt_lon: toNumber,
            shape_pt_sequence: toNumber,
            shape_dist_traveled: toNumber,
        },
    },
    "frequencies.txt": {
        tableName: "frequencies",
        supportsCustomFields: false,
        fields: {
            trip_id: true,
            start_time: true,
            end_time: true,
            headway_secs: toNumber,
            exact_times: toNumber,
        },
    },
    "transfers.txt": {
        tableName: "transfers",
        supportsCustomFields: false,
        fields: {
            from_stop_id: true,
            to_stop_id: true,
            transfer_type: toNumber,
            min_transfer_time: toNumber,
        },
    },
    "stop_times.txt": {
        tableName: "stopTimes",
        dbName: "stop_times",
        supportsCustomFields: false,
        fields: {
            trip_id: true,
            arrival_time: toTimeSeconds,
            departure_time: toTimeSeconds,
            stop_id: true,
            stop_sequence: toNumber,
            stop_headsign: true,
            pickup_type: toNumber,
            drop_off_type: toNumber,
            shape_dist_traveled: toNumber,
        },
    },
};

export default (buffer: Buffer) => {
    return {
        id: "import_gtfs",
        execute: async ({ sqlite }) => {
            sqlite.run("PRAGMA foreign_keys = OFF;");

            await new Promise((resolve, reject) => {
                yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
                    if (err) return reject(err);

                    zipfile.readEntry();

                    zipfile.on("entry", (entry: yauzl.Entry) => {
                        if (/\/$/.test(entry.fileName)) return zipfile.readEntry();

                        const config = gtfsMapping[entry.fileName];
                        if (!config) return zipfile.readEntry();

                        zipfile.openReadStream(entry, async (err, readStream) => {
                            if (err) return reject(err);

                            const parser = csv();
                            readStream.pipe(parser);

                            const chunkSize = 50000;
                            let chunk: any[] = [];

                            const insertMany = sqlite.transaction((rows) => {
                                for (const row of rows) {
                                    stmt.run(row);
                                }
                            });

                            const namedPlaceholders = Object.keys(config.fields)
                                .map((k) => `@${k}`)
                                .join(", ");

                            const stmt = sqlite.prepare(
                                `INSERT OR IGNORE INTO ${config.dbName ?? config.tableName} (${Object.keys(config.fields).join(", ")}) VALUES (${namedPlaceholders})`,
                            );

                            parser.on("data", async (row: Record<string, string>) => {
                                const transformedRow: any = {};
                                const customFields: Record<string, any> = {};

                                for (const [key, value] of Object.entries(row)) {
                                    const field = config.fields[key];

                                    if (field !== undefined) {
                                        transformedRow[`@${key}`] = field === true ? value : field(value);
                                    } else if (config.supportsCustomFields) {
                                        customFields[key] = value;
                                    }
                                }

                                if (config.supportsCustomFields && Object.keys(customFields).length > 0) {
                                    transformedRow["@extra_fields_json"] = JSON.stringify(customFields);
                                }

                                chunk.push(transformedRow);

                                if (chunk.length >= chunkSize) {
                                    parser.pause();

                                    try {
                                        insertMany(chunk);
                                    } finally {
                                        chunk = [];
                                        parser.resume();
                                    }
                                }
                            });

                            parser.on("end", async () => {
                                if (chunk.length > 0) {
                                    insertMany(chunk);
                                }

                                console.log(`[GTFS Import] Processed ${entry.fileName}: inserted rows`);
                                zipfile.readEntry();
                            });

                            parser.on("error", (e) => reject(e));
                        });
                    });

                    zipfile.on("end", () => {
                        console.log("[GTFS Import] Finished processing all files.");
                        resolve(void 0);
                    });

                    zipfile.on("error", reject);
                });
            });

            sqlite.run("PRAGMA foreign_keys = ON;");
        },
    } satisfies Task;
};
