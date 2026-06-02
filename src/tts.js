'use strict'
const { existsSync, mkdirSync, readFileSync } = require('fs')
const { join } = require('path')
const { createHash } = require('crypto')

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const VOICE = 'af_heart'
const DTYPE = 'q8'

let instance    = null
let initPromise = null

function getCacheDir() { return process.env.CACHE_DIR ?? join(require('os').homedir(), '.t1v-cache') }
function ttsCache()   { return join(getCacheDir(), 'tts') }
function wavPath(text) {
  const hash = createHash('md5').update(text).digest('hex')
  return join(ttsCache(), `${hash}.wav`)
}

async function getModel() {
  if (instance)    return instance
  if (initPromise) return initPromise
  const { KokoroTTS } = await import('kokoro-js')
  const { env }       = await import('@huggingface/transformers')
  env.cacheDir = join(getCacheDir(), 'hf')
  console.log('[tts] Loading Kokoro model…')
  initPromise = KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: 'cpu' })
    .then(m => { instance = m; console.log('[tts] Model ready'); return m })
  return initPromise
}

async function speak(text) {
  const file = wavPath(text)
  if (existsSync(file)) return readFileSync(file)
  mkdirSync(ttsCache(), { recursive: true })
  const model = await getModel()
  const audio = await model.generate(text, { voice: VOICE })
  await audio.save(file)
  return readFileSync(file)
}

async function warmup(phrases) {
  mkdirSync(ttsCache(), { recursive: true })
  const model = await getModel()
  for (const text of phrases) {
    const file = wavPath(text)
    if (existsSync(file)) continue
    try {
      const audio = await model.generate(text, { voice: VOICE })
      await audio.save(file)
      console.log(`[tts] Warmed: "${text}"`)
    } catch (err) {
      console.warn(`[tts] Warmup failed for "${text}":`, err.message)
    }
  }
  console.log('[tts] Warmup complete')
}

module.exports = { speak, warmup }
