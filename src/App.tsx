import { useCallback, useState } from "react";
import Header from "./components/Header";
import Terminal from "./components/Terminal";
import Pipeline from "./components/Pipeline";
import CodeViewer from "./components/CodeViewer";
import TrainingLab from "./components/TrainingLab";
import ExecConsole from "./components/ExecConsole";
import Notes from "./components/Notes";
import Footer from "./components/Footer";
import { useRevealAll } from "./hooks";

export default function App() {
  const rootRef = useRevealAll<HTMLDivElement>();
  const [activeFile, setActiveFile] = useState("fetch");

  const openFile = useCallback((id: string) => {
    setActiveFile(id);
    requestAnimationFrame(() => {
      document.getElementById("code")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <div ref={rootRef} className="relative min-h-screen">
      <div className="ambient-grid" aria-hidden="true" />
      <div className="ambient-glow" aria-hidden="true" />
      <div className="ambient-grain" aria-hidden="true" />

      <Header />
      <main>
        <Terminal />
        <Pipeline onOpenFile={openFile} />
        <CodeViewer active={activeFile} setActive={setActiveFile} />
        <TrainingLab />
        <ExecConsole />
        <Notes />
      </main>
      <Footer />
    </div>
  );
}
