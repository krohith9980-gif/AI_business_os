import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the API only if the key is available on the server
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function POST(req: NextRequest) {
  try {
    if (!genAI) {
      return NextResponse.json(
        { error: 'AI Explain API is not configured (GEMINI_API_KEY missing)' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { facts } = body;

    if (!facts || typeof facts !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid facts object' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
System Instruction:
You are the AI purchasing explainer for VyaparOS, a fertilizer and agricultural store management system. 
Explain the provided purchasing intelligence using ONLY the supplied deterministic facts. 
Do not invent, modify, recalculate, estimate, substitute, or round any numerical value.
Do not create a purchasing recommendation. The deterministic engine has already calculated the recommendation.
Your job is simply to read the facts and output a concise, 2-to-3 sentence explanation of "Why this recommendation?".
Do not use markdown formatting (like **bold**). Keep it simple text.

Provided Facts:
${JSON.stringify(facts, null, 2)}

Output the explanation:`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    return NextResponse.json({ explanation: responseText.trim() });
  } catch (error: unknown) {
    console.error('Error generating AI explanation:', error);
    return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 });
  }
}
