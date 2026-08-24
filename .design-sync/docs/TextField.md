---
category: Forms
---

`FieldShell` with a text input in it — the form control of this design system.

`id` and `label` are required and are wired together, so the label is a real
`<label>` and tapping it focuses the input. Everything else is a plain
`<input>` prop: `type`, `placeholder`, `defaultValue`, `inputMode`,
`autoComplete`, `ref`.

The input has no border or background of its own — the shell is the visible
control — a brand caret, and a lighter placeholder weight. `className` is
deliberately not accepted: restyle by composing `FieldShell` yourself instead.

```tsx
<TextField id="email" label="El teu correu" type="email" placeholder="tu@exemple.cat" />
```

Stack them with `flex flex-col gap-4`, which is how the ride-offer form reads.
