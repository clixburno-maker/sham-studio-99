import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ChatProvider } from "@/lib/chat-context";
import { ChatSidebar, ChatToggleButton } from "@/components/chat-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import NewProject from "@/pages/new-project";
import WriteScript from "@/pages/write-script";
import ProjectView from "@/pages/project-view";
import NichesPage from "@/pages/niches";
import SavedScriptsPage from "@/pages/saved-scripts";
import VoiceoverPage from "@/pages/voiceover";
import { LayoutDashboard, PenTool, BookOpen, FileText, Mic, Plus, Sparkles } from "lucide-react";
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

const NAV_ITEMS = [
  { href: "/", label: "Projects", icon: LayoutDashboard, match: (p: string) => p === "/" || p.startsWith("/project/") || p === "/new" },
  { href: "/write", label: "Script Writer", icon: PenTool, match: (p: string) => p === "/write" },
  { href: "/niches", label: "Niches", icon: BookOpen, match: (p: string) => p === "/niches" },
  { href: "/scripts", label: "Scripts", icon: FileText, match: (p: string) => p === "/scripts" },
  { href: "/voiceover", label: "Voiceover", icon: Mic, match: (p: string) => p === "/voiceover" },
];

function App() {
  const [location] = useLocation();
  const isProjectRoute = location.startsWith("/project/");

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ChatProvider>
            <div className="min-h-screen bg-[#07090d]">
              {!isProjectRoute && (
                <aside className="fixed left-0 top-0 bottom-0 w-[260px] z-40 flex flex-col sidebar-premium">
                  <div className="px-6 pt-7 pb-2">
                    <Link href="/">
                      <div className="flex items-center gap-3 cursor-pointer mb-10 group">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow duration-300">
                          <Sparkles className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-[15px] tracking-tight bg-gradient-to-r from-white via-blue-100 to-blue-200 bg-clip-text text-transparent">Sham</span>
                          <span className="text-[10px] text-white/30 font-medium tracking-widest uppercase">Studio</span>
                        </div>
                      </div>
                    </Link>

                    <Link href="/new">
                      <button className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl text-sm font-semibold px-4 py-3 mb-8 new-project-btn transition-all duration-300">
                        <Plus className="w-4 h-4" />
                        New Project
                      </button>
                    </Link>
                  </div>

                  <nav className="flex-1 px-3 space-y-0.5">
                    {NAV_ITEMS.map(item => {
                      const active = item.match(location);
                      return (
                        <Link key={item.href} href={item.href}>
                          <button className={`w-full inline-flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                            active
                              ? "nav-item-active text-white"
                              : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                          }`}>
                            <item.icon className="w-[18px] h-[18px]" />
                            <span>{item.label}</span>
                          </button>
                        </Link>
                      );
                    })}
                  </nav>

                  <div className="px-6 py-5">
                    <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />
                    <p className="text-[10px] text-white/20 tracking-wider uppercase">Sham v1.0</p>
                  </div>
                </aside>
              )}

              <main className={isProjectRoute ? "min-h-screen" : "min-h-screen ml-[260px]"}>
                <Router />
              </main>

              <ChatSidebar />
              <ChatToggleButton />
            </div>
            <Toaster />
          </ChatProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
