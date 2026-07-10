"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CRITICAL_ATTENDANCE_PERCENT = exports.CONDUCT_RATINGS = void 0;
exports.isValidConductRating = isValidConductRating;
exports.inferConductRatingsFromAttendance = inferConductRatingsFromAttendance;
exports.buildClassTeacherRemarks = buildClassTeacherRemarks;
exports.buildPrincipalRemarks = buildPrincipalRemarks;
exports.sanitizeReportCardRemark = sanitizeReportCardRemark;
exports.buildReportCardRemarks = buildReportCardRemarks;
exports.CONDUCT_RATINGS = [
    'excellent',
    'good',
    'satisfactory',
    'needs_improvement',
    'poor',
];
/** Attendance below this % is mentioned in class-teacher remarks. */
exports.CRITICAL_ATTENDANCE_PERCENT = 75;
function cleanName(value) {
    return value.trim();
}
function subjectLabel(row) {
    return (row.subjectName || row.subject || '').split(' — ')[0].trim() || 'this subject';
}
function pickBestSubject(rows) {
    if (!rows.length)
        return null;
    const sorted = [...rows].sort((a, b) => Number(b.marks) - Number(a.marks));
    return subjectLabel(sorted[0]);
}
function pickFocusSubject(rows) {
    if (!rows.length)
        return null;
    const sorted = [...rows].sort((a, b) => Number(a.marks) - Number(b.marks));
    return subjectLabel(sorted[0]);
}
function isValidConductRating(value) {
    return typeof value === 'string' && exports.CONDUCT_RATINGS.includes(value);
}
/** Default behaviour/attitude ratings inferred from term attendance patterns. */
function inferConductRatingsFromAttendance(attendance) {
    const pct = attendance?.attendancePercent;
    const days = attendance?.daysMarked ?? 0;
    if (pct == null || days === 0) {
        return { behaviorRating: 'good', attitudeRating: 'good' };
    }
    const lateRate = days > 0 ? (attendance?.late ?? 0) / days : 0;
    const absentRate = days > 0 ? (attendance?.absent ?? 0) / days : 0;
    if (pct < 60 || absentRate > 0.25) {
        return { behaviorRating: 'poor', attitudeRating: 'needs_improvement' };
    }
    if (pct < exports.CRITICAL_ATTENDANCE_PERCENT || lateRate > 0.2 || absentRate > 0.15) {
        return { behaviorRating: 'needs_improvement', attitudeRating: 'needs_improvement' };
    }
    if (pct < 85 || lateRate > 0.1) {
        return { behaviorRating: 'satisfactory', attitudeRating: 'satisfactory' };
    }
    if (pct >= 95 && lateRate < 0.05) {
        return { behaviorRating: 'excellent', attitudeRating: 'excellent' };
    }
    return { behaviorRating: 'good', attitudeRating: 'good' };
}
function behaviorSentence(rating) {
    switch (rating) {
        case 'excellent':
            return 'Demonstrates exemplary behaviour and respects school rules consistently.';
        case 'good':
            return 'Shows good behaviour and works well with peers.';
        case 'satisfactory':
            return 'Behaviour is generally acceptable; continued care in class conduct is encouraged.';
        case 'needs_improvement':
            return 'Needs to improve classroom behaviour and follow instructions more consistently.';
        case 'poor':
            return 'Behaviour requires immediate improvement. Parent/guardian support is requested.';
    }
}
function attitudeSentence(rating) {
    switch (rating) {
        case 'excellent':
            return 'Has an excellent attitude towards learning and school activities.';
        case 'good':
            return 'Shows a positive attitude and participates willingly.';
        case 'satisfactory':
            return 'Attitude is satisfactory; more enthusiasm in class would be beneficial.';
        case 'needs_improvement':
            return 'Needs a more positive and cooperative attitude towards work and classmates.';
        case 'poor':
            return 'Attitude towards school work requires urgent improvement.';
    }
}
function criticalAttendanceSentence(attendance) {
    const pct = attendance?.attendancePercent;
    const days = attendance?.daysMarked ?? 0;
    if (pct == null || days === 0 || pct >= exports.CRITICAL_ATTENDANCE_PERCENT)
        return null;
    const rounded = Math.round(pct * 10) / 10;
    return `Attendance this term was ${rounded}%, which is critically low and is affecting learning. Regular, punctual attendance is essential.`;
}
function buildClassTeacherRemarks(input) {
    const firstName = cleanName(input.firstName) || 'The learner';
    const parts = [
        `${firstName} ${behaviorSentence(input.behaviorRating)}`,
        attitudeSentence(input.attitudeRating),
    ];
    const attendanceNote = criticalAttendanceSentence(input.attendance);
    if (attendanceNote)
        parts.push(attendanceNote);
    let body = parts.join(' ');
    const teacherName = (input.classTeacherName || '').trim();
    if (teacherName)
        body = `${body}\n\n${teacherName}`;
    return sanitizeReportCardRemark(body, input.firstName, input.lastName);
}
function buildPrincipalRemarks(input) {
    const firstName = cleanName(input.firstName) || 'The learner';
    const avg = input.averageMark != null ? Number(input.averageMark) : null;
    const bestSubject = pickBestSubject(input.subjectResults);
    const focusSubject = pickFocusSubject(input.subjectResults);
    const focus = focusSubject || 'weaker subjects';
    const strength = bestSubject || 'several subjects';
    const avgLabel = avg != null ? `${Math.round(avg * 10) / 10}%` : null;
    let body;
    if (avg != null && avg >= 80) {
        body = avgLabel
            ? `An outstanding academic performance this term with an average of ${avgLabel}. Notable strength in ${strength}.`
            : `An outstanding academic performance this term with notable strength in ${strength}.`;
    }
    else if (avg != null && avg >= 65) {
        body = avgLabel
            ? `A good academic performance this term (${avgLabel}). With sustained effort, especially in ${focus}, results can improve further.`
            : `A good academic performance this term. With sustained effort, especially in ${focus}, results can improve further.`;
    }
    else if (avg != null && avg >= 50) {
        body = avgLabel
            ? `${firstName} achieved a satisfactory academic average of ${avgLabel}. More focus on ${focus} is encouraged while building on strengths in other subjects.`
            : `${firstName} achieved a satisfactory academic performance. More focus on ${focus} is encouraged while building on existing strengths.`;
    }
    else if (avg != null) {
        body = avgLabel
            ? `Academic performance (${avgLabel}) is below the expected standard. Immediate improvement in ${focus} and overall commitment to learning is required.`
            : `Academic performance is below the expected standard. Immediate improvement in ${focus} and overall commitment to learning is required.`;
    }
    else {
        body = `${firstName} should focus on consistent study across all subjects, with priority given to ${focus}.`;
    }
    return sanitizeReportCardRemark(body, input.firstName, input.lastName);
}
/** Remove redundant "by {student name}" and duplicate name mentions in saved remarks. */
function sanitizeReportCardRemark(text, firstName, lastName) {
    let result = (text || '').trim();
    if (!result)
        return result;
    const first = cleanName(firstName);
    const last = cleanName(lastName);
    const fullName = `${first} ${last}`.trim();
    if (!fullName)
        return result;
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fullPattern = escape(fullName);
    result = result.replace(new RegExp(`(\\b${fullPattern}\\b[^.]*?)\\s+by\\s+${fullPattern}\\.?`, 'gi'), '$1.');
    result = result.replace(new RegExp(`\\s+by\\s+${fullPattern}\\.?`, 'gi'), '.');
    result = result.replace(new RegExp(`^(${fullPattern})\\s+\\1\\b`, 'i'), '$1');
    return result.replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
}
function buildReportCardRemarks(input) {
    const inferred = inferConductRatingsFromAttendance(input.attendance);
    const behaviorRating = input.behaviorRating ?? inferred.behaviorRating;
    const attitudeRating = input.attitudeRating ?? inferred.attitudeRating;
    return {
        behaviorRating,
        attitudeRating,
        classTeacherRemarks: buildClassTeacherRemarks({
            firstName: input.firstName,
            lastName: input.lastName,
            behaviorRating,
            attitudeRating,
            attendance: input.attendance,
            classTeacherName: input.classTeacherName,
        }),
        principalRemarks: buildPrincipalRemarks({
            firstName: input.firstName,
            lastName: input.lastName,
            averageMark: input.averageMark,
            subjectResults: input.subjectResults,
        }),
    };
}
