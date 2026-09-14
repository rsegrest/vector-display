# @vector-display/font

An Atari-style vector stroke font and text layout for [**vector-display**](https://www.npmjs.com/package/@vector-display/core). Letters are drawn as beam lines, so text glows and flickers like everything else on a vector display.

> **Status:** early (0.x). The API may change between minor versions.

## Install

```sh
npm install @vector-display/core @vector-display/font
```

ES modules only, with TypeScript declarations.

## Usage

```ts
import { DisplayList } from "@vector-display/core";
import { VectorFont } from "@vector-display/font";

const font = VectorFont.createArcadeFont();
const displayList = new DisplayList();

displayList.setColor({ red: 0.85, green: 0.95, blue: 1 });
font.addText(displayList, { text: "SCORE 01250", x: 40, y: 30, size: 20 });
font.addText(displayList, { text: "GAME OVER", x: 512, y: 384, size: 32, alignment: "center" });

const { width, height } = font.measureText("HIGH SCORE", 16);
```

`addText` options: `text`, `x`, `y` (top of the first line), `size` (capital-letter height in world units), and optional `alignment` (`"left"`, `"center"`, `"right"`), `rotation` (radians) and `intensity`.

## Characters

- A–Z and 0–9; lowercase letters use the capitals
- `. , : ; ! ? ' " - + = * / _ < > ( ) # % ©`
- `\n` starts a new line; characters without a glyph keep their space so columns stay aligned

The glyphs are original designs in the style of late-1970s Atari vector games, drawn on a 4 × 6 grid. Zero has a slash to distinguish it from O.

## Custom glyphs and fonts

```ts
// Add or replace glyphs (grid units, y down, baseline at 6):
const font = VectorFont.createArcadeFont({
  "$": [{ points: [{ x: 4, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 5 }, { x: 0, y: 5 }], isClosed: false }],
});

// Or build a different font entirely:
const customFont = VectorFont.fromDefinition({ glyphs, metrics: { glyphWidth: 4, capHeight: 6, letterSpacing: 2, lineSpacing: 4 } });
```

**Legibility:** with glow and bloom, text 16 world units tall or larger reads clearly. For smaller text, reduce bloom and endpoint brightness in the renderer.

## License

MIT © Rick Segrest
