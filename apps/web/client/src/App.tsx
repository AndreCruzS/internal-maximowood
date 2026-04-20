import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useLocalAuth } from "./contexts/AuthContext";
import AppLayout from "./components/AppLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Calculator from "./pages/Calculator";
import Inventory from "./pages/Inventory";
import Pricing from "./pages/Pricing";
import B2BCalculator from "./pages/B2BCalculator";
import NotFound from "./pages/NotFound";

function Router() {
  const { isAuthenticated, isLoading } = useLocalAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1A1A1A]">
        <div className="text-white text-sm tracking-widest uppercase">Carregando…</div>
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/maximo">
        <Redirect to="/maximo/calculator" />
      </Route>
      <Route path="/maximo/calculator">
        <AppLayout>
          <Calculator />
        </AppLayout>
      </Route>
      <Route path="/maximo/inventory">
        <AppLayout>
          <Inventory />
        </AppLayout>
      </Route>
      <Route path="/maximo/pricing">
        <AppLayout>
          <Pricing />
        </AppLayout>
      </Route>
      <Route path="/maximo/b2b">
        <AppLayout>
          <B2BCalculator />
        </AppLayout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
