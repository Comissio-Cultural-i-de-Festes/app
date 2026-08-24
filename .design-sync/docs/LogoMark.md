---
category: Brand
---

The red square: the app icon, and the badge that sits next to a heading.

The glyph inside is the association's short name from configuration, never a
literal. A trailing full stop is drawn as a disc rather than set as a
character — `comi.` gets the dot, `La Comi` simply has none.

`size` is the only geometry you give it; the corner radius, the type size, the
dot and the gap are all ratios of it, so the mark stays itself at 24px and at
512px. It is `aria-hidden` wherever it appears, because a wordmark or a heading
always names the association next to it.

```tsx
<LogoMark size={44} />
```

Do not put it on a coloured surface: it brings its own `bg-brand`.
