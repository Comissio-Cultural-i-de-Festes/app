/**
 * Compile the app's Tailwind source into the single stylesheet design-sync
 * ships (`cfg.cssEntry`).
 *
 * Why this exists at all: `src/styles/index.css` is Tailwind SOURCE. The app
 * compiles it through @tailwindcss/vite at build time, but design-sync needs a
 * finished stylesheet, because a design rendered in the hosted tool receives
 * only the compiled `styles.css` closure — no bundler runs there.
 *
 * Why the safelist: Tailwind emits a utility only if it saw the class written
 * somewhere. Scanning src/ therefore yields exactly the app's current classes
 * and nothing else — which is fine for the components, but a NEW screen
 * composed with them over there would write `gap-7` or `bg-surface-4`, get
 * no rule, and ship silently unstyled layout. So the safelist below emits the
 * whole token-backed vocabulary (every colour, size, radius and font the
 * theme defines, crossed with the utilities that consume them) plus the
 * structural utilities any layout needs. It is DERIVED from theme.css, so
 * adding a token to the theme adds its utilities here on the next build
 * instead of quietly leaving a hole.
 *
 * Usage: node .design-sync/build-css.mjs
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const OUT = join(HERE, '.cache', 'ds.css')

/** Every `--<namespace>-<name>` key the theme declares, grouped by namespace. */
function themeKeys() {
  const css = readFileSync(join(ROOT, 'src', 'styles', 'theme.css'), 'utf8')
  const groups = { color: [], text: [], radius: [], font: [], shadow: [] }
  for (const [, ns, name] of css.matchAll(
    /^\s*--(color|text|radius|font|shadow)-([a-z0-9-]+):/gm,
  )) {
    groups[ns].push(name)
  }
  return groups
}

/** Tailwind's numeric scale, on this theme's 2px `--spacing` step. */
const STEPS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64,
]

const SPACING_PREFIXES = [
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'gap',
  'gap-x',
  'gap-y',
  'space-x',
  'space-y',
  'w',
  'h',
  'size',
  'min-w',
  'min-h',
  'max-w',
  'max-h',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'inset-x',
  'inset-y',
]

const COLOR_PREFIXES = [
  'bg',
  'text',
  'border',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'fill',
  'stroke',
  'ring',
  'outline',
  'divide',
  'accent',
  'caret',
  'placeholder',
  'from',
  'via',
  'to',
  'decoration',
  'shadow',
]

/** Structural utilities that carry no theme token but every layout needs. */
const STRUCTURAL = `
block inline-block inline flex inline-flex grid inline-grid hidden contents flow-root
flex-row flex-row-reverse flex-col flex-col-reverse flex-wrap flex-nowrap flex-1 flex-auto flex-none flex-initial
grow grow-0 shrink shrink-0 basis-0 basis-full basis-auto
items-start items-center items-end items-stretch items-baseline
justify-start justify-center justify-end justify-between justify-around justify-evenly
content-start content-center content-end content-between
self-start self-center self-end self-stretch self-auto
place-items-center place-content-center
grid-cols-1 grid-cols-2 grid-cols-3 grid-cols-4 grid-cols-5 grid-cols-6 grid-cols-7 grid-cols-12
grid-rows-1 grid-rows-2 grid-rows-3 grid-flow-row grid-flow-col
col-span-1 col-span-2 col-span-3 col-span-4 col-span-full row-span-1 row-span-2 row-span-full
static relative absolute fixed sticky
z-0 z-10 z-20 z-30 z-40 z-50 z-auto
w-full w-auto w-fit w-screen w-px h-full h-auto h-fit h-screen h-px size-full size-auto size-px
min-h-full min-h-screen min-w-full max-w-full max-w-none max-w-prose
overflow-auto overflow-hidden overflow-visible overflow-scroll overflow-x-auto overflow-y-auto overflow-x-hidden overflow-y-hidden
object-cover object-contain object-center object-top object-bottom
aspect-square aspect-video aspect-auto
font-thin font-light font-normal font-medium font-semibold font-bold font-extrabold font-black
italic not-italic uppercase lowercase capitalize normal-case
text-left text-center text-right text-justify
underline no-underline line-through
truncate text-nowrap text-wrap text-balance text-pretty break-words break-all
leading-none leading-tight leading-snug leading-normal leading-relaxed leading-loose
tracking-tighter tracking-tight tracking-normal tracking-wide tracking-wider tracking-widest
align-middle align-top align-bottom align-baseline
list-none list-disc list-decimal
border border-0 border-2 border-4 border-8 border-x border-y
border-solid border-dashed border-dotted border-none
rounded rounded-none rounded-full
opacity-0 opacity-10 opacity-20 opacity-30 opacity-40 opacity-50 opacity-60 opacity-70 opacity-75 opacity-80 opacity-90 opacity-100
shadow shadow-none
transition transition-all transition-colors transition-opacity transition-transform transition-none
duration-75 duration-100 duration-150 duration-200 duration-300 duration-500 duration-700
ease-linear ease-in ease-out ease-in-out delay-100 delay-200
scale-95 scale-100 scale-105 rotate-45 rotate-90 rotate-180 -rotate-45 -rotate-90
translate-x-0 translate-y-0 -translate-x-1/2 -translate-y-1/2
cursor-pointer cursor-default cursor-not-allowed pointer-events-none pointer-events-auto
select-none select-text appearance-none resize-none
sr-only not-sr-only
whitespace-nowrap whitespace-pre-line whitespace-normal
backdrop-blur backdrop-blur-sm backdrop-blur-md
mx-auto my-auto ml-auto mr-auto
`

