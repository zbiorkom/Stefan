import { dateToString } from "@/util";
import { calendar, calendarDates, type Task, ExceptionType, CalendarAvailability } from "..";

const MS_DAY = 24 * 60 * 60 * 1000;

export default (backwardDays: number = -1, forwardDays: number = 7) => {
    return {
        id: "getActiveServices",
        execute: async ({ db }) => {
            const activeServices = new Map<string, number[]>();

            const allCalendars = await db.select().from(calendar);
            const allExceptions = await db.select().from(calendarDates);

            const exceptionsByService = new Map<string, typeof allExceptions>();
            for (const ex of allExceptions) {
                let arr = exceptionsByService.get(ex.service_id);
                if (!arr) {
                    arr = [];
                    exceptionsByService.set(ex.service_id, arr);
                }
                arr.push(ex);
            }

            const allServiceIds = new Set([
                ...allCalendars.map((c) => c.service_id),
                ...allExceptions.map((e) => e.service_id),
            ]);

            const calendarsByService = new Map(allCalendars.map((c) => [c.service_id, c]));

            const now = new Date();
            const utcMidnight = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

            for (const serviceId of allServiceIds) {
                const results: number[] = [];
                const serviceCalendar = calendarsByService.get(serviceId);
                const serviceExceptions = exceptionsByService.get(serviceId) || [];

                for (let offset = backwardDays; offset <= forwardDays; offset++) {
                    const dayTimestamp = utcMidnight.getTime() + offset * MS_DAY;
                    const dayDate = new Date(dayTimestamp);
                    const dayKey = dateToString(dayDate);

                    let active = false;

                    if (serviceCalendar) {
                        if (dayKey >= serviceCalendar.start_date && dayKey <= serviceCalendar.end_date) {
                            const dayOfWeek = dayDate.getUTCDay();
                            const isDayActive =
                                [
                                    serviceCalendar.sunday,
                                    serviceCalendar.monday,
                                    serviceCalendar.tuesday,
                                    serviceCalendar.wednesday,
                                    serviceCalendar.thursday,
                                    serviceCalendar.friday,
                                    serviceCalendar.saturday,
                                ][dayOfWeek] === CalendarAvailability.Available;

                            if (isDayActive) {
                                active = true;
                            }
                        }
                    }

                    for (const ex of serviceExceptions) {
                        if (ex.date !== dayKey) continue;
                        if (ex.exception_type === ExceptionType.Added) active = true;
                        if (ex.exception_type === ExceptionType.Removed) active = false;
                    }

                    if (active) {
                        results.push(dayTimestamp);
                    }
                }

                if (results.length > 0) {
                    activeServices.set(serviceId, results);
                }
            }

            return activeServices;
        },
    } satisfies Task;
};
