import ExcelJS from "exceljs";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import {
  ParsedTimetable,
  DAY_NAMES,
  getTimeSlots,
  ProcessStatus,
} from "./types";
import {
  generateCardRows,
  generateMasterDataRows,
  buildClassMatrix,
} from "./xmlParser";

export async function generateAndSaveExcel(
  data: ParsedTimetable,
  onStatus: (status: ProcessStatus, message: string) => void
): Promise<void> {
  try {
    onStatus("generating", "Menyusun File Excel...");

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "aSc to Excel Converter";
    workbook.created = new Date();

    // ========================
    // SHEET 1: Matriks Kelas
    // ========================
    const sheet1 = workbook.addWorksheet("Matriks Kelas", {
      properties: { tabColor: { argb: "FFFF99" } },
    });

    buildSheet1(sheet1, data);

    // ========================
    // SHEET 2: Data Mentah
    // ========================
    onStatus("generating", "Menyusun Sheet Data Mentah...");
    const sheet2 = workbook.addWorksheet("Data Mentah");
    buildSheet2(sheet2, data);

    // ========================
    // SHEET 3: Master Data Flat
    // ========================
    onStatus("generating", "Menyusun Sheet Master Data Flat...");
    const sheet3 = workbook.addWorksheet("Master Data Flat");
    buildSheet3(sheet3, data);

    // ========================
    // SHEET 4: Master Guru
    // ========================
    onStatus("generating", "Menyusun Sheet Master Guru...");
    const sheet4 = workbook.addWorksheet("Master Guru");
    buildSheet4(sheet4, data);

    // ========================
    // SHEET 5: Master Kelas
    // ========================
    onStatus("generating", "Menyusun Sheet Master Kelas...");
    const sheet5 = workbook.addWorksheet("Master Kelas");
    buildSheet5(sheet5, data);

    // ========================
    // SHEET 6: Master Mapel
    // ========================
    onStatus("generating", "Menyusun Sheet Master Mapel...");
    const sheet6 = workbook.addWorksheet("Master Mapel");
    buildSheet6(sheet6, data);

    // Save file
    onStatus("saving", "Menyimpan ke Komputer...");

    const filePath = await save({
      defaultPath: "output_jadwal.xlsx",
      filters: [
        {
          name: "Excel Files",
          extensions: ["xlsx"],
        },
      ],
    });

    if (!filePath) {
      onStatus("idle", "Penyimpanan dibatalkan.");
      return;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    await writeFile(filePath, new Uint8Array(buffer));

    onStatus("done", `File berhasil disimpan ke:\n${filePath}`);
  } catch (err: any) {
    onStatus("error", `Error: ${err.message || String(err)}`);
    throw err;
  }
}

// ======================== SHEET 1 BUILDER ========================
function buildSheet1(
  sheet: ExcelJS.Worksheet,
  data: ParsedTimetable
): void {
  const matrix = buildClassMatrix(data);
  // Sort classes ascending by name
  matrix.sort((a, b) => a.className.localeCompare(b.className, "id"));
  const timeSlots = getTimeSlots(data.periods);
  const NUM_PERIODS = timeSlots.length || 10;
  const NUM_DAYS = 5;

  // Styling constants
  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFF99" },
  };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 10 };
  const headerAlignment: Partial<ExcelJS.Alignment> = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  const dataAlignment: Partial<ExcelJS.Alignment> = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };

  // Row 1: Day names (merged across 10 columns each)
  // Col A & B = merged "Kelas" / "Tipe"
  sheet.mergeCells(1, 1, 3, 1); // A1:A3
  sheet.mergeCells(1, 2, 3, 2); // B1:B3
  const cellA1 = sheet.getCell("A1");
  cellA1.value = "Kelas";
  cellA1.fill = headerFill;
  cellA1.font = { ...headerFont, size: 11 };
  cellA1.alignment = headerAlignment;
  cellA1.border = thinBorder;

  const cellB1 = sheet.getCell("B1");
  cellB1.value = "Tipe";
  cellB1.fill = headerFill;
  cellB1.font = { ...headerFont, size: 11 };
  cellB1.alignment = headerAlignment;
  cellB1.border = thinBorder;

  for (let d = 0; d < NUM_DAYS; d++) {
    const startCol = 3 + d * NUM_PERIODS;
    const endCol = startCol + NUM_PERIODS - 1;
    sheet.mergeCells(1, startCol, 1, endCol);

    const cell = sheet.getCell(1, startCol);
    cell.value = DAY_NAMES[d];
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = headerAlignment;
    cell.border = thinBorder;

    // Row 2: Period numbers
    for (let p = 0; p < NUM_PERIODS; p++) {
      const col = startCol + p;
      const cell2 = sheet.getCell(2, col);
      cell2.value = p + 1;
      cell2.fill = headerFill;
      cell2.font = headerFont;
      cell2.alignment = headerAlignment;
      cell2.border = thinBorder;

      // Row 3: Time slots
      const cell3 = sheet.getCell(3, col);
      cell3.value = timeSlots[p] || "";
      cell3.fill = headerFill;
      cell3.font = { ...headerFont, size: 8 };
      cell3.alignment = headerAlignment;
      cell3.border = thinBorder;
    }
  }

  // Data rows: each class gets 2 rows
  let currentRow = 4;
  for (const classMatrix of matrix) {
    // Merge column A for 2 rows
    sheet.mergeCells(currentRow, 1, currentRow + 1, 1);
    const nameCell = sheet.getCell(currentRow, 1);
    nameCell.value = classMatrix.className;
    nameCell.alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
    nameCell.border = thinBorder;

    // Row for "Subject"
    const subjLabelCell = sheet.getCell(currentRow, 2);
    subjLabelCell.value = "Subject";
    subjLabelCell.font = { bold: true, size: 9 };
    subjLabelCell.alignment = headerAlignment;
    subjLabelCell.border = thinBorder;

    // Row for "Teacher"
    const teachLabelCell = sheet.getCell(currentRow + 1, 2);
    teachLabelCell.value = "Teacher";
    teachLabelCell.font = { bold: true, size: 9 };
    teachLabelCell.alignment = headerAlignment;
    teachLabelCell.border = thinBorder;

    for (let d = 0; d < NUM_DAYS; d++) {
      const dayMap = classMatrix.days.get(d) || new Map();
      for (let p = 0; p < NUM_PERIODS; p++) {
        const col = 3 + d * NUM_PERIODS + p;
        const entry = dayMap.get(p + 1);

        const subjectCell = sheet.getCell(currentRow, col);
        subjectCell.value = entry?.subjectShort || "";
        subjectCell.alignment = dataAlignment;
        subjectCell.border = thinBorder;
        subjectCell.font = { size: 9 };

        const teacherCell = sheet.getCell(currentRow + 1, col);
        teacherCell.value = entry?.teacherShort || "";
        teacherCell.alignment = dataAlignment;
        teacherCell.border = thinBorder;
        teacherCell.font = { size: 9 };
      }
    }

    currentRow += 2;
  }

  // Set column widths
  sheet.getColumn(1).width = 35;
  sheet.getColumn(2).width = 10;
  for (let c = 3; c <= 3 + NUM_DAYS * NUM_PERIODS; c++) {
    sheet.getColumn(c).width = 8;
  }
}

