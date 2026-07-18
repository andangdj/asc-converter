import { useState, useCallback, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { parseXmlContent } from "./xmlParser";
import { generateAndSaveExcel } from "./excelGenerator";
import { downloadAllClassesZip, downloadAllTeachersZip } from "./pdfGenerator";
import type { ParsedTimetable, ProcessStatus } from "./types";

const STATUS_MESSAGES: Record<ProcessStatus, string> = {
  idle: "",
  reading: "Membaca File XML...",
  processing: "Memproses Data & Relasi...",
  generating: "",
  saving: "Menyimpan ke Komputer...",
  done: "",
  error: "",
  ready: "",
};

function App() {
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsedData, setParsedData] = useState<ParsedTimetable | null>(null);
  const readyMsgRef = useRef("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // App version state
  const [appVersion, setAppVersion] = useState("0.0.0");

  // Update check state
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    newVersion: string;
    body: string;
  } | null>(null);
  const updateRef = useRef<any>(null);

  // Get app version & check for updates on first mount
  useEffect(() => {
    const init = async () => {
      try {
        const v = await getVersion();
        setAppVersion(v);
      } catch {
        // fallback to default
      }
      try {
        const update = await check();
        if (update) {
          updateRef.current = update;
          setUpdateInfo({
            currentVersion: update.currentVersion,
            newVersion: update.version,
            body: update.body || "",
          });
        }
      } catch {
        // Silently fail - no network or dev mode
      }
    };
    init();
  }, []);

  const handleUpdate = async () => {
    try {
      if (updateRef.current) {
        setUpdateInfo(null);
        await updateRef.current.downloadAndInstall();
        await relaunch();
      }
    } catch {
      // ignore
    }
  };

  const handleStatus = useCallback(
    (newStatus: ProcessStatus, message: string) => {
      setStatus(newStatus);
      if (newStatus === "error") {
        setErrorMessage(message);
        setStatusMessage("");
      } else if (newStatus === "done" || newStatus === "ready") {
        setErrorMessage("");
        setStatusMessage(message);
      } else {
        setErrorMessage("");
        setStatusMessage(message || STATUS_MESSAGES[newStatus]);
      }
    },
    []
  );

  const validateXmlRoot = (content: string): boolean => {
    const trimmed = content.trim();
    return (
      trimmed.includes("<timetable") ||
      trimmed.startsWith("<?xml") ||
      trimmed.includes("ascttversion")
    );
  };

  const processFile = async (filePath: string) => {
    try {
      setFileName(filePath.split(/[/\\]/).pop() || filePath);

      handleStatus("reading", STATUS_MESSAGES.reading);
      const content = await readTextFile(filePath);

      if (!validateXmlRoot(content)) {
        handleStatus(
          "error",
          "File tidak valid. Pastikan file adalah file XML ekspor dari aSc Timetables (root node: &lt;timetable ascttversion=...&gt;)."
        );
        return;
      }

      handleStatus("processing", STATUS_MESSAGES.processing);
      const data = parseXmlContent(content);

      if (data.cards.length === 0) {
        handleStatus(
          "error",
          "Tidak ada data jadwal (&lt;card&gt;) ditemukan dalam file XML."
        );
        return;
      }

      setParsedData(data);
      const msg = `File berhasil diproses! (${data.cards.length} kartu jadwal, ${data.classes.size} kelas, ${data.teachers.size} guru)`;
      readyMsgRef.current = msg;
      handleStatus("ready", msg);
    } catch (err: any) {
      const msg = err?.message || String(err);
      handleStatus("error", `Terjadi kesalahan: ${msg}`);
    }
  };

  // ── Download handlers ──

  const handleDownloadExcel = async () => {
    if (!parsedData) return;
    try {
      await generateAndSaveExcel(parsedData, handleStatus);
      setStatus("ready");
      setStatusMessage(readyMsgRef.current);
    } catch (err: any) {
      handleStatus("error", `Gagal export Excel: ${err.message || err}`);
    }
  };

  const handleDownloadClassesZip = async () => {
    if (!parsedData) return;
    try {
      await downloadAllClassesZip(parsedData, handleStatus);
      setStatus("ready");
      setStatusMessage(readyMsgRef.current);
    } catch (err: any) {
      handleStatus("error", `Gagal export PDF: ${err.message || err}`);
    }
  };

  const handleDownloadTeachersZip = async () => {
    if (!parsedData) return;
    try {
      await downloadAllTeachersZip(parsedData, handleStatus);
      setStatus("ready");
      setStatusMessage(readyMsgRef.current);
    } catch (err: any) {
      handleStatus("error", `Gagal export PDF: ${err.message || err}`);
    }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length === 0) return;
      const file = files[0];
      if (file) {
        // @ts-ignore
        const path = file.path;
        if (path) await processFile(path);
        else handleStatus("error", "Tidak dapat membaca path file.");
      }
    },
    [handleStatus]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleBrowseClick = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "XML Files", extensions: ["xml"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (selected) await processFile(selected as string);
    } catch (err: any) {
      handleStatus("error", `Gagal membuka file: ${err.message || err}`);
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setStatusMessage("");
    setErrorMessage("");
    setFileName("");
    setParsedData(null);
    readyMsgRef.current = "";
  };

  const isLoading = ["reading", "processing", "generating", "saving"].includes(status);
  const isReady = status === "ready";
  const isDone = status === "done";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col">
      {/* Update Available Modal */}
      {updateInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">Update Tersedia!</h3>
            <p className="text-sm text-gray-500 mb-4">
              Versi <span className="font-semibold text-gray-700">{updateInfo.newVersion}</span> sudah tersedia.
              <br />
              <span className="text-xs text-gray-400">
                Saat ini: v{updateInfo.currentVersion}
              </span>
            </p>
            {updateInfo.body && (
              <div className="bg-gray-50 rounded-lg p-3 mb-5 text-xs text-gray-600 text-left max-h-24 overflow-y-auto whitespace-pre-wrap">
                {updateInfo.body}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setUpdateInfo(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Nanti Saja
              </button>
              <button
                onClick={handleUpdate}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-md"
              >
                Update Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <img src="/icon.png" alt="Logo" className="w-10 h-10 rounded-xl shadow-md" />
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              aSc Timetables → Excel Converter
            </h1>
            <p className="text-sm text-gray-500">
              Konversi XML jadwal aSc ke Excel (.xlsx) & PDF
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {/* Drop Zone / Idle */}
          {status === "idle" && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={handleBrowseClick}
              className={`
                relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer
                transition-all duration-300 ease-in-out
                ${
                  isDragging
                    ? "border-blue-500 bg-blue-50 scale-[1.02] shadow-lg"
                    : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/50 hover:shadow-md"
                }
              `}
            >
              <div className="mb-6 flex justify-center">
                <div className="relative">
                  <svg
                    className="w-20 h-20 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                Drop file XML di sini
              </h3>
              <p className="text-gray-500 mb-4">
                atau klik untuk memilih file
              </p>
              <p className="text-xs text-gray-400">
                Mendukung file ekspor XML dari aSc Timetables
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                className="hidden"
              />
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="bg-white rounded-2xl shadow-lg p-10 text-center">
              <div className="mb-6 flex justify-center">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="w-7 h-7 text-blue-600 animate-pulse"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                {statusMessage}
              </h3>
              <p className="text-sm text-gray-400">File: {fileName}</p>

              <div className="mt-6 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-700 ease-in-out animate-pulse"
                  style={{
                    width:
                      status === "reading"
                        ? "25%"
                        : status === "processing"
                          ? "50%"
                          : status === "generating"
                            ? "75%"
                            : status === "saving"
                              ? "90%"
                              : "100%",
                  }}
                />
              </div>

              <div className="mt-4 flex justify-center gap-2 text-xs text-gray-400">
                {["reading", "processing", "generating", "saving"].map(
                  (step, i) => (
                    <div
                      key={step}
                      className={`flex items-center gap-1 ${
                        status === step
                          ? "text-blue-600 font-semibold"
                          : ["reading", "processing", "generating", "saving"].indexOf(status) > i
                            ? "text-green-500"
                            : ""
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                          ["reading", "processing", "generating", "saving"].indexOf(status) > i
                            ? "bg-green-100 text-green-700"
                            : status === step
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {["reading", "processing", "generating", "saving"].indexOf(status) > i
                          ? "✓"
                          : i + 1}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Error State */}
          {status === "error" && (
            <div className="bg-white rounded-2xl shadow-lg p-10 text-center">
              <div className="mb-6 flex justify-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-red-700 mb-2">
                Gagal Memproses File
              </h3>
              <p
                className="text-sm text-gray-600 mb-6"
                dangerouslySetInnerHTML={{ __html: errorMessage }}
              />
              <button
                onClick={handleReset}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md hover:shadow-lg"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* Ready State: Show 3 download buttons */}
          {isReady && (
            <div className="bg-white rounded-2xl shadow-lg p-10 text-center">
              <div className="mb-6 flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-green-700 mb-1">
                File Berhasil Diproses!
              </h3>
              <p className="text-sm text-gray-500 mb-2">{fileName}</p>
              <p className="text-xs text-gray-400 mb-8">{statusMessage}</p>

              <p className="text-sm font-semibold text-gray-600 mb-4">
                Pilih format download:
              </p>

              <div className="flex flex-col gap-3 items-center">
                {/* Excel Button */}
                <button
                  onClick={handleDownloadExcel}
                  className="w-72 px-6 py-3 bg-green-600 text-white rounded-xl
                    hover:bg-green-700 transition-all font-semibold shadow-md
                    hover:shadow-lg flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download Full Excel (.xlsx)
                </button>

                {/* PDF per Class button */}
                <button
                  onClick={handleDownloadClassesZip}
                  className="w-72 px-6 py-3 bg-blue-600 text-white rounded-xl
                    hover:bg-blue-700 transition-all font-semibold shadow-md
                    hover:shadow-lg flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  Download Jadwal per Kelas (ZIP PDF)
                </button>

                {/* PDF per Teacher button */}
                <button
                  onClick={handleDownloadTeachersZip}
                  className="w-72 px-6 py-3 bg-indigo-600 text-white rounded-xl
                    hover:bg-indigo-700 transition-all font-semibold shadow-md
                    hover:shadow-lg flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  Download Jadwal per Guru (ZIP PDF)
                </button>
              </div>

              <button
                onClick={handleReset}
                className="mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Konversi File Lain
              </button>
            </div>
          )}

          {/* Done State */}
          {isDone && (
            <div className="bg-white rounded-2xl shadow-lg p-10 text-center">
              <div className="mb-6 flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-green-700 mb-2">
                Berhasil!
              </h3>
              <p className="text-sm text-gray-600 mb-6 whitespace-pre-wrap">
                {statusMessage}
              </p>
              <button
                onClick={handleReset}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md hover:shadow-lg"
              >
                Kembali
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-3 text-center text-xs text-gray-400">
        aSc Timetables to Excel Converter v{appVersion} &middot; Developed by{" "}
        <a
          href="https://github.com/andangdj"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          andangdj
        </a>
      </footer>
    </div>
  );
}

export default App;

