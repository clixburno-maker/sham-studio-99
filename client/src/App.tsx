import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import NewProject from "@/pages/new-project";
import WriteScript from "@/pages/write-script";
import ProjectView from "@/pages/project-view";
import NichesPage from "@/pages/niches";
import SavedScriptsPage from "@/pages/saved-scripts";
import VoiceoverPage from "@/pages/voiceover";
import { Film } from "lucide-react";
import { Link } from "wouter";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/new" component={NewProject} />
      <Route path="/write" component={WriteScript} />
      <Route path="/niches" component={NichesPage} />
      <Route path="/scripts" component={SavedScriptsPage} />
      <Route path="/voiceover" component={VoiceoverPage} />
      <Route path="/project/:id" component={ProjectView} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-50 navbar-glass">
              <div className="flex items-center justify-between gap-4 px-6 h-14">
                <Link href="/">
                  <div className="flex items-center gap-2.5 cursor-pointer group" data-testid="link-home">
                    <div className="w-8 h-8 rounded-xl gradient-btn flex items-center justify-center shadow-[0_0_20px_-3px_hsl(217_92%_58%/0.3)] group-hover:shadow-[0_0_28px_-3px_hsl(217_92%_58%/0.45)] transition-shadow duration-300">
                      <Film className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-sm tracking-tight gradient-text">Video Production - YT</span>
                  </div>
                </Link>
                <ThemeToggle />
              </div>
            </header>
            <main className="min-h-[calc(100vh-3.5rem)]">
              <Router />
            </main>
          </div>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
