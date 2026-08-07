/**
 * Example React usage (React + Vite + Tailwind, matching the HR Pro frontend).
 *
 * The codec runs entirely in the browser — no round-trip to the backend needed
 * for encode/decode. It imports the exact same shared core as the backend
 * function and the CLI, so results are identical everywhere.
 */
import { useState } from "react";
import { encodeText, decodeText, Base44FormatError } from "../src/base44.ts";

export function Base44Tool() {
  const [input, setInput] = useState("Hello, World!");
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    try {
      setOutput(mode === "encode" ? encodeText(input) : decodeText(input));
    } catch (e) {
      setOutput("");
      setError(e instanceof Base44FormatError ? e.message : "Unexpected error.");
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-3">
      <div className="flex gap-2">
        <button
          className={`px-3 py-1 rounded ${mode === "encode" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setMode("encode")}
        >
          Encode
        </button>
        <button
          className={`px-3 py-1 rounded ${mode === "decode" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setMode("decode")}
        >
          Decode
        </button>
      </div>

      <textarea
        className="w-full h-28 border rounded p-2 font-mono text-sm"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={run}>
        {mode === "encode" ? "Encode to Base44" : "Decode from Base44"}
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {output && (
        <pre className="w-full border rounded p-2 font-mono text-sm whitespace-pre-wrap break-all">
          {output}
        </pre>
      )}
    </div>
  );
}
