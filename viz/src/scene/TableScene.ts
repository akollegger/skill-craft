import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { cellSizeFor, defaultItemArt, spriteToRGBA, type ItemArt } from "../art/index.ts";
import { hex } from "../palette.ts";
import type { FrameData } from "../../../src/viz/contract.ts";
import type { SceneFactory, SceneHandle } from "./handle.ts";
import { confettiBurst, sceneAt, type Effect } from "./model.ts";

// The scene is drawn at a small native size and scaled up by whole numbers with nearest-neighbour sampling, so it
// stays crisp at any size. Which color plays which role is provisional: the palette's roles are set with the page.
const W = 168;
const H = 128;
const HOTBAR_SLOTS = 8;

const COLOR = {
  backdrop: hex("darkestBaltic"),
  // The table is wood: a ramp derived from Marigold (see DERIVED in palette.ts), bevelled light on the top and left.
  frame: hex("woodFrame"),
  face: hex("woodFace"),
  light: hex("woodHighlight"),
  shade: hex("woodShade"),
  deep: hex("woodDeep"),
  arrow: hex("baltic"),
  edge: hex("black"),
  socket: hex("woodDeep"),
  ghost: hex("lightBaltic"),
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

    // Layout follows the grid: the cell is a multiple of the 8-pixel sprite, smaller as the grid grows.
    const layout = (rows: number, cols: number) => {
      const cell = cellSizeFor(Math.max(rows, cols));
      const x0 = 8;
      const y0 = 8;
      return { cell, x0, y0, w: cols * cell, h: rows * cell, scale: cell / 8 };
    };

    let current: ReturnType<typeof layout> | undefined;
    const cellSprites = new Map<string, Container>();

    function drawStatic(frames: readonly FrameData[], index: number): void {
      const s = sceneAt(frames, index);
      const L = layout(s.rows, s.cols);
      current = L;
      board.removeChildren().forEach((c) => c.destroy());
      items.removeChildren().forEach((c) => c.destroy());
      hud.removeChildren().forEach((c) => c.destroy());
      cellSprites.clear();

      board.addChild(new Graphics().rect(0, 0, W, H).fill(COLOR.backdrop));
      board.addChild(new Graphics().rect(L.x0 - 3, L.y0 - 3, L.w + 6, L.h + 6).fill(COLOR.frame).stroke({ width: 1, color: COLOR.deep }));
      for (let r = 0; r < s.rows; r++) {
        for (let c = 0; c < s.cols; c++) {
          bevelled(board, L.x0 + c * L.cell + 1, L.y0 + r * L.cell + 1, L.cell - 2, L.cell - 2);
        }
      }
      s.cells.forEach((row, r) =>
        row.forEach((item, c) => {
          if (item === null) return;
          // An item and its shadow move together: a dark copy one sprite pixel down and right keeps every palette legible on the wood.
          const holder = new Container();
          holder.position.set(L.x0 + c * L.cell, L.y0 + r * L.cell);
          const shadow = new Sprite(textureFor(item));
          shadow.tint = COLOR.deep;
          shadow.alpha = 0.6;
          shadow.scale.set(L.scale);
          shadow.position.set(L.scale, L.scale);
          const sp = new Sprite(textureFor(item));
          sp.scale.set(L.scale);
          holder.addChild(shadow, sp);
          items.addChild(holder);
          cellSprites.set(`${r},${c}`, holder);
        }),
      );

      // Output slot: an arrow from the table to a riveted wooden frame holding a socket, which is empty or shows a ghost of what
      // craft would make now.
      const ox = L.x0 + L.w + 18;
      const oy = L.y0 + Math.floor(L.h / 2) - 14;
      const mid = oy + 14;
      const arrow = new Graphics();
      arrow.rect(L.x0 + L.w + 6, mid - 1, 6, 2).fill(COLOR.arrow); // the shaft
      arrow.rect(L.x0 + L.w + 12, mid - 3, 1, 6).fill(COLOR.arrow); // and a head, one column at a time
      arrow.rect(L.x0 + L.w + 13, mid - 2, 1, 4).fill(COLOR.arrow);
      arrow.rect(L.x0 + L.w + 14, mid - 1, 1, 2).fill(COLOR.arrow);
      hud.addChild(arrow);
      const frame = bevelled(hud, ox - 2, oy - 2, 32, 32);
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

      // The hotbar: what the agent holds, with counts.
      s.hotbar.slice(0, HOTBAR_SLOTS).forEach((h, i) => {
        const hx = 8 + i * 19;
        const hy = H - 24;
        hud.addChild(new Graphics().rect(hx, hy, 18, 18).fill(COLOR.frame).stroke({ width: 1, color: COLOR.deep }));
        const sp = new Sprite(textureFor(h.item));
        sp.scale.set(2);
        sp.position.set(hx + 1, hy + 1);
        hud.addChild(sp);
        const n = new Text({ text: String(h.count), style: { fontFamily: "Fira Code", fontSize: 7, fill: COLOR.text } });
        n.position.set(hx + 11, hy + 10);
        hud.addChild(n);
      });
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
          sp.position.set(L.x0 + e.col * L.cell, L.y0 + e.row * L.cell);
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
