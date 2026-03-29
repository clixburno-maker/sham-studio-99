import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrls?: string[];
  actions?: AssistantAction[];
  actionsExecuted?: boolean;
  timestamp: number;
}

export interface AssistantAction {
  type: string;
  description: string;
  params: Record<string, any>;
}

interface ChatContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  messages: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  clearMessages: () => void;
  markActionsExecuted: (messageId: string) => void;
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  focusedSceneId: string | null;
  setFocusedSceneId: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    setMessages(prev => [...prev, {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }]);
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const markActionsExecuted = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, actionsExecuted: true } : m
    ));
  }, []);

  return (
    <ChatContext.Provider value={{
      isOpen, setIsOpen,
      messages, addMessage, clearMessages, markActionsExecuted,
      projectId, setProjectId,
      focusedSceneId, setFocusedSceneId,
      isLoading, setIsLoading,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
