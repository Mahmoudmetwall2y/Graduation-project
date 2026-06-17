import type { SerialCommand, SerialResponse } from './provisioning'
import { serializeSerialCommand } from './provisioning'

export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readable?: ReadableStream<Uint8Array> | null
  writable?: WritableStream<Uint8Array> | null
}

export type NavigatorWithSerial = Navigator & {
  serial?: {
    requestPort(): Promise<SerialPortLike>
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function toWebSerialErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Failed to provision over USB.'
  const lower = message.toLowerCase()

  if (lower.includes('failed to open serial port') || lower.includes('already open')) {
    return 'Could not open the ESP32 serial port. Close Arduino IDE Serial Monitor, PlatformIO, esptool, or any other app using the board, unplug/replug the ESP32, then try again.'
  }

  if (lower.includes('permission') || lower.includes('denied') || lower.includes('not allowed')) {
    return 'Browser permission to the ESP32 serial port was denied. Try again and select the ESP32 USB device. On Linux, make sure your user has serial access, for example through the dialout group.'
  }

  if (lower.includes('no port selected')) {
    return 'No serial port was selected. Click again and choose the ESP32 USB device.'
  }

  return message
}

export function isWebSerialSupported() {
  return typeof navigator !== 'undefined' && Boolean((navigator as NavigatorWithSerial).serial)
}

export async function requestSerialPort() {
  const serial = (navigator as NavigatorWithSerial).serial
  if (!serial) throw new Error('Web Serial is not available in this browser.')
  return serial.requestPort()
}

async function openSerialPort(port: SerialPortLike, baudRate: number) {
  try {
    await port.open({ baudRate })
  } catch (error) {
    await port.close().catch(() => undefined)
    await sleep(250)

    try {
      await port.open({ baudRate })
    } catch {
      throw new Error(toWebSerialErrorMessage(error))
    }
  }
}

export async function sendJsonLineCommands(input: {
  port: SerialPortLike
  commands: SerialCommand[]
  baudRate?: number
  /** Extra time (ms) to keep reading after all commands are written, so the
   *  firmware's final reboot ACK lines have time to arrive before the port
   *  is closed. Default: 1200ms — enough for the ESP32 ~500ms reboot delay
   *  plus a safety margin. */
  drainMs?: number
  onLine?: (line: string, parsed?: SerialResponse) => void
}) {
  const baudRate = input.baudRate || 115200
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const readerHolder: { current: ReadableStreamDefaultReader<Uint8Array> | null } = {
    current: null,
  }
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let keepReading = true
  let lineBuffer = ''

  await openSerialPort(input.port, baudRate)

  const readPromise = input.port.readable
    ? (async () => {
        readerHolder.current = input.port.readable?.getReader() || null
        while (keepReading && readerHolder.current) {
          const { value, done } = await readerHolder.current.read()
          if (done) break
          if (!value) continue

          lineBuffer += decoder.decode(value, { stream: true })
          const lines = lineBuffer.split(/\r?\n/)
          lineBuffer = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            let parsed: SerialResponse | undefined
            if (trimmed.startsWith('{')) {
              try {
                parsed = JSON.parse(trimmed) as SerialResponse
              } catch {
                parsed = undefined
              }
            }
            input.onLine?.(trimmed, parsed)
          }
        }
      })()
    : Promise.resolve()

  try {
    if (!input.port.writable) throw new Error('Selected serial port is not writable.')

    writer = input.port.writable.getWriter()
    for (const command of input.commands) {
      await writer.write(encoder.encode(serializeSerialCommand(command)))
      // Give the firmware time to process each command; reboot needs more time
      await new Promise(resolve => setTimeout(resolve, command.cmd === 'reboot' ? 500 : 250))
    }

    // Drain period: keep reading serial output after all commands are written so
    // the firmware's final ACK (e.g. {"stage":"saved_to_nvs"} or
    // {"stage":"rebooting"}) arrives before we close the port.
    const drainMs = input.drainMs ?? 1200
    if (drainMs > 0) {
      await new Promise(resolve => setTimeout(resolve, drainMs))
    }
  } finally {
    keepReading = false
    try {
      writer?.releaseLock()
    } catch {}
    try {
      await readerHolder.current?.cancel()
      readerHolder.current?.releaseLock()
    } catch {}
    await readPromise.catch(() => undefined)
    await input.port.close().catch(() => undefined)
  }
}

export async function sendTextLineCommands(input: {
  port: SerialPortLike
  commands: string[]
  baudRate?: number
  onLine?: (line: string) => void
  onCommand?: (command: string) => void
}) {
  const baudRate = input.baudRate || 115200
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const readerHolder: { current: ReadableStreamDefaultReader<Uint8Array> | null } = {
    current: null,
  }
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let keepReading = true

  await openSerialPort(input.port, baudRate)

  const readPromise = input.port.readable
    ? (async () => {
        readerHolder.current = input.port.readable?.getReader() || null
        while (keepReading && readerHolder.current) {
          const { value, done } = await readerHolder.current.read()
          if (done) break
          if (!value) continue
          input.onLine?.(decoder.decode(value, { stream: true }))
        }
      })()
    : Promise.resolve()

  try {
    if (!input.port.writable) throw new Error('Selected serial port is not writable.')

    writer = input.port.writable.getWriter()
    for (const command of input.commands) {
      input.onCommand?.(command)
      await writer.write(encoder.encode(`${command}\r\n`))
      await sleep(command === 'REBOOT' ? 700 : 220)
    }
  } finally {
    keepReading = false
    try {
      writer?.releaseLock()
    } catch {}
    try {
      await readerHolder.current?.cancel()
      readerHolder.current?.releaseLock()
    } catch {}
    await readPromise.catch(() => undefined)
    await input.port.close().catch(() => undefined)
  }
}
