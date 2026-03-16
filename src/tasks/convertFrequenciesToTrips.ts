import type { Task, TStopTime, TTrip } from "..";
import { toTimeSeconds } from "../gtfsConfig";
import { frequencies, stopTimes, trips } from "../schema";
import { inArray } from "drizzle-orm";

export default (): Task => {
    return {
        id: "convert_frequencies_to_trips",
        execute: async ({ db, sqlite }) => {
            const freqs = await db.select().from(frequencies);
            if (freqs.length === 0) return;

            const tripIds = [...new Set(freqs.map((f) => f.trip_id))];

            const templateTrips: TTrip[] = [];
            const templateStopTimes: TStopTime[] = [];

            for (let i = 0; i < tripIds.length; i += 500) {
                const chunk = tripIds.slice(i, i + 500);
                templateTrips.push(...(await db.select().from(trips).where(inArray(trips.trip_id, chunk))));
                templateStopTimes.push(
                    ...(await db.select().from(stopTimes).where(inArray(stopTimes.trip_id, chunk))),
                );
            }

            const stopTimesByTrip = new Map<string, typeof templateStopTimes>();
            for (const st of templateStopTimes) {
                if (!stopTimesByTrip.has(st.trip_id)) stopTimesByTrip.set(st.trip_id, []);
                stopTimesByTrip.get(st.trip_id)!.push(st);
            }

            const insertTrip = sqlite.prepare(
                `INSERT INTO trips (trip_id, route_id, service_id, trip_headsign, trip_short_name, direction_id, block_id, shape_id, wheelchair_accessible, bikes_allowed, extra_fields_json)
                 VALUES ($trip_id, $route_id, $service_id, $trip_headsign, $trip_short_name, $direction_id, $block_id, $shape_id, $wheelchair_accessible, $bikes_allowed, $extra_fields_json)`,
            );

            const insertStopTime = sqlite.prepare(
                `INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence, stop_headsign, pickup_type, drop_off_type, shape_dist_traveled)
                 VALUES ($trip_id, $arrival_time, $departure_time, $stop_id, $stop_sequence, $stop_headsign, $pickup_type, $drop_off_type, $shape_dist_traveled)`,
            );

            sqlite.transaction(() => {
                for (const trip of templateTrips) {
                    const tripFreqs = freqs.filter((f) => f.trip_id === trip.trip_id);
                    const sts = stopTimesByTrip.get(trip.trip_id) || [];
                    if (sts.length === 0) continue;

                    sts.sort((a, b) => a.stop_sequence - b.stop_sequence);
                    const firstDepartureTime = sts[0].departure_time;

                    for (const freq of tripFreqs) {
                        const startSecs = toTimeSeconds(freq.start_time);
                        const endSecs = toTimeSeconds(freq.end_time);
                        const headway = freq.headway_secs;

                        for (let t = startSecs; t < endSecs; t += headway) {
                            const newTripId = `${trip.trip_id}_${t}`;
                            const offset = t - firstDepartureTime;

                            insertTrip.run({
                                $trip_id: newTripId,
                                $route_id: trip.route_id,
                                $service_id: trip.service_id,
                                $trip_headsign: trip.trip_headsign,
                                $trip_short_name: trip.trip_short_name,
                                $direction_id: trip.direction_id,
                                $block_id: trip.block_id,
                                $shape_id: trip.shape_id,
                                $wheelchair_accessible: trip.wheelchair_accessible,
                                $bikes_allowed: trip.bikes_allowed,
                                $extra_fields_json: JSON.stringify(trip.extra_fields_json || {}),
                            });

                            for (const st of sts) {
                                insertStopTime.run({
                                    $trip_id: newTripId,
                                    $arrival_time: st.arrival_time + offset,
                                    $departure_time: st.departure_time + offset,
                                    $stop_id: st.stop_id,
                                    $stop_sequence: st.stop_sequence,
                                    $stop_headsign: st.stop_headsign,
                                    $pickup_type: st.pickup_type,
                                    $drop_off_type: st.drop_off_type,
                                    $shape_dist_traveled: st.shape_dist_traveled,
                                });
                            }
                        }
                    }
                }
            })();

            const freqsSubquery = db.select({ id: frequencies.trip_id }).from(frequencies);

            await db.delete(stopTimes).where(inArray(stopTimes.trip_id, freqsSubquery));
            await db.delete(trips).where(inArray(trips.trip_id, freqsSubquery));
            await db.delete(frequencies);
        },
    };
};
