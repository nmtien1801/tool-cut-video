import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { execFile } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

const fixPathForAsar = (p) => p.replace("app.asar", "app.asar.unpacked");

let ffmpegPath = ffmpegStatic;
let ffprobePath = ffprobeStatic.path;

if (!isDev) {
  const prodFfmpeg = path.join(process.resourcesPath, "ffmpeg.exe");
  const prodFfprobe = path.join(process.resourcesPath, "ffprobe.exe");
  if (fs.existsSync(prodFfmpeg)) ffmpegPath = prodFfmpeg;
  if (fs.existsSync(prodFfprobe)) ffprobePath = prodFfprobe;
}

ffmpeg.setFfmpegPath(fixPathForAsar(ffmpegPath));
ffmpeg.setFfprobePath(fixPathForAsar(ffprobePath));

// ─────────────────────────────────────────────
// 1. XÁC ĐỊNH ĐƯỜNG DẪN THƯ MỤC CHỨA FONT ANTON (Khai báo trước)
// ─────────────────────────────────────────────
const resolveFontsDir = () => {
  const devPublic = path.join(__dirname, "../public");
  const prodResources = path.join(process.resourcesPath, "public");
  const prodDist = path.join(__dirname, "../dist");

  if (fs.existsSync(devPublic)) return devPublic;
  if (fs.existsSync(prodResources)) return prodResources;
  if (fs.existsSync(prodDist)) return prodDist;
  return null;
};

const fontsDir = resolveFontsDir();

// ─────────────────────────────────────────────
// 2. TẠO CẤU HÌNH FONTCONFIG CHO FFmpeg (Khai báo sau fontsDir)
// ─────────────────────────────────────────────
const setupFontConfig = () => {
  if (!fontsDir || !fs.existsSync(fontsDir)) return null;

  const cleanFontsDir = fontsDir.replace(/\\/g, "/");
  const fontConfigXml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${cleanFontsDir}</dir>
</fontconfig>`;

  const confDir = path.join(os.tmpdir(), "ffmpeg_fontconfig");
  if (!fs.existsSync(confDir)) fs.mkdirSync(confDir, { recursive: true });

  const confFile = path.join(confDir, "fonts.conf");
  fs.writeFileSync(confFile, fontConfigXml, "utf8");
  return confDir;
};

const fontConfigPath = setupFontConfig();

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 850,
    title: "Cut video - Pro Video Tool",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
  });

  const startUrl = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "../dist/index.html")}`;

  mainWindow.loadURL(startUrl);
  if (isDev) mainWindow.webContents.openDevTools();
};

app.whenReady().then(createWindow);

// ─────────────────────────────────────────────
// HW ENCODER DETECTION (GPU)
// ─────────────────────────────────────────────
let cachedEncoder = null;
const HW_CANDIDATES = [
  {
    name: "h264_nvenc",
    args: [
      "-f",
      "lavfi",
      "-i",
      "nullsrc=s=64x64:d=1",
      "-c:v",
      "h264_nvenc",
      "-f",
      "null",
      "-",
    ],
  },
  {
    name: "hevc_videotoolbox",
    args: [
      "-f",
      "lavfi",
      "-i",
      "nullsrc=s=64x64:d=1",
      "-c:v",
      "hevc_videotoolbox",
      "-f",
      "null",
      "-",
    ],
  },
  {
    name: "h264_videotoolbox",
    args: [
      "-f",
      "lavfi",
      "-i",
      "nullsrc=s=64x64:d=1",
      "-c:v",
      "h264_videotoolbox",
      "-f",
      "null",
      "-",
    ],
  },
  {
    name: "h264_amf",
    args: [
      "-f",
      "lavfi",
      "-i",
      "nullsrc=s=64x64:d=1",
      "-c:v",
      "h264_amf",
      "-f",
      "null",
      "-",
    ],
  },
  {
    name: "h264_qsv",
    args: [
      "-f",
      "lavfi",
      "-i",
      "nullsrc=s=64x64:d=1",
      "-c:v",
      "h264_qsv",
      "-f",
      "null",
      "-",
    ],
  },
];

// --- HÀM HỖ TRỢ XỬ LÝ THỜI GIAN PHỤ ĐỀ ---
const timeStringToSeconds = (timeStr) => {
  if (!timeStr) return 0;
  const [hms, ms] = timeStr.split(",");
  const [h, m, s] = hms.split(":");
  return (
    parseInt(h) * 3600 +
    parseInt(m) * 60 +
    parseInt(s) +
    parseInt(ms || 0) / 1000
  );
};

