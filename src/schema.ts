import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export enum LocationType {
    Stop = 0,
    Station = 1,
    EntranceExit = 2,
    GenericNode = 3,
    BoardingArea = 4,
}

export enum WheelchairAccessibility {
    NoInformation = 0,
    Accessible = 1,
    NotAccessible = 2,
}

export enum RouteType {
    Tram = 0,
    Subway = 1,
    Rail = 2,
    Bus = 3,
    Ferry = 4,
    CableTram = 5,
    AerialLift = 6,
    Funicular = 7,
    Trolleybus = 11,
    Monorail = 12,
}

export enum CalendarAvailability {
    NotAvailable = 0,
    Available = 1,
}

export enum ExceptionType {
    Added = 1,
    Removed = 2,
}

export enum DirectionId {
    Outbound = 0,
    Inbound = 1,
}

export enum BikesAllowed {
    NoInformation = 0,
    Allowed = 1,
    NotAllowed = 2,
}

export enum PickupDropOffType {
    Regular = 0,
    NotAvailable = 1,
    MustPhoneAgency = 2,
    MustCoordinateWithDriver = 3,
}

export enum ExactTimes {
    FrequencyBased = 0,
    ScheduleBased = 1,
}

export enum TransferType {
    Recommended = 0,
    TimedTransfer = 1,
    RequiresMinTime = 2,
    NotPossible = 3,
    InSeatTransfer = 4,
    NoInSeatTransfer = 5,
}

export const agency = sqliteTable("agency", {
    agency_id: text().primaryKey(),
    agency_name: text().notNull(),
    agency_url: text().notNull(),
    agency_timezone: text().notNull(),
    agency_lang: text(),
    agency_phone: text(),
    agency_fare_url: text(),
    agency_email: text(),
    extra_fields_json: text({ mode: "json" }),
});

export const stops = sqliteTable(
    "stops",
    {
        stop_id: text().primaryKey(),
        stop_code: text(),
        stop_name: text().notNull(),
        stop_desc: text(),
        stop_lat: real().notNull(),
        stop_lon: real().notNull(),
        zone_id: text(),
        stop_url: text(),
        location_type: integer().$type<LocationType>().default(LocationType.Stop),
        parent_station: text(),
        stop_timezone: text(),
        wheelchair_boarding: integer()
            .$type<WheelchairAccessibility>()
            .default(WheelchairAccessibility.NoInformation),
        level_id: text(),
        platform_code: text(),
        extra_fields_json: text({ mode: "json" }),
    },
    (table) => [
        index("stops_parent_station_idx").on(table.parent_station),
        index("stops_zone_idx").on(table.zone_id),
    ],
);

export const routes = sqliteTable(
    "routes",
    {
        route_id: text().primaryKey(),
        agency_id: text()
            .notNull()
            .references(() => agency.agency_id, { onDelete: "cascade" }),
        route_short_name: text().notNull(),
        route_long_name: text().notNull(),
        route_desc: text(),
        route_type: integer().$type<RouteType>().notNull(),
        route_url: text(),
        route_color: text(),
        route_text_color: text(),
        route_sort_order: integer(),
        extra_fields_json: text({ mode: "json" }),
    },
    (table) => [index("routes_agency_idx").on(table.agency_id)],
);

export const calendar = sqliteTable("calendar", {
    service_id: text().primaryKey(),
    monday: integer().$type<CalendarAvailability>().notNull(),
    tuesday: integer().$type<CalendarAvailability>().notNull(),
    wednesday: integer().$type<CalendarAvailability>().notNull(),
    thursday: integer().$type<CalendarAvailability>().notNull(),
    friday: integer().$type<CalendarAvailability>().notNull(),
    saturday: integer().$type<CalendarAvailability>().notNull(),
    sunday: integer().$type<CalendarAvailability>().notNull(),
    start_date: text().notNull(), // "YYYYMMDD"
    end_date: text().notNull(), // "YYYYMMDD"
});

export const calendarDates = sqliteTable(
    "calendar_dates",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        service_id: text().notNull(),
        date: text().notNull(), // "YYYYMMDD"
        exception_type: integer().$type<ExceptionType>().notNull(),
    },
    (table) => [
        index("cd_service_idx").on(table.service_id),
        uniqueIndex("cd_service_date_idx").on(table.service_id, table.date),
    ],
);

export const shapes = sqliteTable(
    "shapes",
    {
        shape_id: text().notNull(),
        shape_pt_lat: real().notNull(),
        shape_pt_lon: real().notNull(),
        shape_pt_sequence: integer().notNull(),
        shape_dist_traveled: real(),
    },
    (table) => [
        index("shapes_id_idx").on(table.shape_id),
        uniqueIndex("shapes_pk").on(table.shape_id, table.shape_pt_sequence),
    ],
);

export const trips = sqliteTable(
    "trips",
    {
        trip_id: text().primaryKey(),
        route_id: text()
            .notNull()
            .references(() => routes.route_id, { onDelete: "cascade" }),
        service_id: text()
            .notNull()
            .references(() => calendar.service_id, { onDelete: "cascade" }),
        trip_headsign: text(),
        trip_short_name: text(),
        direction_id: integer().$type<DirectionId>(),
        block_id: text(),
        shape_id: text(),
        wheelchair_accessible: integer()
            .$type<WheelchairAccessibility>()
            .default(WheelchairAccessibility.NoInformation),
        bikes_allowed: integer().$type<BikesAllowed>().default(BikesAllowed.NoInformation),
        extra_fields_json: text({ mode: "json" }),
    },
    (table) => [
        index("trips_route_idx").on(table.route_id),
        index("trips_service_idx").on(table.service_id),
        index("trips_shape_idx").on(table.shape_id),
        index("trips_block_idx").on(table.block_id),
    ],
);

export const stopTimes = sqliteTable(
    "stop_times",
    {
        trip_id: text()
            .notNull()
            .references(() => trips.trip_id, { onDelete: "cascade" }),
        arrival_time: integer().notNull(),
        departure_time: integer().notNull(),
        stop_id: text()
            .notNull()
            .references(() => stops.stop_id, { onDelete: "cascade" }),
        stop_sequence: integer().notNull(),
        stop_headsign: text(),
        pickup_type: integer().$type<PickupDropOffType>().default(PickupDropOffType.Regular),
        drop_off_type: integer().$type<PickupDropOffType>().default(PickupDropOffType.Regular),
        shape_dist_traveled: real(),
    },
    (table) => [
        uniqueIndex("st_pk").on(table.trip_id, table.stop_sequence),
        index("st_stop_idx").on(table.stop_id),
    ],
);

export const frequencies = sqliteTable(
    "frequencies",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        trip_id: text()
            .notNull()
            .references(() => trips.trip_id, { onDelete: "cascade" }),
        start_time: text().notNull(),
        end_time: text().notNull(),
        headway_secs: integer().notNull(),
        exact_times: integer().$type<ExactTimes>().default(ExactTimes.FrequencyBased),
    },
    (table) => [index("freq_trip_idx").on(table.trip_id)],
);

export const transfers = sqliteTable(
    "transfers",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        from_stop_id: text()
            .notNull()
            .references(() => stops.stop_id, { onDelete: "cascade" }),
        to_stop_id: text()
            .notNull()
            .references(() => stops.stop_id, { onDelete: "cascade" }),
        transfer_type: integer().$type<TransferType>().notNull(),
        min_transfer_time: integer(),
    },
    (table) => [index("tr_from_idx").on(table.from_stop_id), index("tr_to_idx").on(table.to_stop_id)],
);
