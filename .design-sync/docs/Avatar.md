---
category: People
---

A member's face, or the striped placeholder from the prototype.

`src` is `string | null` and `size` is required — the component sets width and
height itself rather than inheriting them, because inside a non-flex parent an
inline element would ignore both and collapse to nothing, which looks like the
data failed to load.

Pictures come from Google and are hosted there, so they fail behind a captive
portal or when somebody has removed theirs since signing in. **A load failure
falls back to the same placeholder as no picture at all** — a broken-image icon
in a leaderboard of two hundred rows reads as a broken app. Requests carry
`referrerPolicy="no-referrer"`.

`ring` marks the row that is you: a brand outline, offset by a pixel.

Decorative by default (`alt=""`, `aria-hidden` on the placeholder): every
avatar in this app sits next to the name it belongs to, and announcing it twice
is noise. If you place one without a name beside it, label the row yourself.

```tsx
<Avatar src={member.avatar_url} size={34} ring={member.id === meId} />
```
