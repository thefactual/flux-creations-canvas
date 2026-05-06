import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalHeader } from "@/components/GlobalHeader";
import Home from "./pages/Home.tsx";
import Index from "./pages/Index.tsx";
import Generator from "./pages/Generator.tsx";
import Video from "./pages/Video.tsx";
import SpacesProjects from "./pages/SpacesProjects.tsx";
import MarketingStudio from "./pages/MarketingStudio.tsx";
import MarketingStudioProject from "./pages/MarketingStudioProject.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import { AuthProvider } from "@/hooks/useAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <GlobalHeader />
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/home" element={<Home />} />
          <Route path="/create" element={<Generator />} />
          <Route path="/create/:slug" element={<Generator />} />
          <Route path="/image" element={<Navigate to="/create" replace />} />
          <Route path="/generator" element={<Navigate to="/create" replace />} />
          <Route path="/video" element={<Video />} />
          <Route path="/spaces-projects" element={<SpacesProjects />} />
          <Route path="/spaces" element={<Index />} />
          <Route path="/marketingstudio" element={<MarketingStudio />} />
          <Route path="/marketingstudio/:slug" element={<MarketingStudioProject />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
