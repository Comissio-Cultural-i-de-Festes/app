---
category: Actions
---

The button that draws a shareable image and hands it over. Nothing is ever
posted on anybody's behalf.

`card` is a **thunk**, not a value: it is called only when the button is
pressed, because a 1080×1920 canvas plus a font load is not something to do on
the off chance while somebody is reading. `name` is the parts of the filename
that will show up in a photo roll.

The label is the confirmation — it changes to "fet"/"desada" for 2500 ms and
goes back, with no toast — and it tells the truth about what will happen: a
phone that cannot share files says "save it to your roll" from the start
rather than promising a share sheet and producing a download. A note under the
button says the same thing in a sentence.

`variant`: `solid` where this is the screen's main action, `quiet` where the
screen already has a louder one.

```tsx
<ShareCard
  card={async () => ({
    kind: 'checkin',
    photo: await loadCardImage(url),
    when,
    headline,
    what,
    count,
  })}
  name={['comi', 'benvinguda', 'fitxatge']}
  text="Ja sóc dins"
/>
```
