# @vector-display/svg

SVG drawings as outlines for [**vector-display**](https://www.npmjs.com/package/@vector-display/core): logos, icons and line art from Inkscape, Illustrator, Figma or any editor that saves SVG, drawn by the beam.

> **Status:** early (0.x). The API may change between minor versions.

## Install

```sh
npm install @vector-display/core @vector-display/svg
```

ES modules only, with TypeScript declarations. No DOM is used: it runs the same in a browser, in Node and in tests.

## Usage

```ts
import { DisplayList, SCREEN_SPACE_PLACEMENT } from "@vector-display/core";
import { fitDrawing, readSvg, shapesByColor } from "@vector-display/svg";

const drawing = readSvg(svgText);
// Into a 200 × 200 box at (40, 40), keeping proportions, then one shape per color.
const shapes = shapesByColor(fitDrawing(drawing, { x: 40, y: 40, width: 200, height: 200 }));

function addLogo(displayList: DisplayList) {
  for (const { color, opacity, shape } of shapes) {
    displayList.setColor(color);
    displayList.addShape(shape, { ...SCREEN_SPACE_PLACEMENT, intensity: opacity });
  }
}
```

`drawing.polylines` holds the outlines themselves (`points`, `isClosed`, `color`, `opacity`, and the element's `id`), in the drawing's own coordinates (its viewBox), for anything else you want to do with them.

## What is read

- **Elements:** `path` (every command, arcs included), `line`, `polyline`, `polygon`, `rect` (with rounded corners), `circle`, `ellipse`, `use` (and `symbol`), nested `svg`, and the groups `g`, `a` and `switch`.
- **Transforms** on any element, through groups.
- **Color:** the stroke, or for a shape with no stroke its fill (a vector display draws only lines, and most icons are fills; `outlineFills: false` keeps strokes only). Set by attributes or the `style` attribute, inherited through groups, with `currentColor`, every CSS color form, and opacity, stroke-opacity and fill-opacity multiplied into `opacity`. A gradient draws in its fallback color, or light gray.
- **Curves** are cut into straight pieces that stay within `tolerance` of the true curve (default: a thousandth of the drawing's larger side).
- **Skipped:** hidden elements (`display: none`, `visibility: hidden`), and what is never drawn directly (`defs`, `clipPath`, `mask`, markers, gradients' shading). Text, images and CSS stylesheets cannot become outlines and are counted in `drawing.skipped`. Convert text to paths first: in Inkscape, Path > Object to Path, or `inkscape in.svg --actions="select-all:all;object-to-path;export-plain-svg;export-filename:out.svg;export-do"`.

## Options

| Option | Default | |
|---|---|---|
| `tolerance` | a thousandth of the larger side | How far a flattened curve may stray from the true one, in user units |
| `outlineFills` | `true` | Draw the edges of filled shapes that have no stroke |
| `currentColor` | white | What `currentColor` means where the drawing sets no `color` |
| `colorOverride` | none | Draw everything in this one color |

## License

MIT © Rick Segrest
