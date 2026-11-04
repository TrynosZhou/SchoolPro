"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dayIntToEnum = dayIntToEnum;
exports.dayEnumToInt = dayEnumToInt;
exports.dayEnumLabel = dayEnumLabel;
const enums_1 = require("../entities/enums");
const DAY_ORDER = [
    enums_1.DayOfWeek.MONDAY,
    enums_1.DayOfWeek.TUESDAY,
    enums_1.DayOfWeek.WEDNESDAY,
    enums_1.DayOfWeek.THURSDAY,
    enums_1.DayOfWeek.FRIDAY,
    enums_1.DayOfWeek.SATURDAY,
    enums_1.DayOfWeek.SUNDAY,
];
/** Timetable convention: 1 = Monday … 7 = Sunday. */
function dayIntToEnum(day) {
    const idx = Math.max(1, Math.min(7, Number(day))) - 1;
    return DAY_ORDER[idx] || enums_1.DayOfWeek.MONDAY;
}
function dayEnumToInt(day) {
    const idx = DAY_ORDER.indexOf(day);
    return idx >= 0 ? idx + 1 : 1;
}
function dayEnumLabel(day) {
    const labels = {
        [enums_1.DayOfWeek.MONDAY]: 'Monday',
        [enums_1.DayOfWeek.TUESDAY]: 'Tuesday',
        [enums_1.DayOfWeek.WEDNESDAY]: 'Wednesday',
        [enums_1.DayOfWeek.THURSDAY]: 'Thursday',
        [enums_1.DayOfWeek.FRIDAY]: 'Friday',
        [enums_1.DayOfWeek.SATURDAY]: 'Saturday',
        [enums_1.DayOfWeek.SUNDAY]: 'Sunday',
    };
    return labels[day] || day;
}
