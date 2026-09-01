/**
 * subtitleService.js
 * Runs in the Electron MAIN process.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import { pipeline } from "@xenova/transformers";
import { decodeWavToFloat32 } from "./wavDecoder.js";

const execFileAsync = util.promisify(execFile);

const LANG_MAP = {
  en: "english",
  vi: "vietnamese",
  zh: "chinese",
};

let asrPipelinePromise = null;

function getAsrPipeline(onModelProgress) {
  if (!asrPipelinePromise) {
    // Dùng whisper-small để nhận diện giọng nói tiếng Việt chuẩn xác
    asrPipelinePromise = pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-small",
      {
        quantized: true,
        progress_callback: onModelProgress,
      },
    );
  }
  return asrPipelinePromise;
}

/** Extract mono 16kHz PCM WAV audio from the source video via ffmpeg. */
async function extractAudio(ffmpegBin, inputPath, outputWavPath) {
  await execFileAsync(ffmpegBin, [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    outputWavPath,
  ]);
  return outputWavPath;
}

/** Transcribe audio using Whisper */
async function transcribeAudio(wavPath, sourceLang, onProgress) {
  const transcriber = await getAsrPipeline((p) =>
    onProgress?.({ stage: "loading-model", model: "whisper", ...p }),
  );

  const audioData = decodeWavToFloat32(fs.readFileSync(wavPath));

  const transcriptionOptions = {
    chunk_length_s: 30,
    stride_length_s: 5,
    task: "transcribe",
    return_timestamps: true,
    callback_function: () => onProgress?.({ stage: "transcribing" }),
  };

  if (sourceLang !== "auto" && LANG_MAP[sourceLang]) {
    transcriptionOptions.language = LANG_MAP[sourceLang];
  }

  const result = await transcriber(audioData, transcriptionOptions);

  if (Array.isArray(result.chunks) && result.chunks.length > 0) {
    return result.chunks.map((c) => ({ text: c.text, timestamp: c.timestamp }));
  }
  return [{ text: result.text, timestamp: [0, null] }];
}

/** Dịch nhanh qua Google Translate Endpoint công khai */
async function translateText(text, from, to) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    return data[0]?.map((item) => item[0]).join("") || text;
  } catch (err) {
    return text; // Giữ nguyên text nếu mất mạng
  }
}

async function translateSegments(segments, sourceLang, targetLang, onProgress) {
  if (sourceLang === targetLang) return segments;

  const src = sourceLang === "auto" ? "auto" : sourceLang;
  const tgt = targetLang;

  const translated = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const trans = await translateText(seg.text, src, tgt);
    translated.push({ ...seg, text: trans });
    onProgress?.({
      stage: "translating",
      index: i + 1,
      total: segments.length,
    });
  }
  return translated;
}

function toSrtTimestamp(totalSeconds) {
  const clamped = Math.max(0, totalSeconds || 0);
  const hh = String(Math.floor(clamped / 3600)).padStart(2, "0");
  const mm = String(Math.floor((clamped % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(clamped % 60)).padStart(2, "0");
  const ms = String(Math.round((clamped % 1) * 1000)).padStart(3, "0");
  return `${hh}:${mm}:${ss},${ms}`;
}

function segmentsToSrt(segments) {
  return segments
    .map((seg, i) => {
      const [start, end] = seg.timestamp;
      const endSec = end != null ? end : start + 3;
      return `${i + 1}\n${toSrtTimestamp(start)} --> ${toSrtTimestamp(endSec)}\n${seg.text.trim()}\n`;
    })
    .join("\n");
}

export async function generateSubtitles({
  ffmpegBin,
  inputPath,
  sourceLang = "auto",
  targetLang = "vi",
  onProgress,
}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cutvideo-sub-"));
  const wavPath = path.join(workDir, "audio.wav");

  try {
    onProgress?.({ stage: "extracting-audio" });
    await extractAudio(ffmpegBin, inputPath, wavPath);

    const rawSegments = await transcribeAudio(wavPath, sourceLang, onProgress);
    fs.unlinkSync(wavPath);

    const finalSegments = await translateSegments(
      rawSegments,
      sourceLang,
      targetLang,
      onProgress,
    );

    const srtContent = segmentsToSrt(finalSegments);
    const srtPath = path.join(workDir, `sub_${Date.now()}.srt`);
    fs.writeFileSync(srtPath, srtContent, "utf8");

    onProgress?.({ stage: "subtitle-done" });
    return srtPath;
  } catch (err) {
    fs.rmSync(workDir, { recursive: true, force: true });
    throw err;
  }
}
