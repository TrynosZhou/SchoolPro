"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimetableSnapshot = getTimetableSnapshot;
exports.generateTimetableFromTeacherLoad = generateTimetableFromTeacherLoad;
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const timetable_day_1 = require("../utils/timetable-day");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const teacher_load_service_1 = require("./teacher-load.service");
const teacher_display_1 = require("../utils/teacher-display");
function staffName(staff) {
    return (0, teacher_display_1.formatTeacherTimetableName)(staff);
}
function hashSeed(value) {
    let h = 0;
    for (let i = 0; i < value.length; i += 1) {
        h = (h * 31 + value.charCodeAt(i)) >>> 0;
    }
    return h;
}
function slotKey(prefix, id, day, startTime) {
    return `${prefix}:${id}:${day}:${startTime}`;
}
function normalizePeriods(periods) {
    return periods
        .map((p) => ({
        startTime: String(p.startTime || '').trim(),
        endTime: String(p.endTime || '').trim(),
    }))
        .filter((p) => p.startTime && p.endTime)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
function canPlaceBlock(task, day, periodIndex, periods, occupied) {
    if (periodIndex < 0 || periodIndex + task.blockSize > periods.length)
        return false;
    for (let i = 0; i < task.blockSize; i += 1) {
        const p = periods[periodIndex + i];
        const ck = slotKey('c', task.classId, day, p.startTime);
        const tk = slotKey('t', task.teacherId, day, p.startTime);
        if (occupied.has(ck) || occupied.has(tk))
            return false;
    }
    return true;
}
function occupyBlock(task, day, periodIndex, periods, occupied) {
    for (let i = 0; i < task.blockSize; i += 1) {
        const p = periods[periodIndex + i];
        occupied.add(slotKey('c', task.classId, day, p.startTime));
        occupied.add(slotKey('t', task.teacherId, day, p.startTime));
    }
}
function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffleWithRng(items, rand) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function buildBlocksToPlace(tasks) {
    const blocks = [];
    for (const task of tasks) {
        for (let b = 0; b < task.blocksPerWeek; b += 1) {
            blocks.push({ task });
        }
    }
    return blocks;
}
function scoreCandidate(task, day, periodIndex, placed, rand) {
    let score = rand() * 4;
    for (const p of placed) {
        if (p.task.classSubjectId === task.classSubjectId && p.periodIndex === periodIndex) {
            score += 80;
        }
        if (p.task.teacherId === task.teacherId && p.periodIndex === periodIndex) {
            score += 40;
        }
        if (p.task.classSubjectId === task.classSubjectId && p.dayOfWeek === day) {
            score += 25;
        }
        if (p.task.teacherId === task.teacherId && p.dayOfWeek === day) {
            score += 10;
        }
    }
    return score;
}
function listCandidates(task, periods, occupied, placed, rand) {
    const candidates = [];
    for (let day = 1; day <= 5; day += 1) {
        for (let pi = 0; pi <= periods.length - task.blockSize; pi += 1) {
            if (!canPlaceBlock(task, day, pi, periods, occupied))
                continue;
            candidates.push({
                day,
                periodIndex: pi,
                score: scoreCandidate(task, day, pi, placed, rand),
            });
        }
    }
    return candidates.sort((a, b) => a.score - b.score);
}
function scheduleAssignments(tasks, periods) {
    const occupied = new Set();
    const placed = [];
    const failures = [];
    const scheduledCount = new Map();
    const seed = tasks.reduce((s, t) => s + hashSeed(t.classSubjectId), 0) ^ (Date.now() & 0xffff);
    const rand = mulberry32(seed);
    for (const task of tasks) {
        scheduledCount.set(task.classSubjectId, 0);
    }
    const blocks = shuffleWithRng(buildBlocksToPlace([...tasks].sort((a, b) => b.blockSize - a.blockSize || b.requiredPeriods - a.requiredPeriods)), rand);
    for (const { task } of blocks) {
        const candidates = listCandidates(task, periods, occupied, placed, rand);
        if (!candidates.length)
            continue;
        const bestScore = candidates[0].score;
        const topTier = candidates.filter((c) => c.score <= bestScore + 8);
        const pick = shuffleWithRng(topTier, rand)[0];
        occupyBlock(task, pick.day, pick.periodIndex, periods, occupied);
        placed.push({
            task,
            dayOfWeek: pick.day,
            periodIndex: pick.periodIndex,
            blockSize: task.blockSize,
        });
        scheduledCount.set(task.classSubjectId, (scheduledCount.get(task.classSubjectId) || 0) + task.blockSize);
    }
    for (const task of tasks) {
        const scheduled = scheduledCount.get(task.classSubjectId) || 0;
        if (scheduled < task.requiredPeriods) {
            failures.push({
                className: task.className,
                subjectName: task.subjectName,
                teacherName: task.teacherName,
                requiredPeriods: task.requiredPeriods,
                scheduledPeriods: scheduled,
                reason: scheduled === 0
                    ? 'No free slots matched teacher load (increase periods or reduce assignments).'
                    : `Only ${scheduled} of ${task.requiredPeriods} periods could be scheduled.`,
            });
        }
    }
    return { placed, failures };
}
function buildViewsFromSlots(slots) {
    const byTeacher = new Map();
    const byClass = new Map();
    for (const slot of slots) {
        if (!byTeacher.has(slot.teacherId))
            byTeacher.set(slot.teacherId, []);
        byTeacher.get(slot.teacherId).push(slot);
        if (!byClass.has(slot.classId))
            byClass.set(slot.classId, []);
        byClass.get(slot.classId).push(slot);
    }
    const teachers = [...byTeacher.entries()]
        .map(([teacherId, rows]) => {
        rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
        return {
            teacherId,
            teacherName: rows[0]?.teacherName || '',
            employeeNumber: rows[0]?.employeeNumber || '',
            slotCount: rows.length,
            classCount: new Set(rows.map((r) => r.classId)).size,
            subjectCount: new Set(rows.map((r) => r.subjectId)).size,
            slots: rows,
        };
    })
        .sort((a, b) => a.teacherName.localeCompare(b.teacherName));
    const classes = [...byClass.entries()]
        .map(([classId, rows]) => {
        rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
        return {
            classId,
            className: rows[0]?.className || '',
            slotCount: rows.length,
            subjectCount: new Set(rows.map((r) => r.subjectId)).size,
            slots: rows,
        };
    })
        .sort((a, b) => a.className.localeCompare(b.className));
    const summaryMap = new Map();
    for (const teacher of teachers) {
        const assignmentMap = new Map();
        for (const slot of teacher.slots) {
            const key = `${slot.classId}:${slot.subjectId}`;
            if (!assignmentMap.has(key)) {
                assignmentMap.set(key, {
                    classId: slot.classId,
                    className: slot.className,
                    subjectId: slot.subjectId,
                    subjectName: slot.subjectName,
                    weeklyPeriods: 0,
                    lessonLength: 'single',
                    scheduledPeriods: 0,
                    requiredPeriods: 0,
                });
            }
            assignmentMap.get(key).scheduledPeriods += 1;
        }
        summaryMap.set(teacher.teacherId, {
            teacherId: teacher.teacherId,
            teacherName: teacher.teacherName,
            employeeNumber: teacher.employeeNumber,
            totalPeriods: teacher.slotCount,
            classCount: teacher.classCount,
            subjectCount: teacher.subjectCount,
            assignments: [...assignmentMap.values()].sort((a, b) => a.className.localeCompare(b.className)),
        });
    }
    return {
        teachers,
        classes,
        teacherSummary: [...summaryMap.values()].sort((a, b) => a.teacherName.localeCompare(b.teacherName)),
    };
}
async function loadAssignmentTasks(classIds) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
    const qb = repo
        .createQueryBuilder('cs')
        .innerJoinAndSelect('cs.teacher', 'teacher')
        .innerJoinAndSelect('teacher.user', 'teacherUser')
        .innerJoinAndSelect('cs.schoolClass', 'schoolClass')
        .innerJoinAndSelect('cs.subject', 'subject')
        .where('cs.teacherId IS NOT NULL')
        .andWhere('cs.weeklyPeriods > 0');
    if (classIds?.length) {
        qb.andWhere('cs.classId IN (:...classIds)', { classIds });
    }
    const rows = await qb.getMany();
    const tasks = [];
    for (const cs of rows) {
        const weeklyPeriods = Math.max(0, Math.round(Number(cs.weeklyPeriods) || 0));
        if (weeklyPeriods < 1)
            continue;
        const lessonLength = (0, teacher_load_service_1.normalizeLessonLength)(cs.lessonLength);
        const blockSize = (0, teacher_load_service_1.lessonLengthMultiplier)(lessonLength);
        const requiredPeriods = (0, teacher_load_service_1.effectiveWeeklyPeriods)(weeklyPeriods, lessonLength);
        tasks.push({
            classSubjectId: cs.id,
            teacherId: cs.teacherId,
            classId: cs.classId,
            subjectId: cs.subjectId,
            className: cs.schoolClass?.name || 'Class',
            subjectName: cs.subject?.name || 'Subject',
            teacherName: staffName(cs.teacher),
            employeeNumber: cs.teacher?.employeeNumber || '',
            blockSize,
            blocksPerWeek: weeklyPeriods,
            requiredPeriods,
            seed: hashSeed(cs.id) % 5,
        });
    }
    return tasks;
}
async function enrichSummaryWithLoads(summary, classIds) {
    const tasks = await loadAssignmentTasks(classIds);
    const loadByTeacher = new Map();
    for (const task of tasks) {
        if (!loadByTeacher.has(task.teacherId))
            loadByTeacher.set(task.teacherId, []);
        loadByTeacher.get(task.teacherId).push(task);
    }
    const enriched = [];
    const seenTeachers = new Set();
    for (const row of summary) {
        seenTeachers.add(row.teacherId);
        const loads = loadByTeacher.get(row.teacherId) || [];
        const assignments = loads.map((task) => {
            const scheduled = row.assignments.find((a) => a.classId === task.classId && a.subjectId === task.subjectId)?.scheduledPeriods || 0;
            return {
                classId: task.classId,
                className: task.className,
                subjectId: task.subjectId,
                subjectName: task.subjectName,
                weeklyPeriods: task.blocksPerWeek,
                lessonLength: task.blockSize === 3 ? 'triple' : task.blockSize === 2 ? 'double' : 'single',
                scheduledPeriods: scheduled,
                requiredPeriods: task.requiredPeriods,
            };
        });
        enriched.push({
            ...row,
            assignments,
            totalPeriods: assignments.reduce((s, a) => s + a.scheduledPeriods, 0),
            classCount: new Set(assignments.map((a) => a.classId)).size,
            subjectCount: new Set(assignments.map((a) => a.subjectId)).size,
        });
    }
    for (const [teacherId, loads] of loadByTeacher) {
        if (seenTeachers.has(teacherId))
            continue;
        const first = loads[0];
        enriched.push({
            teacherId,
            teacherName: first.teacherName,
            employeeNumber: first.employeeNumber,
            totalPeriods: 0,
            classCount: new Set(loads.map((l) => l.classId)).size,
            subjectCount: new Set(loads.map((l) => l.subjectId)).size,
            assignments: loads.map((task) => ({
                classId: task.classId,
                className: task.className,
                subjectId: task.subjectId,
                subjectName: task.subjectName,
                weeklyPeriods: task.blocksPerWeek,
                lessonLength: task.blockSize === 3 ? 'triple' : task.blockSize === 2 ? 'double' : 'single',
                scheduledPeriods: 0,
                requiredPeriods: task.requiredPeriods,
            })),
        });
    }
    return enriched.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
}
async function getTimetableSnapshot() {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Timetable);
    const rows = await repo.find({
        where: { teacherId: (0, typeorm_1.Not)((0, typeorm_1.IsNull)()) },
        relations: (0, typeorm_helpers_1.relations)('subject', 'teacher', 'teacher.user', 'schoolClass'),
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
    const slots = rows
        .filter((r) => r.teacherId)
        .map((r) => ({
        id: r.id,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        classId: r.classId,
        className: r.schoolClass?.name || '',
        subjectId: r.subjectId,
        subjectName: r.subject?.name || '',
        subjectCode: r.subject?.code || null,
        subjectShort: r.subject?.short || null,
        teacherId: r.teacherId,
        teacherName: staffName(r.teacher),
        employeeNumber: r.teacher?.employeeNumber || '',
        isLocked: !!r.isLocked,
    }));
    const views = buildViewsFromSlots(slots);
    const teacherSummary = await enrichSummaryWithLoads(views.teacherSummary);
    return {
        success: slots.length > 0,
        summary: {
            totalSlots: slots.length,
            classesScheduled: views.classes.length,
            teachersScheduled: views.teachers.length,
            assignmentsPlaced: teacherSummary.filter((t) => t.assignments.every((a) => a.scheduledPeriods >= a.requiredPeriods)).length,
            assignmentsPartial: teacherSummary.filter((t) => t.assignments.some((a) => a.scheduledPeriods > 0 && a.scheduledPeriods < a.requiredPeriods)).length,
            assignmentsFailed: teacherSummary.filter((t) => t.assignments.every((a) => a.scheduledPeriods === 0)).length,
            capacityPerWeek: 0,
            requiredSlots: teacherSummary.reduce((s, t) => s + t.assignments.reduce((a, b) => a + b.requiredPeriods, 0), 0),
        },
        failures: [],
        teachers: views.teachers,
        classes: views.classes,
        teacherSummary,
    };
}
async function generateTimetableFromTeacherLoad(input) {
    const periods = normalizePeriods(input.periods || []);
    if (!periods.length) {
        throw new Error('At least one lesson period is required. Configure periods first.');
    }
    const classIds = input.classIds?.filter(Boolean);
    const tasks = await loadAssignmentTasks(classIds);
    if (!tasks.length) {
        throw new Error('No teacher load assignments found. Assign classes and subjects on Staff → Teacher Load first.');
    }
    const capacityPerWeek = periods.length * 5;
    const requiredSlots = tasks.reduce((s, t) => s + t.requiredPeriods, 0);
    if (requiredSlots > capacityPerWeek * new Set(tasks.map((t) => t.classId)).size) {
        // Soft warning only — per-class capacity is periods*5, not global
    }
    const { placed, failures } = scheduleAssignments(tasks, periods);
    await data_source_1.AppDataSource.transaction(async (manager) => {
        const timetableRepo = manager.getRepository(entities_1.Timetable);
        const allocationRepo = manager.getRepository(entities_1.TeacherAllocation);
        if (input.replaceExisting !== false) {
            await allocationRepo.createQueryBuilder().delete().execute();
            await timetableRepo.createQueryBuilder().delete().execute();
        }
        for (const block of placed) {
            for (let i = 0; i < block.blockSize; i += 1) {
                const period = periods[block.periodIndex + i];
                const entry = await timetableRepo.save(timetableRepo.create({
                    classId: block.task.classId,
                    subjectId: block.task.subjectId,
                    teacherId: block.task.teacherId,
                    dayOfWeek: block.dayOfWeek,
                    startTime: period.startTime,
                    endTime: period.endTime,
                }));
                const dayOfWeek = (0, timetable_day_1.dayIntToEnum)(block.dayOfWeek);
                await allocationRepo.save(allocationRepo.create({
                    timetableEntryId: entry.id,
                    teacherId: block.task.teacherId,
                    subjectId: block.task.subjectId,
                    classId: block.task.classId,
                    dayOfWeek,
                    startTime: period.startTime,
                    endTime: period.endTime,
                }));
            }
        }
    });
    const snapshot = await getTimetableSnapshot();
    const assignmentsPlaced = tasks.filter((t) => !failures.some((f) => f.className === t.className && f.subjectName === t.subjectName)).length;
    return {
        ...snapshot,
        success: failures.length === 0,
        summary: {
            ...snapshot.summary,
            assignmentsPlaced,
            assignmentsPartial: failures.filter((f) => f.scheduledPeriods > 0).length,
            assignmentsFailed: failures.filter((f) => f.scheduledPeriods === 0).length,
            capacityPerWeek,
            requiredSlots,
        },
        failures,
    };
}
