# gps-dials

Free, open-source telemetry overlays for action camera footage: speed, heart rate, gradient, maps and more, lined up automatically with your GPS data.

It is a community replacement for the workflow of Garmin VIRB Edit and paid overlay tools. The planned app imports your clips and FIT or GPX files, syncs them, lets you lay out dials on a WYSIWYG canvas and exports an overlay for your video editor: true transparency (alpha) for editors that support it, or a chroma key background for those that don't.

> **Status: early.** Only the sync engine exists so far, as a command-line tool. There is no app, editor or export yet.

## What works today

Sync finds where a clip belongs in an activity by comparing the camera's turning with the turns in the GPS track, so it does not depend on the camera's clock being right. It reports a confidence result, and clips it isn't sure about are meant to go to a manual map sync screen (not built yet).

Requires [Node.js](https://nodejs.org/) 24 or later and [FFmpeg](https://ffmpeg.org/) on your PATH.

```bash
npm run sync -- path/to/clip.mp4 path/to/activity.fit
```

Use `--device <id>` to choose a device instead of detecting it.

## Supported devices

| Device | Motion data | Status |
|---|---|---|
| DJI Osmo Action 4 | Orientation track, plus vibration | Tested on one clip |
| Insta360 GO 3 | Picture motion | Tested on one clip |
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

[MIT](LICENSE). FFmpeg is a separate program with its own licence and is not included. This project is not affiliated with Garmin, DJI, Insta360, Wahoo or Telemetry Overlay.
