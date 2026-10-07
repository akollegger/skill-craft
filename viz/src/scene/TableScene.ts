import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { cellSizeFor, defaultItemArt, spriteToRGBA, type ItemArt } from "../art/index.ts";
import { hex } from "../palette.ts";
import type { FrameData } from "../../../src/viz/contract.ts";
import type { SceneFactory, SceneHandle } from "./handle.ts";
import { confettiBurst, sceneAt, type Effect } from "./model.ts";

// The scene is drawn at a small native size and scaled up by whole numbers with nearest-neighbour sampling, so it
// stays crisp at any size. Which color plays which role is provisional: the palette's roles are set with the page.
const W = 168;
const HOTBAR_SLOTS = 8;

const COLOR = {
  backdrop: hex("retroDeep"),
  // The table is wood: a ramp derived from Marigold (see DERIVED in palette.ts), bevelled light on the top and left.
  frame: hex("woodFrame"),
  face: hex("woodFace"),
  light: hex("woodHighlight"),
  shade: hex("woodShade"),
  deep: hex("woodDeep"),
  arrow: hex("retroDim"),
  edge: hex("black"),
  socket: hex("woodDeep"),
  ghost: hex("retroMuted"),
  craft: hex("midForest"),
  refuse: hex("midHibiscus"),
  text: hex("lightGray"),
};
const CONFETTI = [hex("highlightYellow"), hex("lightForest"), hex("midMarigold"), hex("midHibiscus"), hex("lightBaltic"), hex("highlightPeriwinkle")];

/** A small deterministic random source, so the same step always throws the same confetti. */
const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** One running effect: advance by `ms`; return false when finished. */
type Running = (ms: number) => boolean;

/**
 * The digits 0 to 9 in a three by five pixel face, one string per row ("1" is a lit pixel). Drawn as whole pixels like the rest of the scene,
 * so a count stays sharp at any scale; text rendered at seven pixels and scaled up four times is a blur.
 */
const DIGITS = [
  ["111", "101", "101", "101", "111"],
  ["010", "110", "010", "010", "111"],
  ["111", "001", "111", "100", "111"],
  ["111", "001", "111", "001", "111"],
  ["101", "101", "111", "001", "001"],
  ["111", "100", "111", "001", "111"],
  ["111", "100", "111", "101", "111"],
  ["111", "001", "001", "001", "001"],
  ["111", "101", "111", "101", "111"],
  ["111", "101", "111", "001", "111"],
] as const;

/** A count in pixel digits with its right edge at `right` and its top at `top`, light with a dark outline so it reads over any item. */
function pixelCount(into: Container, count: number, right: number, top: number): void {
  const digits = [...String(Math.min(count, 99))].map(Number);
  const left = right - (digits.length * 4 - 1);
  const lit: [number, number][] = [];
  digits.forEach((d, i) =>
    DIGITS[d]!.forEach((row, y) => [...row].forEach((on, x) => on === "1" && lit.push([left + i * 4 + x, top + y]))),
  );
  const g = new Graphics();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    for (const [x, y] of lit) g.rect(x + dx, y + dy, 1, 1).fill(COLOR.deep);
  }
  for (const [x, y] of lit) g.rect(x, y, 1, 1).fill(COLOR.text);
  into.addChild(g);
}

/** A wooden square with a one-pixel bevel: light on the top and left, shade on the bottom and right. Returns the Graphics drawn into. */
function bevelled(into: Container, x: number, y: number, w: number, h: number): Graphics {
  const g = new Graphics().rect(x, y, w, h).fill(COLOR.face);
  g.rect(x, y, w, 1).fill(COLOR.light).rect(x, y, 1, h).fill(COLOR.light);
  g.rect(x, y + h - 1, w, 1).fill(COLOR.shade).rect(x + w - 1, y, 1, h).fill(COLOR.shade);
  into.addChild(g);
  return g;
}

