import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CreatorProfile from "@/pages/CreatorProfile";
import Chat from "@/pages/Chat";
import { BuyCreditsModal } from "@/components/billing/BuyCreditsModal";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* The creator profile IS the landing page / funnel entry point. */}
        <Route path="/" element={<CreatorProfile />} />
        <Route path="/:handle" element={<CreatorProfile />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/:handle/chat" element={<Chat />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Buy-credits modal (used from chat), available on every route */}
      <BuyCreditsModal />
    </BrowserRouter>
  );
}
