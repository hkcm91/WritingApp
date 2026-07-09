import { getState, setState } from "./store.js";

// JSON import/export. Accepts camelCase or snake_case keys plus natural
// aliases; fills only the fields present. Export writes the whole project
// minus the API key.

const ALIASES = {
  storyBible: ["storyBible", "story_bible", "bible"],
  runningSynopsis: ["runningSynopsis", "running_synopsis", "synopsis"],
  source: ["source", "source_chapter_or_outline", "outline", "draft"],
  instructions: ["instructions"],
  characters: ["characters", "cast"],
  rewriteInput: ["rewriteInput", "rewrite_input", "rewrite_text"],
  rewritePrompt: ["rewritePrompt", "rewrite_prompt", "rewrite_instructions"],
  notesWant: ["notesWant", "notes_want", "want", "steer_toward", "wants"],
  notesAvoid: ["notesAvoid", "notes_avoid", "avoid", "avoids", "do_not"],
  mode: ["mode"],
  temperature: ["temperature", "temp"],
  model: ["model"],
  summaryModel: ["summaryModel", "summary_model"],
  chapters: ["chapters"],
};

function pickAlias(obj, aliases) {
  for (const key of aliases) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

const text = (v) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

let charId = Date.now();
export const newCharId = () => `c${charId++}`;

/** Apply a project object to the store. Returns the list of filled fields. */
export function applyImport(obj) {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error("Expected a JSON object with pane fields.");
  }
  const filled = [];
  const patch = {};

  const simple = (key, label) => {
    const v = pickAlias(obj, ALIASES[key]);
    if (v !== undefined) {
      patch[key] = text(v);
      filled.push(label);
    }
  };
  simple("storyBible", "Story Bible");
  simple("runningSynopsis", "Synopsis");
  simple("source", "Source");
  simple("instructions", "Instructions");
  simple("rewriteInput", "Rewrite text");
  simple("rewritePrompt", "Rewrite prompt");

  const notes = (key, label) => {
    const v = pickAlias(obj, ALIASES[key]);
    if (v !== undefined) {
      patch[key] = Array.isArray(v) ? v.map((n) => `- ${n}`).join("\n") : text(v);
      filled.push(label);
    }
  };
  notes("notesWant", "Steer-toward notes");
  notes("notesAvoid", "Avoid notes");

  const characters = pickAlias(obj, ALIASES.characters);
  if (Array.isArray(characters)) {
    patch.characters = characters
      .map((c) =>
        typeof c === "string"
          ? { id: newCharId(), name: c.split("—")[0].trim(), description: (c.split("—")[1] || "").trim(), image: "" }
          : {
              id: newCharId(),
              name: text(c.name ?? ""),
              description: text(c.description ?? c.desc ?? c.bio ?? ""),
              image: typeof (c.image ?? c.img ?? c.image_url) === "string" ? (c.image ?? c.img ?? c.image_url) : "",
            }
      )
      .filter((c) => c.name.trim() || c.description.trim());
    filled.push(`Characters (${patch.characters.length})`);
  }

  const mode = pickAlias(obj, ALIASES.mode);
  if (typeof mode === "string" && ["GENERATE", "REVISE"].includes(mode.toUpperCase())) {
    patch.mode = mode.toUpperCase();
    filled.push("Mode");
  }
  const temperature = Number(pickAlias(obj, ALIASES.temperature));
  if (!Number.isNaN(temperature) && temperature >= 0 && temperature <= 2) {
    patch.temperature = Math.min(1.2, Math.max(0.5, temperature));
    filled.push("Temperature");
  }
  const model = pickAlias(obj, ALIASES.model);
  if (typeof model === "string" && model.trim()) {
    patch.model = model.trim();
    filled.push("Model");
  }
  const summaryModel = pickAlias(obj, ALIASES.summaryModel);
  if (typeof summaryModel === "string" && summaryModel.trim()) {
    patch.summaryModel = summaryModel.trim();
    filled.push("Summary model");
  }

  const chapters = pickAlias(obj, ALIASES.chapters);
  if (Array.isArray(chapters)) {
    patch.chapters = chapters
      .map((ch, i) =>
        typeof ch === "string"
          ? { n: i + 1, text: ch, summary: "" }
          : { n: Number(ch.n) || i + 1, text: text(ch.text ?? ""), summary: text(ch.summary ?? "") }
      )
      .filter((ch) => ch.text.trim());
    patch.activeChapter = null;
    filled.push(`Chapters (${patch.chapters.length})`);
  }

  if (!filled.length) {
    throw new Error(
      "No recognized fields. Expected keys like storyBible, characters, notesWant, notesAvoid, runningSynopsis, source, instructions, mode, chapters."
    );
  }
  setState(patch);
  return filled;
}

export function exportProject() {
  const { apiKey, storageError, ...project } = getState(); // never write the key to disk
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "chapter-engine-project.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Downscale an image file to a small data-URL thumbnail. */
export function resizeImage(file, maxDim = 384) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image.")); };
    img.src = url;
  });
}
