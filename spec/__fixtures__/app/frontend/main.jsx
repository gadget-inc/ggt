import { Provider } from "@gadgetinc/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { api } from "./api";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found for booting react app");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Provider api={api} auth={window.gadgetConfig.authentication}>
      <App />
    </Provider>
  </React.StrictMode>
);
