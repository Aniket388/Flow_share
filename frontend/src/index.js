import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { Toaster } from "sonner";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
    <Toaster 
      position="top-right" 
      theme="dark" 
      richColors 
      toastOptions={{
        style: {
          background: '#1e293b',
          border: '1px solid #475569',
          color: '#f1f5f9',
        },
      }}
    />
  </React.StrictMode>,
);
