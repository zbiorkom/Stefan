import type { Task } from "..";

export default () => {
    return {
        id: "fix_sequences",
        execute: async ({ sqlite }) => {
            sqlite.run(`
                WITH numbered_stops AS (
                    SELECT
                        trip_id,
                        stop_sequence,
                        ROW_NUMBER() OVER (PARTITION BY trip_id ORDER BY stop_sequence ASC) - 1 as new_sequence
                    FROM stop_times
                )
                UPDATE stop_times
                SET stop_sequence = -1 * (
                    SELECT new_sequence
                    FROM numbered_stops
                    WHERE numbered_stops.trip_id = stop_times.trip_id
                    AND numbered_stops.stop_sequence = stop_times.stop_sequence
                ) - 1
            `);
            
            sqlite.run(`UPDATE stop_times SET stop_sequence = (stop_sequence * -1) - 1`);

            sqlite.run(`
                WITH numbered_shapes AS (
                    SELECT
                        shape_id,
                        shape_pt_sequence,
                        ROW_NUMBER() OVER (PARTITION BY shape_id ORDER BY shape_pt_sequence ASC) - 1 as new_sequence
                    FROM shapes
                )
                UPDATE shapes
                SET shape_pt_sequence = -1 * (
                    SELECT new_sequence
                    FROM numbered_shapes
                    WHERE numbered_shapes.shape_id = shapes.shape_id
                    AND numbered_shapes.shape_pt_sequence = shapes.shape_pt_sequence
                ) - 1
            `);

            sqlite.run(`UPDATE shapes SET shape_pt_sequence = (shape_pt_sequence * -1) - 1`);
        },
    } satisfies Task;
};
