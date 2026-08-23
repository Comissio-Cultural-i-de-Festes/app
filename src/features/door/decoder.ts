// The wasm binary, served from this origin and content-hashed by the build.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

/**
 * The QR decoder, and why the wasm is ours.
 *
 * `barcode-detector` falls back to zxing-wasm wherever `BarcodeDetector` is
 * missing — which is every iPhone, so every door. Left alone, zxing fetches
 * its 1 MB binary from a jsdelivr CDN the first time it decodes anything.
 *
 * That is the worst possible request at the worst possible moment: a
 * third-party host, over the venue's dead wifi, at the exact second somebody
 * is standing in front of you with their phone out. It is also a third party
 * learning when and where this association holds its parties.
 *
 * So the binary ships with the app. It is deliberately NOT precached — a
 * megabyte for two hundred members who will never open the scanner — but a
 * CacheFirst rule keeps it forever once fetched, and the junta screen warms it
 * before anybody walks up to the door.
 */

const overrides = {
  locateFile: (path: string, prefix: string) =>
    path.endsWith('.wasm') ? wasmUrl : `${prefix}${path}`,
}

/** The detector class, with the module already pointed at our own binary. */
export async function loadDetector() {
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
  prepareZXingModule({ overrides })
  return BarcodeDetector
}

/**
 * Fetches the decoder before it is needed.
 *
 * Called from the junta home, which is opened on the way to the door rather
 * than at it. Failure is silent: this is an optimisation, and the scanner
 * still works — with signal — without it.
 */
export async function warmDecoder(): Promise<void> {
  try {
    const { prepareZXingModule } = await import('barcode-detector/ponyfill')
    await prepareZXingModule({ overrides, fireImmediately: true })
  } catch {
    // Nothing to do. The door will fetch it itself.
  }
}
