import type { Task } from "..";
import { stringify } from "csv-stringify";
import yazl from "yazl";
import { createWriteStream, renameSync } from "fs";
import { gtfsConfig } from "../gtfsConfig";
import { sql } from "drizzle-orm";

export default (outputZipPath: string) => {
    return {
        id: "export_gtfs",
        execute: async ({ sqlite, db }) => {
            const zipfile = new yazl.ZipFile();

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

                for (const row of query.iterate() as any) {
                    const formattedRow: Record<string, any> = {};

                    for (const field of fields) {
                        let val = row[field];

                        const outputFormatter = config.fields[field]?.output;
                        if (val !== null && val !== undefined && outputFormatter) {
                            val = outputFormatter(val);
                        }

                        formattedRow[field] = val;
                    }

                    stringifier.write(formattedRow);
                }

                stringifier.end();

                zipfile.addReadStream(stringifier, config.fileName);
            }

            await new Promise<void>((resolve, reject) => {
                zipfile.outputStream
                    .pipe(createWriteStream(outputZipPath + ".tmp"))
                    .on("close", () => resolve())
                    .on("error", reject);

                zipfile.end();
            });

            renameSync(outputZipPath + ".tmp", outputZipPath);
        },
    } satisfies Task;
};
