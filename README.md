# OpenLite Mobile

OpenLite for Android: the OpenSpell game in a full-screen WebView with
OpenLite's plugins, which come from the PC client
([OpenLite](https://github.com/OblongNoodle/OpenLite), `openlite` branch).

- `build.ps1 [-Install]` builds the APK (and installs it over USB).
- The app updates its plugins itself: `.github/workflows/bundle.yml` builds
  them from the PC client into a bundle on this repo's GitHub Pages site, and
  the app downloads it on launch (used from the next launch).
- Plugins that don't work on a phone are listed in `scripts/sync-plugins.mjs`.
- OSRS models and textures come from your own OSRS cache, copied to the
  phone; nothing from the cache is in this repo or the app.
