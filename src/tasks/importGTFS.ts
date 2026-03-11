import type { TAgency, Task, TRoute, TStop, TTrip } from "..";
import yauzl from "yauzl";
import csv from "csv-parser";
import { gtfsConfig } from "../gtfsConfig";

export interface ImportGTFSOptions {
    buffer: Buffer;
    disableEscapeQuotes?: boolean;
    transformAgency?: (agency: TAgency) => TAgency | null;
    transformStop?: (stop: TStop) => TStop | null;
    transformRoute?: (route: TRoute) => TRoute | null;
    transformTrip?: (trip: TTrip) => TTrip | null;
}

const gtfsMapping = Object.fromEntries(gtfsConfig.map((c) => [c.fileName, c]));

export default (options: ImportGTFSOptions) => {
    return {
        id: "import_gtfs",
        execute: async ({ sqlite }) => {
            sqlite.run("PRAGMA foreign_keys = OFF;");

            await new Promise((resolve, reject) => {
                yauzl.fromBuffer(options.buffer, { lazyEntries: true }, (err, zipfile) => {
                    if (err) return reject(err);

                    zipfile.readEntry();

                    zipfile.on("entry", (entry: yauzl.Entry) => {
                        if (/\/$/.test(entry.fileName)) return zipfile.readEntry();

                        const config = gtfsMapping[entry.fileName];
                        if (!config) return zipfile.readEntry();

                        zipfile.openReadStream(entry, async (err, readStream) => {
                            if (err) return reject(err);

                            const parser = csv({ quote: options.disableEscapeQuotes ? "\0" : '"' });

                            readStream.pipe(parser);

                            const chunkSize = 50000;
                            let chunk: any[] = [];

                            const insertMany = sqlite.transaction((rows) => {
                                for (const row of rows) {
                                    stmt.run(row);
                                }
                            });

                            const allFields = Object.keys(config.fields);
                            if (config.supportsCustomFields) {
                                allFields.push("extra_fields_json");
                            }

                            const namedPlaceholders = allFields.map((k) => `@${k}`).join(", ");
                            const stmt = sqlite.prepare(
                                `INSERT OR IGNORE INTO ${config.tableName} (${allFields.join(", ")}) VALUES (${namedPlaceholders})`,
                            );

                            parser.on("data", async (row: Record<string, string>) => {
                                let rowObj: any = { extra_fields_json: {} };

                                for (const [key, value] of Object.entries(row)) {
                                    const field = config.fields[key];
                                    rowObj[key] = field?.input ? field.input(value) : value;
                                }

                                if (config.tableName === "agency" && options.transformAgency) {
                                    rowObj = options.transformAgency(rowObj);
                                } else if (config.tableName === "stops" && options.transformStop) {
                                    rowObj = options.transformStop(rowObj);
                                } else if (config.tableName === "routes" && options.transformRoute) {
                                    rowObj = options.transformRoute(rowObj);
                                } else if (config.tableName === "trips" && options.transformTrip) {
                                    rowObj = options.transformTrip(rowObj);
                                }

                                if (rowObj === null) return;

                                if (config.supportsCustomFields) {
                                    for (const key of Object.keys(rowObj)) {
                                        if (config.fields[key] === undefined && key !== "extra_fields_json") {
                                            rowObj.extra_fields_json[key] = rowObj[key];
                                        }
                                    }

                                    rowObj.extra_fields_json = JSON.stringify(rowObj.extra_fields_json);
                                }

                                const sqlParams: Record<string, any> = {};
                                for (const key of allFields) {
                                    sqlParams[`@${key}`] = rowObj[key] !== undefined ? rowObj[key] : null;
                                }

                                chunk.push(sqlParams);

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
                                if (chunk.length > 0) insertMany(chunk);
                                zipfile.readEntry();
                            });

                            parser.on("error", (e) => reject(e));
                        });
                    });

                    zipfile.on("end", () => resolve(void 0));

                    zipfile.on("error", reject);
                });
            });

            sqlite.run("PRAGMA foreign_keys = ON;");
        },
    } satisfies Task;
};
