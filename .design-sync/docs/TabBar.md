---
category: Navigation
---

The bottom tab bar — a PWA gets no native chrome, so this is the app's only
persistent navigation.

Five slots in a fixed order: Inici, Idees, **My QR in the centre**, Rànquing,
Perfil. The centre is an action, not a tab — a 44px brand square — because it
is the one thing people open the app to do while standing at a door. Ideas sits
second, where a thumb lands, since it is the reason to open the app on a day
nothing is on.

It knows nothing about routing or copy, which is what makes it reusable:

- `labels` — every label, localised. Never hardcode copy in it.
- `hrefs` — per tab. **A tab with no href renders as a disabled button at 45%**,
  announced with `comingSoonLabel` appended. That is how an unshipped screen is
  drawn; do not hide the slot.
- `renderLink` — defaults to a plain `<a>`, which reloads the page. Inside a
  router, pass a link component.
- `navLabel` — the landmark name, e.g. "Navegació principal".

It is a `<nav>` of links, not `role="tablist"`: ARIA tabs imply same-page
panels and hijack the arrow keys.

```tsx
<TabBar
  current="home"
  hrefs={{ home: '/', proposals: '/idees', qr: '/qr', ranking: '/ranquing', profile: '/perfil' }}
  labels={{ home: t('nav.home') /* … */ }}
  navLabel={t('nav.label')}
  comingSoonLabel={t('nav.soon')}
  renderLink={(p) => <Link to={p.href} {...p} />}
/>
```

It is `position: fixed` at the bottom. Screens that have one clear it with the
`.with-tabbar` class rather than a hardcoded padding.
