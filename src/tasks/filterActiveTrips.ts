import { trips, type Task } from "..";
import getActiveServices from "./getActiveServices";

export default (backwardDays: number = -1, forwardDays: number = 7) => {
    return {
        id: "filter_active_trips",
        execute: async (stefan) => {
            const activeServices = await getActiveServices(backwardDays, forwardDays).execute(stefan);

            const allTrips = await stefan.db
                .select({
                    trip_id: trips.trip_id,
                    service_id: trips.service_id,
                    extra_fields_json: trips.extra_fields_json,
                })
                .from(trips);

            const updateStmt = stefan.sqlite.prepare(
                "UPDATE trips SET extra_fields_json = $json WHERE trip_id = $id",
            );
            const deleteStmt = stefan.sqlite.prepare("DELETE FROM trips WHERE trip_id = $id");

            stefan.sqlite.transaction((items: typeof allTrips) => {
                for (const trip of items) {
                    const activeDays = activeServices.get(trip.service_id);

                    if (!activeDays || activeDays.length === 0) {
                        deleteStmt.run({ $id: trip.trip_id });
                    } else {
                        (trip.extra_fields_json as any).activeDays = activeDays;

                        updateStmt.run({
                            $id: trip.trip_id,
                            $json: JSON.stringify(trip.extra_fields_json),
                        });
                    }
                }
            })(allTrips);
        },
    } satisfies Task;
};
