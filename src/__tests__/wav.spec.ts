import { describe, expect, it } from 'vitest'
import { encodeWav } from '../wav'

const read = (blob: Blob) =>
  new Promise<DataView>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new DataView(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
const text = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)))

describe('encodeWav', () => {
  it('writes a 16-bit PCM header', async () => {
    const blob = encodeWav([new Float32Array(10), new Float32Array(10)], 48000)
    const view = await read(blob)

    expect(blob.type).toBe('audio/wav')
    expect(view.byteLength).toBe(44 + 10 * 2 * 2)
    expect(text(view, 0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(36 + 40)
    expect(text(view, 8, 8)).toBe('WAVEfmt ')
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint32(24, true)).toBe(48000)
    expect(view.getUint32(28, true)).toBe(48000 * 4)
    expect(view.getUint16(32, true)).toBe(4)
    expect(view.getUint16(34, true)).toBe(16)
    expect(text(view, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(40)
  })

  it('interleaves channels and clips out-of-range samples', async () => {
    const left = new Float32Array([1, -1, 2])
    const right = new Float32Array([0.5, 0, -3])
    const view = await read(encodeWav([left, right], 44100))
    const samples = Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true))

    expect(samples).toEqual([32767, 16383, -32768, 0, 32767, -32768])
  })
})
