"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeGender = normalizeGender;
exports.getDemographics = getDemographics;
exports.getRetention = getRetention;
exports.getAtRiskStudents = getAtRiskStudents;
const data_source_1 = require("../config/data-source");
const Term_1 = require("../entities/Term");
const student_lifecycle_service_1 = require("./student-lifecycle.service");
function normalizeGender(raw) {
    const g = (raw || '').trim().toLowerCase();
    if (g === 'male' || g === 'm' || g === 'boy')
        return 'Male';
    if (g === 'female' || g === 'f' || g === 'girl')
        return 'Female';
    return 'Unspecified';
}
function studentTypeLabel(raw) {
    return (raw || '').toLowerCase() === 'boarder' ? 'Boarder' : 'Day Scholar';
}
function ageFromDob(dob, asOf) {
    if (!dob)
        return null;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime()))
        return null;
    const ref = asOf ? new Date(asOf) : new Date();
    let age = ref.getFullYear() - birth.getFullYear();
    const m = ref.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < birth.getDate()))
        age--;
    return age >= 0 && age < 120 ? age : null;
}
const AGE_BANDS = [
    { key: 'Under 6', min: 0, max: 5 },
    { key: '6-10', min: 6, max: 10 },
    { key: '11-13', min: 11, max: 13 },
    { key: '14-16', min: 14, max: 16 },
    { key: '17+', min: 17, max: 200 },
];
function ageBand(age) {
    if (age == null)
        return 'Unknown';
    return AGE_BANDS.find((b) => age >= b.min && age <= b.max)?.key ?? 'Unknown';
}
async function resolveSchoolYearId(filters) {
    if (filters.schoolYearId)
        return filters.schoolYearId;
    if (filters.termId) {
        const term = await data_source_1.AppDataSource.getRepository(Term_1.Term).findOne({ where: { id: filters.termId } });
        return term?.schoolYearId;
    }
    return undefined;
}
/** Cast positional params to uuid in raw SQL ($1::uuid, $2::uuid, …). */
function uuidWhere(column, index) {
    return `${column} = $${index}::uuid`;
}
/** Text comparison for snapshot columns stored as varchar (legacy sync). */
function textIdWhere(column, index) {
    return `${column} = $${index}`;
}
async function getDemographics(filters) {
    const schoolYearId = await resolveSchoolYearId(filters);
    const current = await (0, student_lifecycle_service_1.getActiveSchoolYear)();
    const asOf = null; // ages computed as of today for simplicity
    let rows = [];
    let source = 'live';
    if (schoolYearId) {
        // Prefer historical snapshot when the year has enrollment history.
        const snapCount = await data_source_1.AppDataSource.query(`SELECT COUNT(*)::int AS c FROM student_enrollments WHERE ${uuidWhere('"schoolYearId"', 1)}`, [schoolYearId]);
        if (Number(snapCount?.[0]?.c || 0) > 0)
            source = 'snapshot';
    }
    if (source === 'snapshot' && schoolYearId) {
        const params = [schoolYearId];
        let where = `${uuidWhere('e."schoolYearId"', 1)} AND e.status IN ('enrolled', 'completed', 'left')`;
        if (filters.classId) {
            params.push(filters.classId);
            where += ` AND ${textIdWhere('e."classId"', params.length)}`;
        }
        if (filters.formId) {
            params.push(filters.formId);
            where += ` AND ${textIdWhere('e."formId"', params.length)}`;
        }
        rows = await data_source_1.AppDataSource.query(`
      SELECT s.gender, s."studentType", s."dateOfBirth",
             e."classId", e."className", e."formId", e."formName", f.level AS "formLevel"
      FROM student_enrollments e
      JOIN students s ON s.id = e."studentId"
      LEFT JOIN forms f ON f.id = e."formId"::uuid
      WHERE ${where}
      `, params);
    }
    else {
        const params = [];
        let where = `s."isActive" = true`;
        if (filters.classId) {
            params.push(filters.classId);
            where += ` AND ${uuidWhere('s."classId"', params.length)}`;
        }
        if (filters.formId) {
            params.push(filters.formId);
            where += ` AND ${uuidWhere('s."formId"', params.length)}`;
        }
        rows = await data_source_1.AppDataSource.query(`
      SELECT s.gender, s."studentType", s."dateOfBirth",
             s."classId", c.name AS "className", s."formId", f.name AS "formName", f.level AS "formLevel"
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      LEFT JOIN forms f ON f.id = s."formId"
      WHERE ${where}
      `, params);
    }
    // Aggregate in JS for flexibility (dataset is at most a few thousand rows).
    const totals = { total: 0, male: 0, female: 0, unspecified: 0, boarders: 0, dayScholars: 0 };
    const genderMap = new Map();
    const typeMap = new Map();
    const ageMap = new Map();
    const formMap = new Map();
    const classMap = new Map();
    const bump = (map, id, label, level, g, isBoarder) => {
        let grp = map.get(id);
        if (!grp) {
            grp = { id, label, level, total: 0, male: 0, female: 0, unspecified: 0, boarders: 0, dayScholars: 0 };
            map.set(id, grp);
        }
        grp.total++;
        if (g === 'Male')
            grp.male++;
        else if (g === 'Female')
            grp.female++;
        else
            grp.unspecified++;
        if (isBoarder)
            grp.boarders++;
        else
            grp.dayScholars++;
    };
    for (const r of rows) {
        const g = normalizeGender(r.gender);
        const type = studentTypeLabel(r.studentType);
        const isBoarder = type === 'Boarder';
        totals.total++;
        if (g === 'Male')
            totals.male++;
        else if (g === 'Female')
            totals.female++;
        else
            totals.unspecified++;
        if (isBoarder)
            totals.boarders++;
        else
            totals.dayScholars++;
        genderMap.set(g, (genderMap.get(g) || 0) + 1);
        typeMap.set(type, (typeMap.get(type) || 0) + 1);
        const band = ageBand(ageFromDob(r.dateOfBirth, asOf));
        ageMap.set(band, (ageMap.get(band) || 0) + 1);
        const formId = r.formId || 'unassigned';
        bump(formMap, formId, r.formName || 'Unassigned', r.formLevel ?? 999, g, isBoarder);
        const classId = r.classId || 'unassigned';
        bump(classMap, classId, r.className || 'Unassigned', r.formLevel ?? 999, g, isBoarder);
    }
    const byGender = ['Male', 'Female', 'Unspecified'];
    return {
        source,
        schoolYearId: schoolYearId ?? current?.id,
        totals,
        byGender: byGender
            .filter((k) => (genderMap.get(k) || 0) > 0 || k !== 'Unspecified')
            .map((k) => ({ key: k, count: genderMap.get(k) || 0 })),
        byStudentType: ['Boarder', 'Day Scholar'].map((k) => ({ key: k, count: typeMap.get(k) || 0 })),
        byGrade: [...formMap.values()]
            .sort((a, b) => a.level - b.level || a.label.localeCompare(b.label))
            .map((g) => ({
            formId: g.id,
            formName: g.label,
            level: g.level === 999 ? null : g.level,
            total: g.total,
            male: g.male,
            female: g.female,
            unspecified: g.unspecified,
        })),
        byClass: [...classMap.values()]
            .sort((a, b) => a.level - b.level || a.label.localeCompare(b.label))
            .map((g) => ({
            classId: g.id,
            className: g.label,
            total: g.total,
            male: g.male,
            female: g.female,
            boarders: g.boarders,
            dayScholars: g.dayScholars,
        })),
        byAge: AGE_BANDS.map((b) => ({ key: b.key, count: ageMap.get(b.key) || 0 })).concat(ageMap.get('Unknown') ? [{ key: 'Unknown', count: ageMap.get('Unknown') || 0 }] : []),
    };
}
// ---------------------------------------------------------------------------
// 2. Dropout & retention tracking
// ---------------------------------------------------------------------------
async function getRetention() {
    // Pull every enrollment snapshot with its year, ordered chronologically.
    const enrollments = await data_source_1.AppDataSource.query(`
    SELECT e."schoolYearId", sy.name AS "yearName", sy."startDate" AS "startDate",
           e."studentId", e.status
    FROM student_enrollments e
    JOIN school_years sy ON sy.id = e."schoolYearId"
    ORDER BY sy."startDate" ASC
  `);
    // Group students by year.
    const yearOrder = [];
    const seenYear = new Set();
    const yearStudents = new Map();
    const yearGraduates = new Map();
    for (const e of enrollments) {
        if (!seenYear.has(e.schoolYearId)) {
            seenYear.add(e.schoolYearId);
            yearOrder.push({ id: e.schoolYearId, name: e.yearName, startDate: e.startDate });
            yearStudents.set(e.schoolYearId, new Set());
            yearGraduates.set(e.schoolYearId, new Set());
        }
        yearStudents.get(e.schoolYearId).add(e.studentId);
        if (e.status === 'completed')
            yearGraduates.get(e.schoolYearId).add(e.studentId);
    }
    const byYear = yearOrder.map((y) => ({
        schoolYearId: y.id,
        name: y.name,
        enrolled: yearStudents.get(y.id).size,
        graduated: yearGraduates.get(y.id).size,
    }));
    // Year-over-year retention: of the students eligible to return from year N-1
    // (enrolled last year minus those who graduated), how many appear in year N.
    const yearOverYear = [];
    for (let i = 1; i < yearOrder.length; i++) {
        const prev = yearOrder[i - 1];
        const curr = yearOrder[i];
        const prevSet = yearStudents.get(prev.id);
        const gradSet = yearGraduates.get(prev.id);
        const currSet = yearStudents.get(curr.id);
        const eligible = [...prevSet].filter((id) => !gradSet.has(id));
        const returned = eligible.filter((id) => currSet.has(id)).length;
        const eligibleCount = eligible.length;
        const dropped = eligibleCount - returned;
        yearOverYear.push({
            fromSchoolYearId: prev.id,
            fromYear: prev.name,
            toSchoolYearId: curr.id,
            toYear: curr.name,
            eligible: eligibleCount,
            returned,
            graduated: gradSet.size,
            dropped,
            retentionRate: eligibleCount ? Math.round((returned / eligibleCount) * 1000) / 10 : null,
            dropoutRate: eligibleCount ? Math.round((dropped / eligibleCount) * 1000) / 10 : null,
        });
    }
    // Term-over-term attrition: students who exited within each term window.
    const termAttrition = await data_source_1.AppDataSource.query(`
    SELECT t.id AS "termId", t.name AS "termName", sy.name AS "yearName",
           t."startDate" AS "startDate", t."endDate" AS "endDate",
           COUNT(s.id)::int AS exits,
           COUNT(*) FILTER (WHERE s.status = 'withdrawn')::int AS withdrawn,
           COUNT(*) FILTER (WHERE s.status = 'transferred')::int AS transferred,
           COUNT(*) FILTER (WHERE s.status = 'graduated')::int AS graduated
    FROM terms t
    JOIN school_years sy ON sy.id = t."schoolYearId"
    LEFT JOIN students s
      ON s."exitDate" IS NOT NULL
     AND s."exitDate" >= t."startDate"
     AND s."exitDate" <= t."endDate"
    GROUP BY t.id, t.name, sy.name, t."startDate", t."endDate"
    ORDER BY t."startDate" ASC
  `);
    // Recent exits list (for the "students who left" table).
    const recentExits = await data_source_1.AppDataSource.query(`
    SELECT s.id, s."admissionNumber", s."firstName", s."lastName", s.status,
           s."exitDate", s."exitReason", f.name AS "formName"
    FROM students s
    LEFT JOIN forms f ON f.id = s."formId"
    WHERE s.status IN ('withdrawn', 'transferred') AND s."exitDate" IS NOT NULL
    ORDER BY s."exitDate" DESC
    LIMIT 100
  `);
    const latest = yearOverYear[yearOverYear.length - 1] || null;
    return {
        byYear,
        yearOverYear,
        termAttrition: termAttrition.map((t) => ({ ...t })),
        recentExits,
        summary: {
            currentRetentionRate: latest?.retentionRate ?? null,
            currentDropoutRate: latest?.dropoutRate ?? null,
            latestPair: latest ? `${latest.fromYear} → ${latest.toYear}` : null,
            totalExits: recentExits.length,
            hasHistory: yearOverYear.length > 0,
        },
    };
}
async function getAtRiskStudents(filters) {
    // Determine the analysis window from the selected/current term (fallback: last 90 days).
    let term = null;
    if (filters.termId) {
        term = await data_source_1.AppDataSource.getRepository(Term_1.Term).findOne({ where: { id: filters.termId } });
    }
    if (!term) {
        term = await data_source_1.AppDataSource.getRepository(Term_1.Term).findOne({ where: { isCurrent: true } });
    }
    const today = new Date().toISOString().slice(0, 10);
    const start = term?.startDate || new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const end = term && term.endDate < today ? term.endDate : today;
    const params = [start, end];
    let studentWhere = `s."isActive" = true`;
    if (filters.classId) {
        params.push(filters.classId);
        studentWhere += ` AND ${uuidWhere('s."classId"', params.length)}`;
    }
    if (filters.formId) {
        params.push(filters.formId);
        studentWhere += ` AND ${uuidWhere('s."formId"', params.length)}`;
    }
    // Attendance over the window.
    const attendance = await data_source_1.AppDataSource.query(`
    SELECT s.id AS "studentId", s."firstName", s."lastName", s."admissionNumber",
           c.name AS "className", f.name AS "formName",
           COUNT(a.id)::int AS "daysMarked",
           COUNT(*) FILTER (WHERE a.status::text = 'present')::int AS present,
           COUNT(*) FILTER (WHERE a.status::text = 'late')::int AS late,
           COUNT(*) FILTER (WHERE a.status::text = 'absent')::int AS absent
    FROM students s
    LEFT JOIN classes c ON c.id = s."classId"
    LEFT JOIN forms f ON f.id = s."formId"
    LEFT JOIN student_attendance a
      ON a."studentId" = s.id AND a.date >= $1 AND a.date <= $2
    WHERE ${studentWhere}
    GROUP BY s.id, s."firstName", s."lastName", s."admissionNumber", c.name, f.name
    `, params);
    // Latest two published report cards per student (for performance + trend).
    const reportRows = await data_source_1.AppDataSource.query(`
    SELECT rc."studentId", rc."averageMark", rc."subjectsPassed", rc."totalSubjects", t."startDate"
    FROM report_cards rc
    JOIN terms t ON t.id = rc."termId"
    WHERE rc."isPublished" = true
    ORDER BY rc."studentId", t."startDate" DESC
  `);
    const perfMap = new Map();
    for (const r of reportRows) {
        let p = perfMap.get(r.studentId);
        if (!p) {
            p = {};
            perfMap.set(r.studentId, p);
        }
        const avg = r.averageMark != null ? Number(r.averageMark) : undefined;
        if (p.latest === undefined) {
            p.latest = avg;
            p.passed = r.subjectsPassed ?? undefined;
            p.total = r.totalSubjects ?? undefined;
        }
        else if (p.prev === undefined) {
            p.prev = avg;
        }
    }
    // Outstanding fees per student.
    const feeRows = await data_source_1.AppDataSource.query(`
    SELECT i."studentId", COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) AS owed
    FROM invoices i
    WHERE (i."totalAmount" - i."amountPaid") > 0.005
      AND i.status NOT IN ('cancelled', 'draft', 'paid')
    GROUP BY i."studentId"
  `);
    const feeMap = new Map();
    for (const f of feeRows)
        feeMap.set(f.studentId, Number(f.owed || 0));
    const results = [];
    for (const a of attendance) {
        const attMarked = a.daysMarked;
        const attRate = attMarked ? Math.round(((a.present + a.late) / attMarked) * 1000) / 10 : null;
        const perf = perfMap.get(a.studentId) || {};
        const avg = perf.latest ?? null;
        const trend = perf.latest !== undefined && perf.prev !== undefined
            ? Math.round((perf.latest - perf.prev) * 10) / 10
            : null;
        const owed = feeMap.get(a.studentId) || 0;
        let score = 0;
        const factors = [];
        if (attRate != null && attMarked >= 5) {
            if (attRate < 75) {
                score += 3;
                factors.push(`Low attendance (${attRate}%)`);
            }
            else if (attRate < 85) {
                score += 2;
                factors.push(`Below-target attendance (${attRate}%)`);
            }
            else if (attRate < 90) {
                score += 1;
                factors.push(`Attendance slipping (${attRate}%)`);
            }
        }
        if (avg != null) {
            if (avg < 40) {
                score += 3;
                factors.push(`Failing average (${avg}%)`);
            }
            else if (avg < 50) {
                score += 2;
                factors.push(`Below pass average (${avg}%)`);
            }
            else if (avg < 60) {
                score += 1;
                factors.push(`Marginal average (${avg}%)`);
            }
        }
        if (trend != null && trend <= -15) {
            score += 2;
            factors.push(`Sharp performance drop (${trend} pts)`);
        }
        else if (trend != null && trend <= -10) {
            score += 1;
            factors.push(`Declining performance (${trend} pts)`);
        }
        if (perf.passed != null && perf.total != null && perf.total > 0 && perf.passed < perf.total / 2) {
            score += 2;
            factors.push(`Failing majority of subjects (${perf.passed}/${perf.total})`);
        }
        if (owed > 0.005) {
            score += 1;
            factors.push(`Outstanding fees ($${owed.toFixed(2)})`);
        }
        if (score < 1)
            continue;
        const level = score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';
        results.push({
            studentId: a.studentId,
            admissionNumber: a.admissionNumber,
            name: `${a.firstName} ${a.lastName}`,
            className: a.className || null,
            formName: a.formName || null,
            attendanceRate: attRate,
            daysMarked: attMarked,
            averageMark: avg,
            subjectsPassed: perf.passed ?? null,
            totalSubjects: perf.total ?? null,
            performanceTrend: trend,
            outstanding: Math.round(owed * 100) / 100,
            riskScore: score,
            riskLevel: level,
            riskFactors: factors,
        });
    }
    results.sort((a, b) => b.riskScore - a.riskScore);
    return {
        window: { termId: term?.id ?? null, termName: term?.name ?? 'Last 90 days', start, end },
        counts: {
            total: results.length,
            high: results.filter((r) => r.riskLevel === 'high').length,
            medium: results.filter((r) => r.riskLevel === 'medium').length,
            low: results.filter((r) => r.riskLevel === 'low').length,
        },
        students: results,
    };
}
