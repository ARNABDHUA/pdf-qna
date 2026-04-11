import { useRef, useState, useCallback, useEffect } from "react";

export function useTTS() {
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef(null);
  const voicesRef = useRef([]);

  // Load voices — Chrome loads them async, Firefox loads sync
  useEffect(() => {
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };

    loadVoices();

    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const getVoice = useCallback(() => {
    const voices = voicesRef.current.length
      ? voicesRef.current
      : window.speechSynthesis.getVoices();

    return (
      voices.find(v => v.lang.startsWith("en") && v.localService) ||
      voices.find(v => v.lang === "en-US") ||
      voices.find(v => v.lang.startsWith("en")) ||
      voices[0] ||
      null
    );
  }, []);

  const speak = useCallback(
    (text) => {
      if (!ttsEnabled || !text?.trim() || !window.speechSynthesis) return;

      // Cancel anything already playing
      window.speechSynthesis.cancel();

      // Strip markdown symbols so they aren't read aloud
      const cleaned = text
        .replace(/#{1,6}\s+/g, "")        // headings
        .replace(/\*\*(.+?)\*\*/g, "$1")  // bold
        .replace(/\*(.+?)\*/g, "$1")      // italic
        .replace(/`{1,3}[^`]*`{1,3}/g, "") // code
        .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
        .replace(/^\s*[-*+]\s+/gm, "")    // list bullets
        .replace(/^\s*\d+\.\s+/gm, "")    // numbered lists
        .replace(/[═─]{3,}/g, "")         // dividers (your legal mode)
        .replace(/\n{2,}/g, ". ")         // double newlines → pause
        .replace(/\n/g, " ")              // single newlines → space
        .replace(/\s{2,}/g, " ")          // collapse whitespace
        .trim();

      if (!cleaned) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate   = 1.0;
      utterance.pitch  = 1.0;
      utterance.volume = 1.0;

      const voice = getVoice();
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend   = () => setIsSpeaking(false);
      utterance.onerror = (e) => {
        // "interrupted" fires when cancel() is called intentionally — ignore it
        if (e.error !== "interrupted") {
          console.warn("TTS error:", e.error);
        }
        setIsSpeaking(false);
      };

      utteranceRef.current = utterance;

      // Chrome bug: speechSynthesis sometimes silently stops mid-utterance.
      // Keeping a periodic resume() call fixes it.
      const resumeTimer = setInterval(() => {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 5000);

      utterance.onend = () => {
        clearInterval(resumeTimer);
        setIsSpeaking(false);
      };
      utterance.onerror = (e) => {
        clearInterval(resumeTimer);
        if (e.error !== "interrupted") {
          console.warn("TTS error:", e.error);
        }
        setIsSpeaking(false);
      };

      // If voices weren't ready yet, wait for them then speak
      if (!voice && window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = () => {
          const v = getVoice();
          if (v) utterance.voice = v;
          window.speechSynthesis.speak(utterance);
        };
      } else {
        window.speechSynthesis.speak(utterance);
      }
    },
    [ttsEnabled, getVoice]
  );

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const toggleTTS = useCallback(() => {
    setTtsEnabled((prev) => {
      if (prev) {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
      }
      return !prev;
    });
  }, []);

  // Stop speaking if component unmounts
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  return { ttsEnabled, isSpeaking, speak, stopSpeaking, toggleTTS };
}