import { XMLParser } from "fast-xml-parser";
import {
  ParsedTimetable,
  Teacher,
  Subject,
  Class,
  DaysDef,
  Lesson,
  Card,
  Period,
  CardRow,
  MasterDataRow,
} from "./types";

export function parseXmlContent(xmlContent: string): ParsedTimetable {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
  });

  const parsed = parser.parse(xmlContent);
  const root = parsed.timetable;

  if (!root) {
    throw new Error(
      "File XML tidak valid: Root node <timetable> tidak ditemukan."
    );
  }

  // Parse teachers
  const teachers = new Map<string, Teacher>();
  if (root.teachers?.teacher) {
    const teacherList = Array.isArray(root.teachers.teacher)
      ? root.teachers.teacher
      : [root.teachers.teacher];
    for (const t of teacherList) {
      teachers.set(t.id, {
        id: t.id,
        name: t.name || "",
        short: t.short || "",
        gender: t.gender || "",
      });
    }
  }

  // Parse subjects
  const subjects = new Map<string, Subject>();
  if (root.subjects?.subject) {
    const subjectList = Array.isArray(root.subjects.subject)
      ? root.subjects.subject
      : [root.subjects.subject];
    for (const s of subjectList) {
      subjects.set(s.id, {
        id: s.id,
        name: s.name || "",
        short: s.short || "",
      });
    }
  }

  // Parse classes
  const classes = new Map<string, Class>();
  if (root.classes?.class) {
    const classList = Array.isArray(root.classes.class)
      ? root.classes.class
      : [root.classes.class];
    for (const c of classList) {
      classes.set(c.id, {
        id: c.id,
        name: c.name || "",
        short: c.short || "",
      });
    }
  }

  // Parse daysdefs
  const daysDefs = new Map<string, DaysDef>();
  if (root.daysdefs?.daysdef) {
    const daysList = Array.isArray(root.daysdefs.daysdef)
      ? root.daysdefs.daysdef
      : [root.daysdefs.daysdef];
    for (const d of daysList) {
      daysDefs.set(d.id, {
        id: d.id,
        name: d.name || "",
        days: d.days || "",
        short: d.short || "",
      });
    }
  }

  // Parse lessons
  const lessons = new Map<string, Lesson>();
  if (root.lessons?.lesson) {
    const lessonList = Array.isArray(root.lessons.lesson)
      ? root.lessons.lesson
      : [root.lessons.lesson];
    for (const l of lessonList) {
      lessons.set(l.id, {
        id: l.id,
        subjectid: l.subjectid || "",
        classids: l.classids || "",
        teacherids: l.teacherids || "",
        groupid: l.groupid || "",
      });
    }
  }

  // Parse cards (try both wrapped <cards><card> and direct <card> under <timetable>)
  const cards: Card[] = [];
  const cardNodes = root.cards?.card || root.card;
  if (cardNodes) {
    const cardList = Array.isArray(cardNodes)
      ? cardNodes
      : [cardNodes];
    for (const c of cardList) {
      cards.push({
        lessonid: String(c.lessonid ?? ""),
        classroomids: String(c.classroomids ?? ""),
        period: String(c.period ?? ""),
        days: String(c.days ?? ""),
      });
    }
  }

  // Parse periods
  const periods: Period[] = [];
  if (root.periods?.period) {
    const periodList = Array.isArray(root.periods.period)
      ? root.periods.period
      : [root.periods.period];
    for (const p of periodList) {
      periods.push({
        name: String(p.name ?? ""),
        short: String(p.short ?? ""),
        period: String(p.period ?? ""),
        starttime: String(p.starttime ?? ""),
        endtime: String(p.endtime ?? ""),
      });
    }
  }

  // Log parsing stats for debugging
  console.log(
    `[Parser] teachers: ${teachers.size}, subjects: ${subjects.size}, ` +
    `classes: ${classes.size}, daysDefs: ${daysDefs.size}, ` +
    `lessons: ${lessons.size}, cards: ${cards.length}, periods: ${periods.length}`
  );

  // Build a short->daysdef lookup for efficient resolution
  const daysDefsByShort = new Map<string, DaysDef>();
  const daysDefsByName = new Map<string, DaysDef>();
  for (const [, def] of daysDefs) {
    if (def.short) daysDefsByShort.set(def.short, def);
    if (def.name) daysDefsByName.set(def.name, def);
  }

  return { teachers, subjects, classes, daysDefs, daysDefsByShort, daysDefsByName, lessons, cards, periods };
}

