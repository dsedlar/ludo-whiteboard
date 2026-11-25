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

## Cloud sync (Firebase)

Plays are always saved on the iPad first, so the app works offline. When a coach signs in with a
ves.org account, the app also keeps a shared copy in Firebase and syncs whenever it is online. If
two iPads change the same play, the most recently saved copy wins.

Setup, done once:

1. Create a Firebase project, add a Web app, and paste its settings into `firebase-config.js`.
2. In Authentication, switch on the Google and Email/Password sign-in methods, and add
   `dsedlar.github.io` under Settings, Authorized domains.
3. Create a Firestore database and paste the contents of `firestore.rules` into its Rules tab.
4. In Firestore, create the document `config/staff` with an array field `emails` listing each
   coach's ves.org address in lowercase. Only those accounts can change the playbook.

Players open the site address with `?players` on the end and sign in with their ves.org account.
They see only plays that a coach has marked "Show this play to players", and cannot change anything.

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
| `cloud.js` | Syncs plays with Firebase when a coach is signed in |
| `firebase-config.js` | Your Firebase project settings |
| `firestore.rules` | Who may read and change the shared playbook |
| `vendor/` | The Firebase library, shipped with the app so it works offline |
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
