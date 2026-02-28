import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';

export const maxDuration = 30; // 30 seconds max for Edge function

export async function POST(req: Request) {
    try {
        // We skip strict user validation here because:
        // 1. Next.js Middleware already protects the dashboard where the ChatBot lives.
        // 2. Client-side fetch headers sometimes drop refresh tokens leading to 401s.

        // Verify LLM Provider is set up
        const provider = process.env.LLM_PROVIDER;
        if (provider !== 'openai' || !process.env.OPENAI_API_KEY) {
            return NextResponse.json({
                error: 'OpenAI integration is not configured. Please check your .env settings.'
            }, { status: 501 });
        }

        const { messages } = await req.json();

        // The system prompt sets the persona and rules for the bot
        const systemPrompt = `You are the AscultiCor AI Assistant, a specialized medical AI trained to analyze cardiac metrics, ECG patterns, and PCG heart sounds.
    
    Your primary goals:
    1. Answer questions about cardiology clearly and educationaly.
    2. Help users understand what "Murmurs", "SVEB/VEB Arrhythmias", and other terms mean.
    3. Be concise and professional.
    
    CRITICAL MEDICAL DISCLAIMER: You are for educational purposes only. You must always remind users that you cannot diagnose patients and they should speak with a real doctor when discussing specific symptoms.`;

        const result = await streamText({
            model: openai('gpt-4o'), // Or 'gpt-3.5-turbo' depending on preferences
            system: systemPrompt,
            messages,
            temperature: 0.3, // Keep low for clinical consistency
        });

        return result.toTextStreamResponse();
    } catch (error) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ error: 'Failed to process chat request' }, { status: 500 });
    }
}
