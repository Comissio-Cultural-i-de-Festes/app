---
category: Navigation
---

The way out of a junta screen.

Committee screens have no tab bar — they are a place you go into and come back
out of — so every one of them draws its own exit, and it is always this one: a
back chevron with where it goes, optionally a title under it.

- `to` / `label` — the destination and what to call it.
- `title` — optional; set in the display face when present.
- `aside` — the right of the link row, usually the screen's one action.
- `className` — e.g. `lg:hidden` on screens that grow a top bar instead.

It is `sticky top-0` with the app background and a hairline under it, and it
already accounts for the safe-area inset.

```tsx
<JuntaHeader to="/junta" label="Junta" title="Portes" aside={<NewButton />} />
```

Uses a router `<Link>`, so it needs a router in the tree.
