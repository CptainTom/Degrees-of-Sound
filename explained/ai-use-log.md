# How we used AI

Space Apps requires each submission to describe how AI tools were used. Add a line every time AI helps with something, so the final write-up is easy.

| When | What AI helped with | What we did ourselves |
|---|---|---|
| Before the event | Explained the challenge, critiqued our idea, researched which NASA datasets suit a globe, found the colorbar range | Chose the concept, the dataset and the features |
| Hackathon day 2 | World ring shows an actual temperature (NASA GISS 1951–1980 baseline of about 14 °C + the anomaly); music now starts only when the user presses S; updated the tests; drafted the Greek presentation script | We asked for both changes and chose to keep local values as ± changes (no local baseline in the data) |
| Hackathon day 2 | Code review, automated tests (70 logic checks, 61 in-browser checks, axe-core accessibility audit) and bug fixes found by them | We decided what to fix and what to keep |
| Hackathon day 1 | Merged the audio team's narrator and new sound engine with our accessibility features into one voice system; built the start screen with Listening/Visual modes, game-style Menu and Help (`js/menu.js`), the search suggestions (`js/search.js`), the ring gauges and the pixel-font layout; tested in a browser | The audio team wrote the narrator logic, region names, the groove and the instruments; we decided the modes, keys and look |
| Hackathon day 1 | Researched accessibility patterns from games, navigation apps and data-sonification tools; built the screen-reader keyboard fix, speech layer (`js/speech.js`), history/compare/radar/nearby/guide features (`js/features.js`), earcons, explore-by-touch, mute/stop/help keys and new settings; drafted `explained/03-accessibility.md` | We chose which ideas to build and will test with real users |
| Hackathon day 1 | Built the country search (`js/places.js`, search bar, zoom to country, zoom with wheel/keys) | We chose the feature and the country list |
| Hackathon day 1 | Built the settings menu (volume, strum speed, background hum) around the UI team's dropdown code, and moved the year slider to a vertical bar on the left | The UI team wrote the dropdown open/close logic; we chose the layout |
| Hackathon day 1 | Built the three.js 3D globe with a cursor (click/drag/keys), the one-screen layout, the louder master volume and the "cursor spot plays louder / probe" sound behaviour | We decided on the cursor, the 3D globe, the volume and the no-scroll layout |
| Hackathon day 1 | Integrated the UI team's design (starfield, title, glass panels, sliders, wireframe rings) into the app; made the globe show the NASA map and follow the needle instead of auto-spinning (`js/globe.js`) | The UI team designed the look and the globe/slider interaction |
| Hackathon day 1 | Reviewed the audio team's engine (found that their test page was silently using invented data), integrated it into the app (`js/audio.js`, `js/state.js`, `js/app.js`, `index.html`), snapped the drone to the scale, drafted `explained/02-sound.md` | The audio team designed and wrote the sound engine and its mapping; we chose "hot = high pitch" and the needle concept |
| Hackathon day 1 | Wrote the temperature decoder (`tools/build-gistemp.mjs`), the data loader (`js/data.js`) and the check page; drafted `explained/01-decoder.md` | Decided the method, reviewed the results against NASA's numbers |
