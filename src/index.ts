import { Database } from "bun:sqlite";
import { drizzle, BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import chalk from "chalk";

export interface Task<T = unknown> {
    name: string;
    execute(stefan: Stefan<any>): Promise<T> | T;
    optional?: boolean;
}

const sqlSchema = await Bun.file("./schema.sql").text();

class Stefan<TReturn = void> {
    public readonly sqlite: Database;
    public readonly db: BunSQLiteDatabase<typeof schema>;
    private tasks: Task[] = [];

    constructor() {
        this.sqlite = new Database(":memory:");

        this.sqlite.run("PRAGMA journal_mode = WAL;");
        this.sqlite.run("PRAGMA synchronous = NORMAL;");
        this.sqlite.run("PRAGMA temp_store = MEMORY;");
        this.sqlite.run("PRAGMA mmap_size = 600000000;");
        this.sqlite.run("PRAGMA foreign_keys = ON;");
        this.sqlite.run(sqlSchema);

        this.db = drizzle(this.sqlite, { schema });
    }

    withTasks<TTasks extends (Task<any> | Task<any>[])[]>(
        tasks: [...TTasks],
    ): Stefan<
        TTasks extends [...any[], Task<infer R>]
            ? R
            : TTasks extends [...any[], Task<infer R>[]]
              ? R
              : TTasks extends Task<infer R>[]
                ? R
                : unknown
    > {
        this.tasks = tasks.flat();

        return this as any;
    }

    private getTaskName(index: number) {
        return (
            chalk.blue("[ ") +
            chalk.bold(chalk.green(this.tasks[index].name)) +
            chalk.blue(",") +
            chalk.bold(chalk.yellow(` #${index + 1} `)) +
            chalk.blue("]")
        );
    }

    private getTimeString(milliseconds: number) {
        let result = "";

        if (milliseconds >= 1000) {
            const seconds = (milliseconds / 1000).toFixed(2);
            result += `${seconds}s`;
        } else {
            result += `${milliseconds.toFixed(2)}ms`;
        }

        return chalk.bold(chalk.yellow(result));
    }

    async run(): Promise<TReturn> {
        const pipelineStart = performance.now();
        let lastResult: any;

        for (let i = 0; i < this.tasks.length; i++) {
            const task = this.tasks[i];

            const taskStart = performance.now();
            console.log(`${this.getTaskName(i)} 🚀  Running`);

            try {
                lastResult = await task.execute(this);

                const taskEnd = performance.now();
                console.log(
                    `${this.getTaskName(i)} ✅  Completed in ${this.getTimeString(taskEnd - taskStart)}`,
                );
            } catch (error) {
                if (this.tasks[i].optional) {
                    console.log(`${this.getTaskName(i)} ⚠️  Failed with error: ${error}`);
                } else {
                    throw error;
                }
            }
        }

        const pipelineEnd = performance.now();
        console.log(
            `\n⭐  ${chalk.green("All tasks completed")} in ${this.getTimeString(pipelineEnd - pipelineStart)}!`,
        );

        return lastResult;
    }
}

export default Stefan;
export * from "./schema";
