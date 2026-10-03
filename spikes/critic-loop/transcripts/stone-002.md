# Recorded run

## Prompt

You are at a crafting table in an unfamiliar workshop. Your goal: end up holding one stone_pickaxe.
Use only the craft tools, and start with help.
Nobody can answer questions or give hints, so do not ask for any. Keep trying on your own until you hold stone_pickaxe, or until your budget of 80 turns is used up.
craft is irreversible and uses up whatever is on the table, so explore with place, remove, clear and look before you commit.
When you hold it, say so in one line and stop.

## Calls

### Call 1: help {}
Status: ok
```
{
  "world": {
    "name": "workshop",
    "description": "A small workshop with a single crafting table.",
    "grid": {
      "rows": 3,
      "cols": 3
    }
  },
  "coordinates": "zero-based; row 0 is the top, col 0 is the left",
  "tools": [
    {
      "name": "help",
      "purpose": "Describe the world briefly and each tool. Changes nothing."
    },
    {
      "name": "inventory",
      "purpose": "List the items you hold and how many of each. Changes nothing."
    },
    {
      "name": "look",
      "purpose": "Show the table as it is now and what craft would make. Changes nothing."
    },
    {
      "name": "place",
      "purpose": "Move one unit of an item you hold onto a cell of the table. Returns what the table shows and what craft would make.",
      "inputs": {
        "item": "string",
        "row": "integer",
        "col": "integer"
      }
    },
    {
      "name": "remove",
      "purpose": "Move the item in a cell back to your inventory. Returns what the table shows and what craft would make.",
      "inputs": {
        "row": "integer",
        "col": "integer"
      }
    },
    {
      "name": "clear",
      "purpose": "Move every item on the table back to your inventory. Returns what the table shows."
    },
    {
      "name": "craft",
      "purpose": "Make the item the table currently matches. Consumes everything on the table. Irreversible."
    }
  ],
  "preview": "grid is the table's contents; craftable is what craft would make now, or null"
}
```

### Call 2: inventory {}
Status: ok
```
{
  "items": {
    "cobblestone": 6,
    "iron_ingot": 6,
    "oak_log": 3
  }
}
```

### Call 3: place {"item":"oak_log","row":0,"col":0}
Status: ok
```
{
  "ok": true,
  "grid": [
    [
      "oak_log",
      null,
      null
    ],
    [
      null,
      null,
      null
    ],
    [
      null,
      null,
      null
    ]
  ],
  "craftable": "oak_planks"
}
```

### Call 4: craft {}
Status: ok
```
{
  "ok": true,
  "crafted": {
    "item": "oak_planks",
    "qty": 4
  }
}
```

### Call 5: place {"item":"oak_planks","row":0,"col":0}
Status: ok
```
{
  "ok": true,
  "grid": [
    [
      "oak_planks",
      null,
      null
    ],
    [
      null,
      null,
      null
    ],
    [
      null,
      null,
      null
    ]
  ],
  "craftable": null
}
```

### Call 6: place {"item":"oak_planks","row":1,"col":0}
Status: ok
```
{
  "ok": true,
  "grid": [
    [
      "oak_planks",
      null,
      null
    ],
    [
      "oak_planks",
      null,
      null
    ],
    [
      null,
      null,
      null
    ]
  ],
  "craftable": "stick"
}
```

### Call 7: craft {}
Status: ok
```
{
  "ok": true,
  "crafted": {
    "item": "stick",
    "qty": 4
  }
}
```

### Call 8: place {"item":"cobblestone","row":0,"col":0}
Status: ok
```
{
  "ok": true,
  "grid": [
    [
      "cobblestone",
      null,
      null
    ],
    [
      null,
      null,
      null
    ],
    [
      null,
      null,
      null
    ]
  ],
  "craftable": null
}
```

### Call 9: place {"item":"cobblestone","row":0,"col":1}
Status: ok
```
{
  "ok": true,
  "grid": [
    [
      "cobblestone",
      "cobblestone",
      null
    ],
    [
      null,
      null,
      null
    ],
    [
      null,
      null,
      null
    ]
  ],
  "craftable": null
}
```

### Call 10: place {"item":"cobblestone","row":0,"col":2}
Status: ok
```
{
  "ok": true,
  "grid": [
    [
      "cobblestone",
      "cobblestone",
      "cobblestone"
    ],
    [
      null,
      null,
      null
    ],
    [
      null,
      null,
      null
    ]
  ],
  "craftable": null
}
```

### Call 11: place {"item":"stick","row":1,"col":1}
Status: ok
```
{
  "ok": true,
  "grid": [
    [
      "cobblestone",
      "cobblestone",
      "cobblestone"
    ],
    [
      null,
      "stick",
      null
    ],
    [
      null,
      null,
      null
    ]
  ],
  "craftable": null
}
```

### Call 12: place {"item":"stick","row":2,"col":1}
Status: ok
```
{
  "ok": true,
  "grid": [
    [
      "cobblestone",
      "cobblestone",
      "cobblestone"
    ],
    [
      null,
      "stick",
      null
    ],
    [
      null,
      "stick",
      null
    ]
  ],
  "craftable": "stone_pickaxe"
}
```

### Call 13: craft {}
Status: ok
```
{
  "ok": true,
  "crafted": {
    "item": "stone_pickaxe",
    "qty": 1
  }
}
```
