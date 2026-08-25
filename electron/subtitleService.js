/**
 * subtitleService.js
 * Runs in the Electron MAIN process.
 *
 * Pipeline: video -> extract audio (ffmpeg, reuses your existing ffmpeg binary)
 * -> transcribe (local Whisper via @xenova/transformers) -> translate if
 * needed (local NLLB-200) -> real timestamped .srt file.
 *
 * 100% local/offline after the models are downloaded once (cached by
 * @xenova/transformers in the OS user cache dir). No API key needed.
 *
 * Install once:
 *   npm install @xenova/transformers
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import { pipeline } from "@xenova/transformers";
import { decodeWavToFloat32 } from "./wavDecoder.js";

const execFileAsync = util.promisify(execFile);

// UI language codes (sourceLang/targetLang from Dashboard.jsx) mapped to what
// Whisper and NLLB-200 each expect.
const LANG_MAP = {
  en: { whisper: "english", nllb: "eng_Latn" },
  vi: { whisper: "vietnamese", nllb: "vie_Latn" },
  zh: { whisper: "chinese", nllb: "zho_Hans" },
};

// Lazy singletons so the (large) models are only loaded once per app run,
// not once per export.
let asrPipelinePromise = null;
let translationPipelinePromise = null;

function getAsrPipeline(onModelProgress) {
  if (!asrPipelinePromise) {
    // Keep inference small enough to run reliably inside Electron's main process.
    asrPipelinePromise = pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-tiny",
      {
        quantized: true,
        progress_callback: onModelProgress,
      },
    );
  }
  return asrPipelinePromise;
}

function getTranslationPipeline(onModelProgress) {
  if (!translationPipelinePromise) {
    translationPipelinePromise = pipeline(
      "translation",
      "Xenova/nllb-200-distilled-600M",
      {
        quantized: true,
        progress_callback: onModelProgress,
      },
    );
  }
  return translationPipelinePromise;
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

/**
 * Transcribe audio into timestamped chunks using local Whisper.
 * Returns: [{ text, timestamp: [startSec, endSec|null] }, ...]
 */
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

  if (sourceLang !== "auto") {
    transcriptionOptions.language = LANG_MAP[sourceLang]?.whisper;
  }

  const result = await transcriber(audioData, transcriptionOptions);

  if (Array.isArray(result.chunks) && result.chunks.length > 0) {
    return result.chunks.map((c) => ({ text: c.text, timestamp: c.timestamp }));
  }
  return [{ text: result.text, timestamp: [0, null] }];
}

/** Translate each subtitle segment's text with local NLLB-200. */
async function translateSegments(segments, sourceLang, targetLang, onProgress) {
  if (sourceLang === targetLang) return segments;

  const translator = await getTranslationPipeline((p) =>
    onProgress?.({ stage: "loading-model", model: "nllb", ...p }),
  );

  const srcNllb = LANG_MAP[sourceLang]?.nllb || "eng_Latn";
  const tgtNllb = LANG_MAP[targetLang]?.nllb || "vie_Latn";

  const translated = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const out = await translator(seg.text, {
      src_lang: srcNllb,
      tgt_lang: tgtNllb,
    });
    translated.push({ ...seg, text: out[0].translation_text });
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
      const endSec = end != null ? end : start + 3; // pad last chunk if no end timestamp
      return `${i + 1}\n${toSrtTimestamp(start)} --> ${toSrtTimestamp(endSec)}\n${seg.text.trim()}\n`;
    })
    .join("\n");
}

/**
 * Full pipeline: video -> real .srt file (translated if needed).
 *
 * @param {string} ffmpegBin - path to the ffmpeg binary you already resolve in main.js
 * @param {string} inputPath - path to the source video
 * @param {string} sourceLang - 'auto' | 'en' | 'vi' | 'zh'
 * @param {string} targetLang - 'en' | 'vi' | 'zh'
 * @param {(data: object) => void} [onProgress] - forwarded to the renderer as 'subtitle-progress'
 * @returns {Promise<string>} path to the generated .srt file
 */
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

    // Free up disk space — audio isn't needed once transcribed.
    fs.unlinkSync(wavPath);

    // Whisper transcribes in the spoken language; NLLB then translates that
    // text to targetLang. When sourceLang is 'auto' we don't get a
    // structured language code back from this pipeline, so we fall back to
    // a sensible default for your 3-language UI (en/vi/zh).
    const effectiveSourceLang =
      sourceLang === "auto" ? (targetLang === "en" ? "vi" : "en") : sourceLang;

    const finalSegments = await translateSegments(
      rawSegments,
      effectiveSourceLang,
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
