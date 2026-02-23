# Stefan

> A Bun-based GTFS toolkit, heavily inspired by and adapted from [Impuls](https://github.com/MKuranowski/impuls) by Mikołaj Kuranowski. The project name is inspired by the cat Stefan.

## Usage

```bash
bun install
```

- **Quick example (programmatic task runner):**

Create a small file, e.g. `run.ts`, and load tasks from `src/tasks`:

```ts
import Stefan from "./src/index";
import importGTFS from "./src/tasks/importGTFS";
import getActiveServices from "./src/tasks/getActiveServices";

const buffer = Buffer.from(await Bun.file("data/gtfs.zip").arrayBuffer());

const stefan = new Stefan().withTasks([importGTFS(buffer), getActiveServices(-1, 7)]);
const results = await stefan.run();

// Task results are available in the object returned by `run()`
console.log(results.import_gtfs); // result of task with id "import_gtfs"
console.log(results.get_active_services); // result of task with id "get_active_services"
```

- **Running a runner file with Bun:**

```bash
bun run run.ts
```

- **How to get task results:**
  After calling `await new Stefan().withTasks([...]).run()` you receive an object whose keys are task `id`s
  and whose values are the task results (only tasks that return a value appear in the object).

- **Error handling and optional tasks:**
  A task can set `optional: true` — errors in optional tasks will be logged but won't stop the whole pipeline.
