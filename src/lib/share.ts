/**
 * Getting a card off the phone.
 *
 * Two paths, and which one a phone has is not something to guess at. Web Share
 * level 2 — `navigator.share({ files })` — opens the system sheet, which is the
 * only way to reach Instagram or TikTok from a browser. Where it does not
 * exist, the file is handed to the download machinery instead and the button
 * changes what it says rather than disappearing: «el botó no desapareix mai,
 * canvia de feina».
 *
 * `canShare({ files })` and not `typeof navigator.share`. A desktop Chrome has
 * `share` and refuses files; iOS Safari in a private window has it and refuses
 * everything. Asking about the actual payload is the only question with a
 * useful answer, and it has to be asked with a real File — a plain object gets
 * a false negative.
 */

export type ShareOutcome = 'shared' | 'saved' | 'cancelled' | 'failed'

function fileOf(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type })
}

export function canShareFiles(blob: Blob, filename: string): boolean {
  try {
    return (
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [fileOf(blob, filename)] })
    )
  } catch {
    // Some engines throw rather than return false for an unsupported payload.
    return false
  }
}

export async function shareCard(
  blob: Blob,
  filename: string,
  text?: string,
): Promise<ShareOutcome> {
  const file = fileOf(blob, filename)

  if (canShareFiles(blob, filename)) {
    try {
      await navigator.share({ files: [file], ...(text === undefined ? {} : { text }) })
      return 'shared'
    } catch (cause) {
      // Dismissing the sheet is an AbortError, and it is not a failure: the
      // person decided not to. Telling them something went wrong when they
      // pressed cancel is the app arguing with them.
      if (cause instanceof DOMException && cause.name === 'AbortError') return 'cancelled'
      return 'failed'
    }
  }

  return download(blob, filename)
}

/**
 * The plan B: into the downloads, and the person posts it themselves.
 *
 * The object URL is revoked on the next frame rather than immediately —
 * revoking it in the same task cancels the download on WebKit — and the anchor
 * is never left in the document.
 */
function download(blob: Blob, filename: string): ShareOutcome {
  try {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 10_000)
    return 'saved'
  } catch {
    return 'failed'
  }
}

/**
 * A filename somebody will see in their photo roll.
 *
 * Only the characters a filesystem is sure about, and never empty: an anchor
 * with `download=""` saves the file as the origin's name.
 */
export function cardFilename(parts: readonly string[]): string {
  const slug = parts
    .join('-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug === '' ? 'targeta' : slug}.png`
}