/** Variants worth pre-generating for the vocabulary above. */
const VARIANTS = [
  'hover:',
  'focus:',
  'focus-visible:',
  'active:',
  'disabled:',
  'first:',
  'last:',
  'sm:',
  'md:',
  'lg:',
]

function buildSafelist() {
  const t = themeKeys()
  const out = new Set()

  for (const c of t.color) for (const p of COLOR_PREFIXES) out.add(`${p}-${c}`)
  for (const s of t.text) out.add(`text-${s}`)
  for (const r of t.radius) out.add(`rounded-${r}`)
  for (const f of t.font) out.add(`font-${f}`)
  for (const s of t.shadow) out.add(`shadow-${s}`)
  for (const p of SPACING_PREFIXES) for (const n of STEPS) out.add(`${p}-${n}`)
  for (const w of STRUCTURAL.split(/\s+/)) if (w) out.add(w)

  // A focused variant pass: the interactive states the components themselves
  // use, over the utilities most likely to carry them. Crossing every variant
  // with every utility would multiply the sheet by ten for no gain.
  const varied = [
    ...t.color.flatMap((c) => [`bg-${c}`, `text-${c}`, `border-${c}`]),
    'opacity-50',
    'opacity-70',
    'underline',
    'no-underline',
    'cursor-not-allowed',
    'scale-95',
    'scale-105',
    'shadow-none',
  ]
  for (const v of VARIANTS) for (const u of varied) out.add(`${v}${u}`)

  return [...out].sort()
}

const safelist = buildSafelist()
writeFileSync(
  join(HERE, 'safelist.txt'),
  '# Generated by build-css.mjs — do not edit. Scanned by tailwind-entry.css.\n' +
    safelist.join('\n') +
    '\n',
)

mkdirSync(dirname(OUT), { recursive: true })
execFileSync(
  process.execPath,
  [
    join(ROOT, '.ds-sync', 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
    '--input',
    join(HERE, 'tailwind-entry.css'),
    '--output',
    OUT,
    '--cwd',
    ROOT,
  ],
  { stdio: 'inherit' },
)

/**
 * Land the font files next to the compiled CSS.
 *
 * Tailwind inlines the two @fontsource stylesheets but does NOT rewrite their
 * `url(./files/…)` references, so the compiled sheet points at a `files/`
 * directory beside itself. design-sync resolves @font-face urls relative to
 * the stylesheet and copies what it finds into the bundle's `fonts/` — so the
 * files have to actually be there, or every design renders in a fallback face.
 */
const FONT_PKGS = [
  join(ROOT, 'node_modules', '@fontsource-variable', 'archivo', 'files'),
  join(ROOT, 'node_modules', '@fontsource', 'archivo-black', 'files'),
]
const filesDir = join(dirname(OUT), 'files')
mkdirSync(filesDir, { recursive: true })
const wanted = [
  ...new Set(
    [...readFileSync(OUT, 'utf8').matchAll(/url\(\.\/files\/([^)]+)\)/g)].map((m) => m[1]),
  ),
]
let copied = 0
for (const name of wanted) {
  const src = FONT_PKGS.map((d) => join(d, name)).find((p) => existsSync(p))
  if (!src) {
    console.error(`  ! font: ${name} not found in @fontsource packages`)
    continue
  }
  copyFileSync(src, join(filesDir, name))
  copied++
}

/**
 * Alias the bare family `Archivo` onto the variable files that actually ship.
 *
 * `--ds-font-body` is `'Archivo Variable', Archivo, system-ui, …` — the second
 * name is there for a locally installed copy, and design-sync rightly reports
 * a family the CSS asks for but nothing supplies. Rather than leave designs
 * one fallback step from system-ui, point the name at the same woff2s. Same
 * typeface, second name — nothing is substituted.
 */
const compiled = readFileSync(OUT, 'utf8')
const alias = [...compiled.matchAll(/@font-face\s*\{[^}]*\}/g)]
  .map((m) => m[0])
  .filter((rule) => /font-family:\s*['"]?Archivo Variable['"]?/.test(rule))
  .map((rule) => rule.replace(/font-family:\s*['"]?Archivo Variable['"]?/, "font-family:'Archivo'"))
writeFileSync(
  join(dirname(OUT), 'archivo-alias.css'),
  '/* Generated by build-css.mjs — the bare `Archivo` family name, served by the shipped variable files. */\n' +
    alias.join('\n') +
    '\n',
)

console.error(
  `  css: ${safelist.length} safelisted utilities, ${copied}/${wanted.length} font files, ` +
    `${alias.length} Archivo alias rule(s) → ${OUT}`,
)
