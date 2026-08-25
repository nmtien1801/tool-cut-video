/**
 * wavDecoder.js
 * Minimal PCM16 mono WAV -> Float32Array decoder (no extra dependency needed).
 * ffmpeg is asked to output 16kHz / mono / pcm_s16le, so this is enough.
 */

export function decodeWavToFloat32(buffer) {
  let offset = 12; // skip "RIFF"+size+"WAVE"
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (dataOffset === -1) {
    throw new Error('wavDecoder: could not find "data" chunk in WAV file');
  }

  const sampleCount = dataSize / 2; // 16-bit samples
  const float32 = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = buffer.readInt16LE(dataOffset + i * 2);
    float32[i] = int16 / 32768; // normalize to [-1, 1]
  }

  return float32;
}