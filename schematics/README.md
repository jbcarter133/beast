# Schematics

Drop building schematics here for Beast to build with `!buildSchematic("name")`.
Preview the material cost first with `!checkMaterials("name")`, and see what's
available with `!listSchematics`.

## Supported formats

- **`.json`** — Beast's native construction format (fully supported, no extra
  dependencies). See `small_wood_house.json` for a working example.
- **`.schem` / `.schematic`** — Sponge and legacy MCEdit schematics, e.g. the
  ones you download from sites like minecraft-schematics.com. These are parsed
  with the optional [`prismarine-schematic`](https://www.npmjs.com/package/prismarine-schematic)
  package:

  ```
  npm install prismarine-schematic
  ```

  Air inside a schematic is skipped rather than force-cleared, so Beast adds the
  structure's solid blocks without excavating the surrounding terrain.

## JSON format

```jsonc
{
  "name": "small_wood_house",
  "offset": 0,                 // vertical offset of the base layer (0 = on the ground)
  "blocks": [                  // blocks[y][z][x]
    [                          // one layer (bottom to top)
      ["planks", "planks"],    // a row along x
      ["planks", "air"]
    ]
  ]
}
```

Each cell is:
- a **block name** to place (`"oak_planks"`, `"cobblestone"`, `"glass"`),
- a **generic** name Beast resolves from context (`"planks"`, `"log"`, `"bed"`,
  `"door"`, `"torch"`, `"dirt"`),
- `"air"` to actively clear that spot, or
- `""` to leave whatever is already there untouched.
```
