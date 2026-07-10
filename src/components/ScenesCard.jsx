import React, { useState } from "react";
import { useStore, setState, getState, uid } from "../store.js";
import { streamLongform, completeOnce } from "../api.js";
import { SYSTEM_PROMPT, buildSplitScenesMessage, buildSceneMessage, parseScenes } from "../prompts.js";
import Card from "./Card.jsx";
import Icon from "./Icon.jsx";
import ImagePromptSheet from "./ImagePromptSheet.jsx";
import { toast } from "../toast.js";

// Scene-by-scene chapter building. Scenes are a workspace for the chapter in
// progress: each has an outline and (once written) its prose. The manuscript
// is rebuilt from written scenes so you can fine-tune one scene at a time.

const assembleDraft = (scenes) => scenes.map((sc) => sc.text.trim()).filter(Boolean).join("\n\n");

export default function ScenesCard({ openSettings }) {
  const s = useStore();
  const [busyId, setBusyId] = useState(null); // scene id being written, or "split"
  const [artSceneId, setArtSceneId] = useState(null);
  const artScene = s.scenes.find((x) => x.id === artSceneId);

  const update = (id, patch) => {
    setState({ scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)) });
  };

  const needKey = () => {
    if (!getState().apiKey) {
      toast("No API key — add it in Settings first.", "error");
      openSettings();
      return true;
    }
    return false;
  };

  const splitFromSource = async () => {
    if (needKey()) return;
    if (!getState().source.trim()) return toast("Source is empty — paste an outline to split.", "error");
    setBusyId("split");
    try {
      const raw = await completeOnce({
        model: getState().model,
        temperature: 0.6,
        messages: [{ role: "user", content: buildSplitScenesMessage(getState()) }],
      });
      const scenes = parseScenes(raw).map((sc) => ({ id: uid("sc"), ...sc, text: "", image: "" }));
      if (!scenes.length) throw new Error("No scenes came back.");
      setState({ scenes });
      toast(`Split into ${scenes.length} scenes.`);
    } catch (err) {
      toast(`Split failed: ${err.message}`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const writeScene = async (scene) => {
    if (needKey()) return;
    if (!scene.outline.trim()) return toast("This scene has no outline yet.", "error");
    setBusyId(scene.id);
    const priorText = assembleDraft(getState().scenes.slice(0, getState().scenes.findIndex((x) => x.id === scene.id)));
    update(scene.id, { text: "" });
    try {
      const text = await streamLongform({
        system: SYSTEM_PROMPT,
        userMessage: buildSceneMessage(getState(), scene, priorText),
        temperature: getState().temperature,
        onToken: (t) => {
          const cur = getState().scenes;
          const mine = cur.find((x) => x.id === scene.id);
          setState({
            scenes: cur.map((x) => (x.id === scene.id ? { ...x, text: (mine?.text || "") + t } : x)),
            draftText: assembleDraft(cur.map((x) => (x.id === scene.id ? { ...x, text: (mine?.text || "") + t } : x))),
          });
        },
      });
      if (!text.trim()) throw new Error("Model returned nothing for this scene.");
      setState({ draftText: assembleDraft(getState().scenes), activeChapter: null });
      toast(`Scene written — manuscript updated.`);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card id="scenes" title="Scenes" badge={s.scenes.length || null} defaultOpen={false}>
      <span className="hint">
        Optional fine control: break the chapter into scenes and write them one at a time.
        Written scenes assemble into the manuscript in order.
      </span>
      <div className="btn-row">
        <button className="btn-secondary" onClick={splitFromSource} disabled={busyId !== null}>
          {busyId === "split" ? "Splitting…" : "Split Source into scenes"}
        </button>
        <button
          className="btn-secondary"
          onClick={() => setState({ scenes: [...s.scenes, { id: uid("sc"), title: "", outline: "", text: "", image: "" }] })}
        >
          <Icon name="plus" />
          Add scene
        </button>
        {s.scenes.length > 0 && (
          <button
            className="btn-secondary"
            onClick={() => confirm("Clear all scenes? Written prose stays in the manuscript.") && setState({ scenes: [] })}
          >
            Clear
          </button>
        )}
      </div>

      {s.scenes.map((sc, i) => (
        <div className="scene-card" key={sc.id}>
          <div className="scene-head">
            <span className="scene-num">{i + 1}</span>
            <input
              placeholder="Scene title"
              value={sc.title}
              onChange={(e) => update(sc.id, { title: e.target.value })}
            />
            <span className={`scene-state ${sc.text.trim() ? "done" : ""}`}>
              {busyId === sc.id ? "writing…" : sc.text.trim() ? `${sc.text.trim().split(/\s+/).length.toLocaleString()} words` : "unwritten"}
            </span>
            <button
              className="icon-btn"
              title="Generate scene art"
              aria-label={`Generate art for scene ${i + 1}`}
              onClick={() => setArtSceneId(sc.id)}
            >
              <Icon name="image" size={15} />
            </button>
            <button
              className="char-del"
              title="Remove scene"
              aria-label={`Remove scene ${i + 1}`}
              onClick={() => confirm(`Remove scene ${i + 1}?`) && setState({ scenes: s.scenes.filter((x) => x.id !== sc.id) })}
            >
              <Icon name="trash" />
            </button>
          </div>
          {sc.image && <img className="scene-thumb" src={sc.image} alt={`${sc.title || "scene"} art`} />}
          <textarea
            placeholder="What happens in this scene…"
            value={sc.outline}
            onChange={(e) => update(sc.id, { outline: e.target.value })}
          />
          <button className="btn-secondary" onClick={() => writeScene(sc)} disabled={busyId !== null}>
            <Icon name="play" />
            {sc.text.trim() ? "Rewrite scene" : "Write scene"}
          </button>
        </div>
      ))}

      {artScene && (
        <ImagePromptSheet
          title={`Scene art — ${artScene.title || "untitled scene"}`}
          forcedContext={{ label: "This scene", text: `${artScene.title}\n${artScene.outline}\n${artScene.text}`.trim() }}
          onClose={() => setArtSceneId(null)}
          onSave={(dataUrl) => update(artScene.id, { image: dataUrl })}
          openSettings={openSettings}
        />
      )}
    </Card>
  );
}
