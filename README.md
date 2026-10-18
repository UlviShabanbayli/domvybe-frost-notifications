# Frost notification center — UI component

**[Live demo](https://domvybe.com/components/frost-notifications/)** · [Step-by-step tutorial](https://domvybe.com/library/frost-notifications/) · [Download the ZIP](https://github.com/UlviShabanbayli/domvybe-frost-notifications/releases/latest/download/frost-notifications-source.zip)

Notifications made of ice on a winter night: they fly in, fan out under your cursor and shatter into frost when you swipe them away.

Open `index.html` through any local static server (for example `python3 -m http.server`) and try it with a mouse,
a finger or the keyboard. Plain HTML, CSS and JavaScript; no build step; one library, three.js (vendored in vendor/three/, MIT).

- `index.html` — the notification center page: the stack, the cards, Clear all and the live region
- `css` — frost.css: the cards, the stack and the fan, the phone layout, reduced motion
- `js` — app.js (arrive, fan, swipe, clear all, keys), data.js (the apps, people and messages), ice.js (the three.js night, the ice slabs, the shards and the frost)
- `assets` — tiles/: three stills of the scene, rendered in code
- `vendor` — three.js r186 with its MIT LICENSE

Aura and every app, person and message on the cards are made up (`js/data.js`). Everything is made in code: the night,
the ice slabs, the shards and the frost are real-time three.js, and the app icons are hand-drawn SVG; no AI pictures.
three.js (r186) is in `vendor/three/` under its own MIT licence (`vendor/three/LICENSE`). The page reads Google Fonts
(Inter).

It respects `prefers-reduced-motion`. Made by Ulvi (Code with Ulvi) · domvybe.com

## Licence

MIT — see [LICENSE](LICENSE). Use it in your own projects, commercial ones included.
