import type { Task } from "..";
import yauzl from "yauzl";
import csv from "csv-parser";
import { gtfsConfig } from "../gtfsConfig";

const gtfsMapping = Object.fromEntries(gtfsConfig.map((c) => [c.fileName, c]));

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
                                `INSERT OR IGNORE INTO ${config.tableName} (${Object.keys(config.fields).join(", ")}) VALUES (${namedPlaceholders})`,
                            );

                            parser.on("data", async (row: Record<string, string>) => {
                                const transformedRow: any = {};
                                const customFields: Record<string, any> = {};

                                for (const [key, value] of Object.entries(row)) {
                                    const field = config.fields[key];

                                    if (field !== undefined) {
                                        transformedRow[`@${key}`] = field.input ? field.input(value) : value;
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
                                if (chunk.length > 0) insertMany(chunk);
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
