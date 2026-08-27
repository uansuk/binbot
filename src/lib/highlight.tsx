import type { ReactNode } from "react";

/* Lightweight Python tokenizer for display purposes. */

const KEYWORDS = new Set([
  "def", "class", "return", "if", "elif", "else", "for", "while", "in", "not",
  "and", "or", "import", "from", "as", "with", "try", "except", "finally",
  "raise", "pass", "break", "continue", "lambda", "yield", "global",
  "nonlocal", "assert", "del", "is", "None", "True", "False", "async", "await",
  "self", "cls",
]);

const BUILTINS = new Set([
  "print", "len", "range", "int", "float", "str", "list", "dict", "set",
  "tuple", "abs", "max", "min", "sum", "enumerate", "zip", "type",
  "isinstance", "super", "np", "pd", "os", "sys", "time", "gym", "spaces",
  "PPO", "Path", "datetime", "timezone", "logging", "signal", "argparse",
  "torch", "ccxt", "field",
]);

interface Tok {
  text: string;
  cls: string;
}

const LINE_RE =
  /(#.*$)|("""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(@[\w.]+)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g;

function tokenizeLine(line: string, forceString: boolean): Tok[] {
  if (forceString) return [{ text: line, cls: "tk-s" }];
  const toks: Tok[] = [];
  LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let lastIdent = -1;
  const raw: { text: string; kind: string }[] = [];

  while ((m = LINE_RE.exec(line)) !== null) {
    if (m[1] !== undefined) raw.push({ text: m[1], kind: "c" });
    else if (m[2] !== undefined) raw.push({ text: m[2], kind: "s" });
    else if (m[3] !== undefined) raw.push({ text: m[3], kind: "d" });
    else if (m[4] !== undefined) raw.push({ text: m[4], kind: "n" });
    else if (m[5] !== undefined) raw.push({ text: m[5], kind: "i" });
    else raw.push({ text: m[0], kind: "w" });
  }

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (r.kind === "i") {
      lastIdent = i;
      // lookahead: identifier followed by "(" → function call
      let j = i + 1;
      while (j < raw.length && raw[j].kind === "w" && /^\s+$/.test(raw[j].text)) j++;
      const isCall = j < raw.length && raw[j].kind === "w" && raw[j].text === "(";
      let cls = "tk-f";
      if (KEYWORDS.has(r.text)) cls = "tk-k";
      else if (isCall) cls = "tk-b";
      else if (BUILTINS.has(r.text)) cls = "tk-b";
      else if (/^[A-Z]/.test(r.text)) cls = "tk-n";
      toks.push({ text: r.text, cls });
    } else if (r.kind === "c") toks.push({ text: r.text, cls: "tk-c" });
    else if (r.kind === "s") toks.push({ text: r.text, cls: "tk-s" });
    else if (r.kind === "d") toks.push({ text: r.text, cls: "tk-d" });
    else if (r.kind === "n") toks.push({ text: r.text, cls: "tk-n" });
    else toks.push({ text: r.text, cls: "" });
  }
  void lastIdent;
  return toks;
}

/** Highlight a whole file, tracking multi-line """ docstrings across lines. */
export function highlightPython(code: string): Tok[][] {
  const lines = code.replace(/\t/g, "    ").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  let inDoc = false;
  return lines.map((line) => {
    if (inDoc) {
      const closeIdx = line.indexOf('"""');
      if (closeIdx !== -1) {
        inDoc = (line.match(/"""/g)?.length ?? 0) % 2 === 1;
      }
      return [{ text: line, cls: "tk-s" }];
    }
    const opens = (line.match(/"""/g)?.length ?? 0);
    if (opens % 2 === 1) {
      inDoc = true;
      const idx = line.indexOf('"""');
      const before = tokenizeLine(line.slice(0, idx), false);
      return [...before, { text: line.slice(idx), cls: "tk-s" }];
    }
    return tokenizeLine(line, false);
  });
}

export function CodeLines({ code }: { code: string }): ReactNode {
  const lines = highlightPython(code);
  return (
    <>
      {lines.map((toks, i) => (
        <div key={i} className="flex hover:bg-grn/[0.03]">
          <span className="w-11 shrink-0 select-none pr-4 text-right text-[11px] leading-[1.62rem] text-dim/70">
            {i + 1}
          </span>
          <span className="whitespace-pre pr-6 leading-[1.62rem]">
            {toks.map((t, j) =>
              t.cls ? (
                <span key={j} className={t.cls}>
                  {t.text}
                </span>
              ) : (
                <span key={j}>{t.text}</span>
              )
            )}
            {toks.length === 0 ? "\u00A0" : null}
          </span>
        </div>
      ))}
    </>
  );
}
