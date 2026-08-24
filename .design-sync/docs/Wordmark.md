---
category: Brand
---

The association's name set large, with the full stop as a brand-red disc.

Same rule as `LogoMark`: the text is the configured short name, and the disc
replaces a trailing full stop rather than rendering one. `size` is the font
size in pixels; the disc and the gap scale from it.

```tsx
<Wordmark size={64} />
<p className="mt-6 text-md font-bold text-fg-muted">TecnoCampus Mataró</p>
```

It uses the display face (`--ds-font-display`, Archivo Black) and `text-fg`, so
it belongs on `bg-app` or darker. Pair it with `LogoMark` only where both are
wanted at once — on most screens one or the other is enough.
