import { useEffect, useRef, useState } from "react";

/**
 * Speech-to-text via the Web Speech API. Final phrases are committed and
 * interim words shown live; auto-restarts through pauses until toggled off.
 *
 * @param getValue  () => current input text (dictation appends to it)
 * @param setValue  (text) => void
 * @param onStatus  (msg, kind) => void  — permission errors, listening notice
 */
export default function useDictation(getValue, setValue, onStatus) {
  const [supported, setSupported] = useState(true);
  const [dictating, setDictating] = useState(false);
  const recRef = useRef(null);
  const activeRef = useRef(false);
  const committedRef = useRef("");

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.addEventListener("result", (e) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk + " ";
        else interim += chunk;
      }
      if (finalText) committedRef.current += finalText;
      setValue(committedRef.current + interim);
    });

    rec.addEventListener("error", (e) => {
      onStatus?.(
        e.error === "not-allowed"
          ? "Microphone permission denied — allow it in the browser to dictate."
          : `Dictation error: ${e.error}`,
        "error"
      );
      activeRef.current = false;
      setDictating(false);
    });

    rec.addEventListener("end", () => {
      if (activeRef.current) { try { rec.start(); } catch { /* already running */ } }
    });

    recRef.current = rec;
    return () => { activeRef.current = false; try { rec.stop(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (activeRef.current) {
      activeRef.current = false;
      setDictating(false);
      try { rec.stop(); } catch {}
    } else {
      const cur = getValue();
      committedRef.current = cur && !/\s$/.test(cur) ? cur + " " : cur;
      activeRef.current = true;
      setDictating(true);
      onStatus?.("Listening… tap the mic again to stop.");
      try { rec.start(); } catch {}
    }
  };

  const stop = () => {
    if (activeRef.current) toggle();
  };

  return { supported, dictating, toggle, stop };
}
