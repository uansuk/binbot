import { useMemo } from "react";
import { PY_FILES } from "../lib/python";
import { CodeLines } from "../lib/highlight";
import { useCopy } from "../hooks";

export default function CodeViewer({ active, setActive }: { active: string; setActive: (id: string) => void }) {
  const file = PY_FILES.find((f) => f.id === active) ?? PY_FILES[0];
  const [copied, copy] = useCopy();
  const [copiedAll, copyAll] = useCopy();

  const lineCount = useMemo(() => file.code.split("\n").length - 1, [file]);
  const kb = useMemo(() => (new Blob([file.code]).size / 1024).toFixed(1), [file]);

  return (
    <section id="code" className="relative z-10 mx-auto max-w-7xl scroll-mt-20 px-5 py-20 lg:px-8">
      <div className="rv flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-amb">// source</div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            The full implementation
          </h2>
        </div>
        <button className="btn btn-grn" onClick={() => copyAll(PY_FILES.filter(f=>f.id!=="setup").map((f) => `# ===== ${f.name} =====\n${f.code}`).join("\n\n"))}>
          {copiedAll ? "copied ✓" : "download all · copy"}
        </button>
      </div>

      <div className="rv panel mt-10 overflow-hidden" style={{ transitionDelay: "100ms" }}>
        {/* tab bar */}
        <div className="flex flex-wrap items-stretch border-b border-line bg-bg2">
          {PY_FILES.map((f) => {
            const on = f.id === active;
            return (
              <button
                key={f.id}
                onClick={() => setActive(f.id)}
                className={
                  "group relative flex flex-col justify-center gap-0.5 px-5 py-3 text-left transition-colors " +
                  (on ? "bg-panel" : "hover:bg-panel/60")
                }
              >
                <span
                  className={
                    "font-mono text-[12.5px] font-medium " + (on ? "text-grn" : "text-mut group-hover:text-ink")
                  }
                >
                  {f.name}
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-dim">{f.kind}</span>
                {on && <span className="absolute inset-x-0 top-0 h-[2px] bg-grn" />}
              </button>
            );
          })}
          <div className="ml-auto hidden items-center gap-4 pr-5 font-mono text-[10px] uppercase tracking-[0.16em] text-dim lg:flex">
            <span>{lineCount} lines</span>
            <span>{kb} kb</span>
            <span className="text-grn">python 3.11</span>
          </div>
        </div>

        {/* file meta + copy */}
        <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
          <span className="truncate font-mono text-[11px] text-dim">kestrel-bot/{file.name} — {file.summary}</span>
          <button
            onClick={() => copy(file.code)}
            className={
              "ml-4 shrink-0 border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-all " +
              (copied
                ? "border-grn/60 bg-grn/10 text-grn"
                : "border-line2 text-mut hover:border-grn hover:text-grn")
            }
          >
            {copied ? "✓ copied" : "copy file"}
          </button>
        </div>

        {/* code body */}
        <div className="scroll-slim max-h-[620px] overflow-auto bg-[#0d1311] font-mono text-[12.5px] text-ink/90">
          <CodeLines code={file.code} />
        </div>
      </div>
    </section>
  );
}
