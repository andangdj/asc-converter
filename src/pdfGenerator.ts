import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { ParsedTimetable, ProcessStatus } from "./types";
import { buildClassMatrix, decodeDays } from "./xmlParser";
import { DAY_NAMES, getTimeSlots } from "./types";

// ─── Types ───────────────────────────────────────────

interface CellEntry {
  subjectShort: string;
  subjectName: string;
  teacherShort: string;
  teacherName: string;
  className?: string;
}

interface ScheduleMatrix {
  title: string;
  // dayIndex (0-4) -> period (1..N) -> CellEntry
  days: Map<number, Map<number, CellEntry>>;
}

// ─── Build Teacher Matrix ────────────────────────────

function buildTeacherMatrix(data: ParsedTimetable): Map<string, ScheduleMatrix> {
  const map = new Map<string, ScheduleMatrix>();

  for (const card of data.cards) {
    const lesson = data.lessons.get(card.lessonid);
    if (!lesson) continue;

    // Resolve days
    const resolvedDays = resolveDaysForCard(data, card.days);
    const dayIndices = decodeDays(resolvedDays);
    const period = parseInt(card.period, 10);
    const subject = data.subjects.get(lesson.subjectid);

    const teacherIds = lesson.teacherids
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const classIds = lesson.classids
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    for (const teacherId of teacherIds) {
      const teacher = data.teachers.get(teacherId);
      if (!teacher) continue;

      if (!map.has(teacherId)) {
        map.set(teacherId, {
          title: `${teacher.name} (${teacher.short})`,
          days: new Map(),
        });
      }
      const matrix = map.get(teacherId)!;

      for (const dayIdx of dayIndices) {
        if (!matrix.days.has(dayIdx)) {
          matrix.days.set(dayIdx, new Map());
        }
        const dayMap = matrix.days.get(dayIdx)!;

        const classNames = classIds
          .map((cid) => data.classes.get(cid)?.short || cid)
          .join(", ");

        const existing = dayMap.get(period);
        if (existing) {
          existing.subjectShort += "\n" + (subject?.short || "");
          existing.subjectName += "\n" + (subject?.name || "");
          existing.teacherShort += "\n" + (teacher.short || "");
          existing.teacherName += "\n" + (teacher.name?.trim() || "");
          existing.className += "\n" + classNames;
        } else {
          dayMap.set(period, {
            subjectShort: subject?.short || "",
            subjectName: subject?.name || "",
            teacherShort: teacher.short || "",
            teacherName: teacher.name?.trim() || "",
            className: classNames,
          });
        }
      }
    }
  }

  return map;
}

// ─── Days Resolution ────────────────────────────────

function resolveDaysForCard(
  data: ParsedTimetable,
  cardDays: string
): string {
  if (!cardDays) return "";
  const byId = data.daysDefs.get(cardDays);
  if (byId?.days) return byId.days;
  const byShort = data.daysDefsByShort.get(cardDays);
  if (byShort?.days) return byShort.days;
  const byName = data.daysDefsByName.get(cardDays);
  if (byName?.days) return byName.days;
  if (/^[01]+$/.test(cardDays)) return cardDays;
  return "";
}

// ─── PDF Generation ─────────────────────────────────

const PAGE_W = 297; // A4 landscape mm
const PAGE_H = 210;
const MARGIN = 8;
const COL_W = (PAGE_W - MARGIN * 2 - 28) / 5; // 5 days
const ROW_H = 13;
const HEADER_H = 11;
const CELL_PAD = 1.2; // padding inside cell

