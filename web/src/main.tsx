import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource/instrument-serif";
import "@fontsource/instrument-serif/400-italic.css";
import "./styles.css";
import { SessionProvider, Toasts } from "./state";
import { AppLayout } from "./components/AppLayout";
import { Spinner } from "./components/ui";
import Auth from "./pages/Auth";

const Landing = lazy(() => import("./pages/Landing"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Studio = lazy(() => import("./pages/Studio"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Library = lazy(() => import("./pages/Library"));
const Autopilot = lazy(() => import("./pages/Autopilot"));
const Settings = lazy(() => import("./pages/Settings"));

const Wait = () => (
  <div className="grid min-h-[50vh] place-items-center">
    <Spinner />
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider>
      <BrowserRouter>
        <Suspense fallback={<Wait />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/signup" element={<Auth mode="signup" />} />
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="welcome" element={<Onboarding />} />
              <Route path="create" element={<Studio />} />
              <Route path="products" element={<Products />} />
              <Route path="posts/:id" element={<PostDetail />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="library" element={<Library />} />
              <Route path="autopilot" element={<Autopilot />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toasts />
      </BrowserRouter>
    </SessionProvider>
  </StrictMode>,
);
