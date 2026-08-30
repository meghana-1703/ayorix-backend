import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { IntentService } from '../intent/intent.service';
import { DecisionService } from '../decision/decision.service';
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

    /*
     * ========================================================
     * 1. BASIC VALIDATION
     * ========================================================
     */

    if (!message) {
      return this.finalResponse(
        input,
        'Please tell me a little about your project.',
        {
          intent: 'GENERAL_QUESTION',
          confidence: 1,
        },
        {
          advisor: 'discovery',
          action: 'start_discovery',
          nextStep: 'collect_details',
        },
        project,
        client,
      );
    }

    /*
     * ========================================================
     * 2. LOAD MEMORY
     * ========================================================
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

      const storedClient =
        await this.memoryService.getClient(
          conversation.clientId,
        );

      if (storedClient) {
        client = storedClient;
      }
    }

    /*
     * ========================================================
     * 3. LANGUAGE
     * ========================================================
     */

    const language =
      this.detectResponseLanguage(
        message,
      );

    /*
     * ========================================================
     * 4. INTENT
     * ========================================================
     */

    const detectedIntent =
      this.intentService.detect(
        message,
      );

    const decision =
      this.decisionService.decide(
        detectedIntent.intent,
      );

    /*
     * ========================================================
     * 5. SAVE USER MESSAGE
     * ========================================================
     */

    if (input.conversationId) {
      await this.memoryService.saveMessage(
        input.conversationId,
        {
          role: 'user',
          content: message,
          intent:
            detectedIntent.intent,
          confidence:
            detectedIntent.confidence,
        },
      );
    }

    /*
     * ========================================================
     * 6. EXTRACT CLIENT INFORMATION
     * ========================================================
     */

    if (input.clientId) {
      const extractedName =
        this.extractClientName(
          message,
        );

      if (
        extractedName &&
        !client?.name
      ) {
        client =
          await this.memoryService.updateClient(
            input.clientId,
            {
              name: extractedName,
            },
          );
      }

      const email =
        this.extractEmail(
          message,
        );

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
        this.extractPhoneNumber(
          message,
        );

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
     * ========================================================
     * 7. DETERMINE WHAT AIRA IS WAITING FOR
     * ========================================================
     *
     * This happens BEFORE extraction.
     *
     * Example:
     *
     * AIRA: What is your business name?
     * User: ABC Restaurant
     *
     * The answer is stored as project.name.
     */

    let workflow =
      this.workflowService.determine({
        project,
        client,
      });

    const expectedField =
      workflow.nextMissingField;

    /*
     * ========================================================
     * 8. CONTEXT-AWARE ANSWER HANDLING
     * ========================================================
     */

    if (
      input.clientId &&
      expectedField === 'clientName' &&
      !client?.name
    ) {
      const cleanName =
        this.cleanSimpleAnswer(
          message,
        );

      if (
        cleanName &&
        !this.looksLikeEmail(
          cleanName,
        ) &&
        !this.looksLikePhone(
          cleanName,
        )
      ) {
        client =
          await this.memoryService.updateClient(
            input.clientId,
            {
              name: cleanName,
            },
          );
      }
    }

    /*
     * BUSINESS NAME
     */

    if (
      input.conversationId &&
      project?.id &&
      expectedField === 'businessName'
    ) {
      const businessName =
        this.cleanSimpleAnswer(
          message,
        );

      if (
        businessName &&
        !this.looksLikeEmail(
          businessName,
        ) &&
        !this.looksLikePhone(
          businessName,
        )
      ) {
        project =
          await this.memoryService.updateProject(
            project.id,
            {
              name: businessName,
            },
          );
      }
    }

    /*
     * ========================================================
     * 9. PROJECT DATA EXTRACTION
     * ========================================================
     */

    const understanding =
      this.buildUnderstanding(
        message,
        project,
        expectedField,
      );

    if (
      input.conversationId &&
      project?.id &&
      Object.keys(
        understanding,
      ).length > 0
    ) {
      project =
        await this.memoryService.updateProject(
          project.id,
          understanding,
        );
    }

    /*
     * ========================================================
     * 10. REFRESH MEMORY
     * ========================================================
     */

    if (
      input.conversationId &&
      input.clientId
    ) {
      const refreshed =
        await this.memoryService.getConversationForClient(
          input.conversationId,
          input.clientId,
        );

      if (refreshed?.project) {
        project =
          refreshed.project;
      }

      const refreshedClient =
        await this.memoryService.getClient(
          input.clientId,
        );

      if (refreshedClient) {
        client =
          refreshedClient;
      }
    }

    /*
     * ========================================================
     * 11. RECALCULATE WORKFLOW
     * ========================================================
     */

    workflow =
      this.workflowService.determine({
        project,
        client,
      });

    /*
     * ========================================================
     * 12. PRICE + TIMELINE
     * ========================================================
     *
     * These are automatic.
     *
     * User is NEVER asked for budget.
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

      /*
       * Store automatic price.
       */

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
          Object.keys(
            updateData,
          ).length > 0
        ) {
          project =
            await this.memoryService.updateProject(
              project.id,
              updateData,
            );
        }
      }

      workflow =
        this.workflowService.determine({
          project,
          client,
        });
    }

    /*
     * ========================================================
     * 13. GREETING
     * ========================================================
     */

    if (
      this.isGreeting(
        message,
      )
    ) {
      const response =
        await this.generateNaturalResponse({
          message,
          project,
          client,
          history,
          language,
          instruction: `
The user greeted AIRA.

Reply warmly and briefly.

If the consultation is already in progress,
do NOT restart it.

Do NOT ask multiple questions.
`,
        });

      return this.finalResponse(
        input,
        response,
        detectedIntent,
        decision,
        project,
        client,
        pricing,
        timeline,
        workflow,
      );
    }

    /*
     * ========================================================
     * 14. THANKS
     * ========================================================
     */

    if (
      this.isThanks(
        message,
      )
    ) {
      const response =
        await this.generateNaturalResponse({
          message,
          project,
          client,
          history,
          language,
          instruction: `
The user thanked AIRA.

Reply briefly and naturally.

Do not restart discovery.
Do not ask another question.
`,
        });

      return this.finalResponse(
        input,
        response,
        detectedIntent,
        decision,
        project,
        client,
        pricing,
        timeline,
        workflow,
      );
    }

    /*
     * ========================================================
     * 15. PROPOSAL DECISION
     * ========================================================
     */

    if (
      this.isWaitingForProposalDecision(
        history,
      )
    ) {
      /*
       * CONFIRM
       */

      if (
        this.isProposalConfirmation(
          message,
        )
      ) {
        /*
         * Email missing
         */

        if (!client?.email) {
          const emailQuestion =
            this.questionText(
              'email',
              language,
            );

          return this.finalResponse(
            input,
            emailQuestion,
            detectedIntent,
            decision,
            project,
            client,
            pricing,
            timeline,
            {
              ...workflow,
              currentStage:
                'PROPOSAL',
              nextStage:
                'PROPOSAL',
              shouldAskQuestion:
                true,
              nextMissingField:
                'email',
              missingInformation:
                ['email'],
            },
            undefined,
            this.getQuestionOptions(
              'email',
              language,
            ),
          );
        }

        /*
         * Send proposal
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

          return this.finalResponse(
            input,
            this.getProposalSentMessage(
              language,
            ),
            {
              intent: 'PROPOSAL',
              confidence: 1,
            },
            {
              advisor: 'proposal',
              action: 'send_proposal',
              nextStep:
                'complete_project',
            },
            project,
            client,
            pricing,
            timeline,
            {
              currentStage:
                'COMPLETE',
              nextStage:
                'COMPLETE',
              missingInformation: [],
              shouldAskQuestion:
                false,
              nextMissingField:
                undefined,
            },
            proposal,
            [],
          );
        }
      }

      /*
       * DECLINE / CHANGES
       */

      if (
        this.isProposalDecline(
          message,
        )
      ) {
        const response =
          await this.generateNaturalResponse({
            message,
            project,
            client,
            history,
            language,
            instruction: `
The user does not want to send the proposal yet.

Reply politely.

If they said they want changes,
acknowledge that.

Do not restart discovery.
Do not ask multiple questions.
`,
          });

        return this.finalResponse(
          input,
          response,
          detectedIntent,
          decision,
          project,
          client,
          pricing,
          timeline,
          workflow,
        );
      }
    }

    /*
     * ========================================================
     * 16. EMAIL DIRECT ANSWER
     * ========================================================
     */

    const suppliedEmail =
      this.extractEmail(
        message,
      );

    if (
      suppliedEmail &&
      expectedField === 'email'
    ) {
      if (input.clientId) {
        client =
          await this.memoryService.updateClient(
            input.clientId,
            {
              email:
                suppliedEmail,
            },
          );
      }

      workflow =
        this.workflowService.determine({
          project,
          client,
        });
    }

    /*
     * ========================================================
     * 17. QUESTIONNAIRE CONTROLLER
     * ========================================================
     *
     * THIS IS THE MAIN AIRA FLOW.
     *
     * One question only.
     * Options are returned.
     * "Other" is always available for fields
     * where predefined options exist.
     */

    if (
      workflow.shouldAskQuestion &&
      workflow.nextMissingField
    ) {
      const field =
        workflow.nextMissingField;

      const question =
        this.questionText(
          field,
          language,
        );

      const options =
        this.getQuestionOptions(
          field,
          language,
        );

      return this.finalResponse(
        input,
        question,
        detectedIntent,
        decision,
        project,
        client,
        pricing,
        timeline,
        workflow,
        undefined,
        options,
      );
    }

    /*
     * ========================================================
     * 18. REQUIREMENTS COMPLETE
     * ========================================================
     */

    if (
      !workflow.shouldAskQuestion &&
      workflow.nextMissingField ===
        undefined &&
      this.hasAllProjectRequirements(
        project,
      )
    ) {
      const summary =
        this.buildProjectSummary(
          project,
          client,
          pricing,
          timeline,
          language,
        );

      return this.finalResponse(
        input,
        summary,
        {
          intent: 'PROPOSAL',
          confidence: 1,
        },
        {
          advisor: 'proposal',
          action: 'prepare_proposal',
          nextStep:
            'confirm_proposal',
        },
        project,
        client,
        pricing,
        timeline,
        {
          ...workflow,
          currentStage:
            'PROPOSAL',
          nextStage:
            'PROPOSAL',
          shouldAskQuestion:
            false,
          nextMissingField:
            undefined,
        },
        undefined,
        this.getProposalConfirmationOptions(
          language,
        ),
      );
    }

    /*
     * ========================================================
     * 19. NATURAL FALLBACK
     * ========================================================
     */

    const response =
      await this.generateNaturalResponse({
        message,
        project,
        client,
        history,
        language,
        instruction: `
Respond naturally and briefly to the user's latest message.

Do not restart discovery.

Do not ask multiple questions.

Do not ask for budget.

If the application needs a required
question, the application will ask it separately.
`,
      });

    return this.finalResponse(
      input,
      response,
      detectedIntent,
      decision,
      project,
      client,
      pricing,
      timeline,
      workflow,
    );
  }

  /*
   * ==========================================================
   * BUILD UNDERSTANDING
   * ==========================================================
   */

  private buildUnderstanding(
    message: string,
    project?: any,
    expectedField?: string,
  ): Record<string, any> {
    const lower =
      message
        .toLowerCase()
        .trim();

    const data: Record<string, any> = {};

    /*
     * ========================================================
     * PROJECT TYPE
     * ========================================================
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
     * ========================================================
     * INDUSTRY
     * ========================================================
     */

    if (
      lower.includes('restaurant') ||
      lower.includes('resturant') ||
      lower.includes('food') ||
      lower.includes('cafe')
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
    } else if (
      expectedField === 'industry'
    ) {
      const custom =
        this.cleanOptionAnswer(
          message,
        );

      if (
        custom &&
        !this.isGenericOptionText(
          custom,
        )
      ) {
        data.industry =
          custom;
      }
    }

    /*
     * ========================================================
     * GOAL
     * ========================================================
     */

    if (
      lower.includes('online order') ||
      lower.includes('online ordering')
    ) {
      data.goal =
        'Generate online orders';
    }

    if (
      lower.includes('table reservation') ||
      lower.includes('table reservations') ||
      lower.includes('reserve table') ||
      lower.includes('book a table')
    ) {
      data.goal =
        data.goal
          ? `${data.goal} and enable table reservations`
          : 'Enable table reservations';
    }

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
    } else if (
      expectedField === 'goal'
    ) {
      const custom =
        this.cleanOptionAnswer(
          message,
        );

      if (
        custom &&
        !this.isGenericOptionText(
          custom,
        )
      ) {
        data.goal =
          custom;
      }
    }

    /*
     * ========================================================
     * AUDIENCE
     * ========================================================
     */

    if (
      lower.includes('local customer') ||
      lower.includes('local customers') ||
      lower.includes('nearby customers')
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
    } else if (
      expectedField === 'audience'
    ) {
      const custom =
        this.cleanOptionAnswer(
          message,
        );

      if (
        custom &&
        !this.isGenericOptionText(
          custom,
        )
      ) {
        data.audience =
          custom;
      }
    }

    /*
     * ========================================================
     * FEATURES
     * ========================================================
     */

    const features =
      this.extractFeatures(
        message,
      );

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
     * "Other" typed feature
     */

    if (
      expectedField === 'features' &&
      features.length === 0 &&
      !this.isGenericOptionText(
        message,
      )
    ) {
      const custom =
        this.cleanOptionAnswer(
          message,
        );

      if (custom) {
        const existing =
          this.toList(
            project?.features,
          );

        data.features = [
          ...new Set([
            ...existing,
            custom,
          ]),
        ];
      }
    }

    /*
     * ========================================================
     * TECHNOLOGY
     * ========================================================
     */

    const technology =
      this.extractTechnology(
        message,
      );

    if (technology) {
      data.technology =
        technology;
    } else if (
      expectedField === 'technology'
    ) {
      const custom =
        this.cleanOptionAnswer(
          message,
        );

      if (
        custom &&
        !this.isGenericOptionText(
          custom,
        )
      ) {
        data.technology =
          custom;
      }
    }

    /*
     * ========================================================
     * SEO
     * ========================================================
     */

    const seo =
      this.extractSeo(
        message,
      );

    if (seo) {
      data.seo =
        seo;
    }

    /*
     * ========================================================
     * TIMELINE
     * ========================================================
     */

    const timeline =
      this.extractTimeline(
        message,
      );

    if (timeline) {
      data.timeline =
        timeline;
    } else if (
      expectedField === 'timeline'
    ) {
      const custom =
        this.cleanOptionAnswer(
          message,
        );

      if (
        custom &&
        !this.isGenericOptionText(
          custom,
        )
      ) {
        data.timeline =
          custom;
      }
    }

    /*
     * ========================================================
     * COMPLEXITY
     * ========================================================
     */

    const complexity =
      this.extractComplexity(
        message,
      );

    if (complexity) {
      data.complexity =
        complexity;
    }

    return data;
  }

  /*
   * ==========================================================
   * QUESTION TEXT
   * ==========================================================
   */

  private questionText(
    field: string,
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string {
    const questions: Record<
      string,
      {
        en: string;
        'te-en': string;
        te: string;
      }
    > = {
      clientName: {
        en: 'Great! Before we continue, what’s your name?',
        'te-en':
          'Great! Continue cheyyadaniki mundu, mee name enti?',
        te:
          'సరే! కొనసాగించే ముందు మీ పేరు ఏమిటి?',
      },

      businessName: {
        en: 'What is your business name?',
        'te-en':
          'Mee business name enti?',
        te:
          'మీ business పేరు ఏమిటి?',
      },

      projectType: {
        en: 'What kind of website would you like?',
        'te-en':
          'Meeku ye type of website kavali?',
        te:
          'మీకు ఎలాంటి website కావాలి?',
      },

      industry: {
        en: 'What type of business is this?',
        'te-en':
          'Mee business ye type ki belong avuthundi?',
        te:
          'మీ business ఏ రకానికి చెందుతుంది?',
      },

      goal: {
        en: 'What is the main goal of your website?',
        'te-en':
          'Mee website main goal enti?',
        te:
          'మీ website ప్రధాన లక్ష్యం ఏమిటి?',
      },

      audience: {
        en: 'Who do you mainly want to reach with the website?',
        'te-en':
          'Mee website mainly evarini reach avvali?',
        te:
          'మీ website ప్రధానంగా ఎవరిని చేరుకోవాలి?',
      },

      features: {
        en: 'Which features would you like on your website?',
        'te-en':
          'Mee website lo ye features kavali?',
        te:
          'మీ website లో ఏ features కావాలి?',
      },

      technology: {
        en: 'Do you have a preferred technology, or would you like me to recommend one?',
        'te-en':
          'Meeku technology preference undha, leka nenu recommend cheyyala?',
        te:
          'మీకు technology preference ఉందా, లేక నేను recommend చేయాలా?',
      },

      seo: {
        en: 'Would you like SEO to help your website appear in Google search?',
        'te-en':
          'Mee website Google lo rank avvadaniki SEO kavala?',
        te:
          'మీ website Googleలో కనిపించడానికి SEO కావాలా?',
      },

      timeline: {
        en: 'When would you like the website to be ready?',
        'te-en':
          'Website eppatiki ready avvali?',
        te:
          'Website ఎప్పటికి ready అవ్వాలి?',
      },

      email: {
        en: 'What email address should I use for your project and proposal?',
        'te-en':
          'Mee project and proposal kosam ye email address use cheyyali?',
        te:
          'మీ project మరియు proposal కోసం ఏ email address ఉపయోగించాలి?',
      },
    };

    const item =
      questions[field];

    if (!item) {
      return 'Tell me a little more about what you need.';
    }

    if (language === 'te') {
      return item.te;
    }

    if (language === 'te-en') {
      return item['te-en'];
    }

    return item.en;
  }

  /*
   * ==========================================================
   * OPTIONS
   * ==========================================================
   *
   * Every selectable questionnaire field gets an "Other"
   * option.
   *
   * Frontend should show a text input when Other is selected.
   */

  private getQuestionOptions(
    field: string,
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string[] {
    const options: Record<
      string,
      string[]
    > = {
      industry: [
        'Restaurant',
        'Salon / Beauty',
        'Clinic / Healthcare',
        'Education',
        'Real Estate',
        'E-commerce',
        'Technology',
        'Other',
      ],

      projectType: [
        'Business Website',
        'E-commerce Website',
        'Web Application',
        'Portfolio Website',
        'Other',
      ],

      goal: [
        'Showcase services',
        'Get more customers',
        'Generate leads',
        'Online orders',
        'Bookings / Reservations',
        'Multiple goals',
        'Other',
      ],

      audience: [
        'Local customers',
        'General public',
        'Small businesses',
        'Startups',
        'Students',
        'Professionals',
        'Other',
      ],

      features: [
        'Online Ordering',
        'Table Booking',
        'Payment Gateway',
        'WhatsApp',
        'Contact Form',
        'Google Maps',
        'Admin Panel',
        'Other',
        'Done',
      ],

      technology: [
        'React',
        'Next.js',
        'Not sure — recommend',
        'Other',
      ],

      seo: [
        'Basic SEO',
        'Local SEO',
        'Advanced SEO',
        'No SEO',
        'Other',
      ],

      timeline: [
        '1 week',
        '2 weeks',
        '3–4 weeks',
        'Flexible',
        'Other',
      ],
    };

    return options[field] ?? [];
  }

  /*
   * ==========================================================
   * PROPOSAL OPTIONS
   * ==========================================================
   */

  private getProposalConfirmationOptions(
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string[] {
    if (language === 'te') {
      return [
        'అవును, proposal పంపండి',
        'మార్పులు చేయాలి',
      ];
    }

    if (language === 'te-en') {
      return [
        'Avunu, proposal pampu',
        'Changes kavali',
      ];
    }

    return [
      'Yes, send proposal',
      'Make changes',
    ];
  }

  /*
   * ==========================================================
   * SUMMARY
   * ==========================================================
   */

  private buildProjectSummary(
    project: any,
    client: any,
    pricing: any,
    timeline: any,
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string {
    const features =
      this.toList(
        project?.features,
      );

    const price =
      pricing
        ? `${pricing.currency} ${pricing.estimatedPrice}`
        : project?.budget ??
          'To be confirmed';

    const days =
      timeline
        ? `${timeline.estimatedDays} days`
        : project?.timeline ??
          'To be confirmed';

    if (language === 'te') {
      return `
Mee project requirements complete ayyayi. ❤️

Business: ${project?.name ?? '-'}
Business Type: ${project?.industry ?? '-'}
Website: ${project?.projectType ?? '-'}
Goal: ${project?.goal ?? '-'}
Audience: ${project?.audience ?? '-'}
Features: ${features.join(', ') || '-'}
Technology: ${project?.technology ?? '-'}
SEO: ${project?.seo ?? '-'}
Timeline: ${days}
Estimated Investment: ${price}

Proposal prepare cheyyala?
`.trim();
    }

    if (language === 'te-en') {
      return `
Mee project requirements complete ayyayi. ❤️

Business: ${project?.name ?? '-'}
Business Type: ${project?.industry ?? '-'}
Website: ${project?.projectType ?? '-'}
Goal: ${project?.goal ?? '-'}
Audience: ${project?.audience ?? '-'}
Features: ${features.join(', ') || '-'}
Technology: ${project?.technology ?? '-'}
SEO: ${project?.seo ?? '-'}
Timeline: ${days}
Estimated Investment: ${price}

Proposal prepare cheyyala?
`.trim();
    }

    return `
Your project requirements are complete. ❤️

Business: ${project?.name ?? '-'}
Business Type: ${project?.industry ?? '-'}
Website: ${project?.projectType ?? '-'}
Goal: ${project?.goal ?? '-'}
Audience: ${project?.audience ?? '-'}
Features: ${features.join(', ') || '-'}
Technology: ${project?.technology ?? '-'}
SEO: ${project?.seo ?? '-'}
Timeline: ${days}
Estimated Investment: ${price}

Would you like me to prepare your proposal?
`.trim();
  }

  /*
   * ==========================================================
   * FINAL RESPONSE
   * ==========================================================
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
    options: string[] = [],
  ) {
    const finalMessage =
      message?.trim() ||
      'Please tell me a little about your project.';

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

      options,

      intent,
      decision,

      workflow:
        workflow ?? {
          currentStage:
            project?.status ??
            'DISCOVERY',

          nextStage:
            'DISCOVERY',

          missingInformation: [],

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
   * ==========================================================
   * NATURAL RESPONSE
   * ==========================================================
   */

  private async generateNaturalResponse(
    params: {
      message: string;
      project: any;
      client: any;
      history: any[];
      language:
        | 'en'
        | 'te-en'
        | 'te'
        | 'other';
      instruction: string;
    },
  ): Promise<string> {
    const systemPrompt = `
You are AIRA, the friendly AI project consultant for AYORIX Digital Solutions.

You are helpful, natural and professional.

IMPORTANT:
The application controls the questionnaire flow.

Never invent required information.

Never skip required questions.

Never ask multiple questions.

Never ask for budget.

Never restart discovery.

Never mention internal systems, workflow,
database, extraction or implementation details.

Language:
- English -> English
- Roman Telugu / Telugu-English -> Roman Telugu + English
- Telugu script -> Telugu script

Keep responses concise.

${params.instruction}
`;

    const userPrompt = `
USER MESSAGE:
${params.message}

PROJECT MEMORY:
${JSON.stringify(
  params.project ?? {},
  null,
  2,
)}

CLIENT MEMORY:
${JSON.stringify(
  params.client ?? {},
  null,
  2,
)}

RECENT HISTORY:
${JSON.stringify(
  params.history.slice(-10),
  null,
  2,
)}

Respond only to the user's latest message.
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
      // fallback
    }

    return this.fallbackResponse(
      params.language,
    );
  }

  /*
   * ==========================================================
   * PROPOSAL SENT
   * ==========================================================
   */

  private getProposalSentMessage(
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string {
    if (language === 'te') {
      return 'Mee proposal successfully email ki pampinchanu. Thank you! ❤️';
    }

    if (language === 'te-en') {
      return 'Mee proposal successfully email ki pampinchanu. Thank you! ❤️';
    }

    return 'Your proposal has been successfully sent to your email. Thank you! ❤️';
  }

  /*
   * ==========================================================
   * PROPOSAL CONFIRMATION
   * ==========================================================
   */

  private isProposalConfirmation(
    message: string,
  ): boolean {
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
      'avunu proposal pampu',
      'avunu, proposal pampu',
      'yes send proposal',
      'yes, send proposal',
    ].includes(text);
  }

  private isProposalDecline(
    message: string,
  ): boolean {
    const text =
      message
        .toLowerCase()
        .trim();

    return [
      'no',
      'no thanks',
      'not now',
      'maybe later',
      'dont send',
      "don't send",
      'do not send',
      'vaddu',
      'ippudu vaddu',
      'changes kavali',
      'make changes',
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
                'prepare',
              ) ||
              text.includes(
                'send',
              )
            )
          );
        },
      );
  }

  /*
   * ==========================================================
   * CLIENT NAME
   * ==========================================================
   */

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
        return match[1].trim();
      }
    }

    return undefined;
  }

  /*
   * ==========================================================
   * EMAIL
   * ==========================================================
   */

  private extractEmail(
    message: string,
  ): string | undefined {
    const match =
      message.match(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      );

    return match?.[0];
  }

  /*
   * ==========================================================
   * PHONE
   * ==========================================================
   */

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

  /*
   * ==========================================================
   * SIMPLE ANSWER
   * ==========================================================
   */

  private cleanSimpleAnswer(
    message: string,
  ): string {
    return message
      .replace(
        /^(my name is|i am|i'm|this is|business name is|our business name is)\s+/i,
        '',
      )
      .replace(
        /[.!?,]+$/,
        '',
      )
      .trim();
  }

  private cleanOptionAnswer(
    message: string,
  ): string {
    return message
      .replace(
        /^(other|others)\s*[:\-]?\s*/i,
        '',
      )
      .replace(
        /[.!?,]+$/,
        '',
      )
      .trim();
  }

  /*
   * ==========================================================
   * GENERIC OPTION CHECK
   * ==========================================================
   */

  private isGenericOptionText(
    value: string,
  ): boolean {
    const text =
      value
        .toLowerCase()
        .trim();

    return [
      'other',
      'others',
      'done',
      'ok',
      'okay',
      'yes',
      'no',
      'not sure',
      'not sure recommend',
      'flexible',
    ].includes(text);
  }

  /*
   * ==========================================================
   * EMAIL / PHONE CHECK
   * ==========================================================
   */

  private looksLikeEmail(
    value: string,
  ): boolean {
    return /@/.test(value);
  }

  private looksLikePhone(
    value: string,
  ): boolean {
    return /^(?:\+91[\s-]?)?[6-9]\d{9}$/.test(
      value.replace(/\s/g, ''),
    );
  }

  /*
   * ==========================================================
   * FEATURES
   * ==========================================================
   */

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

      'table booking':
        'Table booking',

      'table reservation':
        'Table booking',

      'table reservations':
        'Table booking',

      reservation:
        'Table booking',

      booking:
        'Booking system',

      appointment:
        'Booking system',

      payment:
        'Payment gateway',

      'payment gateway':
        'Payment gateway',

      razorpay:
        'Payment gateway',

      stripe:
        'Payment gateway',

      checkout:
        'Payment gateway',

      'contact form':
        'Contact form',

      whatsapp:
        'WhatsApp',

      'google maps':
        'Google Maps',

      maps:
        'Google Maps',

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
      const key of Object.keys(
        map,
      )
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

  /*
   * ==========================================================
   * TECHNOLOGY
   * ==========================================================
   */

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

  /*
   * ==========================================================
   * SEO
   * ==========================================================
   */

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
      text.includes('local seo')
    ) {
      return 'Local SEO';
    }

    if (
      text.includes('advanced seo')
    ) {
      return 'Advanced SEO';
    }

    if (
      text.includes('basic seo')
    ) {
      return 'Basic SEO';
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

  /*
   * ==========================================================
   * TIMELINE
   * ==========================================================
   */

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

    if (
      text.includes('1 week')
    ) {
      return '1 week';
    }

    if (
      text.includes('2 weeks')
    ) {
      return '2 weeks';
    }

    if (
      text.includes('3–4 weeks') ||
      text.includes('3-4 weeks')
    ) {
      return '3–4 weeks';
    }

    if (
      text.includes('flexible')
    ) {
      return 'Flexible';
    }

    return undefined;
  }

  /*
   * ==========================================================
   * COMPLEXITY
   * ==========================================================
   */

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

  /*
   * ==========================================================
   * LANGUAGE
   * ==========================================================
   */

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
      'na',
      'meeku',
      'meeru',
      'mee',
      'cheppu',
      'cheppandi',
      'kavali',
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
      'ivvandi',
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

  /*
   * ==========================================================
   * FALLBACK
   * ==========================================================
   */

  private fallbackResponse(
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string {
    if (language === 'te') {
      return 'మీకు ఏం కావాలో చెప్పండి.';
    }

    if (
      language === 'te-en'
    ) {
      return 'Meeku em kavalo cheppandi.';
    }

    return 'Tell me what you need.';
  }

  /*
   * ==========================================================
   * ESTIMATE CHECK
   * ==========================================================
   */

  private hasEnoughForEstimate(
    project: any,
  ): boolean {
    return Boolean(
      project?.projectType &&
      project?.industry &&
      project?.goal &&
      project?.audience &&
      project?.features &&
      this.toList(
        project.features,
      ).length > 0 &&
      project?.technology &&
      project?.seo,
    );
  }

  /*
   * ==========================================================
   * ALL REQUIREMENTS
   * ==========================================================
   */

  private hasAllProjectRequirements(
    project: any,
  ): boolean {
    return Boolean(
      project?.name &&
      project?.projectType &&
      project?.industry &&
      project?.goal &&
      project?.audience &&
      this.toList(
        project?.features,
      ).length > 0 &&
      project?.technology &&
      project?.seo &&
      project?.timeline,
    );
  }

  /*
   * ==========================================================
   * LIST
   * ==========================================================
   */

  private toList(
    value?: string | string[],
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

  /*
   * ==========================================================
   * GREETING
   * ==========================================================
   */

  private isGreeting(
    message: string,
  ): boolean {
    return /^(hi|hii|hello|hey|helo|good morning|good afternoon|good evening|good night)$/i.test(
      message.trim(),
    );
  }

  /*
   * ==========================================================
   * THANKS
   * ==========================================================
   */

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
}