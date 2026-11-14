"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimetableSnapshot = getTimetableSnapshot;
exports.generateTimetableFromTeacherLoad = generateTimetableFromTeacherLoad;
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const timetable_day_1 = require("../utils/timetable-day");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const teacher_load_service_1 = require("./teacher-load.service");
const teacher_assignment_service_1 = require("./teacher-assignment.service");
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
function timeToMinutes(time) {
    const [h, m] = String(time || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
function normalizePeriods(periods) {
    const sorted = periods
        .map((p) => ({
        startTime: String(p.startTime || '').trim(),
        endTime: String(p.endTime || '').trim(),
        isBreak: p.slotType === 'break',
    }))
        .filter((p) => p.startTime && p.endTime)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    // Lesson periods only, but each remembers whether a break / lunch (or a time gap) sits before it,
    // so a double / triple lesson is never placed across a break.
    const lessons = [];
    let breakSeen = false;
    for (const p of sorted) {
        if (p.isBreak) {
            breakSeen = true;
            continue;
        }
        const prev = lessons[lessons.length - 1];
        const gap = !!prev && timeToMinutes(p.startTime) > timeToMinutes(prev.endTime);
        lessons.push({
            startTime: p.startTime,
            endTime: p.endTime,
            breakBefore: !!prev && (breakSeen || gap),
        });
        breakSeen = false;
    }
    return lessons;
}
/** A multi-period lesson can only start at `periodIndex` if no break / lunch falls inside the block. */
function blockFitsWithoutBreak(periods, periodIndex, blockSize) {
    for (let i = 1; i < blockSize; i += 1) {
        if (periods[periodIndex + i]?.breakBefore)
            return false;
    }
    return true;
}
function longestUnbrokenRun(periods) {
    let best = 0;
    let run = 0;
    for (const p of periods) {
        run = p.breakBefore ? 1 : run + 1;
        if (run > best)
            best = run;
    }
    return best;
}
function canPlaceBlock(task, day, periodIndex, periods, occupied) {
    if (periodIndex < 0 || periodIndex + task.blockSize > periods.length)
        return false;
    if (!blockFitsWithoutBreak(periods, periodIndex, task.blockSize))
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
/** One scheduling attempt. `attempt` 0 is deterministic most-constrained-first; later attempts add jitter. */
function scheduleOnce(tasks, periods, preOccupied, attempt, teacherLoad, classLoad) {
    // Seed with slots that are already taken (e.g. existing lessons when appending) so
    // auto-generation never double-books a class or a teacher.
    const occupied = new Set(preOccupied ?? []);
    const placed = [];
    const scheduledCount = new Map();
    const seed = (tasks.reduce((sum, t) => sum + hashSeed(t.classSubjectId), 0) ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0;
    const rand = mulberry32(seed);
    for (const task of tasks) {
        scheduledCount.set(task.classSubjectId, 0);
    }
    // Most constrained first: long blocks, then teachers/classes with the heaviest load, so a
    // busy teacher (e.g. a Mathematics teacher across many classes) is placed while the grid is
    // still empty. Later attempts add random jitter so retries explore different orders.
    const jitter = attempt === 0 ? 0 : 5 + attempt * 2;
    const priority = (t) => t.blockSize * 1000 +
        (teacherLoad.get(t.teacherId) || 0) * 10 +
        (classLoad.get(t.classId) || 0) +
        t.requiredPeriods +
        rand() * jitter * 10;
    const blocks = buildBlocksToPlace(tasks)
        .map((blk) => ({ blk, p: priority(blk.task) }))
        .sort((x, y) => y.p - x.p)
        .map((x) => x.blk);
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
    const failures = [];
    let unscheduled = 0;
    for (const task of tasks) {
        const scheduled = scheduledCount.get(task.classSubjectId) || 0;
        if (scheduled < task.requiredPeriods) {
            unscheduled += task.requiredPeriods - scheduled;
            failures.push({
                className: task.className,
                subjectName: task.subjectName,
                teacherName: task.teacherName,
                requiredPeriods: task.requiredPeriods,
                scheduledPeriods: scheduled,
                reason: explainFailure(task, scheduled, periods, teacherLoad, classLoad),
            });
        }
    }
    return { placed, failures, unscheduled };
}
function explainFailure(task, scheduled, periods, teacherLoad, classLoad) {
    const weekCapacity = periods.length * 5;
    const tLoad = teacherLoad.get(task.teacherId) || 0;
    const cLoad = classLoad.get(task.classId) || 0;
    if (tLoad > weekCapacity) {
        return `${task.teacherName} is assigned ${tLoad} periods/week but the timetable only has ${weekCapacity} lesson slots (5 days × ${periods.length} periods). Reduce this teacher's load or add periods.`;
    }
    if (cLoad > weekCapacity) {
        return `${task.className} has ${cLoad} periods/week assigned but only ${weekCapacity} lesson slots exist. Reduce the class's weekly periods or add periods.`;
    }
    if (task.blockSize > 1 && task.blockSize <= periods.length && task.blockSize > longestUnbrokenRun(periods)) {
        return `${task.subjectName} uses ${task.blockSize}-period lessons but no ${task.blockSize} lesson periods in a row exist without a break or lunch in between. Use shorter lessons or change the periods.`;
    }
    if (task.blockSize > periods.length) {
        return `${task.subjectName} uses ${task.blockSize}-period lessons but only ${periods.length} lesson periods exist per day.`;
    }
    return scheduled === 0
        ? `No free slot could be found for ${task.teacherName} in ${task.className} (the teacher's or the class's free periods never lined up). Reduce the load or add periods.`
        : `Only ${scheduled} of ${task.requiredPeriods} periods could be scheduled.`;
}
/**
 * Places every assignment, retrying with different orderings and keeping the best result.
 * A single random greedy pass can strand the last lessons of a heavily loaded teacher, so we
 * run several attempts (bounded in time) and stop as soon as everything is placed.
 */
function scheduleAssignments(tasks, periods, preOccupied) {
    const teacherLoad = new Map();
    const classLoad = new Map();
    for (const t of tasks) {
        teacherLoad.set(t.teacherId, (teacherLoad.get(t.teacherId) || 0) + t.requiredPeriods);
        classLoad.set(t.classId, (classLoad.get(t.classId) || 0) + t.requiredPeriods);
    }
    const MAX_ATTEMPTS = 60;
    const TIME_BUDGET_MS = 4000;
    const started = Date.now();
    let best = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const outcome = scheduleOnce(tasks, periods, preOccupied, attempt, teacherLoad, classLoad);
        if (!best || outcome.unscheduled < best.unscheduled)
            best = outcome;
        if (best.unscheduled === 0)
            break;
        if (Date.now() - started > TIME_BUDGET_MS)
            break;
    }
    return { placed: best.placed, failures: best.failures };
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
async function loadAssignmentTasksDetailed(classIds) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ClassSubject);
    // leftJoin on the teacher's user so a staff record without a linked user account is not
    // silently dropped from the timetable.
    const qb = repo
        .createQueryBuilder('cs')
        .innerJoinAndSelect('cs.teacher', 'teacher')
        .leftJoinAndSelect('teacher.user', 'teacherUser')
        .innerJoinAndSelect('cs.schoolClass', 'schoolClass')
        .innerJoinAndSelect('cs.subject', 'subject')
        .where('cs.teacherId IS NOT NULL');
    if (classIds?.length) {
        qb.andWhere('cs.classId IN (:...classIds)', { classIds });
    }
    const rows = await qb.getMany();
    const tasks = [];
    const skipped = [];
    // Fallback sources for "weekly periods" when Class Subject.weeklyPeriods was never set
    // (e.g. the teacher was assigned a subject from Class Assignments without a period count).
    const assignmentRepo = data_source_1.AppDataSource.getRepository(entities_1.TeacherAssignment);
    const activeAssignments = await assignmentRepo.find({
        where: { role: enums_1.TeacherAssignmentRole.SUBJECT_TEACHER, isActive: true, endDate: (0, typeorm_1.IsNull)() },
    });
    const assignmentPeriods = new Map();
    for (const a of activeAssignments) {
        if (!a.teacherId || !a.classId || !a.subjectId)
            continue;
        const n = Math.round(Number(a.weeklyPeriods) || 0);
        if (n > 0)
            assignmentPeriods.set(`${a.teacherId}:${a.classId}:${a.subjectId}`, n);
    }
    for (const cs of rows) {
        const lessonLength = (0, teacher_load_service_1.normalizeLessonLength)(cs.lessonLength);
        const blockSize = (0, teacher_load_service_1.lessonLengthMultiplier)(lessonLength);
        let weeklyPeriods = Math.max(0, Math.round(Number(cs.weeklyPeriods) || 0));
        if (weeklyPeriods < 1) {
            weeklyPeriods = assignmentPeriods.get(`${cs.teacherId}:${cs.classId}:${cs.subjectId}`) || 0;
        }
        if (weeklyPeriods < 1) {
            const existing = await data_source_1.AppDataSource.getRepository(entities_1.Timetable).count({
                where: { teacherId: cs.teacherId, classId: cs.classId, subjectId: cs.subjectId },
            });
            weeklyPeriods = Math.ceil(existing / blockSize);
        }
        if (weeklyPeriods < 1) {
            skipped.push({
                className: cs.schoolClass?.name || 'Class',
                subjectName: cs.subject?.name || 'Subject',
                teacherName: staffName(cs.teacher),
                requiredPeriods: 0,
                scheduledPeriods: 0,
                reason: `${staffName(cs.teacher)} is assigned ${cs.subject?.name || 'this subject'} in ${cs.schoolClass?.name || 'this class'} but no weekly periods are set. Set the number of periods on Staff → Teacher Load, then generate again.`,
            });
            continue;
        }
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
    return { tasks, skipped };
}
async function loadAssignmentTasks(classIds) {
    return (await loadAssignmentTasksDetailed(classIds)).tasks;
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
    const { tasks, skipped } = await loadAssignmentTasksDetailed(classIds);
    if (!tasks.length) {
        throw new Error(skipped.length
            ? `${skipped.length} teacher assignment(s) have no weekly periods set (e.g. ${skipped[0].teacherName} – ${skipped[0].subjectName}, ${skipped[0].className}). Set periods on Staff → Teacher Load first.`
            : 'No teacher load assignments found. Assign classes and subjects on Staff → Teacher Load first.');
    }
    const capacityPerWeek = periods.length * 5;
    const requiredSlots = tasks.reduce((s, t) => s + t.requiredPeriods, 0);
    if (requiredSlots > capacityPerWeek * new Set(tasks.map((t) => t.classId)).size) {
        // Soft warning only — per-class capacity is periods*5, not global
    }
    const replacing = input.replaceExisting !== false;
    // When appending (not replacing), the generator must know which class/teacher slots
    // are already used so it does not place lessons on top of existing ones.
    const preOccupied = new Set();
    if (!replacing) {
        const existing = await data_source_1.AppDataSource.getRepository(entities_1.Timetable).find();
        for (const e of existing) {
            preOccupied.add(slotKey('c', e.classId, e.dayOfWeek, e.startTime));
            if (e.teacherId) {
                preOccupied.add(slotKey('t', e.teacherId, e.dayOfWeek, e.startTime));
            }
        }
    }
    const { placed, failures: placementFailures } = scheduleAssignments(tasks, periods, preOccupied);
    // Assignments that were skipped (no weekly periods) are reported, never silently dropped.
    const failures = [...skipped, ...placementFailures];
    await data_source_1.AppDataSource.transaction(async (manager) => {
        const timetableRepo = manager.getRepository(entities_1.Timetable);
        const allocationRepo = manager.getRepository(entities_1.TeacherAllocation);
        if (replacing) {
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
    await (0, teacher_assignment_service_1.syncTimetableSlotsFromGenerated)({ replaceAll: replacing });
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