/**
 * Decode the binary days string to array of day indices (0=Monday..4=Friday).
 * Handles both single binary string ("10000") and comma-separated ("10000,01000,00100,00010,00001").
 */
export function decodeDays(daysStr: string): number[] {
  const result: number[] = [];
  // Handle comma-separated format (e.g., "10000,01000,00100,00010,00001")
  const parts = daysStr.includes(",") ? daysStr.split(",") : [daysStr];
  for (const part of parts) {
    const trimmed = part.trim();
    for (let i = 0; i < trimmed.length && i < 5; i++) {
      if (trimmed[i] === "1" && !result.includes(i)) {
        result.push(i);
      }
    }
  }
  // Sort by day index for consistent ordering
  result.sort((a, b) => a - b);
  return result;
}

/**
 * Resolve a card's "days" reference to the actual binary days string.
 * In aSc XML, card.days is typically a reference to a daysdef (by id, short, or name),
 * NOT the binary string directly. This function resolves it.
 */
function resolveDaysBinary(
  daysDefs: Map<string, DaysDef>,
  daysDefsByShort: Map<string, DaysDef>,
  daysDefsByName: Map<string, DaysDef>,
  cardDays: string
): string {
  if (!cardDays) return "";

  // 1. Try direct lookup by ID
  const byId = daysDefs.get(cardDays);
  if (byId?.days) return byId.days;

  // 2. Try lookup by short (e.g., "Mo", "TuWe")
  const byShort = daysDefsByShort.get(cardDays);
  if (byShort?.days) return byShort.days;

  // 3. Try lookup by name (e.g., "Monday", "Tue+Wed")
  const byName = daysDefsByName.get(cardDays);
  if (byName?.days) return byName.days;

  // 4. Fallback: treat cardDays as binary string directly (e.g., "10000")
  // Only if it looks like a binary string (contains 0 and 1 only)
  if (/^[01]+$/.test(cardDays)) return cardDays;

  return "";
}

/**
 * Get the primary class ID from a comma-separated classids string
 */
export function getPrimaryClassId(classids: string): string {
  return classids.split(",")[0]?.trim() || "";
}

/**
 * Get all class IDs from a comma-separated classids string
 */
