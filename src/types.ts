// Types for aSc XML Timetable data

export interface Teacher {
  id: string;
  name: string;
  short: string;
  gender: string;
}

export interface Subject {
  id: string;
  name: string;
  short: string;
}

export interface Class {
  id: string;
  name: string;
  short: string;
}

export interface DaysDef {
  id: string;
  name: string;
  days: string; // binary string like "10000"
  short: string;
}

export interface Lesson {
  id: string;
  subjectid: string;
  classids: string; // comma-separated IDs
  teacherids: string; // comma-separated IDs
  groupid: string;
}

export interface Card {
  lessonid: string;
  classroomids: string;
  period: string;
  days: string;
}

export interface Period {
  name: string;
  short: string;
  period: string;
  starttime: string;
  endtime: string;
}

export interface ParsedTimetable {
  teachers: Map<string, Teacher>;
  subjects: Map<string, Subject>;
  classes: Map<string, Class>;
  daysDefs: Map<string, DaysDef>;
  daysDefsByShort: Map<string, DaysDef>;
  daysDefsByName: Map<string, DaysDef>;
  lessons: Map<string, Lesson>;
  cards: Card[];
  periods: Period[];
}

// Day mapping: binary position -> day index (0=Monday...4=Friday)
export const DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
export const DAY_NAMES_UPPER = ["SENIN", "SELASA", "RABU", "KAMIS", "JUMAT"];

/** Build time slot labels from parsed periods (e.g., "8:00 - 8:45") */
export function getTimeSlots(periods: Period[]): string[] {
  return periods.map((p) => `${p.starttime} - ${p.endtime}`);
}

export interface CardRow {
  card_lesson: string;
  card_room_id: string;
  card_days_id: string;
  card_period: string;
  card_mapel: string;
  card_mapel_short: string;
  card_urut_kelas1: string;
  card_teacher: string;
  card_teacher_short: string;
  card_day_urut: string;
  card_day_name: string;
  card_kelas_gabung: string;
  card_teacher_team1: string;
  card_teacher_short_team1: string;
}

export interface MasterDataRow {
  Kelas: string;
  Mapel: string;
  Hari: string;
  Jam: number;
  Guru: string;
  Card_day_urut: number;
  Card_day_name: string;
}

export type ProcessStatus =
  | "idle"
  | "reading"
  | "processing"
  | "ready"
  | "generating"
  | "saving"
  | "done"
  | "error";
