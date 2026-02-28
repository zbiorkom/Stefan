import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";
import { secondsToString } from "./util";

export type TransformFn = (val: string) => any;
export type FormatFn = (val: any) => string;

export interface ColumnDef {
    input?: TransformFn;
    output?: FormatFn;
}

export interface FileDef {
    fileName: string;
    tableName: string;
    table: SQLiteTable;
    supportsCustomFields: boolean;
    fields: Record<string, ColumnDef>;
}

export const toNumber = (v: string) => (!v || Number.isNaN(+v) ? null : +v);

export const toTimeSeconds = (v: string) => {
    let totalSeconds = 0;

    const timeParts = v.split(":");
    if (timeParts[0]) totalSeconds += parseInt(timeParts[0], 10) * 3600;
    if (timeParts[1]) totalSeconds += parseInt(timeParts[1], 10) * 60;
    if (timeParts[2]) totalSeconds += parseInt(timeParts[2], 10);

    return totalSeconds;
};

export const gtfsConfig: FileDef[] = [
    {
        fileName: "agency.txt",
        tableName: "agency",
        table: schema.agency,
        supportsCustomFields: true,
        fields: {
            agency_id: {},
            agency_name: {},
            agency_url: {},
            agency_timezone: {},
            agency_lang: {},
            agency_phone: {},
            agency_fare_url: {},
            agency_email: {},
        },
    },
    {
        fileName: "stops.txt",
        tableName: "stops",
        table: schema.stops,
        supportsCustomFields: true,
        fields: {
            stop_id: {},
            stop_code: {},
            stop_name: {},
            stop_desc: {},
            stop_lat: { input: toNumber },
            stop_lon: { input: toNumber },
            zone_id: {},
            stop_url: {},
            location_type: { input: toNumber },
            parent_station: {},
            stop_timezone: {},
            wheelchair_boarding: { input: toNumber },
            level_id: {},
            platform_code: {},
        },
    },
    {
        fileName: "routes.txt",
        tableName: "routes",
        table: schema.routes,
        supportsCustomFields: true,
        fields: {
            route_id: {},
            agency_id: {},
            route_short_name: {},
            route_long_name: {},
            route_desc: {},
            route_type: { input: toNumber },
            route_url: {},
            route_color: {},
            route_text_color: {},
            route_sort_order: { input: toNumber },
        },
    },
    {
        fileName: "trips.txt",
        tableName: "trips",
        table: schema.trips,
        supportsCustomFields: true,
        fields: {
            route_id: {},
            service_id: {},
            trip_id: {},
            trip_headsign: {},
            trip_short_name: {},
            direction_id: { input: toNumber },
            block_id: {},
            shape_id: {},
            wheelchair_accessible: { input: toNumber },
            bikes_allowed: { input: toNumber },
        },
    },
    {
        fileName: "calendar.txt",
        tableName: "calendar",
        table: schema.calendar,
        supportsCustomFields: false,
        fields: {
            service_id: {},
            monday: { input: toNumber },
            tuesday: { input: toNumber },
            wednesday: { input: toNumber },
            thursday: { input: toNumber },
            friday: { input: toNumber },
            saturday: { input: toNumber },
            sunday: { input: toNumber },
            start_date: {},
            end_date: {},
        },
    },
    {
        fileName: "calendar_dates.txt",
        tableName: "calendar_dates",
        table: schema.calendarDates,
        supportsCustomFields: false,
        fields: {
            service_id: {},
            date: {},
            exception_type: { input: toNumber },
        },
    },
    {
        fileName: "shapes.txt",
        tableName: "shapes",
        table: schema.shapes,
        supportsCustomFields: false,
        fields: {
            shape_id: {},
            shape_pt_lat: { input: toNumber },
            shape_pt_lon: { input: toNumber },
            shape_pt_sequence: { input: toNumber },
            shape_dist_traveled: { input: toNumber },
        },
    },
    {
        fileName: "frequencies.txt",
        tableName: "frequencies",
        table: schema.frequencies,
        supportsCustomFields: false,
        fields: {
            trip_id: {},
            start_time: {},
            end_time: {},
            headway_secs: { input: toNumber },
            exact_times: { input: toNumber },
        },
    },
    {
        fileName: "transfers.txt",
        tableName: "transfers",
        table: schema.transfers,
        supportsCustomFields: false,
        fields: {
            from_stop_id: {},
            to_stop_id: {},
            transfer_type: { input: toNumber },
            min_transfer_time: { input: toNumber },
        },
    },
    {
        fileName: "stop_times.txt",
        tableName: "stop_times",
        table: schema.stopTimes,
        supportsCustomFields: false,
        fields: {
            trip_id: {},
            arrival_time: { input: toTimeSeconds, output: secondsToString },
            departure_time: { input: toTimeSeconds, output: secondsToString },
            stop_id: {},
            stop_sequence: { input: toNumber },
            stop_headsign: {},
            pickup_type: { input: toNumber },
            drop_off_type: { input: toNumber },
            shape_dist_traveled: { input: toNumber },
        },
    },
];