const secondsToTimeString = (totalSeconds) => {
  const clamped = Math.max(0, totalSeconds);
  const hh = String(Math.floor(clamped / 3600)).padStart(2, "0");
  const mm = String(Math.floor((clamped % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(clamped % 60)).padStart(2, "0");
  const ms = String(Math.round((clamped % 1) * 1000)).padStart(3, "0");
  return `${hh}:${mm}:${ss},${ms}`;
};

// Hàm chia nhỏ và ngắt tối đa 2 dòng cho mỗi đoạn phụ đề
const splitSubIntoChunks = (sub, maxWordsPerChunk = 6) => {
  const text = (sub.text || "").replace(/\s+/g, " ").trim();
  const words = text.split(" ").filter(Boolean);

  if (words.length === 0) return [];

  // Tách 2 dòng: nếu <= 3 từ thì 1 dòng, > 3 từ thì chia đôi
  const formatLines = (wordArr) => {
    if (wordArr.length <= 3) {
      return wordArr.join(" ");
    }
    const mid = Math.ceil(wordArr.length / 2);
    return `${wordArr.slice(0, mid).join(" ")}\n${wordArr.slice(mid).join(" ")}`;
  };

  if (words.length <= maxWordsPerChunk) {
    return [{ ...sub, text: formatLines(words) }];
  }

  const startSec = timeStringToSeconds(sub.start);
  const endSec = timeStringToSeconds(sub.end);
  const totalDuration = Math.max(0.5, endSec - startSec);

  const chunks = [];
  for (let i = 0; i < words.length; i += maxWordsPerChunk) {
    const chunkWords = words.slice(i, i + maxWordsPerChunk);
    chunks.push(formatLines(chunkWords));
  }

  const timePerChunk = totalDuration / chunks.length;

  return chunks.map((chunkText, index) => {
    const chunkStart = startSec + index * timePerChunk;
    const chunkEnd = chunkStart + timePerChunk;
    return {
      id: `${sub.id}_${index}`,
      text: chunkText,
      start: secondsToTimeString(chunkStart),
      end: secondsToTimeString(chunkEnd),
    };
  });
};

const generateSegmentSrt = (rawSegments, segStartTime, segDuration) => {
  const segEndSec = segStartTime + segDuration;

  const flattenedSubs = rawSegments.flatMap((sub) =>
    splitSubIntoChunks(sub, 6),
  );

  const filteredSubs = flattenedSubs
    .map((sub) => {
      const subStartSec = timeStringToSeconds(sub.start);
      const subEndSec = timeStringToSeconds(sub.end);

      if (subEndSec <= segStartTime || subStartSec >= segEndSec) return null;

      const newStartSec = Math.max(0, subStartSec - segStartTime);
      const newEndSec = Math.min(segDuration, subEndSec - segStartTime);

      return {
        ...sub,
        text: sub.text,
        start: secondsToTimeString(newStartSec),
        end: secondsToTimeString(newEndSec),
      };
    })
    .filter(Boolean);

  return filteredSubs
    .map((sub, i) => `${i + 1}\n${sub.start} --> ${sub.end}\n${sub.text}`)
    .join("\n\n");
};

const detectHwEncoder = async () => {
  if (cachedEncoder) return cachedEncoder;
  const bin = fixPathForAsar(ffmpegPath);

  for (const candidate of HW_CANDIDATES) {
    try {
      await new Promise((resolve, reject) => {
        execFile(bin, ["-y", ...candidate.args], { timeout: 2500 }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      cachedEncoder = candidate.name;
      return cachedEncoder;
    } catch (e) {
      /* continue */
    }
  }
  cachedEncoder = "libx264";
  return cachedEncoder;
};

const getEncoderPreset = (encoder) => {
  if (encoder === "h264_nvenc")
    return ["-preset", "p4", "-rc", "vbr", "-cq", "23", "-b:v", "0"];
  if (["h264_videotoolbox", "hevc_videotoolbox"].includes(encoder))
    return ["-q:v", "65", "-realtime", "false"];
  if (encoder === "h264_amf")
    return ["-quality", "balanced", "-rc", "cqp", "-qp_i", "23", "-qp_p", "23"];
  if (encoder === "h264_qsv") return ["-preset", "faster", "-q", "23"];
  return ["-preset", "ultrafast", "-crf", "23"];
};

// ─────────────────────────────────────────────
// TIỆN ÍCH & XỬ LÝ SONG SONG
// ─────────────────────────────────────────────
const timemarkToSeconds = (timemark) => {
  if (!timemark || typeof timemark !== "string") return 0;
  const parts = timemark.split(":");
  return parts.length === 3
    ? parseFloat(parts[0]) * 3600 +
        parseFloat(parts[1]) * 60 +
        parseFloat(parts[2])
    : parseFloat(timemark) || 0;
};

const runConcurrent = async (tasks, maxWorkers) => {
  const results = [],
    executing = [];
  for (const task of tasks) {
    const p = task();
    results.push(p);
    if (maxWorkers <= tasks.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= maxWorkers) await Promise.race(executing);
    }
  }
  return Promise.all(results);
};

class ProgressMerger {
  constructor(segments, onProgress) {
    this.durations = segments.map((s) => s.duration);
    this.totalDuration = this.durations.reduce((a, b) => a + b, 0) || 1;
    this.pcts = segments.map(() => 0);
    this.speeds = segments.map(() => 1);
    this.onProgress = onProgress;
  }

  update(idx, pct, speed) {
    this.pcts[idx] = pct;
    this.speeds[idx] = Math.max(speed, 0.01);
    if (this.onProgress) {
      const doneSeconds = this.durations.reduce(
        (sum, dur, i) => sum + (this.pcts[i] / 100) * dur,
        0,
      );
      const overallPct = Math.min(
        Math.floor((doneSeconds / this.totalDuration) * 100),
        99,
      );
      const avgSpeed =
        this.speeds.reduce((a, b) => a + b, 0) / this.speeds.length;
      const remainingVideo = this.totalDuration - doneSeconds;
      const etaSeconds = remainingVideo / avgSpeed;
      this.onProgress(overallPct, Math.max(etaSeconds, 0));
    }
  }
}

const runFfmpeg = (args, segmentDuration, onProgress) => {
  return new Promise((resolve, reject) => {
    const bin = fixPathForAsar(ffmpegPath);
    let lastSpeed = 1.0;

    const customEnv = { ...process.env };
    if (fontConfigPath) {
      customEnv.FONTCONFIG_PATH = fontConfigPath;
    }

    const proc = execFile(
      bin,
      args,
      { maxBuffer: 100 * 1024 * 1024, env: customEnv },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr?.slice(-800) || error.message));
        else resolve();
      },
    );

    proc.stderr.on("data", (data) => {
      const line = data.toString();
      const matchSpeed = line.match(/speed=\s*([\d.]+)x?/);
      if (matchSpeed) lastSpeed = Math.max(parseFloat(matchSpeed[1]), 0.01);
      const matchTime = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
      if (matchTime && onProgress && segmentDuration > 0) {
        const elapsed = timemarkToSeconds(matchTime[1]);
        const pct = Math.min(Math.round((elapsed / segmentDuration) * 100), 99);
        onProgress(pct, lastSpeed);
      }
    });
  });
};

const moveFileWithRetry = async (sourcePath, targetPath) => {
  let lastError;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      await fs.promises.rename(sourcePath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "EPERM", "EACCES"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(
    `Không thể ghi file output sau khi chờ mở khóa: ${lastError?.message}`,
  );
};

// ─────────────────────────────────────────────
// PHỤ ĐỀ / AUTO-TRANSLATE
// ─────────────────────────────────────────────
const runSubtitleGeneration = async (inputPath, sourceLang, targetLang) => {
  const { generateSubtitles } = await import("./subtitleService.js");
  return generateSubtitles({
    ffmpegBin: fixPathForAsar(ffmpegPath),
    inputPath,
    sourceLang,
    targetLang,
    onProgress: (data) =>
      mainWindow?.webContents.send("subtitle-progress", data),
  });
};

// ─────────────────────────────────────────────
// IPC HANDLERS
// ─────────────────────────────────────────────

ipcMain.handle("detect-hw-encoder", async () => await detectHwEncoder());

ipcMain.handle("select-video", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Videos", extensions: ["mp4", "mov", "avi", "mkv", "webm"] },
    ],
  });
  if (result.canceled) return { success: false };
  return {
    success: true,
    filePath: result.filePaths[0],
    fileName: path.basename(result.filePaths[0]),
  };
});

