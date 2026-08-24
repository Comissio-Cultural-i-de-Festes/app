---
category: Forms
---

The bordered block with a small uppercase label above its contents.

The shell is deliberately separate from any input: the invitation screen uses
the same block for a code you cannot type into and for the fields you can.
Square, like everything else that takes a decision on these screens.

- `label` — the uppercase eyebrow. Pass `htmlFor` when the contents are a real
  form control, and the label becomes a `<label>`.
- `aside` — the right-hand end of the label row, e.g. an expiry.
- `variant` — `dashed` stands for something **absent**. The "no invitation"
  panel on the door has the shape of the invitation block precisely so the
  missing thing reads as missing.

```tsx
<FieldShell label="Invitació" aside={<Expiry hours={6} />}>
  <p className="mt-[7px] text-xl font-semibold tracking-[0.12em] text-fg">7QK-24M</p>
</FieldShell>
```

For a plain text input, use `TextField`, which is this with the input already
in it.
