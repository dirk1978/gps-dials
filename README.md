# gps-dials

Free, open-source telemetry overlays for action camera footage: speed, heart rate, gradient, maps and more, lined up automatically with your GPS data.

It is a community replacement for the workflow of Garmin VIRB Edit and paid overlay tools. The planned app imports your clips and FIT or GPX files, syncs them, lets you lay out dials on a WYSIWYG canvas and exports an overlay for your video editor: true transparency (alpha) for editors that support it, or a chroma key background for those that don't.

> **Status: early.** Syncing works. There is no dial editor or overlay export yet, so it doesn't produce anything for your video editor so far.

## The workflow

1. Copy a day's videos and FIT files into a folder and open it.
2. The app finds the matching activity and syncs every clip.
3. Check each clip beside the map and correct any that are off.
4. Press go to get one overlay file per video. *(Not built yet.)*

## What works today

Sync finds where a clip belongs in an activity by comparing the camera's turning with the turns in the GPS track, so it does not depend on the camera's clock being right. A camera's clock is wrong by about the same amount all day, so clips that match well also settle the short or straight clips that can't be matched alone.

Clips can also be lined up by hand: find a frame you recognise, click that spot on the track and match them. The track still works if map images can't load.

Requires [Node.js](https://nodejs.org/) 24 or later and [FFmpeg](https://ffmpeg.org/) on your PATH. Previews use an NVIDIA GPU when there is one, and fall back to the CPU.

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

[MIT](LICENSE). FFmpeg is a separate program with its own licence and is not included. This project is not affiliated with Garmin, DJI, Insta360, Wahoo or Telemetry Overlay.
