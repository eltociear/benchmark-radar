// Execute the production star prompt with a stub DOM: it appears once per
// browser, survives blocked storage, and reports only through Clarity.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("site/assets/app.js", "utf8");
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return source.slice(start, source.indexOf("\n}\n", start) + 2);
}
const constants = [
  source.match(/const STAR_PROMPT_KEY = .*;/)[0],
  source.match(/const STAR_PROMPT_COPY = \{[\s\S]*?\n\};/)[0],
].join("\n");

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.removed = false; }
  setAttribute(key, value) { this.attrs[key] = value; }
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  remove() { this.removed = true; }
}
const documentStub = { createElement: (tag) => new Node(tag) };

function load(storage) {
  const events = [];
  const windowStub = { localStorage: storage, clarity: (kind, name) => events.push([kind, name]) };
  const api = new Function("window", "document", "t", `${constants}\nlet starPromptShown = false;\n${["element", "trackStarPrompt", "starPrompt"].map(fn).join("\n")}\nreturn { starPrompt };`)(
    windowStub, documentStub, (key) => key,
  );
  return { ...api, events };
}

let store = {};
const storage = {
  getItem: (key) => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); },
};

// First trigger shows the prompt and records which action earned it.
const first = load(storage);
let closed = 0;
const prompt = first.starPrompt("save", () => { closed += 1; });
assert(prompt);
assert.equal(store["benchmark-radar:star-prompt:v1"], "save");
const [, link, dismiss] = prompt.children;
assert.equal(link.attrs.href, "https://github.com/ktwu01/benchmark-radar");
assert.equal(link.attrs.rel, "noopener");
assert.deepEqual(first.events, [["event", "star_prompt_shown_save"]]);
link.listeners.click();
assert(prompt.removed);
assert.equal(closed, 1);
assert.deepEqual(first.events.at(-1), ["event", "star_prompt_click_save"]);
dismiss.listeners.click();
assert.equal(closed, 2);

// Later triggers, on this page or a later visit, show nothing.
assert.equal(first.starPrompt("cite"), null);
assert.equal(load(storage).starPrompt("subscribe"), null);

// Blocked storage still limits the prompt to once per page.
const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
const page = load(blocked);
assert(page.starPrompt("cite"));
assert.equal(page.starPrompt("subscribe"), null);

// Every trigger has copy, and every string has a Chinese translation.
for (const text of Object.values(new Function(`${constants}\nreturn STAR_PROMPT_COPY;`)())) {
  assert(source.includes(`    ${JSON.stringify(text)}: "`), text);
}
console.log("star prompt harness ok");
