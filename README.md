# Ludo Whiteboard

A basketball whiteboard for VES, built for the iPad Pro and Apple Pencil. It uses our own court,
our own overlays, and keeps a playbook on the iPad. It works with no Wi-Fi once installed.

## Install on an iPad

1. Open the site address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open it from the new icon. From then on it runs full screen and offline.

Plays are stored on each iPad. To pass a play to another coach, open **Playbook**, tap **Share**
on the play (AirDrop works), and they tap **Import** in their Playbook.

## What it does

- **Court views:** full court, full court tall, and either half with the basket at the top.
- **Drawing:** cut, pass, dribble, screen, pen and zone lines in six colors, plus a laser pointer
  that fades on its own. The Apple Pencil draws; a finger moves players.
- **Steps:** a play can have several steps. Adding a step starts the players where their lines
  ended. Play animates the steps: a line that starts on a player moves that player, a dribble
  carries the ball, and a pass that starts near the ball moves the ball.
- **Pieces:** alignments (5-out, Horns, zones and your own), cones, a coach marker, a second ball,
  and jersey labels.
- **Overlays:** built-in overlays (Jaws, volleyball lines), overlays you draw yourself, and sets
  that switch on a group at once.
- **Playbook:** tags, notes, search, sort, a printable version, and a picture of any board to send.
- **Present:** hides the toolbars for teaching from a TV or projector.

## Team playbook and the player view

The app has no server, so sharing with the whole team works by publishing one file:

1. On the iPad that holds the plays, open **Playbook** and tap **Export all**. This makes a file
   called `team-playbook.json`.
2. Upload that file to this repository, replacing the one that is here (on github.com: open the
   file, choose **Upload files**, and commit).
3. Every device shows those plays under **Team playbook** the next time it opens the app online.

Players open the site address with `?players` on the end. That view is read-only: they can browse
the team playbook, step through plays and watch the animation, but cannot change anything.

Anything in a public repository can be seen by anyone who finds it, including the team playbook.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page layout |
| `style.css` | Colors and layout |
| `app.js` | All of the behavior |
| `court.jpg` | The court image |
| `team-playbook.json` | The plays published to everyone (see above) |
| `sw.js` | Keeps a copy of the app on the device so it works offline |
| `manifest.webmanifest`, `icon-*.png` | Home-screen name and icon |

## Changing things

- **Add an overlay:** add an entry to the `OVERLAYS` list near the top of `app.js`. Positions are in
  feet: `x` runs baseline to baseline (0 to 84), `y` runs sideline to sideline (0 to 50).
- **Replace the court image:** swap `court.jpg`, then update `IMG_W`, `IMG_H`, `OX`, `OY`, `SX` and
  `SY` at the top of `app.js` so the app knows where the playing surface sits in the picture.
- **After any change:** raise the version in the `CACHE` name at the top of `sw.js` so iPads pick
  up the new files.