export function getAllClassIds(classids: string): string[] {
  return classids
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Get the primary teacher ID from a comma-separated teacherids string
 */
export function getPrimaryTeacherId(teacherids: string): string {
  return teacherids.split(",")[0]?.trim() || "";
}

/**
 * Get all teacher IDs from a comma-separated teacherids string
 */
export function getAllTeacherIds(teacherids: string): string[] {
  return teacherids
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Generate CardRow data for Sheet 2: Data Mentah
 */
export function generateCardRows(data: ParsedTimetable): CardRow[] {
  const rows: CardRow[] = [];

  for (const card of data.cards) {
    const lesson = data.lessons.get(card.lessonid);
    if (!lesson) continue;

    const subject = data.subjects.get(lesson.subjectid);
    const primaryClassId = getPrimaryClassId(lesson.classids);
    const primaryClass = primaryClassId
      ? data.classes.get(primaryClassId)
      : undefined;
    const primaryTeacherId = getPrimaryTeacherId(lesson.teacherids);
    const primaryTeacher = primaryTeacherId
      ? data.teachers.get(primaryTeacherId)
      : undefined;

    // Team teaching: get all teacher IDs
    const allTeacherIds = getAllTeacherIds(lesson.teacherids);
    const teamTeacher =
      allTeacherIds.length > 1
        ? data.teachers.get(allTeacherIds[1])
        : undefined;

    const dayIndices = decodeDays(
      resolveDaysBinary(
        data.daysDefs,
        data.daysDefsByShort,
        data.daysDefsByName,
        card.days
      )
    );

    for (const dayIdx of dayIndices) {
      const allClassIds = getAllClassIds(lesson.classids);
      const classNames = allClassIds
        .map((cid) => data.classes.get(cid)?.name || cid)
        .join(", ");

      rows.push({
        card_lesson: card.lessonid,
        card_room_id: card.classroomids || "",
        card_days_id: card.days,
        card_period: card.period,
        card_mapel: subject?.name || lesson.subjectid,
        card_mapel_short: subject?.short || "",
        card_urut_kelas1: primaryClass?.short || primaryClassId,
        card_teacher: primaryTeacher?.name || primaryTeacherId,
        card_teacher_short: primaryTeacher?.short || "",
        card_day_urut: String(dayIdx + 1),
        card_day_name:
          ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"][dayIdx] || "",
        card_kelas_gabung: classNames,
        card_teacher_team1: teamTeacher?.name || "",
        card_teacher_short_team1: teamTeacher?.short || "",
      });
    }
  }

  return rows;
}

/**
 * Generate MasterDataRow for Sheet 3: Master Data Flat
 */
export function generateMasterDataRows(data: ParsedTimetable): MasterDataRow[] {
  const rows: MasterDataRow[] = [];

  for (const card of data.cards) {
    const lesson = data.lessons.get(card.lessonid);
    if (!lesson) continue;

    const subject = data.subjects.get(lesson.subjectid);
    const primaryTeacherId = getPrimaryTeacherId(lesson.teacherids);
    const primaryTeacher = primaryTeacherId
      ? data.teachers.get(primaryTeacherId)
      : undefined;
    const primaryClassId = getPrimaryClassId(lesson.classids);
    const primaryClass = primaryClassId
      ? data.classes.get(primaryClassId)
      : undefined;

    const dayIndices = decodeDays(
      resolveDaysBinary(
        data.daysDefs,
        data.daysDefsByShort,
        data.daysDefsByName,
        card.days
      )
    );
    const periodNum = parseInt(card.period, 10);

    for (const dayIdx of dayIndices) {
      rows.push({
        Kelas: primaryClass?.name || primaryClassId,
        Mapel: subject?.name || lesson.subjectid,
        Hari:
          ["SENIN", "SELASA", "RABU", "KAMIS", "JUMAT"][dayIdx] || "",
        Jam: periodNum,
        Guru: primaryTeacher?.name || primaryTeacherId,
        Card_day_urut: dayIdx + 1,
        Card_day_name:
          ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"][dayIdx] || "",
      });
    }
  }

  return rows;
}

/**
 * Build matrix data for Sheet 1: Matriks Kelas
 * Returns a map of classId -> { subjectShort[period], teacherShort[period] } for each day
 */
export interface ClassDayMatrix {
  // dayIndex (0-4) -> period (1-10) -> { subjectShort, teacherShort }
  days: Map<
    number,
    Map<number, { subjectShort: string; teacherShort: string }>
  >;
  className: string;
}

export function buildClassMatrix(data: ParsedTimetable): ClassDayMatrix[] {
  const matrixMap = new Map<string, ClassDayMatrix>();

  for (const card of data.cards) {
    const lesson = data.lessons.get(card.lessonid);
    if (!lesson) continue;

    const subject = data.subjects.get(lesson.subjectid);
    const primaryTeacherId = getPrimaryTeacherId(lesson.teacherids);
    const primaryTeacher = primaryTeacherId
      ? data.teachers.get(primaryTeacherId)
      : undefined;

    const classIds = getAllClassIds(lesson.classids);
    const dayIndices = decodeDays(
      resolveDaysBinary(
        data.daysDefs,
        data.daysDefsByShort,
        data.daysDefsByName,
        card.days
      )
    );
    const period = parseInt(card.period, 10);

    for (const classId of classIds) {
      const cls = data.classes.get(classId);
      if (!cls) continue;

      if (!matrixMap.has(classId)) {
        matrixMap.set(classId, {
          className: cls.name,
          days: new Map(),
        });
      }

      const matrix = matrixMap.get(classId)!;

      for (const dayIdx of dayIndices) {
        if (!matrix.days.has(dayIdx)) {
          matrix.days.set(dayIdx, new Map());
        }
        const dayMap = matrix.days.get(dayIdx)!;

        // If multiple lessons at same period, concatenate with newline
        const existing = dayMap.get(period);
        if (existing) {
          dayMap.set(period, {
            subjectShort: existing.subjectShort + "\n" + (subject?.short || ""),
            teacherShort:
              existing.teacherShort +
              "\n" +
              (primaryTeacher?.short || ""),
          });
        } else {
          dayMap.set(period, {
            subjectShort: subject?.short || "",
            teacherShort: primaryTeacher?.short || "",
          });
        }
      }
    }
  }

  return Array.from(matrixMap.values());
}
