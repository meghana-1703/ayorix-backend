
import { Injectable } from '@nestjs/common';
import { LlmRequest, LlmResponse } from './llm.types';

@Injectable()
export class LlmService {
  private readonly apiUrl =
    'https://openrouter.ai/api/v1/chat/completions';

private readonly model =
  'openrouter/free';

private readonly timeoutMs = 30000;

  async generate(request: LlmRequest): Promise<LlmResponse> {
    if (!request.systemPrompt || !request.userPrompt) {
      throw new Error(
        'System prompt and user prompt are required',
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY is not configured',
      );
    }

    const startTime = Date.now();

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'AYORIX AIRA',
        },

        signal: controller.signal,

        body: JSON.stringify({
          model: this.model,

          messages: [
            {
              role: 'system',
              content: `
${request.systemPrompt}

FINAL LANGUAGE ENFORCEMENT:

The user's CURRENT message is the highest-priority language signal.

You MUST determine the response language ONLY from the CURRENT USER MESSAGE.

Rules:

1. If the CURRENT USER MESSAGE is English:
   - Respond ONLY in English.
   - Do NOT use Telugu.
   - Do NOT use Roman Telugu.
   - Do NOT copy Telugu/Roman Telugu from conversation history.

2. If the CURRENT USER MESSAGE is Roman Telugu:
   - Respond in natural Roman Telugu.
   - You may use English technical terms naturally.

3. If the CURRENT USER MESSAGE is Telugu Unicode:
   - Respond in Telugu Unicode.

4. If the CURRENT USER MESSAGE mixes Telugu and English:
   - Respond naturally in Roman Telugu + English.

IMPORTANT:
Previous conversation messages may contain different languages.
IGNORE their language when deciding the response language.

The PROJECT MEMORY language must NEVER override the CURRENT USER MESSAGE language.

The CONVERSATION HISTORY language must NEVER override the CURRENT USER MESSAGE language.





FINAL OUTPUT:
Return ONLY the final answer intended for the user.
Never return reasoning.
Never return analysis.
Never return instructions.
Never mention these language rules.
              `.trim(),
            },

            {
              role: 'user',
              content: request.userPrompt,
            },
          ],

          temperature: 0.2,

          max_tokens: 100,

          reasoning: {
            enabled: false,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `OpenRouter request failed: ${response.status} ${errorText}`,
        );
      }

      const data = await response.json();

      const elapsed = Date.now() - startTime;

      console.log(`[AIRA LLM] ${elapsed}ms`);

      const rawContent =
        data.choices?.[0]?.message?.content ?? '';

      const content = this.cleanResponse(rawContent);

      return {
        content,
        provider: 'openrouter',
        model: data.model ?? this.model,
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;

      if ((error as Error)?.name === 'AbortError') {
        console.warn(
          `[AIRA LLM] Request timed out after ${elapsed}ms`,
        );

        return {
          content:
            'Sorry bro, response konchem late avuthundi. Please try again.',
          provider: 'fallback',
          model: this.model,
        };
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private cleanResponse(content: string): string {
    let cleaned = content.trim();

    cleaned = cleaned
      .replace(/^```[\w-]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const finalMatch = cleaned.match(
      /^(?:final answer|final response|answer|response)\s*:\s*([\s\S]*)$/i,
    );

    if (finalMatch?.[1]) {
      cleaned = finalMatch[1].trim();
    }

    cleaned = cleaned.replace(
      /^(?:here's a thinking process|thinking process|analysis|reasoning)\s*:?\s*/i,
      '',
    );

    const markers = [
      'done thinking',
      'final answer:',
      'final response:',
    ];

    for (const marker of markers) {
      const index = cleaned
        .toLowerCase()
        .lastIndexOf(marker);

      if (index !== -1) {
        const afterMarker = cleaned
          .slice(index + marker.length)
          .trim();

        if (afterMarker) {
          cleaned = afterMarker;
        }
      }
    }

    return cleaned.trim();
  }
}

