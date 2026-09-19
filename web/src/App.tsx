import { Navigate, Route, Routes } from "react-router-dom";
import LauncherPage from "./pages/LauncherPage";
import LiveRunPage from "./pages/LiveRunPage";
import ResultPage from "./pages/ResultPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LauncherPage />} />
      <Route path="/run/:runId" element={<LiveRunPage />} />
      <Route path="/run/:runId/result" element={<ResultPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
