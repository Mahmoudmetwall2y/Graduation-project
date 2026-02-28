'use client';

import { useState } from 'react';
import { MessageSquare, X, Send, Heart, Loader2 } from 'lucide-react';

export default function ChatBot() {
    const [isOpen, setIsOpen] = useState(false);

    const [messages, setMessages] = useState<Array<{ id: string, role: string, content: string }>>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const userMsg = { id: Date.now().toString(), role: 'user', content: inputValue };
        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [...messages, userMsg] })
            });

            if (!res.ok) throw new Error(res.statusText);

            // Simple handling (could parse streams if needed, but for simplicity we await completion here or parse chunks)
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let aiMsgContent = '';

            // Generate a temp ID for the AI message
            const aiMsgId = (Date.now() + 1).toString();
            setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '' }]);

            while (reader) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                // Vercel streaming format usually prefix strings with '0:'
                const cleanedChunk = chunk.replace(/^0:"(.*)"\n$/gm, '$1')
                    .replace(/\\n/g, '\n')
                    .replace(/"/g, '') // Basic clean if raw vercel format, but textStreamResponse handles it.

                aiMsgContent += chunk; // Note: for true textStreamResponse it returns chunks directly

                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: aiMsgContent.replace(/0:"/g, '').replace(/"/g, '').replace(/\\n/g, '\n') } : m
                ));
            }

        } catch (error) {
            console.error("Chat error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Floating Action Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 p-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-xl transition-all duration-300 hover:scale-105 z-50 flex items-center justify-center group"
                    aria-label="Open AscultiCor Assistant"
                >
                    <MessageSquare className="w-6 h-6" />
                    <span className="absolute -top-10 pr-2 right-0 w-32 text-xs font-semibold bg-gray-900 border border-gray-700 text-white px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        Ask AI Assistant
                    </span>
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 w-[350px] sm:w-[400px] h-[550px] max-h-[80vh] bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 animate-in slide-in-from-bottom-5">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-900/50 to-indigo-900/50 p-4 flex justify-between items-center border-b border-gray-800">
                        <div className="flex items-center space-x-2">
                            <div className="p-1.5 bg-blue-500/20 rounded-full">
                                <Heart className="w-5 h-5 text-blue-400" />
                            </div>
                            <h3 className="font-semibold text-gray-100">AscultiCor AI</h3>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900/50 scrollbar-thin scrollbar-thumb-gray-800">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-70">
                                <Heart className="w-12 h-12 text-blue-500/30" />
                                <p className="text-sm text-gray-400 max-w-[200px]">
                                    Hello! I am your clinical AI assistant. How can I help you analyze cardiac data today?
                                </p>
                            </div>
                        ) : (
                            messages.map((m: any) => (
                                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-none'
                                        : 'bg-gray-800 text-gray-200 border border-gray-700 rounded-bl-none'
                                        }`}>
                                        <span className="whitespace-pre-wrap leading-relaxed">{m.content}</span>
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Loading Indicator */}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-bl-none px-4 py-2.5">
                                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-gray-950 border-t border-gray-800">
                        <form onSubmit={handleSubmit} className="relative flex items-center">
                            <input
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-full px-4 py-3 pr-12 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 shadow-inner"
                                placeholder="Ask about cardiology..."
                                disabled={isLoading}
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !inputValue.trim()}
                                className="absolute right-2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors disabled:opacity-50 disabled:hover:bg-blue-600"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                        <p className="text-[10px] text-gray-500 mt-2 text-center">
                            AI-generated information for educational purposes only.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