// ======================== SHEET 2 BUILDER ========================
function buildSheet2(
  sheet: ExcelJS.Worksheet,
  data: ParsedTimetable
): void {
  const cardRows = generateCardRows(data);
  // Sort: card_urut_kelas1 ASC, card_day_urut ASC, card_period ASC
  cardRows.sort((a, b) => {
    const kelasCmp = a.card_urut_kelas1.localeCompare(b.card_urut_kelas1, "id");
    if (kelasCmp !== 0) return kelasCmp;
    const dayCmp = Number(a.card_day_urut) - Number(b.card_day_urut);
    if (dayCmp !== 0) return dayCmp;
    return Number(a.card_period) - Number(b.card_period);
  });

  const headers = [
    "Card_lesson",
    "Card_room_id",
    "Card_days_id",
    "Card_period",
    "Card_mapel",
    "Card_mapel_short",
    "Card_urut_kelas1",
    "Card_teacher",
    "Card_teacher_short",
    "Card_day_urut",
    "Card_day_name",
    "Card kelas gabung",
    "Card_teacher_team1",
    "Card_teacher_short_team1",
  ];

  const headerRow = sheet.getRow(1);
  for (let i = 0; i < headers.length; i++) {
    const cell = headerRow.getCell(i + 1);
    cell.value = headers[i];
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  }

  for (let r = 0; r < cardRows.length; r++) {
    const row = sheet.getRow(r + 2);
    const cr = cardRows[r];
    row.getCell(1).value = cr.card_lesson;
    row.getCell(2).value = cr.card_room_id;
    row.getCell(3).value = cr.card_days_id;
    row.getCell(4).value = cr.card_period;
    row.getCell(5).value = cr.card_mapel;
    row.getCell(6).value = cr.card_mapel_short;
    row.getCell(7).value = cr.card_urut_kelas1;
    row.getCell(8).value = cr.card_teacher;
    row.getCell(9).value = cr.card_teacher_short;
    row.getCell(10).value = cr.card_day_urut;
    row.getCell(11).value = cr.card_day_name;
    row.getCell(12).value = cr.card_kelas_gabung;
    row.getCell(13).value = cr.card_teacher_team1;
    row.getCell(14).value = cr.card_teacher_short_team1;
  }

  // Auto column width
  sheet.columns.forEach((col, i) => {
    col.width = Math.max(15, headers[i]?.length || 10);
  });
}

