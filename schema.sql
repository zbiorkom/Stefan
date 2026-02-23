CREATE TABLE `agency` (
	`agency_id` text PRIMARY KEY NOT NULL,
	`agency_name` text NOT NULL,
	`agency_url` text NOT NULL,
	`agency_timezone` text NOT NULL,
	`agency_lang` text,
	`agency_phone` text,
	`agency_fare_url` text,
	`agency_email` text,
	`extra_fields_json` text
);
--> statement-breakpoint
CREATE TABLE `calendar` (
	`service_id` text PRIMARY KEY NOT NULL,
	`monday` integer NOT NULL,
	`tuesday` integer NOT NULL,
	`wednesday` integer NOT NULL,
	`thursday` integer NOT NULL,
	`friday` integer NOT NULL,
	`saturday` integer NOT NULL,
	`sunday` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_dates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_id` text NOT NULL,
	`date` text NOT NULL,
	`exception_type` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `calendar`(`service_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cd_service_idx` ON `calendar_dates` (`service_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cd_service_date_idx` ON `calendar_dates` (`service_id`,`date`);--> statement-breakpoint
CREATE TABLE `frequencies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`headway_secs` integer NOT NULL,
	`exact_times` integer DEFAULT 0,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`trip_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `freq_trip_idx` ON `frequencies` (`trip_id`);--> statement-breakpoint
CREATE TABLE `routes` (
	`route_id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`route_short_name` text NOT NULL,
	`route_long_name` text NOT NULL,
	`route_desc` text,
	`route_type` integer NOT NULL,
	`route_url` text,
	`route_color` text,
	`route_text_color` text,
	`route_sort_order` integer,
	`extra_fields_json` text,
	FOREIGN KEY (`agency_id`) REFERENCES `agency`(`agency_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routes_agency_idx` ON `routes` (`agency_id`);--> statement-breakpoint
CREATE TABLE `shapes` (
	`shape_id` text NOT NULL,
	`shape_pt_lat` real NOT NULL,
	`shape_pt_lon` real NOT NULL,
	`shape_pt_sequence` integer NOT NULL,
	`shape_dist_traveled` real
);
--> statement-breakpoint
CREATE INDEX `shapes_id_idx` ON `shapes` (`shape_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shapes_pk` ON `shapes` (`shape_id`,`shape_pt_sequence`);--> statement-breakpoint
CREATE TABLE `stop_times` (
	`trip_id` text NOT NULL,
	`arrival_time` integer NOT NULL,
	`departure_time` integer NOT NULL,
	`stop_id` text NOT NULL,
	`stop_sequence` integer NOT NULL,
	`stop_headsign` text,
	`pickup_type` integer DEFAULT 0,
	`drop_off_type` integer DEFAULT 0,
	`shape_dist_traveled` real,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`trip_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stop_id`) REFERENCES `stops`(`stop_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `st_pk` ON `stop_times` (`trip_id`,`stop_sequence`);--> statement-breakpoint
CREATE INDEX `st_stop_idx` ON `stop_times` (`stop_id`);--> statement-breakpoint
CREATE TABLE `stops` (
	`stop_id` text PRIMARY KEY NOT NULL,
	`stop_code` text,
	`stop_name` text NOT NULL,
	`stop_desc` text,
	`stop_lat` real NOT NULL,
	`stop_lon` real NOT NULL,
	`zone_id` text,
	`stop_url` text,
	`location_type` integer DEFAULT 0,
	`parent_station` text,
	`stop_timezone` text,
	`wheelchair_boarding` integer DEFAULT 0,
	`level_id` text,
	`platform_code` text,
	`extra_fields_json` text
);
--> statement-breakpoint
CREATE INDEX `stops_parent_station_idx` ON `stops` (`parent_station`);--> statement-breakpoint
CREATE INDEX `stops_zone_idx` ON `stops` (`zone_id`);--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_stop_id` text NOT NULL,
	`to_stop_id` text NOT NULL,
	`transfer_type` integer NOT NULL,
	`min_transfer_time` integer,
	FOREIGN KEY (`from_stop_id`) REFERENCES `stops`(`stop_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_stop_id`) REFERENCES `stops`(`stop_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tr_from_idx` ON `transfers` (`from_stop_id`);--> statement-breakpoint
CREATE INDEX `tr_to_idx` ON `transfers` (`to_stop_id`);--> statement-breakpoint
CREATE TABLE `trips` (
	`trip_id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`service_id` text NOT NULL,
	`trip_headsign` text,
	`trip_short_name` text,
	`direction_id` integer,
	`block_id` text,
	`shape_id` text,
	`wheelchair_accessible` integer DEFAULT 0,
	`bikes_allowed` integer DEFAULT 0,
	`extra_fields_json` text,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`route_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `calendar`(`service_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trips_route_idx` ON `trips` (`route_id`);--> statement-breakpoint
CREATE INDEX `trips_service_idx` ON `trips` (`service_id`);--> statement-breakpoint
CREATE INDEX `trips_shape_idx` ON `trips` (`shape_id`);--> statement-breakpoint
CREATE INDEX `trips_block_idx` ON `trips` (`block_id`);