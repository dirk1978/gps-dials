# gps-dials

Free, open-source telemetry overlays for action camera footage: speed, heart rate, gradient, maps and more, lined up automatically with your GPS data.

It is a community replacement for the workflow of Garmin VIRB Edit and paid overlay tools. The planned app imports your clips and FIT or GPX files, syncs them, lets you lay out dials on a WYSIWYG canvas and exports an overlay for your video editor: true transparency (alpha) for editors that support it, or a chroma key background for those that don't.

> **Status: early but working.** Sync, the layout editor, source comparison and overlay export all work. Expect rough edges, and tell us what you find.

## The workflow

1. Copy a day's videos and FIT files into a folder and open it.
2. The app finds the matching activity and syncs every clip.
3. Check each clip beside the map and correct any that are off.
4. Press Generate to get one overlay file per video, in an `overlays` folder beside your clips. Each one is named after its clip and fits it exactly, so it drops straight onto the track above it.

| Format | Best for | Size at 4K |
|---|---|---|
| Transparent (ProRes 4444) | Editors with alpha support | About 0.5 GB a minute |
| Green screen (H.264) | Any editor with a chroma key | About 4 MB a minute |

Transparent overlays run at 10 frames a second, the rate the dials update, which editors place correctly by time. Storing every frame would make them five times larger.

## Design your own overlay

The **Design** tab works straight on top of your footage. Any data can be shown any way: speed, pace, heart rate, cadence, power, temperature, altitude, gradient, climbing, heading, distance or time, as a dial, arc, bar, number, graph, road profile, route or custom text.

Drag and resize on the picture, with snapping to the centre and to other widgets. Each widget has its own colours, thickness, size, opacity, fonts, scale, ticks, colour zones and more, and a theme sets everything you haven't changed yourself. Layouts can be saved, shared as files, and imported from Telemetry Overlay `.toptrn` and `.toproj` files.

## Compare your sources

Recorded the same ride on two devices? The **Compare sources** tab shows where they agree and differ on position, altitude, speed, heart rate and gradient, and can build a combined track from the best of each. An optional check against terrain data sends your route to [Open-Meteo](https://open-meteo.com/) only when you press its button. Terrain data comes from the Copernicus GLO-90 elevation model.

## What works today

Sync finds where a clip belongs in an activity by comparing the camera's turning with the turns in the GPS track, so it does not depend on the camera's clock being right. A camera's clock is wrong by about the same amount all day, so clips that match well also settle the short or straight clips that can't be matched alone.

Clips can also be lined up by hand: find a frame you recognise, click that spot on the track and match them. The track still works if map images can't load.

Requires [Node.js](https://nodejs.org/) 24 or later and [FFmpeg](https://ffmpeg.org/) on your PATH. Previews and green screen exports use the GPU when they can. NVIDIA is tested; Intel and AMD are built in but not yet tested on real hardware, and anything else falls back to the CPU.

```bash
npm install
npm run app
```

There is also a command-line version for one clip. Use `--device <id>` to choose a device instead of detecting it.

```bash
npm run sync -- path/to/clip.mp4 path/to/activity.fit
```

## Supported devices

| Device | Motion data | Status |
|---|---|---|
| DJI Osmo Action 4 | Orientation track, plus vibration | Tested on a 72-clip ride, with Garmin and Wahoo tracks |
| Insta360 GO 3 | Picture motion | Tested on one 26-minute clip |
| DJI Neo | Picture motion, or use its `.SRT` track directly | SRT reading tested; sync not tested |
| Anything else | Picture motion | Should work; not tested |

| Track format | Status |
|---|---|
| FIT | Supported |
| DJI `.SRT` | Supported |
| GPX | Wanted |

## Add your camera

Device support is built by the community, and each device is one small file. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE). The Barlow Condensed typeface is used under the SIL Open Font License. FFmpeg is a separate program with its own licence and is not included. This project is not affiliated with Garmin, DJI, Insta360, Wahoo or Telemetry Overlay.