// ======================== SHEET 3 BUILDER ========================
function buildSheet3(
  sheet: ExcelJS.Worksheet,
  data: ParsedTimetable
): void {
  const masterRows = generateMasterDataRows(data);
  // Sort: Kelas ASC, Card_day_urut ASC, Jam ASC
  masterRows.sort((a, b) => {
    const kelasCmp = a.Kelas.localeCompare(b.Kelas, "id");
    if (kelasCmp !== 0) return kelasCmp;
    const dayCmp = a.Card_day_urut - b.Card_day_urut;
    if (dayCmp !== 0) return dayCmp;
    return a.Jam - b.Jam;
  });

  const headers = [
    "Kelas",
    "Mapel",
    "Hari",
    "Jam",
    "Guru",
    "Card_day_urut",
    "Card_day_name",
  ];

  const headerRow = sheet.getRow(1);
  for (let i = 0; i < headers.length; i++) {
    const cell = headerRow.getCell(i + 1);
    cell.value = headers[i];
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  }

  for (let r = 0; r < masterRows.length; r++) {
    const row = sheet.getRow(r + 2);
    const mr = masterRows[r];
    row.getCell(1).value = mr.Kelas;
    row.getCell(2).value = mr.Mapel;
    row.getCell(3).value = mr.Hari;
    row.getCell(4).value = mr.Jam;
    row.getCell(5).value = mr.Guru;
    row.getCell(6).value = mr.Card_day_urut;
    row.getCell(7).value = mr.Card_day_name;
  }

  // AutoFilter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: masterRows.length + 1, column: headers.length },
  };

  sheet.columns.forEach((col, i) => {
    col.width = Math.max(15, headers[i]?.length + 5 || 15);
  });
}

// ======================== SHEET 4 BUILDER: Master Guru ========================
function buildSheet4(
  sheet: ExcelJS.Worksheet,
  data: ParsedTimetable
): void {
  const headers = ["ID Guru", "Kode/Singkatan", "Nama Lengkap"];

  const headerRow = sheet.getRow(1);
  for (let i = 0; i < headers.length; i++) {
    const cell = headerRow.getCell(i + 1);
    cell.value = headers[i];
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  }

  let rowNum = 2;
  for (const [, teacher] of data.teachers) {
    const row = sheet.getRow(rowNum);
    row.getCell(1).value = teacher.id;
    row.getCell(2).value = teacher.short;
    row.getCell(3).value = teacher.name;

    for (let c = 1; c <= 3; c++) {
      row.getCell(c).border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }

    rowNum++;
  }

  sheet.columns.forEach((col, i) => {
    col.width = Math.max(18, headers[i]?.length + 8 || 18);
  });
}

// ======================== SHEET 5 BUILDER: Master Kelas ========================
function buildSheet5(
  sheet: ExcelJS.Worksheet,
  data: ParsedTimetable
): void {
  const headers = ["ID Kelas", "Kode/Singkatan", "Nama Kelas"];

  const headerRow = sheet.getRow(1);
  for (let i = 0; i < headers.length; i++) {
    const cell = headerRow.getCell(i + 1);
    cell.value = headers[i];
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  }

  let rowNum = 2;
  for (const [, cls] of data.classes) {
    const row = sheet.getRow(rowNum);
    row.getCell(1).value = cls.id;
    row.getCell(2).value = cls.short;
    row.getCell(3).value = cls.name;

    for (let c = 1; c <= 3; c++) {
      row.getCell(c).border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }

    rowNum++;
  }

  sheet.columns.forEach((col, i) => {
    col.width = Math.max(18, headers[i]?.length + 8 || 18);
  });
}

// ======================== SHEET 6 BUILDER: Master Mapel ========================
function buildSheet6(
  sheet: ExcelJS.Worksheet,
  data: ParsedTimetable
): void {
  const headers = ["ID Mapel", "Kode/Singkatan", "Nama Mapel"];

  const headerRow = sheet.getRow(1);
  for (let i = 0; i < headers.length; i++) {
    const cell = headerRow.getCell(i + 1);
    cell.value = headers[i];
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  }

  let rowNum = 2;
  for (const [, subject] of data.subjects) {
    const row = sheet.getRow(rowNum);
    row.getCell(1).value = subject.id;
    row.getCell(2).value = subject.short;
    row.getCell(3).value = subject.name;

    for (let c = 1; c <= 3; c++) {
      row.getCell(c).border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }

    rowNum++;
  }

  sheet.columns.forEach((col, i) => {
    col.width = Math.max(18, headers[i]?.length + 8 || 18);
  });
}
