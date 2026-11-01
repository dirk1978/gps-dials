# Contributing

Support for new cameras, drones and track formats is the most useful contribution. Each one is a small, self-contained file, so you don't need to understand the sync code.

## Get set up

You need Node.js 24 or later and FFmpeg on your PATH.

```bash
git clone https://github.com/<your-username>/gps-dials.git
cd gps-dials
npm test
```

## Add a camera or drone

1. **Check what your files contain.** `ffprobe your-clip.mp4` lists the streams, and `exiftool -ee3 -G3 -a your-clip.mp4` shows timed metadata. Look for gyro, orientation or GPS data. If there is none, the `generic-video` adapter already works from the picture, so all that's needed is a test result in the README table.
2. **Add an adapter** in `src/devices/`, using [dji-action-4.ts](src/devices/dji-action-4.ts) as the example. It implements `DeviceAdapter` from [types.ts](src/devices/types.ts):
   - `canRead(clip)` says whether a file is from your device. It must be quick and must not throw.
   - `readMotion(clip, hz)` returns the camera's turn rate, positive clockwise. Note that the sign matters.
3. **List it** in [src/devices/index.ts](src/devices/index.ts), above `genericVideo`.
4. **Add it to the table** in the README, saying what you tested.
5. **Test it** on a clip with a matching FIT file and paste the `npm run sync` output in your pull request.

## Add a track format

Add a reader in `src/activity/` that returns `TrackPoint[]`, then list it in [src/activity/index.ts](src/activity/index.ts). See [dji-srt.ts](src/activity/dji-srt.ts) for a short example.

## Add a new way to show data

Each display type is one file in `src/overlay/displays/`, using [counter.ts](src/overlay/displays/counter.ts) as the shortest example. List it in [index.ts](src/overlay/displays/index.ts) and every kind of data can use it. Its options go in [fields.ts](src/overlay/fields.ts), and the panel in the app builds itself from that list.

## Add an activity

Skiing, sailing, paragliding, anything else: each activity is one file in `src/activities/`, with [flying.ts](src/activities/flying.ts) as a short example. It says which FIT sport numbers or file types mean this activity, which data matters for it, and what layout to start with, using units that suit it. Data can belong to any number of activities. A gauge in the layout can name what to show instead when a file lacks its data, so the space never sits empty. List it in [index.ts](src/activities/index.ts). Opening a matching recording then picks that layout automatically, and it joins the presets.

## Add a map style or preset

Map styles are a list in [map-view.ts](src/overlay/map-view.ts), and starting layouts are a list in [presets.ts](src/overlay/presets.ts). Presets must be original: don't copy artwork or designs from other products, including discontinued ones.

## Add a new kind of data

Add it to the list in [channels.ts](src/overlay/channels.ts), with its units and default scale, and work out its values in [data.ts](src/overlay/data.ts). Every display type can then show it.

## Making a release

Update the version in `package.json`, then push a matching tag such as `v0.2.0`. GitHub Actions tests it and builds every installer, and they appear on the Releases page.

## Rules for pull requests

- **Never commit footage or real activity files.** GPS tracks reveal where people live and ride. Tests use small made-up data instead, as in [fit.test.ts](src/activity/fit.test.ts).
- **Only MIT-compatible code.** Don't copy code from vendor SDKs or apps, or from GPL projects. Garmin's FIT SDK, for example, can't be used here because of its licence terms, which is why this project has its own decoder.
- **Don't decompile commercial software.** Work from your own files and public documentation.
- **Keep it small.** One device or format per pull request, and `npm test` must pass.
