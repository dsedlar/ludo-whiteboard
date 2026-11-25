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

## Importing plays

The Playbook has two import buttons.

- **Import** takes a Ludo export (`.json`) or a **FastDraw library** (`.fdb`). FastDraw plays come in
  as editable plays with their steps, players, ball, cuts, passes, dribbles, screens, cones, shaded
  areas, colors and notes; the playbook and series names become tags. Importing the same library
  again replaces those plays instead of duplicating them. The reader in `fastdraw.js` was worked out
  from sample files, so anything it does not recognise is skipped and listed after the import.
- **Photo or PDF** takes a picture (for example a photo of a play drawn on paper) or a PDF. Each
  picture or PDF page becomes a play with that picture as its board. You can draw on it, or switch to
  a court view, where the picture sits faintly over the court for tracing.

## Cloud sync (Supabase)

Plays are always saved on the iPad first, so the app works offline. When a coach signs in, the app
also keeps a shared copy in Supabase and syncs when it opens, after each save, and when the
connection comes back. If two iPads change the same play, the most recently saved copy wins.

It uses the same Supabase project and the same user accounts as the stats app. Setup, done once:

1. In the Supabase SQL Editor, run `supabase-setup.sql`. It adds two tables, `wb_staff` and
   `wb_items`, and leaves every existing table alone.
2. Add each coach's email to `wb_staff`. Only those accounts can change the playbook.
3. Paste the project URL and the "anon public" key into `cloud-config.js`.

Players open the site address with `?players` on the end and sign in. They see only plays that a
coach has marked "Show this play to players", and cannot change anything.

## Sharing without the cloud

A play can also be sent as a file (Playbook, Send) and brought in with Import. Export all makes a
backup file of every play. If that file is uploaded to this repository as `team-playbook.json`, it
appears on every device under "Team playbook" with no sign-in; anything in a public repository can
be seen by anyone who finds it.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page layout |
| `style.css` | Colors and layout |
| `app.js` | All of the behavior |
| `court.jpg` | The court image |
| `fastdraw.js` | Reads FastDraw library files |
| `cloud.js` | Syncs plays with Supabase when a coach is signed in |
| `cloud-config.js` | Your Supabase project address and public key |
| `supabase-setup.sql` | Creates the whiteboard's tables and access rules |
| `vendor/` | The Supabase and PDF libraries, shipped with the app so it works offline |
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