ipcMain.handle("get-video-duration", async (event, inputPath) => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) resolve({ success: false, duration: 0 });
      else
        resolve({
          success: true,
          duration: Math.floor(metadata.format.duration),
        });
    });
  });
});

// CẮT VIDEO GỐC
ipcMain.handle(
  "trim-multiple-segments",
  async (event, { inputPath, segments, subtitles }) => {
    try {
      const outputBase = path.join(
        os.homedir(),
        "Downloads",
        "Video_Export_Trims",
      );
      if (!fs.existsSync(outputBase))
        fs.mkdirSync(outputBase, { recursive: true });

      const encoder = await detectHwEncoder();
      const isGpu = encoder !== "libx264";

      const merger = new ProgressMerger(segments, (pct, eta) => {
        mainWindow.webContents.send("trim-progress", { percent: pct, eta });
      });

      const tasks = segments.map((seg, index) => async () => {
        const outPath = path.join(outputBase, `cut_${Date.now()}_${index}.mp4`);
        const tempPath = `${outPath}.part.mp4`;

        let srtPath = null;
        let escapedSrtPath = null;

        if (subtitles?.enabled && subtitles?.rawSegments) {
          const srtContent = generateSegmentSrt(
            subtitles.rawSegments,
            seg.startTime,
            seg.duration,
          );
          if (srtContent.trim() !== "") {
            srtPath = path.join(
              os.tmpdir(),
              `custom_sub_trim_${index}_${Date.now()}.srt`,
            );
            fs.writeFileSync(srtPath, srtContent, "utf8");
            escapedSrtPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\\\:");
          }
        }

        const args = [
          "-y",
          "-ss",
          seg.startTime.toString(),
          "-t",
          seg.duration.toString(),
          "-i",
          inputPath,
        ];

        if (escapedSrtPath) {
          let filterComplex = `[0:v]format=yuva420p[base_v];`;
          let lastLayer = "[base_v]";

          if (subtitles.exportGreenScreen) {
            filterComplex += `color=c=0x2b6cb0:s=1920x220,format=yuva420p,geq=r='r(X,Y)':a='240*pow(Y/H,1.2)'[grad];`;
            filterComplex += `[base_v][grad]overlay=0:H-220:shortest=1[with_bg];`;
            lastLayer = "[with_bg]";
          }

          // Cấu hình Fontname=Anton thuần túy, không chèn :fontsdir
          filterComplex += `${lastLayer}subtitles=${escapedSrtPath}:force_style='Fontname=Anton,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=12,MarginL=30,MarginR=30'[outv]`;

          args.push(
            "-filter_complex",
            filterComplex,
            "-map",
            "[outv]",
            "-map",
            "0:a?",
          );
          args.push("-c:v", encoder, ...getEncoderPreset(encoder));
          if (!isGpu)
            args.push(
              "-threads",
              Math.max(1, Math.floor(os.cpus().length / 2)).toString(),
            );
          args.push("-c:a", "copy");
        } else {
          args.push("-c", "copy", "-map", "0");
        }

        args.push("-movflags", "+faststart", tempPath);

        try {
          await runFfmpeg(args, seg.duration, (pct, speed) =>
            merger.update(index, pct, speed),
          );
          await moveFileWithRetry(tempPath, outPath);
        } catch (error) {
          if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
          throw error;
        } finally {
          if (srtPath && fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
        }
      });

      const maxWorkers =
        subtitles?.enabled && isGpu ? 2 : Math.min(segments.length, 4);
      await runConcurrent(tasks, maxWorkers);

      mainWindow.webContents.send("trim-progress", { percent: 100, eta: 0 });
      shell.openPath(outputBase);

      return { success: true, message: "Cắt và xử lý phụ đề hoàn tất!" };
    } catch (error) {
      return { success: false, message: "Lỗi cắt video: " + error.message };
    }
  },
);

// XUẤT VIDEO BLUR NỀN
ipcMain.handle(
  "export-with-aspect-ratio",
  async (event, { inputPath, aspectRatio, segments, subtitles }) => {
    try {
      const encoder = await detectHwEncoder();
      const isGpu = encoder !== "libx264";
      const outW = aspectRatio === "9:16" ? 1080 : 1920;
      const outH = aspectRatio === "9:16" ? 1920 : 1080;
      const gradH = Math.floor(outH * 0.18);
      const inputResolved = path.resolve(inputPath);
      const ratioTag = aspectRatio === "9:16" ? "9x16" : "16x9";
      const outputFolder = path.join(
        os.homedir(),
        "Downloads",
        `Video_Export_${ratioTag}_${Date.now()}`,
      );
      if (!fs.existsSync(outputFolder))
        fs.mkdirSync(outputFolder, { recursive: true });

      const hasAudio = await new Promise((resolve) => {
        ffmpeg.ffprobe(inputResolved, (err, meta) =>
          resolve(
            meta?.streams?.some((s) => s.codec_type === "audio") || false,
          ),
        );
      });

      const bgW = Math.floor(outW / 4),
        bgH = Math.floor(outH / 4);

      const merger = new ProgressMerger(segments, (pct, eta) => {
        mainWindow.webContents.send("export-progress", { percent: pct, eta });
      });

      const tasks = segments.map((seg, index) => async () => {
        const outPath = path.join(outputFolder, `segment_${index + 1}.mp4`);
        const tempPath = `${outPath}.part.mp4`;

        let srtPath = null;
        let escapedSrtPath = null;

        if (subtitles?.enabled && subtitles?.rawSegments) {
          const srtContent = generateSegmentSrt(
            subtitles.rawSegments,
            seg.startTime,
            seg.duration,
          );
          if (srtContent.trim() !== "") {
            srtPath = path.join(
              os.tmpdir(),
              `custom_sub_blur_${index}_${Date.now()}.srt`,
            );
            fs.writeFileSync(srtPath, srtContent, "utf8");
            escapedSrtPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\\\:");
          }
        }

        let filterComplex =
          `[0:v]split=2[bg_in][fg_in];` +
          `[bg_in]scale=${bgW}:${bgH}:force_original_aspect_ratio=increase,crop=${bgW}:${bgH},boxblur=10:5,scale=${outW}:${outH}[bg_blur];` +
          `[fg_in]scale=${outW}:${outH}:force_original_aspect_ratio=decrease[fg_scaled];` +
          `[bg_blur][fg_scaled]overlay=(W-w)/2:(H-h)/2[out_base]`;

        let finalMap = "[out_base]";

        if (escapedSrtPath) {
          let overlayInput = "[out_base]";
          if (subtitles.exportGreenScreen) {
            filterComplex += `;color=c=0x2b6cb0:s=${outW}x${gradH},format=yuva420p,geq=r='r(X,Y)':a='240*pow(Y/H,1.2)'[grad]`;
            filterComplex += `;[out_base][grad]overlay=0:H-${gradH}:shortest=1[with_bg]`;
            overlayInput = "[with_bg]";
          }

          const fontSize = aspectRatio === "9:16" ? 18 : 20;

          // Cấu hình Fontname=Anton
          filterComplex += `;${overlayInput}subtitles=${escapedSrtPath}:force_style='Fontname=Anton,FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2.5,Alignment=2,MarginV=15,MarginL=40,MarginR=40'[out_sub]`;
          finalMap = "[out_sub]";
        }

        const args = [
          "-y",
          "-ss",
          seg.startTime.toString(),
          "-t",
          seg.duration.toString(),
          "-i",
          inputResolved,
          "-filter_complex",
          filterComplex,
          "-map",
          finalMap,
        ];

        if (hasAudio)
          args.push("-map", "0:a:0?", "-c:a", "aac", "-b:a", "192k");
        args.push("-c:v", encoder, ...getEncoderPreset(encoder));
        if (!isGpu)
          args.push(
            "-threads",
            Math.max(1, Math.floor(os.cpus().length / 2)).toString(),
          );
        args.push(
          "-pix_fmt",
          "yuv420p",
          "-f",
          "mp4",
          "-movflags",
          "+faststart",
          tempPath,
        );

        try {
          await runFfmpeg(args, seg.duration, (pct, speed) =>
            merger.update(index, pct, speed),
          );
          await moveFileWithRetry(tempPath, outPath);
        } catch (error) {
          if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
          throw error;
        } finally {
          if (srtPath && fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
        }
      });

      await runConcurrent(tasks, Math.min(segments.length, isGpu ? 2 : 1));
      mainWindow.webContents.send("export-progress", { percent: 100, eta: 0 });
      shell.openPath(outputFolder);

      return {
        success: true,
        message: `Xuất thành công ${segments.length} đoạn kèm phụ đề!`,
      };
    } catch (error) {
      return { success: false, message: "Lỗi xuất video: " + error.message };
    }
  },
);

// TẠO VÀ TRẢ VỀ PHỤ ĐỀ CHO FRONTEND SỬA
ipcMain.handle(
  "generate-subtitles-only",
  async (event, { inputPath, sourceLang, targetLang }) => {
    let srtPath = null;
    try {
      srtPath = await runSubtitleGeneration(inputPath, sourceLang, targetLang);
      const srtContent = fs.readFileSync(srtPath, "utf8");
      fs.unlinkSync(srtPath);
      return { success: true, srtContent };
    } catch (error) {
      if (srtPath && fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
      return { success: false, message: error.message };
    }
  },
);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