export function createTableScene(art: ItemArt = defaultItemArt): SceneFactory {
  return async (host, { reducedMotion }): Promise<SceneHandle> => {
    // The canvas is as tall as its content needs, whatever the grid: a start value until the first frame says what is on the table.
    let H = 118;
    const app = new Application();
    await app.init({ width: W, height: H, backgroundAlpha: 0, antialias: false, autoDensity: true, resolution: 1 });
    const canvas = app.canvas;
    canvas.style.imageRendering = "pixelated";
    canvas.style.display = "block";
    host.appendChild(canvas);

    // Whole-number scale: the largest that fits the host, at least 1.
    const fit = (): void => {
      // The host is as wide as the canvas, so the room to use is its parent's.
      const room = host.parentElement?.clientWidth ?? host.clientWidth;
      const k = Math.max(1, Math.floor(Math.min(room, 720) / W));
      canvas.style.width = `${W * k}px`;
      canvas.style.height = `${H * k}px`;
    };
    fit();
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : undefined;
    resize?.observe(host.parentElement ?? host);

    const textures = new Map<string, Texture>();
    const textureFor = (item: string): Texture => {
      let t = textures.get(item);
      if (!t) {
        const s = art(item);
        const c = document.createElement("canvas");
        c.width = s.width;
        c.height = s.height;
        c.getContext("2d")!.putImageData(new ImageData(spriteToRGBA(s) as Uint8ClampedArray<ArrayBuffer>, s.width, s.height), 0, 0);
        t = Texture.from(c);
        t.source.scaleMode = "nearest";
        textures.set(item, t);
      }
      return t;
    };

    const stage = app.stage;
    const board = new Container();
    const items = new Container();
    const hud = new Container();
    const fx = new Container();
    stage.addChild(board, items, hud, fx);

    const running: Running[] = [];
    app.ticker.add((t) => {
      // An effect that fails is dropped, never allowed to stop the ticker: the table must keep drawing.
      for (let i = running.length - 1; i >= 0; i--) {
        let alive = false;
        try {
          alive = running[i]!(t.deltaMS);
        } catch {
          alive = false;
        }
        if (!alive) running.splice(i, 1);
      }
    });

    // Layout follows the grid: the cell is a multiple of the 8-pixel sprite, smaller as the grid grows. The table, the arrow and the output
    // frame make one row, and the hotbar sits under it; the two are centred as a block on the canvas, both ways, so the margins match.
    // Every measure is a whole number and every width even, so nothing lands between two pixels.
    const FRAME = 3; // the wooden rim round the grid
    const OUT = 32; // the output frame, rim and rivets included
    const GAP = 18; // from the table's rim to the output frame, with the arrow centred in it
    const SLOT = 18; // one hotbar slot
    const SLOT_GAP = 2;
    const SECTION_GAP = 10; // between the table row and the hotbar
    const MARGIN = 6; // above the table row and below the hotbar
    const layout = (rows: number, cols: number) => {
      const cell = cellSizeFor(Math.max(rows, cols));
      const w = cols * cell;
      const h = rows * cell;
      const box = { w: w + 2 * FRAME, h: h + 2 * FRAME };
      // An item is drawn a size smaller than its cell and centred in it, so the cell's bevel shows round it and neighbours do not merge:
      // twice the sprite's size in a 24-pixel cell, and its own size in the smaller ones.
      const scale = cell >= 24 ? 2 : 1;
      const pad = (cell - 8 * scale) / 2;
      const rowW = box.w + GAP + OUT;
      const rowH = Math.max(box.h, OUT);
      const hotbarW = HOTBAR_SLOTS * SLOT + (HOTBAR_SLOTS - 1) * SLOT_GAP;
      const left = Math.round((W - rowW) / 2);
      const top = MARGIN;
      const hotY = top + rowH + SECTION_GAP;
      const boxX = left;
      const boxY = top + Math.round((rowH - box.h) / 2);
      const outX = left + box.w + GAP; // the output frame's left edge
      const outY = top + Math.round((rowH - OUT) / 2);
      return {
        cell, x0: boxX + FRAME, y0: boxY + FRAME, w, h, scale, pad, box, boxX, boxY, outX, outY,
        arrowX: left + box.w + (GAP - 8) / 2, midY: outY + OUT / 2,
        hotX: Math.round((W - hotbarW) / 2), hotY,
        height: hotY + SLOT + MARGIN,
      };
    };

    let current: ReturnType<typeof layout> | undefined;
    const cellSprites = new Map<string, Container>();

    function drawStatic(frames: readonly FrameData[], index: number): void {
      const s = sceneAt(frames, index);
      const L = layout(s.rows, s.cols);
      current = L;
      // The canvas is exactly as tall as the layout: a world with a taller grid gets a taller canvas, and no space is left over.
      if (L.height !== H) {
        H = L.height;
        app.renderer.resize(W, H);
        fit();
      }
      board.removeChildren().forEach((c) => c.destroy());
      items.removeChildren().forEach((c) => c.destroy());
      hud.removeChildren().forEach((c) => c.destroy());
      cellSprites.clear();

      board.addChild(new Graphics().rect(0, 0, W, H).fill(COLOR.backdrop));
      board.addChild(new Graphics().rect(L.boxX, L.boxY, L.box.w, L.box.h).fill(COLOR.frame).stroke({ width: 1, color: COLOR.deep }));
      for (let r = 0; r < s.rows; r++) {
        for (let c = 0; c < s.cols; c++) {
          bevelled(board, L.x0 + c * L.cell + 1, L.y0 + r * L.cell + 1, L.cell - 2, L.cell - 2);
        }
      }
      s.cells.forEach((row, r) =>
        row.forEach((item, c) => {
          if (item === null) return;
          // The holder is what the place animation moves.
          const holder = new Container();
          holder.position.set(L.x0 + c * L.cell + L.pad, L.y0 + r * L.cell + L.pad);
          const sp = new Sprite(textureFor(item));
          sp.scale.set(L.scale);
          holder.addChild(sp);
          items.addChild(holder);
          cellSprites.set(`${r},${c}`, holder);
        }),
      );

      // Output slot: an arrow from the table to a riveted wooden frame holding a socket, which is empty or shows a ghost of what
      // craft would make now.
      const ox = L.outX + 2;
      const oy = L.outY + 2;
      const arrow = new Graphics();
      arrow.rect(L.arrowX, L.midY - 1, 5, 2).fill(COLOR.arrow); // the shaft
      arrow.rect(L.arrowX + 5, L.midY - 3, 1, 6).fill(COLOR.arrow); // and a head, one column at a time
      arrow.rect(L.arrowX + 6, L.midY - 2, 1, 4).fill(COLOR.arrow);
      arrow.rect(L.arrowX + 7, L.midY - 1, 1, 2).fill(COLOR.arrow);
      hud.addChild(arrow);
      const frame = bevelled(hud, L.outX, L.outY, OUT, OUT);
      for (const [rx, ry] of [[ox - 1, oy - 1], [ox + 28, oy - 1], [ox - 1, oy + 28], [ox + 28, oy + 28]] as const) frame.rect(rx, ry, 1, 1).fill(COLOR.shade); // rivets
      const socket = new Graphics().rect(ox, oy, 28, 28).fill(COLOR.socket);
      socket.rect(ox, oy, 28, 1).fill(COLOR.frame).rect(ox, oy, 1, 28).fill(COLOR.frame); // inset: dark on the top and left
      if (s.output.state === "ready") socket.rect(ox, oy, 28, 28).stroke({ width: 1, color: COLOR.craft });
      hud.addChild(socket);
      if (s.output.state === "ready") {
        const g = new Sprite(textureFor(s.output.item));
        g.scale.set(2);
        g.position.set(ox + 6, oy + 6);
        g.alpha = 0.85;
        hud.addChild(g);
      }

      // The hotbar: what the agent holds, with counts. All the slots are always drawn, so the row keeps its place and its width as the
      // agent picks things up; an empty slot is a dark socket and a full one a wooden square.
      for (let i = 0; i < HOTBAR_SLOTS; i++) {
        const hx = L.hotX + i * (SLOT + SLOT_GAP);
        const hy = L.hotY;
        const h = s.hotbar[i];
        hud.addChild(new Graphics().rect(hx, hy, SLOT, SLOT).fill(h ? COLOR.frame : COLOR.socket).stroke({ width: 1, color: COLOR.deep }));
        if (!h) continue;
        const sp = new Sprite(textureFor(h.item));
        sp.scale.set(2);
        sp.position.set(hx + 1, hy + 1);
        hud.addChild(sp);
        pixelCount(hud, h.count, hx + SLOT - 2, hy + SLOT - 7); // the count at the slot's bottom right
      }
    }

    function play(effects: readonly Effect[], seq: number): void {
      if (reducedMotion || !current) return;
      const L = current;
      for (const e of effects) {
        if (e.kind === "place") {
          const sp = cellSprites.get(`${e.row},${e.col}`);
          if (!sp) continue;
          const y = sp.y;
          let t = 0;
          running.push((ms) => {
            t += ms;
            const k = Math.min(1, t / 220);
            sp.y = y - Math.round((1 - k) * (1 - k) * 8 * (k < 1 ? 1 : 0));
            if (k >= 1) sp.y = y;
            return k < 1;
          });
        } else if (e.kind === "lift") {
          const sp = new Sprite(textureFor(e.item));
          sp.scale.set(L.scale);
          sp.position.set(L.x0 + e.col * L.cell + L.pad, L.y0 + e.row * L.cell + L.pad);
          fx.addChild(sp);
          let t = 0;
          running.push((ms) => {
            t += ms;
            const k = Math.min(1, t / 240);
            sp.y -= (ms / 240) * 8;
            sp.alpha = 1 - k;
            if (k >= 1) sp.destroy();
            return k < 1;
          });
        } else if (e.kind === "craft") {
          const flash = new Graphics().rect(0, 0, W, H).fill(0xffffff);
          flash.alpha = 0.5;
          fx.addChild(flash);
          let t = 0;
          running.push((ms) => {
            t += ms;
            flash.alpha = 0.5 * (1 - Math.min(1, t / 260));
            if (t >= 260) flash.destroy();
            return t < 260;
          });
        } else if (e.kind === "refuse") {
          const edge = new Graphics().rect(0, 0, W, H).stroke({ width: 3, color: COLOR.refuse });
          fx.addChild(edge);
          let t = 0;
          running.push((ms) => {
            t += ms;
            const k = Math.min(1, t / 320);
            const shake = Math.round(Math.sin(k * Math.PI * 6) * 3 * (1 - k));
            board.x = shake;
            items.x = shake;
            edge.alpha = 1 - k;
            if (k >= 1) {
              board.x = 0;
              items.x = 0;
              edge.destroy();
            }
            return k < 1;
          });
        } else if (e.kind === "goal") {
          const pieces = confettiBurst(seeded(seq * 7919 + 17), 60).map((p) => {
            const g = new Graphics().rect(0, 0, 2, 2).fill(CONFETTI[p.color % CONFETTI.length]!);
            g.position.set(W / 2, H / 2);
            fx.addChild(g);
            return { p, g, age: 0, vy: p.dy };
          });
          running.push((ms) => {
            let alive = false;
            for (const c of pieces) {
              c.age += ms / 16;
              if (c.age >= c.p.life) {
                c.g.visible = false;
                continue;
              }
              alive = true;
              c.vy += 0.08 * (ms / 16);
              c.g.x += c.p.dx * (ms / 16);
              c.g.y += c.vy * (ms / 16);
              c.g.rotation += c.p.spin;
              c.g.alpha = 1 - c.age / c.p.life;
            }
            if (!alive) for (const c of pieces) c.g.destroy();
            return alive;
          });
        }
      }
    }

    return {
      show(frames, index, effects) {
        // The frame is the truth: effects still running for an earlier step end here, and their pieces go.
        running.length = 0;
        board.x = 0;
        items.x = 0;
        fx.removeChildren().forEach((c) => c.destroy());
        drawStatic(frames, index);
        play(effects, frames[index]?.seq ?? 0);
      },
      destroy() {
        resize?.disconnect();
        running.length = 0;
        app.destroy(true, { children: true, texture: true });
        textures.clear();
      },
    };
  };
}

/** The scene the page uses. */
export const tableScene: SceneFactory = createTableScene();
