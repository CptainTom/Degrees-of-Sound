# 01 – The Decoder: turning NASA's colours back into temperatures

## The problem
NASA gives us a **video of a world map**, one frame per year from 1881 to 2023.
Each place is coloured by how much warmer or colder it was than normal:

- **Blue** = colder than the 1951–1980 average
- **White** = normal
- **Red** = warmer

To a computer, that's just coloured pixels. If we turned the colours straight into sound, we'd be playing **NASA's colour choices**, not the temperature.

> **We don't sonify NASA's colours. We sonify the temperature.**

## What the decoder does, in 4 steps

**1. Pick one picture per year.**
The video has 900 frames. We take one per year: **143 maps, 1881 → 2023**.

**2. Learn the colour scale.**
NASA's colour bar goes from dark navy (−2 °C) through white (0) to dark red (+2 °C). We read it into a lookup table of **201 colours, each linked to a temperature**, in steps of 0.02 °C.

**3. Read every pixel.**
For each pixel we find the closest colour on the scale and write down its temperature.
The trick: NASA draws **land darker than ocean**, so the same temperature looks darker over land. We compare only the **hue** (which colour it is) and ignore brightness (how dark it is). Thin black coastlines get ignored.

**4. Build a grid.**
We group pixels into **2° × 2° squares**, which gives 180 × 90 = 16,200 squares covering the whole planet. Each square takes the **middle value (median)** of its pixels, so stray coastline pixels can't disturb it.

**Result:** 143 years × 16,200 places = **2.3 million temperature values**. The file is 2.3 MB and loads instantly in the browser.

## How we know it's right
We averaged our decoded map over the whole planet for each year and compared it with **NASA's official published numbers**:

| Year | Our decoder | NASA official |
|---|---|---|
| 1910 | −0.44 °C | −0.43 °C |
| 1940 | +0.17 °C | +0.13 °C |
| 1980 | +0.30 °C | +0.26 °C |
| 2000 | +0.45 °C | +0.39 °C |
| 2020 | +0.91 °C | +1.01 °C |
| 2023 | +1.07 °C | +1.17 °C |

Every year is within **0.1 °C**. The decoder runs this check automatically and refuses to save data that fails.

## What the data revealed: the Arctic is heating fastest
Warming from 1951 to 2023, by climate zone:

| Zone | Warming |
|---|---|
| Arctic | **+1.70 °C** |
| Northern mid-latitudes | +1.42 °C |
| Tropics | +1.04 °C |
| Southern mid-latitudes | +0.86 °C |
| Antarctic | +0.58 °C |

The Arctic warmed **about three times faster** than the Antarctic. Scientists call this **Arctic amplification**, and our listeners will be able to *hear* it.

## Honest limits
- **Capped at ±2 °C.** NASA's colour scale stops at +2, so "+2" means "+2 °C or more". The real Arctic warming is even larger than our number.
- **"No data" looks like "normal".** In NASA's video, grey (no measurements) and white (normal) are almost the same colour, so both read as 0. This only matters in early years in places with no weather stations (interior Africa, the poles).
- **The 2023 average is a little low** (1.07 vs 1.17), because of the +2 cap.

## Source
NASA Scientific Visualization Studio #5207, *Global Temperature Anomalies from 1880 to 2023* (GISTEMP v4): https://svs.gsfc.nasa.gov/5207/