function drawPdfSchedule(
  doc: jsPDF,
  matrix: ScheduleMatrix,
  timeSlots: string[],
  numPeriods: number,
  isClassSchedule: boolean
): void {
  let y = MARGIN;

  // Title
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(matrix.title, PAGE_W / 2, y + 5, { align: "center" });
  y += 10;

  // Subtitle
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Jadwal Pelajaran", PAGE_W / 2, y, { align: "center" });
  y += 8;

  // Helper: draw header row
  const drawHeader = () => {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    // "Jam" cell
    doc.setFillColor("#DCDCDC");
    doc.rect(MARGIN, y, 28, HEADER_H, "F");
    doc.setDrawColor("#A0A0A0");
    doc.rect(MARGIN, y, 28, HEADER_H, "S");
    doc.setTextColor("#000000");
    doc.text("Jam", MARGIN + 2, y + 8);
    // Day name cells
    for (let d = 0; d < 5; d++) {
      const x = MARGIN + 28 + d * COL_W;
      doc.setFillColor("#DCDCDC");
      doc.rect(x, y, COL_W, HEADER_H, "F");
      doc.setDrawColor("#A0A0A0");
      doc.rect(x, y, COL_W, HEADER_H, "S");
      doc.setTextColor("#000000");
      doc.text(DAY_NAMES[d], x + COL_W / 2, y + 8, { align: "center" });
    }
    y += HEADER_H;
  };

  drawHeader();

  // Data rows
  for (let p = 1; p <= numPeriods; p++) {
    if (y + ROW_H > PAGE_H - MARGIN) {
      doc.addPage("a4", "landscape");
      y = MARGIN;
      drawHeader();
    }

    const timeSlot = timeSlots[p - 1] || `Jam ${p}`;
    const rowLabel = `${p}\n${timeSlot}`;

    // Period label
    doc.setTextColor("#000000");
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setDrawColor("#B4B4B4");
    doc.rect(MARGIN, y, 28, ROW_H, "D");
    // Split period label to fit
    const lblLines = doc.splitTextToSize(rowLabel, 26);
    let lblY = y + 3.5;
    for (const lbl of lblLines.slice(0, 2)) {
      doc.text(lbl, MARGIN + 2, lblY);
      lblY += 3;
    }

    // Day cells
    for (let d = 0; d < 5; d++) {
      const dayMap = matrix.days.get(d);
      const entry = dayMap?.get(p);
      const x = MARGIN + 28 + d * COL_W;

      doc.setDrawColor("#C8C8C8");
      doc.rect(x, y, COL_W, ROW_H, "D");

      if (entry) {
        const maxW = COL_W - CELL_PAD * 2; // available text width
        if (isClassSchedule) {
          // Class schedule: BOLD subject (line 1), small teacher in (parens) (line 2+)
          const subjName = entry.subjectName || entry.subjectShort;
          const teachName = entry.teacherName || entry.teacherShort;
          const teachText = `(${teachName})`;

          doc.setFontSize(5.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor("#000000");
          const subjLines = doc.splitTextToSize(subjName, maxW);
          const maxSubjLines = 2; // max 2 lines for subject
          let textY = y + 3;
          for (let li = 0; li < Math.min(subjLines.length, maxSubjLines); li++) {
            doc.text(subjLines[li], x + CELL_PAD, textY);
            textY += 3;
          }

          doc.setFontSize(4.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor("#505050");
          const teachLines = doc.splitTextToSize(teachText, maxW);
          const maxTeachLines = 2;
          for (let li = 0; li < Math.min(teachLines.length, maxTeachLines); li++) {
            if (textY < y + ROW_H - 1) {
              doc.text(teachLines[li], x + CELL_PAD, textY);
              textY += 2.8;
            }
          }
        } else {
          // Teacher schedule: subject name + class short
          doc.setFontSize(5.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor("#000000");
          const text = `${entry.subjectName || entry.subjectShort}\n${entry.className || ""}`;
          const lines = doc.splitTextToSize(text, maxW);
          let textY = y + 3;
          for (let li = 0; li < Math.min(lines.length, 4); li++) {
            if (lines[li]) {
              doc.text(lines[li], x + CELL_PAD, textY);
              textY += 3;
            }
          }
        }
      }
    }

    y += ROW_H;
  }
}

function generateSingleClassPdf(
  data: ParsedTimetable,
  classMatrix: ReturnType<typeof buildClassMatrix>[0]
): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const timeSlots = getTimeSlots(data.periods);
  const numPeriods = timeSlots.length || 10;

  // Convert ClassDayMatrix to ScheduleMatrix, enriching with full names
  const matrix: ScheduleMatrix = {
    title: classMatrix.className,
    days: new Map(),
  };
  for (const [dayIdx, dayMap] of classMatrix.days) {
    const newDayMap = new Map<number, CellEntry>();
    for (const [period, entry] of dayMap) {
      // Look up full subject name
      let subjectName = "";
      for (const [, subj] of data.subjects) {
        if (subj.short === entry.subjectShort) { subjectName = subj.name; break; }
      }
      // Look up full teacher name
      let teacherName = "";
      for (const [, t] of data.teachers) {
        if (t.short === entry.teacherShort) { teacherName = t.name.trim(); break; }
      }
      newDayMap.set(period, {
        subjectShort: entry.subjectShort,
        subjectName: subjectName || entry.subjectShort,
        teacherShort: entry.teacherShort,
        teacherName: teacherName || entry.teacherShort,
      });
    }
    matrix.days.set(dayIdx, newDayMap);
  }

  drawPdfSchedule(doc, matrix, timeSlots, numPeriods, true);
  return doc;
}

function generateSingleTeacherPdf(
  _data: ParsedTimetable,
  matrix: ScheduleMatrix,
  timeSlots: string[],
  numPeriods: number
): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  drawPdfSchedule(doc, matrix, timeSlots, numPeriods, false);
  return doc;
}

// ─── ZIP & SAVE ─────────────────────────────────────

export async function downloadAllClassesZip(
  data: ParsedTimetable,
  onStatus: (status: ProcessStatus, msg: string) => void
): Promise<void> {
  try {
    onStatus("generating", "Membuat PDF per kelas...");
    const classMatrices = buildClassMatrix(data);
    classMatrices.sort((a, b) => a.className.localeCompare(b.className, "id"));

    const zip = new JSZip();
    const classFolder = zip.folder("Jadwal_Per_Kelas")!;

    for (let i = 0; i < classMatrices.length; i++) {
      const cm = classMatrices[i];
      onStatus("generating", `Membuat PDF: ${cm.className} (${i + 1}/${classMatrices.length})`);

      const doc = generateSingleClassPdf(data, cm);
      const pdfBytes = doc.output("arraybuffer");

      // Sanitize filename
      const safeName = cm.className.replace(/[/\\?%*:|"<>]/g, "_");
      classFolder.file(`${safeName}.pdf`, pdfBytes);
    }

    onStatus("saving", "Menyimpan ZIP...");
    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    const filePath = await save({
      defaultPath: "Jadwal_Per_Kelas.zip",
      filters: [{ name: "ZIP Files", extensions: ["zip"] }],
    });

    if (!filePath) {
      onStatus("idle", "Penyimpanan dibatalkan.");
      return;
    }

    await writeFile(filePath, zipBytes);
    onStatus("done", `ZIP berhasil disimpan:\n${filePath}\n(${classMatrices.length} file PDF)`);
  } catch (err: any) {
    onStatus("error", `Gagal membuat ZIP: ${err.message || err}`);
    throw err;
  }
}

export async function downloadAllTeachersZip(
  data: ParsedTimetable,
  onStatus: (status: ProcessStatus, msg: string) => void
): Promise<void> {
  try {
    onStatus("generating", "Membuat PDF per guru...");
    const teacherMatrices = buildTeacherMatrix(data);
    const sortedTeachers = Array.from(teacherMatrices.entries()).sort((a, b) =>
      a[1].title.localeCompare(b[1].title, "id")
    );

    const timeSlots = getTimeSlots(data.periods);
    const numPeriods = timeSlots.length || 10;

    const zip = new JSZip();
    const folder = zip.folder("Jadwal_Per_Guru")!;

    for (let i = 0; i < sortedTeachers.length; i++) {
      const [, matrix] = sortedTeachers[i];
      const teacherName = matrix.title;
      onStatus("generating", `Membuat PDF: ${teacherName} (${i + 1}/${sortedTeachers.length})`);

      const doc = generateSingleTeacherPdf(data, matrix, timeSlots, numPeriods);
      const pdfBytes = doc.output("arraybuffer");

      const safeName = teacherName.replace(/[/\\?%*:|"<>]/g, "_");
      folder.file(`${safeName}.pdf`, pdfBytes);
    }

    onStatus("saving", "Menyimpan ZIP...");
    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    const filePath = await save({
      defaultPath: "Jadwal_Per_Guru.zip",
      filters: [{ name: "ZIP Files", extensions: ["zip"] }],
    });

    if (!filePath) {
      onStatus("idle", "Penyimpanan dibatalkan.");
      return;
    }

    await writeFile(filePath, zipBytes);
    onStatus("done", `ZIP berhasil disimpan:\n${filePath}\n(${sortedTeachers.length} file PDF)`);
  } catch (err: any) {
    onStatus("error", `Gagal membuat ZIP: ${err.message || err}`);
    throw err;
  }
}
