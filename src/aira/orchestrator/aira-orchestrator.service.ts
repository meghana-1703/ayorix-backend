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

    let history = input.conversationHistory ?? [];

    const message = input.message?.trim() ?? '';

    /*
     * ========================================================
     * EMPTY MESSAGE
     * ========================================================
     */

    if (!message) {
      return this.finalResponse(
        input,
        this.greetingMessage('en'),
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
     * LOAD MEMORY
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

      project = conversation.project;
      history = conversation.messages ?? [];

      client =
        await this.memoryService.getClient(
          conversation.clientId,
        );
    }

    const language =
      this.detectResponseLanguage(message);

    const intent =
      this.intentService.detect(message);

    /*
     * ========================================================
     * SAVE USER MESSAGE
     * ========================================================
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
     * ========================================================
     * FIRST GREETING
     * ========================================================
     */

    if (
      this.isGreeting(message) &&
      !this.hasStartedProject(project, client)
    ) {
      return this.finalResponse(
        input,
        this.greetingMessage(language),
        intent,
        {
          advisor: 'discovery',
          action: 'start_discovery',
          nextStep: 'collect_name',
        },
        project,
        client,
        undefined,
        undefined,
        {
          currentStage: 'DISCOVERY',
          nextStage: 'DISCOVERY',
          shouldAskQuestion: true,
          nextMissingField: 'clientName',
          missingInformation: ['clientName'],
        },
        undefined,
        [],
      );
    }

    /*
     * ========================================================
     * GREETING DURING ACTIVE FLOW
     * ========================================================
     */

    if (this.isGreeting(message)) {
      return this.finalResponse(
        input,
        language === 'te-en'
          ? 'Hi! Manam mana website project continue cheddham. 😊'
          : language === 'te'
            ? 'హాయ్! మన website project ని continue చేద్దాం. 😊'
            : 'Hi! Let’s continue with your website project. 😊',
        intent,
        this.decisionService.decide(
          intent.intent,
        ),
        project,
        client,
      );
    }

    /*
     * ========================================================
     * THANKS
     * ========================================================
     */

    if (this.isThanks(message)) {
      return this.finalResponse(
        input,
        language === 'te-en'
          ? 'You’re welcome! 😊'
          : language === 'te'
            ? 'మీకు స్వాగతం! 😊'
            : 'You’re welcome! 😊',
        intent,
        this.decisionService.decide(
          intent.intent,
        ),
        project,
        client,
      );
    }

    /*
     * ========================================================
     * DIRECT CLIENT EXTRACTION
     * ========================================================
     */

    if (input.clientId) {
      const extractedName =
        this.extractClientName(message);

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

      const extractedEmail =
        this.extractEmail(message);

      if (extractedEmail) {
        client =
          await this.memoryService.updateClient(
            input.clientId,
            {
              email: extractedEmail,
            },
          );
      }

      const extractedPhone =
        this.extractPhoneNumber(message);

      if (extractedPhone) {
        client =
          await this.memoryService.updateClient(
            input.clientId,
            {
              phone: extractedPhone,
            },
          );
      }
    }

    /*
     * ========================================================
     * CURRENT WORKFLOW BEFORE ANSWER
     * ========================================================
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
     * SAVE ANSWER TO EXACT FIELD
     * ========================================================
     */

    if (
      input.clientId &&
      expectedField
    ) {
      /*
       * OTHER CUSTOM INPUT
       *
       * If frontend sends the actual custom value,
       * save it to the field currently being asked.
       */

      const answerData =
        this.buildAnswerData(
          expectedField,
          message,
          project,
        );

      if (
        Object.keys(answerData).length > 0
      ) {
        /*
         * CLIENT NAME
         */

        if (answerData.__clientName) {
          client =
            await this.memoryService.updateClient(
              input.clientId,
              {
                name:
                  answerData.__clientName,
              },
            );
        }

        /*
         * PHONE
         */

        if (answerData.__phone) {
          client =
            await this.memoryService.updateClient(
              input.clientId,
              {
                phone:
                  answerData.__phone,
              },
            );
        }

        /*
         * PROJECT
         */

        const projectData = {
          ...answerData,
        };

        delete projectData.__clientName;
        delete projectData.__phone;

        if (
          project?.id &&
          Object.keys(projectData).length > 0
        ) {
          project =
            await this.memoryService.updateProject(
              project.id,
              projectData,
            );
        }
      }
    }

    /*
     * ========================================================
     * REFRESH MEMORY
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
        project = refreshed.project;
      }

      const refreshedClient =
        await this.memoryService.getClient(
          input.clientId,
        );

      if (refreshedClient) {
        client = refreshedClient;
      }

      history =
        refreshed?.messages ?? history;
    }

    /*
     * ========================================================
     * WORKFLOW AFTER ANSWER
     * ========================================================
     */

    workflow =
      this.workflowService.determine({
        project,
        client,
      });

    /*
     * ========================================================
     * AUTOMATIC PRICE + TIMELINE CALCULATION
     * ========================================================
     */

    let pricing: any;
    let timeline: any;

    if (
      this.hasEnoughForEstimate(project)
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
       * PRICE IS AUTOMATIC.
       * NEVER ASK USER FOR BUDGET.
       */

      if (
        input.conversationId &&
        project?.id &&
        !project?.budget
      ) {
        project =
          await this.memoryService.updateProject(
            project.id,
            {
              budget:
                `${pricing.currency} ${pricing.estimatedPrice}`,
            },
          );
      }
    }

    /*
     * ========================================================
     * REFRESH WORKFLOW AGAIN
     * ========================================================
     */

    workflow =
      this.workflowService.determine({
        project,
        client,
      });

    /*
     * ========================================================
     * QUESTIONNAIRE
     *
     * ONE QUESTION ONLY
     * ========================================================
     */

    if (
      workflow.shouldAskQuestion &&
      workflow.nextMissingField
    ) {
      const field =
        workflow.nextMissingField;

      /*
       * EMAIL IS SPECIAL.
       *
       * Email must ONLY be asked after
       * user explicitly clicks "Yes, send proposal".
       */

      if (field === 'email') {
        /*
         * Do not expose email question from normal
         * questionnaire unless proposal confirmation
         * already happened.
         */

        if (
          !this.isWaitingForProposalDecision(
            history,
          )
        ) {
          return this.finalResponse(
            input,
            this.buildCompleteMessage(
              project,
              pricing,
              timeline,
              language,
            ),
            {
              intent: 'PROPOSAL',
              confidence: 1,
            },
            {
              advisor: 'proposal',
              action: 'prepare_proposal',
              nextStep: 'confirm_proposal',
            },
            project,
            client,
            pricing,
            timeline,
            {
              currentStage: 'PROPOSAL',
              nextStage: 'PROPOSAL',
              shouldAskQuestion: false,
              nextMissingField: undefined,
              missingInformation: [],
            },
            undefined,
            this.getProposalConfirmationOptions(
              language,
            ),
          );
        }
      }

      /*
       * Normal question.
       */

      return this.finalResponse(
        input,
        this.questionText(
          field,
          language,
        ),
        intent,
        this.decisionService.decide(
          intent.intent,
        ),
        project,
        client,
        pricing,
        timeline,
        workflow,
        undefined,
        this.getQuestionOptions(
          field,
          language,
        ),
      );
    }

    /*
     * ========================================================
     * REQUIREMENTS COMPLETE
     * ========================================================
     *
     * IMPORTANT:
     * DO NOT GENERATE PROPOSAL HERE.
     *
     * Only show clean summary and confirmation buttons.
     */

    if (
      !workflow.nextMissingField
    ) {
      return this.finalResponse(
        input,
        this.buildCompleteMessage(
          project,
          pricing,
          timeline,
          language,
        ),
        {
          intent: 'PROPOSAL',
          confidence: 1,
        },
        {
          advisor: 'proposal',
          action: 'prepare_proposal',
          nextStep: 'confirm_proposal',
        },
        project,
        client,
        pricing,
        timeline,
        {
          ...workflow,
          currentStage: 'PROPOSAL',
          nextStage: 'PROPOSAL',
          shouldAskQuestion: false,
          nextMissingField: undefined,
          missingInformation: [],
        },
        undefined,
        this.getProposalConfirmationOptions(
          language,
        ),
      );
    }

    /*
     * ========================================================
     * PROPOSAL CONFIRMATION
     * ========================================================
     *
     * This block must execute BEFORE generic
     * questionnaire handling.
     */

    if (
      this.isWaitingForProposalDecision(
        history,
      )
    ) {
      /*
       * ------------------------------------------------------
       * YES → SEND PROPOSAL
       * ------------------------------------------------------
       */

      if (
        this.isProposalConfirmation(
          message,
        )
      ) {
        /*
         * EMAIL MISSING
         */

        if (!client?.email) {
          return this.finalResponse(
            input,
            this.questionText(
              'email',
              language,
            ),
            {
              intent: 'PROPOSAL',
              confidence: 1,
            },
            {
              advisor: 'proposal',
              action: 'collect_email',
              nextStep: 'collect_email',
            },
            project,
            client,
            pricing,
            timeline,
            {
              currentStage: 'PROPOSAL',
              nextStage: 'PROPOSAL',
              shouldAskQuestion: true,
              nextMissingField: 'email',
              missingInformation: ['email'],
            },
            undefined,
            [],
          );
        }

        /*
         * EMAIL EXISTS
         *
         * SEND ONLY.
         *
         * DO NOT RETURN THE GENERATED PROPOSAL
         * TO THE CHAT.
         */

        if (
          project?.id &&
          client?.email
        ) {
          /*
           * Ensure pricing exists.
           */

          if (!pricing) {
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
          }

          /*
           * Ensure timeline exists.
           */

          if (!timeline) {
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
          }

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

          /*
           * CHAT RESPONSE ONLY.
           *
           * NO proposal object.
           * NO proposal content.
           */

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
              nextStep: 'complete',
            },
            project,
            client,
            pricing,
            timeline,
            {
              currentStage: 'COMPLETE',
              nextStage: 'COMPLETE',
              shouldAskQuestion: false,
              nextMissingField: undefined,
              missingInformation: [],
            },
            undefined,
            [],
          );
        }
      }

      /*
       * ------------------------------------------------------
       * MAKE CHANGES
       * ------------------------------------------------------
       */

      if (
        this.isProposalChanges(
          message,
        )
      ) {
        return this.finalResponse(
          input,
          this.getChangesMessage(
            language,
          ),
          {
            intent: 'PROPOSAL',
            confidence: 1,
          },
          {
            advisor: 'proposal',
            action: 'modify_project',
            nextStep: 'collect_changes',
          },
          project,
          client,
          pricing,
          timeline,
          workflow,
          undefined,
          [],
        );
      }
    }

    /*
     * ========================================================
     * EMAIL ENTERED AFTER EMAIL QUESTION
     * ========================================================
     */

    const extractedEmail =
      this.extractEmail(message);

    if (
      extractedEmail &&
      client?.email === extractedEmail
    ) {
      /*
       * Email has now been saved.
       *
       * Send proposal immediately.
       */

      if (
        project?.id &&
        this.hasEnoughForEstimate(project)
      ) {
        if (!pricing) {
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
        }

        if (!timeline) {
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
        }

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
          to: extractedEmail,
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
            nextStep: 'complete',
          },
          project,
          client,
          pricing,
          timeline,
          {
            currentStage: 'COMPLETE',
            nextStage: 'COMPLETE',
            shouldAskQuestion: false,
            nextMissingField: undefined,
            missingInformation: [],
          },
          undefined,
          [],
        );
      }
    }

    /*
     * ========================================================
     * FALLBACK
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
Respond naturally and briefly.

The application controls the consultation flow.

Do not restart the consultation.
Do not ask multiple questions.
Do not ask for budget.
Do not invent project details.
Do not generate a proposal in chat.
Do not summarize the entire project unless the application
explicitly asks for the final summary.
`,
      });

    return this.finalResponse(
      input,
      response,
      intent,
      this.decisionService.decide(
        intent.intent,
      ),
      project,
      client,
      pricing,
      timeline,
      workflow,
    );
  }

  /*
   * ==========================================================
   * ANSWER → FIELD
   * ==========================================================
   */

  private buildAnswerData(
    field: string,
    message: string,
    project?: any,
  ): Record<string, any> {
    const answer =
      this.cleanSimpleAnswer(message);

    if (!answer) {
      return {};
    }

    switch (field) {
      case 'clientName':
        return {
          __clientName: answer,
        };

      case 'businessName':
        return {
          name: answer,
        };

      case 'phone': {
        const phone =
          this.extractPhoneNumber(
            message,
          );

        return phone
          ? {
              __phone: phone,
            }
          : {};
      }

      case 'industry':
        return {
          industry:
            this.normalizeIndustry(
              answer,
            ),
        };

      case 'projectType':
        return {
          projectType:
            this.normalizeProjectType(
              answer,
            ),
        };

      case 'goal':
        return {
          goal:
            this.normalizeGoal(
              answer,
            ),
        };

      case 'audience':
        return {
          audience:
            this.normalizeAudience(
              answer,
            ),
        };

      case 'features': {
        if (
          /^done$/i.test(answer)
        ) {
          return {};
        }

        /*
         * "Other" by itself is a frontend state.
         *
         * If it reaches backend alone, do not save
         * "Other" as a feature.
         */

        if (
          /^other$/i.test(answer)
        ) {
          return {};
        }

        const newFeatures =
          this.extractFeatures(
            message,
          );

        if (newFeatures.length > 0) {
          return {
            features: [
              ...new Set([
                ...this.toList(
                  project?.features,
                ),
                ...newFeatures,
              ]),
            ],
          };
        }

        /*
         * Custom feature entered through Other.
         */

        return {
          features: [
            ...new Set([
              ...this.toList(
                project?.features,
              ),
              answer,
            ]),
          ],
        };
      }

      case 'technology':
        return {
          technology:
            this.normalizeTechnology(
              answer,
            ),
        };

      case 'seo':
        return {
          seo:
            this.normalizeSeo(
              answer,
            ),
        };

      case 'timeline':
        return {
          timeline:
            this.normalizeTimeline(
              answer,
            ),
        };

      default:
        return {};
    }
  }

  /*
   * ==========================================================
   * QUESTIONS
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
      any
    > = {
      clientName: {
        en: 'Before we continue, what’s your name?',
        'te-en':
          'Continue cheyyadaniki mundu, mee name enti?',
        te:
          'కొనసాగించే ముందు మీ పేరు ఏమిటి?',
      },

      businessName: {
        en: 'What is your business name?',
        'te-en':
          'Mee business name enti?',
        te:
          'మీ business పేరు ఏమిటి?',
      },

      phone: {
        en: 'What mobile number can I use to contact you?',
        'te-en':
          'Mimmalni contact cheyyadaniki mee mobile number cheppandi.',
        te:
          'మిమ్మల్ని సంప్రదించడానికి మీ mobile number చెప్పండి.',
      },

      industry: {
        en: 'What type of business is this?',
        'te-en':
          'Mee business ye type ki belong avuthundi?',
        te:
          'మీ business ఏ రకానికి చెందుతుంది?',
      },

      projectType: {
        en: 'What kind of website would you like?',
        'te-en':
          'Meeku ye type of website kavali?',
        te:
          'మీకు ఎలాంటి website కావాలి?',
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
        'Not sure — recommend',
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

      email: [],
    };

    return options[field] ?? [];
  }

  /*
   * ==========================================================
   * NORMALIZERS
   * ==========================================================
   */

  private normalizeIndustry(
    value: string,
  ): string {
    const text =
      value.toLowerCase();

    if (
      text.includes('restaurant') ||
      text.includes('food') ||
      text.includes('cafe') ||
      text.includes('hotel')
    ) {
      return 'Restaurant / Food';
    }

    if (
      text.includes('salon') ||
      text.includes('beauty') ||
      text.includes('spa')
    ) {
      return 'Beauty / Salon';
    }

    if (
      text.includes('clinic') ||
      text.includes('hospital') ||
      text.includes('health')
    ) {
      return 'Healthcare';
    }

    if (
      text.includes('school') ||
      text.includes('college') ||
      text.includes('education')
    ) {
      return 'Education';
    }

    if (
      text.includes('real estate') ||
      text.includes('property')
    ) {
      return 'Real Estate';
    }

    if (
      text.includes('technology') ||
      text.includes('software') ||
      text.includes('tech')
    ) {
      return 'Software / Technology';
    }

    if (
      text.includes('e-commerce') ||
      text.includes('ecommerce')
    ) {
      return 'E-commerce';
    }

    return value;
  }

  private normalizeProjectType(
    value: string,
  ): string {
    const text =
      value.toLowerCase();

    if (
      text.includes('ecommerce') ||
      text.includes('e-commerce')
    ) {
      return 'E-commerce Website';
    }

    if (
      text.includes('web application') ||
      text.includes('web app')
    ) {
      return 'Web Application';
    }

    if (
      text.includes('portfolio')
    ) {
      return 'Portfolio Website';
    }

    if (
      text.includes('business website')
    ) {
      return 'Business Website';
    }

    if (
      text.includes('not sure')
    ) {
      return 'Not sure — recommend';
    }

    return value;
  }

  private normalizeGoal(
    value: string,
  ): string {
    const text =
      value.toLowerCase();

    if (
      text.includes('online order')
    ) {
      return 'Generate online orders';
    }

    if (
      text.includes('customer')
    ) {
      return 'Generate leads and attract more customers';
    }

    if (
      text.includes('lead')
    ) {
      return 'Generate leads';
    }

    if (
      text.includes('showcase')
    ) {
      return 'Showcase services';
    }

    if (
      text.includes('booking') ||
      text.includes('reservation')
    ) {
      return 'Enable bookings / reservations';
    }

    return value;
  }

  private normalizeAudience(
    value: string,
  ): string {
    return value;
  }

  private normalizeTechnology(
    value: string,
  ): string {
    if (
      /not sure/i.test(value)
    ) {
      return 'Not sure — recommend';
    }

    return value;
  }

  private normalizeSeo(
    value: string,
  ): string {
    const text =
      value.toLowerCase();

    if (
      text.includes('no seo')
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

    return value;
  }

  private normalizeTimeline(
    value: string,
  ): string {
    const text =
      value.toLowerCase();

    if (
      text.includes('flexible')
    ) {
      return 'Flexible';
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

    const days =
      text.match(
        /(\d+)\s*days?/,
      );

    if (days?.[1]) {
      return `${days[1]} days`;
    }

    return value;
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

      reviews:
        'Reviews / Testimonials',

      testimonials:
        'Reviews / Testimonials',

      'live chat':
        'Live chat',
    };

    const result: string[] = [];

    for (const key of Object.keys(map)) {
      if (text.includes(key)) {
        result.push(map[key]);
      }
    }

    return [
      ...new Set(result),
    ];
  }

  /*
   * ==========================================================
   * PROPOSAL STATE
   * ==========================================================
   */

  private isWaitingForProposalDecision(
    history: any[],
  ): boolean {
    return (
      history ?? []
    )
      .filter(
        (item) =>
          item.role === 'assistant',
      )
      .slice(-8)
      .some((item) => {
        const text =
          item.content
            ?.toLowerCase() ?? '';

        return (
          text.includes(
            'proposal',
          ) &&
          (
            text.includes(
              'would you like',
            ) ||
            text.includes(
              'prepare',
            ) ||
            text.includes(
              'send proposal',
            ) ||
            text.includes(
              'proposal pampu',
            )
          )
        );
      });
  }

  private isProposalConfirmation(
    message: string,
  ): boolean {
    const value =
      message
        .toLowerCase()
        .trim()
        .replace(/[.!?,]+$/g, '');

    return [
      'yes',
      'yeah',
      'yep',
      'sure',
      'okay',
      'ok',
      'send',
      'send it',
      'send proposal',
      'send the proposal',
      'go ahead',
      'yes please',
      'yes send proposal',
      'yes, send proposal',
      'avunu',
      'sare',
      'pampu',
      'pampandi',
      'proposal pampu',
      'avunu proposal pampu',
      'avunu, proposal pampu',
      'avunu proposal pampandi',
      'avunu, proposal pampandi',
    ].includes(value);
  }

  private isProposalChanges(
    message: string,
  ): boolean {
    return [
      'make changes',
      'changes',
      'change',
      'edit',
      'modify',
      'changes kavali',
      'change kavali',
      'marpulu kavali',
    ].includes(
      message
        .toLowerCase()
        .trim(),
    );
  }

  private getChangesMessage(
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string {
    if (language === 'te') {
      return 'Sure. Mee project lo em changes kavalo cheppandi.';
    }

    if (language === 'te-en') {
      return 'Sure. Mee project lo em changes kavalo cheppandi.';
    }

    return 'Sure. Tell me what you would like to change in the project.';
  }

  private getProposalSentMessage(
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string {
    if (
      language === 'te' ||
      language === 'te-en'
    ) {
      return 'Mee proposal successfully email ki pampinchanu. Thank you! ❤️';
    }

    return 'Your proposal has been successfully sent to your email. Thank you! ❤️';
  }

  /*
   * ==========================================================
   * CLEAN FINAL SUMMARY
   * ==========================================================
   */

  private buildCompleteMessage(
    project: any,
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
      project?.timeline ??
      (
        timeline
          ? `${timeline.estimatedDays} days`
          : 'To be confirmed'
      );

    if (
      language === 'te' ||
      language === 'te-en'
    ) {
      return `
Perfect! Mee website requirements complete ayyayi. ❤️

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

Proposal pampinchala?
`.trim();
    }

    return `
Perfect! Your website requirements are complete. ❤️

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

Would you like me to send your proposal?
`.trim();
  }

  /*
   * ==========================================================
   * PROPOSAL BUTTONS
   * ==========================================================
   */

  private getProposalConfirmationOptions(
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string[] {
    if (
      language === 'te' ||
      language === 'te-en'
    ) {
      return [
        'Avunu, proposal pampu',
        'Make changes',
      ];
    }

    return [
      'Yes, send proposal',
      'Make changes',
    ];
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

Be natural, warm and professional.

The application controls the consultation flow.

Rules:
- Never restart the consultation.
- Never ask multiple questions.
- Never ask for budget.
- Never invent project information.
- Never generate a proposal inside chat.
- Never output a long project proposal.
- Keep responses concise.

Language:
English -> English.
Roman Telugu / Telugu-English -> Roman Telugu + English.
Telugu script -> Telugu script.

${params.instruction}
`;

    const userPrompt = `
USER MESSAGE:
${params.message}

PROJECT:
${JSON.stringify(
  params.project ?? {},
  null,
  2,
)}

CLIENT:
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

Respond only to the latest user message.
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
      'Tell me a little about what you would like to build.';

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
      workflow,
      pricing,
      timeline,

      /*
       * IMPORTANT:
       *
       * Proposal content is intentionally NOT returned
       * to the frontend/chat.
       *
       * Proposal is generated and emailed internally.
       */

      proposal: undefined,

      llm: {
        provider: 'openrouter',
        model: 'aira-natural',
      },
    };
  }

  /*
   * ==========================================================
   * HELPERS
   * ==========================================================
   */

  private hasEnoughForEstimate(
    project: any,
  ): boolean {
    return Boolean(
      project?.projectType &&
      project?.industry &&
      project?.goal &&
      this.toList(
        project?.features,
      ).length > 0 &&
      project?.technology &&
      project?.seo,
    );
  }

  private hasStartedProject(
    project: any,
    client: any,
  ): boolean {
    return Boolean(
      client?.name ||
      client?.phone ||
      project?.name ||
      project?.industry ||
      project?.projectType ||
      project?.goal ||
      project?.audience ||
      this.toList(
        project?.features,
      ).length > 0,
    );
  }

  private greetingMessage(
    language:
      | 'en'
      | 'te-en'
      | 'te'
      | 'other',
  ): string {
    if (language === 'te') {
      return 'Hello! మీరు ఏం build చేయాలనుకుంటున్నారో కొంచెం చెప్పండి.';
    }

    if (language === 'te-en') {
      return 'Hello! Mee website lo em build cheyyalanukuntunnaro konchem cheppandi.';
    }

    return 'Hello! Tell me a little about what you’d like to build.';
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

    for (const pattern of patterns) {
      const match =
        message.match(pattern);

      if (match?.[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

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

  private toList(
    value?: string | string[],
  ): string[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value
        .map(String)
        .map((item) =>
          item.trim(),
        )
        .filter(Boolean);
    }

    return value
      .split(',')
      .map((item) =>
        item.trim(),
      )
      .filter(Boolean);
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
    if (language === 'te') {
      return 'మీకు ఏం కావాలో చెప్పండి.';
    }

    if (language === 'te-en') {
      return 'Meeku em kavalo cheppandi.';
    }

    return 'Tell me what you need.';
  }

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
}