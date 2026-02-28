import type { Task } from "..";
import { stringify } from "csv-stringify";
import yazl from "yazl";
import { createWriteStream, renameSync } from "fs";
import { gtfsConfig } from "../gtfsConfig";
import { sql } from "drizzle-orm";
import { Readable } from "stream";

export default (outputZipPath: string) => {
    return {
        id: "export_gtfs",
        execute: async ({ sqlite, db }) => {
            const zipfile = new yazl.ZipFile();
            const writeStream = createWriteStream(outputZipPath + ".tmp");

            zipfile.outputStream.pipe(writeStream);

            for (const config of gtfsConfig) {
                const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(config.table);
                if (count === 0) continue;

                const fields = Object.keys(config.fields);

                const stringifier = stringify({
                    header: true,
                    columns: fields,
                    cast: {
                        boolean: (value) => (value ? "1" : "0"),
                    },
                });

                const query = sqlite.query(`SELECT ${fields.join(", ")} FROM ${config.tableName}`);
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

            await new Promise<void>((resolve, reject) => {
                writeStream.on("close", resolve);
                writeStream.on("error", reject);
                zipfile.end();
            });

            renameSync(outputZipPath + ".tmp", outputZipPath);
        },
    } satisfies Task;
};
