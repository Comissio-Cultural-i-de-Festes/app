import { LogoMark, Wordmark } from 'app-comi'

/** The name set large, with the full stop as a brand disc. */
export function Sizes() {
  return (
    <div className="flex flex-col items-start gap-8">
      <Wordmark size={28} />
      <Wordmark size={44} />
      <Wordmark size={72} />
    </div>
  )
}

/** The entry screen: wordmark over the tagline, which is configuration. */
export function OnTheEntryScreen() {
  return (
    <div className="w-[358px]">
      <Wordmark size={64} />
      <p className="mt-6 text-md font-bold text-fg-muted">TecnoCampus Mataró</p>
    </div>
  )
}

/** Mark and wordmark together, the only place both appear at once. */
export function WithTheMark() {
  return (
    <div className="flex items-center gap-5">
      <LogoMark size={40} />
      <Wordmark size={34} />
    </div>
  )
}
