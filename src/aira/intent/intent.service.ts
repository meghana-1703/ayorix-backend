import { Injectable } from '@nestjs/common';

import {
  INTENT_KEYWORDS,
} from './intent.constants';

import {
  Intent,
  IntentResult,
} from './intent.types';

@Injectable()
export class IntentService {
  detect(
    message: string,
  ): IntentResult {
    const normalizedMessage =
      message
        .toLowerCase()
        .trim();

    if (!normalizedMessage) {
      return {
        intent:
          'GENERAL_QUESTION',
        confidence: 0.2,
      };
    }

    let bestIntent:
      Intent =
      'GENERAL_QUESTION';

    let bestScore = 0;

    for (
      const [
        intent,
        keywords,
      ] of Object.entries(
        INTENT_KEYWORDS,
      )
    ) {
      let score = 0;

      for (
        const keyword of keywords
      ) {
        const normalizedKeyword =
          keyword
            .toLowerCase()
            .trim();

        if (
          normalizedKeyword &&
          normalizedMessage.includes(
            normalizedKeyword,
          )
        ) {
          score++;
        }
      }

      if (
        score >
        bestScore
      ) {
        bestScore =
          score;

        bestIntent =
          intent as Intent;
      }
    }

    const confidence =
      bestScore === 0
        ? 0.2
        : Math.min(
            0.5 +
              bestScore *
                0.15,
            0.95,
          );

    return {
      intent:
        bestIntent,

      confidence,
    };
  }
}