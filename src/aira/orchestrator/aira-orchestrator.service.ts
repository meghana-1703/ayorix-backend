import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { IntentService } from '../intent/intent.service';
import { DecisionService } from '../decision/decision.service';
import { PromptService } from '../prompt/prompt.service';
import { LlmService } from '../llm/llm.service';
import { ProposalService } from '../proposal/proposal.service';
import { PricingService } from '../pricing/pricing.service';
import { TimelineService } from '../timeline/timeline.service';
import { MemoryService } from '../memory/memory.service';
import { WorkflowService } from '../workflow/workflow.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class AiraOrchestratorService {
  constructor(
    private readonly intentService: IntentService,
    private readonly decisionService: DecisionService,
    private readonly promptService: PromptService,
    private readonly llmService: LlmService,
    private readonly proposalService: ProposalService,
    private readonly pricingService: PricingService,
    private readonly timelineService: TimelineService,
    private readonly memoryService: MemoryService,
    private readonly workflowService: WorkflowService,
    private readonly emailService: EmailService,
  ) {}

  async process(input: {
    conversationId?: string;
    clientId?: string;
    message: string;
    client?: any;
    project?: any;
    conversationHistory?: any[];
  }) {
    let client = input.client;
    let project = input.project;

    let history =
      input.conversationHistory ?? [];

    const message =
      input.message?.trim() ?? '';

    if (!message) {
      return this.finalResponse(
        input,
        'Tell me what you have in mind.',
        {
          intent: 'GENERAL',
          confidence: 1,
        },
        {
          type: 'GENERAL',
        },
        project,
        client,
      );
    }

    /*
    ============================================================
    1. LOAD MEMORY
    ============================================================
    */

    if (input.conversationId) {
      if (!input.clientId) {
        throw new BadRequestException(
          'Client ID is required',
        );
      }

      const conversation =
        await this.memoryService.getConversationForClient(
          input.conversationId,
          input.clientId,
        );

      if (!conversation) {
        throw new NotFoundException(
          'Conversation not found',
        );
      }

      project =
        conversation.project;

      history =
        conversation.messages ?? [];

      client =
        await this.memoryService.getClient(
          conversation.clientId,
        );
    }

    /*
    ============================================================
    2. LANGUAGE
    ============================================================
    */

    const language =
      this.detectResponseLanguage(message);

    /*
    ============================================================
    3. INTENT
    ============================================================
    */

    const intent =
      this.intentService.detect(message);

    /*
    ============================================================
    4. SAVE USER MESSAGE
    ============================================================
    */

    if (input.conversationId) {
      await this.memoryService.saveMessage(
        input.conversationId,
        {
          role: 'user',
          content: message,
          intent: intent.intent,
          confidence: intent.confidence,
        },
      );
    }

    /*
    ============================================================
    5. EXTRACT CLIENT DATA
    ============================================================
    */

    if (input.clientId) {
      const name =
        this.extractClientName(message);

      if (name) {
        client =
          await this.memoryService.updateClient(
            input.clientId,
            {
              name,
            },
          );
      }

      const email =
        this.extractEmail(message);

      if (email) {
        client =
          await this.memoryService.updateClient(
            input.clientId,
            {
              email,
            },
          );
      }

      const phone =
        this.extractPhoneNumber(message);

      if (phone) {
        client =
          await this.memoryService.updateClient(
            input.clientId,
            {
              phone,
            },
          );
      }
    }

    /*
    ============================================================
    6. UNDERSTAND + EXTRACT PROJECT DATA
    ============================================================
    */

    const understanding =
      this.buildUnderstanding(
        message,
        project,
      );

    if (
      input.conversationId &&
      project?.id &&
      Object.keys(understanding).length > 0
    ) {
      project =
        await this.memoryService.updateProject(
          project.id,
          understanding,
        );
    }

    /*
    ============================================================
    7. REFRESH PROJECT MEMORY
    ============================================================
    */

    if (
      input.conversationId &&
      project?.id
    ) {
      const refreshed =
        await this.memoryService.getConversationForClient(
          input.conversationId,
          input.clientId!,
        );

      if (refreshed?.project) {
        project =
          refreshed.project;
      }
    }

    /*
    ============================================================
    8. DECISION
    ============================================================
    */

    const decision =
      this.decisionService.decide(
        intent.intent,
      );

    /*
    ============================================================
    9. CALCULATE PRICE / TIMELINE
    ============================================================
    */

    let pricing: any =
      undefined;

    let timeline: any =
      undefined;

    if (
      this.hasEnoughForEstimate(
        project,
      )
    ) {
      pricing =
        this.pricingService.calculate({
          projectType:
            project.projectType,

          features:
            this.toList(
              project.features,
            ),

          seo:
            project.seo,

          complexity:
            project.complexity,
        });

      timeline =
        this.timelineService.calculate({
          projectType:
            project.projectType,

          features:
            this.toList(
              project.features,
            ),

          seo:
            project.seo,

          complexity:
            project.complexity,
        });

      if (
        input.conversationId &&
        project?.id
      ) {
        const updateData: any = {};

        if (!project.budget) {
          updateData.budget =
            `${pricing.currency} ${pricing.estimatedPrice}`;
        }

        if (!project.timeline) {
          updateData.timeline =
            `${timeline.estimatedDays} days`;
        }

        if (
          Object.keys(updateData).length > 0
        ) {
          project =
            await this.memoryService.updateProject(
              project.id,
              updateData,
            );
        }
      }
    }

    /*
    ============================================================
    10. WORKFLOW STATE ONLY
    ============================================================

    Workflow is used for STATE.
    It does NOT control the conversation.
    */

    let workflow =
      this.workflowService.determine({
        project,
        client,
      });

    /*
    ============================================================
    11. GREETING
    ============================================================
    */

    if (
      this.isGreeting(message)
    ) {
      const response =
        await this.generateNaturalResponse({
          message,
          project,
          client,
          history,
          intent,
          decision,
          language,
          instruction: `
The user greeted AIRA.

Reply warmly and naturally.
Do not start a questionnaire.
Do not ask a generic list of questions.
If there is an existing project, acknowledge that naturally.
If there is no project, invite the user to tell you what they have in mind.

Keep it short and conversational.
`,
        });

      return this.finalResponse(
        input,
        response,
        intent,
        decision,
        project,
        client,
        pricing,
        timeline,
        workflow,
      );
    }

    /*
    ============================================================
    12. THANKS
    ============================================================
    */

    if (
      this.isThanks(message)
    ) {
      const response =
        await this.generateNaturalResponse({
          message,
          project,
          client,
          history,
          intent,
          decision,
          language,
          instruction: `
The user thanked AIRA.

Reply naturally and briefly.
Do not restart discovery.
Do not ask another project question.
`,
        });

      return this.finalResponse(
        input,
        response,
        intent,
        decision,
        project,
        client,
        pricing,
        timeline,
        workflow,
      );
    }

    /*
    ============================================================
    13. PROPOSAL DECLINE
    ============================================================
    */

    if (
      this.isProposalDecline(
        message,
        history,
      )
    ) {
      const response =
        await this.generateNaturalResponse({
          message,
          project,
          client,
          history,
          intent,
          decision,
          language,
          instruction: `
The user declined the proposal.

Respond politely.
Do not ask another discovery question.
Do not restart the project conversation.
Keep it short.
`,
        });

      return this.finalResponse(
        input,
        response,
        intent,
        decision,
        project,
        client,
        pricing,
        timeline,
        workflow,
      );
    }

    /*
    ============================================================
    14. PROPOSAL CONFIRMATION
    ============================================================
    */

    if (
      this.isProposalConfirmation(
        message,
        history,
      )
    ) {
      /*
      EMAIL NOT AVAILABLE
      */

      if (!client?.email) {
        const response =
          await this.generateNaturalResponse({
            message,
            project,
            client,
            history,
            intent,
            decision,
            language,
            instruction: `
The user confirmed that they want the proposal.

Ask only for the email address where the proposal
should be sent.

Do not ask anything else.
`,
          });

        return this.finalResponse(
          input,
          response,
          intent,
          decision,
          project,
          client,
          pricing,
          timeline,
          workflow,
        );
      }

      /*
      SEND PROPOSAL
      */

      if (
        project?.id &&
        pricing &&
        timeline &&
        client.email
      ) {
        const proposal =
          this.proposalService.generate({
            client,
            project: {
              ...project,

              timeline:
                project.timeline ??
                `${timeline.estimatedDays} days`,

              budget:
                project.budget ??
                `${pricing.currency} ${pricing.estimatedPrice}`,
            },
          });

        await this.emailService.sendProposalEmail({
          to: client.email,
          clientName:
            client.name,
          proposal,
        });

        project =
          await this.memoryService.updateProject(
            project.id,
            {
              status: 'COMPLETE',
            },
          );

        const response =
          await this.generateNaturalResponse({
            message,
            project,
            client,
            history,
            intent,
            decision,
            language,
            instruction: `
The proposal has successfully been sent to
${client.email}.

Confirm that naturally.
Do not ask another question.
`,
          });

        return this.finalResponse(
          input,
          response,
          intent,
          decision,
          project,
          client,
          pricing,
          timeline,
          workflow,
          proposal,
        );
      }
    }

    /*
    ============================================================
    15. EMAIL AFTER PROPOSAL CONFIRMATION
    ============================================================
    */

    const suppliedEmail =
      this.extractEmail(message);

    if (
      suppliedEmail &&
      this.isWaitingForEmail(history)
    ) {
      if (input.clientId) {
        client =
          await this.memoryService.updateClient(
            input.clientId,
            {
              email: suppliedEmail,
            },
          );
      }

      if (
        project?.id &&
        pricing &&
        timeline &&
        client?.email
      ) {
        const proposal =
          this.proposalService.generate({
            client,
            project: {
              ...project,

              timeline:
                project.timeline ??
                `${timeline.estimatedDays} days`,

              budget:
                project.budget ??
                `${pricing.currency} ${pricing.estimatedPrice}`,
            },
          });

        await this.emailService.sendProposalEmail({
          to: client.email,
          clientName:
            client.name,
          proposal,
        });

        project =
          await this.memoryService.updateProject(
            project.id,
            {
              status: 'COMPLETE',
            },
          );

        const response =
          await this.generateNaturalResponse({
            message,
            project,
            client,
            history,
            intent,
            decision,
            language,
            instruction: `
The proposal was successfully sent to
${client.email}.

Confirm this naturally and briefly.
Do not ask another question.
`,
          });

        return this.finalResponse(
          input,
          response,
          intent,
          decision,
          project,
          client,
          pricing,
          timeline,
          workflow,
          proposal,
        );
      }
    }

    /*
    ============================================================
    16. NORMAL CONVERSATION
    ============================================================

    THIS IS THE IMPORTANT PART.

    No questionnaire.
    No fixed next question.
    No options.
    No forced discovery field.
    */

    const response =
      await this.generateNaturalResponse({
        message,
        project,
        client,
        history,
        intent,
        decision,
        language,
        pricing,
        timeline,
        instruction: `
You are AIRA, the friendly project consultant for AYORIX.

Have a real conversation with the user.

IMPORTANT:

- Do NOT behave like a questionnaire.
- Do NOT ask a fixed sequence of questions.
- Do NOT mention project fields.
- Do NOT mention workflow.
- Do NOT mention extraction.
- Do NOT mention backend logic.
- Do NOT ask several questions at once.
- Do NOT ask for budget.
- Do NOT repeat information the user already gave.
- Understand the user's latest message first.
- Answer their actual question if they asked one.
- If they shared project information, acknowledge it naturally.
- If they ask for an opinion, recommendation or explanation, provide it.
- If something genuinely important is missing, ask naturally for it only when necessary.
- Let the conversation develop naturally.
- The user may provide multiple requirements in one message.
- Remember everything already stored in the project.
- Never behave as if this is a form.
- Never use robotic phrases such as "Next question", "Please select one", or "Let's move to the next field".
- Keep the response concise.
- Use simple natural English when the user speaks English.
- Mirror Roman Telugu / Telugu-English when the user uses it.
- Never randomly switch language.
- Be friendly, professional and human.
`,
      });

    return this.finalResponse(
      input,
      response,
      intent,
      decision,
      project,
      client,
      pricing,
      timeline,
      workflow,
    );
  }

  /*
  ============================================================
  UNDERSTANDING / EXTRACTION
  ============================================================
  */

  private buildUnderstanding(
    message: string,
    project?: any,
  ): Record<string, any> {
    const lower =
      message
        .toLowerCase()
        .trim();

    const data: Record<string, any> = {};

    /*
    PROJECT TYPE
    */

    if (
      lower.includes('ecommerce') ||
      lower.includes('e-commerce') ||
      lower.includes('online store') ||
      lower.includes('online shop')
    ) {
      data.projectType =
        'E-commerce Website';
    } else if (
      lower.includes('web application') ||
      lower.includes('web app')
    ) {
      data.projectType =
        'Web Application';
    } else if (
      lower.includes('portfolio')
    ) {
      data.projectType =
        'Portfolio Website';
    } else if (
      lower.includes('website') ||
      lower.includes('web site')
    ) {
      if (!project?.projectType) {
        data.projectType =
          'Business Website';
      }
    }

    /*
    INDUSTRY
    */

    if (
      lower.includes('restaurant') ||
      lower.includes('food') ||
      lower.includes('cafe') ||
      lower.includes('hotel')
    ) {
      data.industry =
        'Restaurant / Food';
    } else if (
      lower.includes('software') ||
      lower.includes('technology') ||
      lower.includes('tech company')
    ) {
      data.industry =
        'Software / Technology';
    } else if (
      lower.includes('school') ||
      lower.includes('college') ||
      lower.includes('education')
    ) {
      data.industry =
        'Education';
    } else if (
      lower.includes('hospital') ||
      lower.includes('clinic') ||
      lower.includes('healthcare')
    ) {
      data.industry =
        'Healthcare';
    } else if (
      lower.includes('real estate') ||
      lower.includes('property')
    ) {
      data.industry =
        'Real Estate';
    } else if (
      lower.includes('salon') ||
      lower.includes('beauty') ||
      lower.includes('spa')
    ) {
      data.industry =
        'Beauty / Salon';
    }

    /*
    GOAL
    */

    if (
      lower.includes('more customers') ||
      lower.includes('more clients') ||
      lower.includes('increase customers') ||
      lower.includes('increase sales')
    ) {
      data.goal =
        'Generate leads and attract more customers';
    } else if (
      lower.includes('generate leads') ||
      lower.includes('more leads')
    ) {
      data.goal =
        'Generate leads';
    } else if (
      lower.includes('sell products') ||
      lower.includes('sell online')
    ) {
      data.goal =
        'Sell products online';
    } else if (
      lower.includes('brand presence') ||
      lower.includes('branding')
    ) {
      data.goal =
        'Build brand presence';
    }

    /*
    AUDIENCE
    */

    if (
      lower.includes('local customer') ||
      lower.includes('local customers')
    ) {
      data.audience =
        'Local customers';
    } else if (
      lower.includes('small business') ||
      lower.includes('small businesses')
    ) {
      data.audience =
        'Small businesses';
    } else if (
      lower.includes('startup') ||
      lower.includes('startups')
    ) {
      data.audience =
        'Startups';
    } else if (
      lower.includes('student') ||
      lower.includes('students')
    ) {
      data.audience =
        'Students';
    } else if (
      lower.includes('professional') ||
      lower.includes('professionals')
    ) {
      data.audience =
        'Professionals';
    }

    /*
    FEATURES
    */

    const features =
      this.extractFeatures(message);

    if (features.length > 0) {
      const existing =
        this.toList(
          project?.features,
        );

      data.features = [
        ...new Set([
          ...existing,
          ...features,
        ]),
      ];
    }

    /*
    TECHNOLOGY
    */

    const technology =
      this.extractTechnology(message);

    if (technology) {
      data.technology =
        technology;
    }

    /*
    SEO
    */

    const seo =
      this.extractSeo(message);

    if (seo) {
      data.seo = seo;
    }

    /*
    TIMELINE
    */

    const timeline =
      this.extractTimeline(message);

    if (timeline) {
      data.timeline =
        timeline;
    }

    /*
    COMPLEXITY
    */

    const complexity =
      this.extractComplexity(message);

    if (complexity) {
      data.complexity =
        complexity;
    }

    return data;
  }

  /*
  ============================================================
  ESTIMATE CHECK
  ============================================================
  */

  private hasEnoughForEstimate(
    project: any,
  ): boolean {
    return Boolean(
      project?.projectType &&
      project?.industry &&
      project?.goal &&
      project?.features &&
      this.toList(
        project.features,
      ).length > 0 &&
      project?.technology &&
      project?.seo,
    );
  }

  /*
  ============================================================
  NATURAL LLM RESPONSE
  ============================================================
  */

 private async generateNaturalResponse(
  params: {
    message: string;
    project: any;
    client: any;
    history: any[];
    intent: any;
    decision: any;
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other';
    pricing?: any;
    timeline?: any;
    instruction: string;
  },
): Promise<string> {

  const systemPrompt = `
You are AIRA, the friendly AI project consultant for AYORIX Digital Solutions.

YOUR ROLE:
You are a helpful human-like conversational assistant.
You help users understand website development, design, technology, SEO, features, pricing, timelines, and AYORIX services.

MOST IMPORTANT RULE:
You are NOT a questionnaire.
You are NOT a form.
You are NOT a scripted discovery bot.

Have a natural conversation.

CONVERSATION RULES:
- Always understand the user's latest message first.
- Answer the user's actual question before anything else.
- If the user asks a normal/general question, answer it normally.
- If the user asks about AYORIX, explain AYORIX clearly.
- If the user asks what you can do, explain what AIRA/AYORIX can do.
- If the user gives project requirements, acknowledge and use them.
- Never repeat information the user has already provided.
- Never restart the discovery process.
- Never behave as if every message requires another project question.
- Never force the user through predefined fields.
- Never mention workflow stages.
- Never mention project fields.
- Never mention extraction, backend logic, database, intent detection, or internal systems.
- Never ask multiple questions in one response.
- Never ask for budget.
- Only ask a question when it is genuinely useful for continuing the conversation.
- If enough information is available, do not ask another unnecessary question.
- If the user changes the topic, follow the new topic naturally.
- If the user says hello/hey, respond naturally. Do not restart discovery.
- If the user says thanks, respond naturally. Do not ask another question.
- If the user asks for an explanation, explain it simply.
- If the user asks for an opinion, give a useful opinion.
- If the user asks for a recommendation, recommend something practical.
- If the user asks something unrelated to the project, answer it normally when possible.

PROJECT CONTEXT:
The project information below is memory/context only.
Use it to understand the user.
Do NOT turn the conversation into a checklist just because some information is missing.

LANGUAGE:
- English input -> respond in simple natural English.
- Roman Telugu or Telugu-English input -> respond naturally in Roman Telugu + English.
- Telugu script input -> respond in Telugu script.
- Never randomly switch languages.

STYLE:
- Friendly
- Professional
- Simple
- Concise
- Natural
- Human

NEVER USE:
"Next question"
"Let's move to the next field"
"Please select one"
"Choose an option"
"Fill in the following"
"What is your budget?"
"Tell me the remaining requirements"

Do not sound like a questionnaire.

IMPORTANT:
The user may provide several requirements in one message.
Understand all of them.
Do not ask for information that is already present.
Do not repeat the same question simply because another project field is empty.

${params.instruction}
`;

  const userPrompt = `
USER MESSAGE:
${params.message}

CURRENT PROJECT MEMORY:
${JSON.stringify(
  params.project ?? {},
  null,
  2,
)}

CURRENT CLIENT MEMORY:
${JSON.stringify(
  params.client ?? {},
  null,
  2,
)}

CURRENT INTENT:
${JSON.stringify(
  params.intent ?? {},
  null,
  2,
)}

DECISION CONTEXT:
${JSON.stringify(
  params.decision ?? {},
  null,
  2,
)}

PRICING CONTEXT:
${JSON.stringify(
  params.pricing ?? null,
  null,
  2,
)}

TIMELINE CONTEXT:
${JSON.stringify(
  params.timeline ?? null,
  null,
  2,
)}

RECENT CONVERSATION:
${JSON.stringify(
  params.history.slice(-12),
  null,
  2,
)}

Now respond ONLY to the user's latest message.

Do not restart discovery.
Do not create a questionnaire.
Do not ask unnecessary questions.
Answer naturally and directly.
`;

  try {
    const llm =
      await this.llmService.generate({
        systemPrompt,
        userPrompt,
      });

    const content =
      llm.content?.trim();

    if (content) {
      return content;
    }
  } catch {
    // fallback below
  }

  return this.fallbackResponse(
    params.language,
  );
}
  /*
  ============================================================
  FINAL RESPONSE
  ============================================================
  */

  private async finalResponse(
    input: {
      conversationId?: string;
    },
    message: string,
    intent: any,
    decision: any,
    project?: any,
    client?: any,
    pricing?: any,
    timeline?: any,
    workflow?: any,
    proposal?: any,
  ) {
    const finalMessage =
      message?.trim() ||
      'Tell me what you have in mind.';

    if (input.conversationId) {
      await this.memoryService.saveMessage(
        input.conversationId,
        {
          role: 'assistant',
          content: finalMessage,
          intent:
            intent?.intent,
          confidence:
            intent?.confidence,
        },
      );
    }

    return {
      message: finalMessage,

      /*
      IMPORTANT:
      No questionnaire options.
      */

      options: [],

      intent,
      decision,

      workflow:
        workflow ?? {
          currentStage:
            project?.status ??
            'DISCOVERY',

          shouldAskQuestion:
            false,
        },

      pricing,
      timeline,
      proposal,

      llm: {
        provider: 'openrouter',
        model: 'aira-natural',
      },
    };
  }

  /*
  ============================================================
  HELPERS
  ============================================================
  */

  private isGreeting(
    message: string,
  ): boolean {
    return /^(hi|hii|hello|hey|helo|good morning|good afternoon|good evening|good night)$/i.test(
      message.trim(),
    );
  }

  private isThanks(
    message: string,
  ): boolean {
    return [
      'thanks',
      'thank you',
      'thankyou',
      'thx',
      'thanks a lot',
      'thank you so much',
    ].includes(
      message
        .toLowerCase()
        .trim(),
    );
  }

  private isProposalConfirmation(
    message: string,
    history: any[],
  ): boolean {
    if (
      !this.isWaitingForProposalDecision(
        history,
      )
    ) {
      return false;
    }

    const text =
      message
        .toLowerCase()
        .trim();

    return [
      'yes',
      'yeah',
      'yep',
      'sure',
      'okay',
      'ok',
      'send it',
      'send proposal',
      'send the proposal',
      'go ahead',
      'yes please',
      'send',
      'avunu',
      'sare',
      'pampu',
      'pampandi',
    ].includes(text);
  }

  private isProposalDecline(
    message: string,
    history: any[],
  ): boolean {
    if (
      !this.isWaitingForProposalDecision(
        history,
      )
    ) {
      return false;
    }

    const text =
      message
        .toLowerCase()
        .trim();

    return [
      'no',
      'no thanks',
      'not now',
      'no, not now',
      'maybe later',
      'dont send',
      "don't send",
      'do not send',
      'vaddu',
      'ippudu vaddu',
    ].includes(text);
  }

  private isWaitingForProposalDecision(
    history: any[],
  ): boolean {
    return (
      history ?? []
    )
      .filter(
        (item) =>
          item.role ===
          'assistant',
      )
      .slice(-5)
      .some(
        (item) => {
          const text =
            item.content
              ?.toLowerCase() ?? '';

          return (
            text.includes(
              'proposal',
            ) &&
            (
              text.includes(
                'send',
              ) ||
              text.includes(
                'sent',
              )
            ) &&
            text.includes('?')
          );
        },
      );
  }

  private isWaitingForEmail(
    history: any[],
  ): boolean {
    return (
      history ?? []
    )
      .filter(
        (item) =>
          item.role ===
          'assistant',
      )
      .slice(-5)
      .some(
        (item) => {
          const text =
            item.content
              ?.toLowerCase() ?? '';

          return (
            text.includes(
              'email',
            ) &&
            text.includes(
              'proposal',
            )
          );
        },
      );
  }

  private extractEmail(
    message: string,
  ): string | undefined {
    const match =
      message.match(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      );

    return match?.[0];
  }

  private extractPhoneNumber(
    message: string,
  ): string | undefined {
    const match =
      message.match(
        /(?:\+91[\s-]?)?[6-9]\d{9}/,
      );

    if (!match) {
      return undefined;
    }

    return match[0]
      .replace(/\D/g, '')
      .replace(
        /^91(?=\d{10}$)/,
        '',
      );
  }

  private extractClientName(
    message: string,
  ): string | undefined {
    const patterns = [
      /my name is\s+([a-zA-Z][a-zA-Z\s]{1,40})(?:[.!?,]|$)/i,
      /i am\s+([a-zA-Z][a-zA-Z\s]{1,40})(?:[.!?,]|$)/i,
      /i'm\s+([a-zA-Z][a-zA-Z\s]{1,40})(?:[.!?,]|$)/i,
      /this is\s+([a-zA-Z][a-zA-Z\s]{1,40})(?:[.!?,]|$)/i,
    ];

    for (
      const pattern of patterns
    ) {
      const match =
        message.match(pattern);

      if (match?.[1]) {
        return match[1]
          .trim();
      }
    }

    return undefined;
  }

  private extractFeatures(
    message: string,
  ): string[] {
    const text =
      message.toLowerCase();

    const map: Record<
      string,
      string
    > = {
      'online ordering':
        'Online ordering',

      'online order':
        'Online ordering',

      payment:
        'Payment gateway',

      razorpay:
        'Payment gateway',

      stripe:
        'Payment gateway',

      checkout:
        'Payment gateway',

      'contact form':
        'Contact form',

      booking:
        'Booking system',

      appointment:
        'Booking system',

      reservation:
        'Booking system',

      login:
        'Authentication',

      authentication:
        'Authentication',

      'admin dashboard':
        'Admin dashboard',

      'admin panel':
        'Admin dashboard',

      dashboard:
        'Admin dashboard',

      cms:
        'CMS',

      search:
        'Search',

      'live chat':
        'Live chat',

      chat:
        'Live chat',

      reviews:
        'Reviews / Testimonials',

      testimonials:
        'Reviews / Testimonials',
    };

    const features: string[] = [];

    for (
      const key of Object.keys(map)
    ) {
      if (
        text.includes(key)
      ) {
        features.push(
          map[key],
        );
      }
    }

    return [
      ...new Set(features),
    ];
  }

  private extractTechnology(
    message: string,
  ): string | undefined {
    const text =
      message.toLowerCase();

    const technologies: string[] = [];

    if (
      text.includes('react')
    ) {
      technologies.push(
        'React',
      );
    }

    if (
      text.includes('tailwind')
    ) {
      technologies.push(
        'Tailwind CSS',
      );
    }

    if (
      text.includes('next.js') ||
      text.includes('nextjs')
    ) {
      technologies.push(
        'Next.js',
      );
    }

    if (
      text.includes('nestjs') ||
      text.includes('nest.js')
    ) {
      technologies.push(
        'NestJS',
      );
    }

    if (
      text.includes('postgres') ||
      text.includes('postgresql')
    ) {
      technologies.push(
        'PostgreSQL',
      );
    }

    if (
      text.includes('python')
    ) {
      technologies.push(
        'Python',
      );
    }

    if (
      technologies.length === 0
    ) {
      return undefined;
    }

    return [
      ...new Set(
        technologies,
      ),
    ].join(', ');
  }

  private extractSeo(
    message: string,
  ): string | undefined {
    const text =
      message.toLowerCase();

    if (
      text.includes('no seo') ||
      text.includes('without seo') ||
      text.includes("don't need seo") ||
      text.includes('dont need seo')
    ) {
      return 'No SEO';
    }

    if (
      text.includes('seo') ||
      text.includes('google ranking') ||
      text.includes('search engine')
    ) {
      return 'SEO optimization';
    }

    return undefined;
  }

  private extractTimeline(
    message: string,
  ): string | undefined {
    const text =
      message.toLowerCase();

    const weeks =
      text.match(
        /(\d+)\s*(?:weeks?|wks?)/i,
      );

    if (weeks?.[1]) {
      return `${weeks[1]} weeks`;
    }

    const days =
      text.match(
        /(\d+)\s*(?:days?|working\s+days?)/i,
      );

    if (days?.[1]) {
      return `${days[1]} days`;
    }

    const months =
      text.match(
        /(\d+)\s*(?:months?|mos?)/i,
      );

    if (months?.[1]) {
      return `${months[1]} months`;
    }

    if (
      text.includes('asap') ||
      text.includes(
        'as soon as possible',
      )
    ) {
      return 'As soon as possible';
    }

    return undefined;
  }

  private extractComplexity(
    message: string,
  ): string | undefined {
    const text =
      message.toLowerCase();

    if (
      text.includes('simple') ||
      text.includes('basic') ||
      text.includes('low complexity')
    ) {
      return 'Low';
    }

    if (
      text.includes('moderate') ||
      text.includes('medium')
    ) {
      return 'Medium';
    }

    if (
      text.includes('complex') ||
      text.includes('advanced') ||
      text.includes(
        'custom functionality',
      )
    ) {
      return 'High';
    }

    return undefined;
  }

  private detectResponseLanguage(
    message: string,
  ):
    | 'en'
    | 'te-en'
    | 'te'
    | 'other' {
    if (
      /[\u0C00-\u0C7F]/.test(
        message,
      )
    ) {
      return 'te';
    }

    const lower =
      message.toLowerCase();

    const romanTelugu = [
      'nenu',
      'naku',
      'naaku',
      'meeku',
      'meeru',
      'cheppu',
      'cheppandi',
      'kavali',
      'entha',
      'em',
      'ela',
      'enduku',
      'eppudu',
      'avunu',
      'sare',
      'ledu',
      'ledhu',
      'ivvu',
      'ippudu',
      'inka',
      'kuda',
      'chesanu',
      'cheyyali',
      'cheyali',
      'bro',
    ];

    if (
      romanTelugu.some(
        (word) =>
          new RegExp(
            `\\b${word}\\b`,
            'i',
          ).test(lower),
      )
    ) {
      return 'te-en';
    }

    return 'en';
  }

  private fallbackResponse(
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string {
    if (
      language === 'te'
    ) {
      return 'మీకు ఏం కావాలో చెప్పండి.';
    }

    if (
      language === 'te-en'
    ) {
      return 'Meeku em kavalo cheppandi.';
    }

    return 'Tell me what you have in mind.';
  }

  private toList(
    value?:
      | string
      | string[],
  ): string[] {
    if (!value) {
      return [];
    }

    if (
      Array.isArray(value)
    ) {
      return value
        .map(String)
        .map(
          (item) =>
            item.trim(),
        )
        .filter(Boolean);
    }

    return value
      .split(',')
      .map(
        (item) =>
          item.trim(),
      )
      .filter(Boolean);
  }
}