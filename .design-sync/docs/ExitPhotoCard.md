---
category: Event
---

The morning-after card: the one place the app asks for anything, and it asks
once.

Never a camera that opens by itself — this is a card with a button on it and a
way to say no. It decides for itself whether it belongs on the screen and
renders `null` when it does not, so it is safe to mount unconditionally on the
home screen.

It appears only when all of these hold: the event has ended, it is within 36
hours of that end, the member was checked in, there is no exit photograph yet,
and they have not already said "ara no" for that event (remembered per event in
`localStorage`, so dismissing one does not dismiss the next).

- `event` — the last event the home screen knows about, or `null`. Which night
  the card is about is worked out from what the member actually did, not from
  what is on the calendar.

It reads the `['photos','nights']` query itself, so it needs a react-query
provider with that data available.

```tsx
<ExitPhotoCard event={lastEvent} />
```
