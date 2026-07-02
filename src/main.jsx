import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import NeuroDetectiveRDoC from "./NeuroDetectiveRDoC.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <NeuroDetectiveRDoC />
  </StrictMode>
);
