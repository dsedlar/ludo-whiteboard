# Bishops Whiteboard

A basketball whiteboard for VES, built for the iPad Pro and Apple Pencil. It uses our own court,
our own overlays, and keeps a playbook on the iPad. It works with no Wi-Fi once installed.

## Install on an iPad

1. Open the site address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open it from the new icon. From then on it runs full screen and offline.

Plays are stored on each iPad. To pass a play to another coach, open **Playbook**, tap **Share**
on the play (AirDrop works), and they tap **Import** in their Playbook.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page layout |
| `style.css` | Colors and layout |
| `app.js` | All of the behavior |
| `court.jpg` | The court image |
| `sw.js` | Keeps a copy of the app on the device so it works offline |
| `manifest.webmanifest`, `icon-*.png` | Home-screen name and icon |

## Changing things

- **Add an overlay:** add an entry to the `OVERLAYS` list near the top of `app.js`. Positions are in
  feet: `x` runs baseline to baseline (0 to 84), `y` runs sideline to sideline (0 to 50).
- **Replace the court image:** swap `court.jpg`, then update `IMG_W`, `IMG_H`, `OX`, `OY`, `SX` and
  `SY` at the top of `app.js` so the app knows where the playing surface sits in the picture.
- **After any change:** raise the version in the `CACHE` name at the top of `sw.js` so iPads pick
  up the new files.
