import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import User from './User.jsx'
import FileConverter from './FileConverter.jsx'
import CollabSession from "./CollabSession";
import YouTubeConverter from "./YouTubeConverter";
import ExpenseTracker from "./ExpenseTracker";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>

        {/* Main chat page */}
        <Route path="/"          element={<App />} />
        <Route path="/review"          element={<User />} />
        <Route path="/converter"          element={<FileConverter />} />
        <Route path="/collab/:sessionId" element={<CollabSession />} />
        <Route path="/youtube" element={<YouTubeConverter />} />
        <Route path="/expenses" element={<ExpenseTracker />} />

        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  </StrictMode>,
)