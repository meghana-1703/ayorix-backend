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
import { EmailService } from '../../email/email.service';

type Language = 'en' | 'te-en' | 'te';

type Field =
  | 'clientName'
  | 'businessName'
  | 'phone'
  | 'industry'
  | 'projectType'
  | 'goal'
  | 'audience'
  | 'features'
  | 'technology'
  | 'seo'
  | 'email';

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
    private readonly emailService: EmailService,
  ) {}

  /*
  ============================================================
  MAIN FLOW
  ============================================================
  */

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
    ------------------------------------------------------------
    EMPTY MESSAGE
    ------------------------------------------------------------
    */

    if (!message) {
      return this.response(
        input,
        'Please tell me a little about your project.',
        undefined,
        undefined,
        project,
        client,
        undefined,
        undefined,
        {
          shouldAskQuestion: true,
          nextMissingField: this.getNextField(
            project,
            client,
          ),
          currentStage: 'DISCOVERY',
          nextStage: 'DISCOVERY',
        },
        [],
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

      project = conversation.project;

      history = conversation.messages ?? [];

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

    const decision =
      this.decisionService.decide(
        intent.intent,
      );

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
    5. GREETING
    ============================================================
    */

    if (this.isGreeting(message)) {
      const nextField =
        this.getNextField(
          project,
          client,
        );

      return this.response(
        input,
        this.greeting(language),
        intent,
        decision,
        project,
        client,
        undefined,
        undefined,
        {
          shouldAskQuestion: true,
          nextMissingField: nextField,
          currentStage: 'DISCOVERY',
          nextStage: nextField
            ? this.stageForField(nextField)
            : 'COMPLETE',
        },
        this.getQuestionOptions(
          nextField,
        ),
      );
    }

    /*
    ============================================================
    6. FIND CURRENT QUESTION
    ============================================================
    */

    const expectedField =
      this.getNextField(
        project,
        client,
      );

      /*
============================================================
6A. TECHNOLOGY RECOMMENDATION ACKNOWLEDGEMENT
============================================================
*/

if (
  project?.technology &&
  project.technology !==
    'Recommended by AYORIX' &&
  expectedField === 'seo' &&
  this.isAcknowledgement(message)
) {
  return this.response(
    input,
    this.questionText(
      'seo',
      language,
    ),
    intent,
    decision,
    project,
    client,
    undefined,
    undefined,
    {
      shouldAskQuestion: true,
      nextMissingField: 'seo',
      currentStage: 'DISCOVERY',
      nextStage: 'DISCOVERY',
    },
    this.getQuestionOptions('seo'),
  );
}

    /*
    ============================================================
    7. SAVE ANSWER
    ============================================================
    */

    if (
      expectedField &&
      input.conversationId &&
      input.clientId
    ) {
      const saved =
        await this.saveAnswerForField({
          field: expectedField,
          message,
          project,
          client,
          conversationId:
            input.conversationId,
          clientId:
            input.clientId,
        });

      project =
        saved.project ?? project;

      client =
        saved.client ?? client;
    }

    /*
    ============================================================
    8. REFRESH MEMORY
    ============================================================
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
============================================================
9. TECHNOLOGY RECOMMENDATION
============================================================
*/

if (
  expectedField === 'technology' &&
  project?.technology ===
    'Recommended by AYORIX'
) {
  const recommendation =
    this.recommendTechnology(
      project,
    );

  project =
    await this.memoryService.updateProject(
      project.id,
      {
        technology:
          recommendation,
      },
    );

  return this.response(
    input,

    `Based on your project requirements, I recommend ${recommendation}. It’s a strong choice for performance, scalability, and SEO.`,

    intent,
    decision,
    project,
    client,
    undefined,
    undefined,

    {
      shouldAskQuestion: false,
      nextMissingField: 'seo',
      currentStage: 'DISCOVERY',
      nextStage: 'DISCOVERY',
    },

    [],
  );
}
    /*
    ============================================================
    10. CALCULATE PRICE + TIMELINE
    ============================================================
    */

    let pricing: any;
    let timeline: any;

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
      ----------------------------------------------------------
      SAVE AUTOMATIC ESTIMATE
      ----------------------------------------------------------
      */

      if (
        input.conversationId &&
        project?.id
      ) {
        project =
          await this.memoryService.updateProject(
            project.id,
            {
              budget:
                `${pricing.currency} ${pricing.estimatedPrice}`,

              timeline:
                `${timeline.estimatedDays} days`,
            },
          );
      }
    }

    /*
    ============================================================
    11. FIND NEXT FIELD
    ============================================================
    */

    const nextField =
      this.getNextField(
        project,
        client,
      );

    /*
    ============================================================
    12. COMPLETE → SEND PROPOSAL
    ============================================================
    */

    if (!nextField) {
      if (
        pricing &&
        timeline &&
        client?.email &&
        project?.id
      ) {
        return await this.sendProposal(
          input,
          project,
          client,
          pricing,
          timeline,
          intent,
          decision,
          language,
        );
      }
    }

    /*
    ============================================================
    13. ASK NEXT QUESTION
    ============================================================
    */

    if (nextField) {
      return this.response(
        input,
        this.questionText(
          nextField,
          language,
        ),
        intent,
        decision,
        project,
        client,
        pricing,
        timeline,
        {
          shouldAskQuestion: true,
          nextMissingField:
            nextField,
          currentStage:
            this.stageForField(
              nextField,
            ),
          nextStage:
            this.stageForField(
              nextField,
            ),
        },
        this.getQuestionOptions(
          nextField,
        ),
      );
    }

    /*
    ============================================================
    14. FALLBACK
    ============================================================
    */

    const natural =
      await this.generateNaturalResponse({
        message,
        project,
        client,
        history,
        language,
      });

    return this.response(
      input,
      natural,
      intent,
      decision,
      project,
      client,
      pricing,
      timeline,
      {
        shouldAskQuestion: false,
        currentStage:
          project?.status ??
          'DISCOVERY',
      },
      [],
    );
  }

  /*
  ============================================================
  QUESTION ORDER
  ============================================================
  */

  private getNextField(
    project: any,
    client: any,
  ): Field | undefined {
    /*
    01 CLIENT NAME
    */

    if (!client?.name) {
      return 'clientName';
    }

    /*
    02 BUSINESS NAME
    */

    if (!project?.name) {
      return 'businessName';
    }

    /*
    03 BUSINESS TYPE
    */

    if (!project?.industry) {
      return 'industry';
    }

    /*
    04 WEBSITE TYPE
    */

    if (!project?.projectType) {
      return 'projectType';
    }

    /*
    05 GOAL
    */

    if (!project?.goal) {
      return 'goal';
    }

    /*
    06 AUDIENCE
    */

    if (!project?.audience) {
      return 'audience';
    }

    /*
    07 FEATURES
    */

    if (
      this.toList(
        project?.features,
      ).length === 0
    ) {
      return 'features';
    }

    /*
    08 TECHNOLOGY
    */

    if (!project?.technology) {
      return 'technology';
    }

    /*
    09 SEO
    */

    if (!project?.seo) {
      return 'seo';
    }

    /*
    10 PHONE
    */

    if (!client?.phone) {
      return 'phone';
    }

    /*
    11 EMAIL
    */

    if (!client?.email) {
      return 'email';
    }

    /*
    TIMELINE + PRICE ARE AUTOMATIC.
    */

    return undefined;
  }

  /*
  ============================================================
  SAVE ANSWER
  ============================================================
  */

  private async saveAnswerForField(params: {
    field: Field;
    message: string;
    project: any;
    client: any;
    conversationId: string;
    clientId: string;
  }) {
    let project =
      params.project;

    let client =
      params.client;

    const value =
      params.message.trim();

    /*
    CLIENT NAME
    */

    if (
      params.field ===
      'clientName'
    ) {
      const name =
        this.cleanSimpleAnswer(
          value,
        );

      if (
        name &&
        !this.looksLikeEmail(name) &&
        !this.looksLikePhone(name)
      ) {
        client =
          await this.memoryService.updateClient(
            params.clientId,
            {
              name,
            },
          );
      }
    }

    /*
    BUSINESS NAME
    */

    if (
      params.field ===
      'businessName'
    ) {
      const name =
        this.cleanSimpleAnswer(
          value,
        );

      if (
        name &&
        !this.looksLikeEmail(name) &&
        !this.looksLikePhone(name)
      ) {
        project =
          await this.memoryService.updateProject(
            project.id,
            {
              name,
            },
          );
      }
    }

    /*
    INDUSTRY
    */

    if (
      params.field ===
      'industry'
    ) {
      project =
        await this.memoryService.updateProject(
          project.id,
          {
            industry:
              this.normalizeIndustry(
                value,
              ),
          },
        );
    }

    /*
    PROJECT TYPE
    */

    if (
      params.field ===
      'projectType'
    ) {
      project =
        await this.memoryService.updateProject(
          project.id,
          {
            projectType:
              this.normalizeProjectType(
                value,
              ),
          },
        );
    }

    /*
    GOAL
    */

    if (
      params.field ===
      'goal'
    ) {
      project =
        await this.memoryService.updateProject(
          project.id,
          {
            goal: this.cleanSimpleAnswer(
              value,
            ),
          },
        );
    }

    /*
    AUDIENCE
    */

    if (
      params.field ===
      'audience'
    ) {
      project =
        await this.memoryService.updateProject(
          project.id,
          {
            audience:
              this.cleanSimpleAnswer(
                value,
              ),
          },
        );
    }

    /*
    FEATURES
    */

    if (
      params.field ===
      'features'
    ) {
      const existing =
        this.toList(
          project?.features,
        );

      /*
      DONE
      */

      if (
        !this.isDoneOption(value)
      ) {
        const selected =
          this.extractFeaturesFromAnswer(
            value,
          );

        

        const merged = [
          ...new Set([
            ...existing,
            ...selected,
          ]),
        ];

        if (
          merged.length > 0
        ) {
          project =
            await this.memoryService.updateProject(
              project.id,
              {
                features: merged,
              },
            );
        }
      }
    }

    /*
    TECHNOLOGY
    */

    if (
      params.field ===
      'technology'
    ) {
      project =
        await this.memoryService.updateProject(
          project.id,
          {
            technology:
              this.normalizeTechnology(
                value,
              ),
          },
        );
    }

    /*
    SEO
    */

    if (
      params.field ===
      'seo'
    ) {
      project =
        await this.memoryService.updateProject(
          project.id,
          {
            seo:
              this.normalizeSeo(
                value,
              ),
          },
        );
    }

    /*
    PHONE
    */

    if (
      params.field ===
      'phone'
    ) {
      const phone =
        this.extractPhoneNumber(
          value,
        );

      if (phone) {
        client =
          await this.memoryService.updateClient(
            params.clientId,
            {
              phone,
            },
          );
      }
    }

    /*
    EMAIL
    */

    if (
      params.field ===
      'email'
    ) {
      const email =
        this.extractEmail(
          value,
        );

      if (email) {
        client =
          await this.memoryService.updateClient(
            params.clientId,
            {
              email,
            },
          );
      }
    }

    return {
      project,
      client,
    };
  }

  /*
  ============================================================
  QUESTIONS
  ============================================================
  */

  private questionText(
    field: Field,
    language: Language,
  ): string {
    const questions: Record<
      Field,
      {
        en: string;
        'te-en': string;
        te: string;
      }
    > = {
      clientName: {
        en: 'What is your name?',
        'te-en':
          'Mee name enti?',
        te:
          'మీ పేరు ఏమిటి?',
      },

      businessName: {
        en: 'What is your business name?',
        'te-en':
          'Mee business name enti?',
        te:
          'మీ business పేరు ఏమిటి?',
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
        en: 'Which features would you like on your website? Select what you need.',
        'te-en':
          'Mee website lo ye features kavali? Meeku kavalsinavi select cheyyandi.',
        te:
          'మీ website లో ఏ features కావాలి? మీకు కావాల్సినవి select చేయండి.',
      },

      technology: {
        en: 'Do you have a preferred technology?',
        'te-en':
          'Meeku edaina technology preference undha?',
        te:
          'మీకు ఏదైనా technology preference ఉందా?',
      },

      seo: {
        en: 'What level of SEO would you like for your website?',
        'te-en':
          'Mee website ki ye level SEO kavali?',
        te:
          'మీ websiteకి ఏ స్థాయి SEO కావాలి?',
      },

      phone: {
        en: 'What mobile number can I use to contact you?',
        'te-en':
          'Mimmalni contact cheyyadaniki mee mobile number cheppandi.',
        te:
          'మిమ్మల్ని సంప్రదించడానికి మీ mobile number చెప్పండి.',
      },

      email: {
        en: 'What email address should I use to send your proposal?',
        'te-en':
          'Mee proposal send cheyyadaniki ye email address use cheyyali?',
        te:
          'మీ proposal పంపడానికి ఏ email address ఉపయోగించాలి?',
      },
    };

    const question =
      questions[field];

    if (language === 'te') {
      return question.te;
    }

    if (language === 'te-en') {
      return question['te-en'];
    }

    return question.en;
  }

  /*
  ============================================================
  OPTIONS
  ============================================================
  */

  private getQuestionOptions(
    field?: Field,
  ): string[] {
    if (!field) {
      return [];
    }

    const options: Record<
      Field,
      string[]
    > = {
      clientName: [],

      businessName: [],

      industry: [
        'Restaurant / Food',
        'Salon / Beauty',
        'Clinic / Healthcare',
        'Education',
        'Real Estate',
        'E-commerce',
        'Technology',
        'Professional Services',
        
      ],

      projectType: [
        'Business Website',
        'E-commerce Website',
        'Web Application',
        'Portfolio Website',
        'Landing Page',
        'Not sure',
        
      ],

      goal: [
        'Showcase services',
        'Get more customers',
        'Generate leads',
        'Online orders',
        'Bookings / Reservations',
        'Build brand presence',
        'Multiple goals',
        
      ],

      audience: [
        'Local customers',
        'General public',
        'Small businesses',
        'Startups',
        'Students',
        'Professionals',
        
      ],

      features: [
        'Online Ordering',
        'Table Booking',
        'Payment Gateway',
        'WhatsApp',
        'Contact Form',
        'Google Maps',
        'Admin Panel',
        'Authentication',
        'Search',
        'Reviews / Testimonials',
        
        
      ],

      technology: [
        'React',
        'Next.js',
        'Not sure — recommend',
        
      ],

      seo: [
        'Basic SEO',
        'Local SEO',
        'Advanced SEO',
        'No SEO',
      ],

      phone: [],

      email: [],
    };

    return options[field];
  }

  /*
  ============================================================
  TECHNOLOGY RECOMMENDATION
  ============================================================
  */

  private recommendTechnology(
    project: any,
  ): string {
    const type =
      String(
        project?.projectType ??
        '',
      ).toLowerCase();

    const features =
      this.toList(
        project?.features,
      ).map(
        item =>
          item.toLowerCase(),
      );

    /*
    Web application / complex projects
    */

    if (
      type.includes('web application') ||
      features.includes('admin panel') ||
      features.includes('authentication')
    ) {
      return 'Next.js + TypeScript';
    }

    /*
    E-commerce
    */

    if (
      type.includes('e-commerce') ||
      type.includes('ecommerce')
    ) {
      return 'Next.js + TypeScript';
    }

    /*
    Standard business websites
    */

    return 'Next.js + TypeScript';
  }



  /*
  ============================================================
  NORMALIZERS
  ============================================================
  */

  private normalizeIndustry(
    value: string,
  ): string {
    const text =
      value.toLowerCase();

    if (
      text.includes('restaurant') ||
      text.includes('food') ||
      text.includes('cafe')
    ) {
      return 'Restaurant / Food';
    }

    if (
      text.includes('salon') ||
      text.includes('beauty')
    ) {
      return 'Salon / Beauty';
    }

    if (
      text.includes('clinic') ||
      text.includes('health')
    ) {
      return 'Clinic / Healthcare';
    }

    if (
      text.includes('education') ||
      text.includes('school') ||
      text.includes('college')
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
      text.includes('e-commerce') ||
      text.includes('ecommerce') ||
      text.includes('online store')
    ) {
      return 'E-commerce';
    }

    if (
      text.includes('technology') ||
      text.includes('tech') ||
      text.includes('software')
    ) {
      return 'Technology';
    }

    if (
      text.includes('professional')
    ) {
      return 'Professional Services';
    }

    return this.cleanSimpleAnswer(
      value,
    );
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
      text.includes('landing')
    ) {
      return 'Landing Page';
    }

    if (
      text.includes('business website')
    ) {
      return 'Business Website';
    }

    if (
      text.includes('not sure')
    ) {
      return 'Business Website';
    }

    return this.cleanSimpleAnswer(
      value,
    );
  }

  private normalizeTechnology(
    value: string,
  ): string {
    const text =
      value.toLowerCase();

    if (
      text.includes('not sure') ||
      text.includes('recommend')
    ) {
      return 'Recommended by AYORIX';
    }

    if (
      text.includes('next')
    ) {
      return 'Next.js';
    }

    if (
      text.includes('react')
    ) {
      return 'React';
    }

    return this.cleanSimpleAnswer(
      value,
    );
  }

  private normalizeSeo(
    value: string,
  ): string {
    const text =
      value.toLowerCase();

    if (
      text.includes('advanced')
    ) {
      return 'Advanced SEO';
    }

    if (
      text.includes('local')
    ) {
      return 'Local SEO';
    }

    if (
      text.includes('basic')
    ) {
      return 'Basic SEO';
    }

    if (
      text.includes('no seo')
    ) {
      return 'No SEO';
    }

    return this.cleanSimpleAnswer(
      value,
    );
  }

  /*
  ============================================================
  FEATURES
  ============================================================
  */

  private extractFeaturesFromAnswer(
    message: string,
  ): string[] {
    const text =
      message.toLowerCase();

    const map: Record<
      string,
      string
    > = {
      'online ordering':
        'Online Ordering',

      'online order':
        'Online Ordering',

      'table booking':
        'Table Booking',

      'table reservation':
        'Table Booking',

      'payment gateway':
        'Payment Gateway',

      payment:
        'Payment Gateway',

      razorpay:
        'Payment Gateway',

      stripe:
        'Payment Gateway',

      whatsapp:
        'WhatsApp',

      'contact form':
        'Contact Form',

      'google maps':
        'Google Maps',

      maps:
        'Google Maps',

      'admin panel':
        'Admin Panel',

      'admin dashboard':
        'Admin Panel',

      authentication:
        'Authentication',

      login:
        'Authentication',

      search:
        'Search',

      reviews:
        'Reviews / Testimonials',

      testimonials:
        'Reviews / Testimonials',
    };

    const result: string[] = [];

    for (
      const key of Object.keys(map)
    ) {
      if (
        text.includes(key)
      ) {
        result.push(
          map[key],
        );
      }
    }

    const exactOptions = [
      'Online Ordering',
      'Table Booking',
      'Payment Gateway',
      'WhatsApp',
      'Contact Form',
      'Google Maps',
      'Admin Panel',
      'Authentication',
      'Search',
      'Reviews / Testimonials',
    ];

    for (
      const option of exactOptions
    ) {
      if (
        text ===
        option.toLowerCase()
      ) {
        result.push(option);
      }
    }

    return [
      ...new Set(result),
    ];
  }

  /*
  ============================================================
  ESTIMATE
  ============================================================
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

  /*
  ============================================================
  PROPOSAL EMAIL
  ============================================================
  */

  private async sendProposal(
    input: {
      conversationId?: string;
    },
    project: any,
    client: any,
    pricing: any,
    timeline: any,
    intent: any,
    decision: any,
    language: Language,
  ) {
    const proposal =
      this.proposalService.generate({
        client,

        project: {
          ...project,

          timeline:
            `${timeline.estimatedDays} days`,

          budget:
            `${pricing.currency} ${pricing.estimatedPrice}`,
        },
      });

    /*
    IMPORTANT:
    Proposal content NEVER goes to chat.
    */

    await this.emailService.sendProposalEmail({
      to: client.email,

      clientName:
        client.name ??
        project.name ??
        'Client',

      proposal,
    });

    /*
    MARK COMPLETE
    */

    if (project?.id) {
      project =
        await this.memoryService.updateProject(
          project.id,
          {
            status: 'COMPLETE',
          },
        );
    }

    return this.response(
      input,

      this.getProposalSentMessage(
        language,
      ),

      intent,

      decision,

      project,

      client,

      pricing,

      timeline,

      {
        currentStage: 'COMPLETE',
        nextStage: 'COMPLETE',
        shouldAskQuestion: false,
        nextMissingField:
          undefined,
        missingInformation: [],
      },

      [],
    );
  }

  /*
  ============================================================
  RESPONSE
  ============================================================
  */

  private async response(
    input: {
      conversationId?: string;
    },
    message: string,
    intent?: any,
    decision?: any,
    project?: any,
    client?: any,
    pricing?: any,
    timeline?: any,
    workflow?: any,
    options: string[] = [],
  ) {
    const finalMessage =
      message?.trim() ||
      'Tell me what you need.';

    if (
      input.conversationId
    ) {
      await this.memoryService.saveMessage(
        input.conversationId,
        {
          role: 'assistant',
          content:
            finalMessage,
          intent:
            intent?.intent,
          confidence:
            intent?.confidence,
        },
      );
    }

    return {
      message:
        finalMessage,

      options,

      intent,

      decision,

      workflow,

      pricing,

      timeline,

      /*
      Proposal content is intentionally
      never returned.
      */

      proposal:
        undefined,

      llm: {
        provider:
          'openrouter',

        model:
          'aira-natural',
      },
    };
  }

  /*
  ============================================================
  LANGUAGE
  ============================================================
  */

  private detectResponseLanguage(
    message: string,
  ): Language {
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
        word =>
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
  ============================================================
  GREETING
  ============================================================
  */

  private isGreeting(
    message: string,
  ): boolean {
    return /^(hi|hii|hello|hey|helo|good morning|good afternoon|good evening|good night)$/i.test(
      message.trim(),
    );
  }

  private greeting(
    language: Language,
  ): string {
    if (
      language === 'te'
    ) {
      return 'Hi! మీ project గురించి తెలుసుకోవడానికి కొన్ని quick questions అడుగుతాను.';
    }

    if (
      language === 'te-en'
    ) {
      return 'Hi! Mee project gurinchi konni quick questions adugutha.';
    }

    return 'Hi! I’ll ask a few quick questions to understand your project.';
  }

  /*
  ============================================================
  PROPOSAL SENT
  ============================================================
  */

  private getProposalSentMessage(
    language: Language,
  ): string {
    if (
      language === 'te'
    ) {
      return 'మీ proposal successfully emailకి పంపించాను. Thank you! ❤️';
    }

    if (
      language === 'te-en'
    ) {
      return 'Mee proposal successfully email ki pampinchanu. Thank you! ❤️';
    }

    return 'Your proposal has been successfully sent to your email. Thank you! ❤️';
  }

  /*
  ============================================================
  NATURAL RESPONSE
  ============================================================
  */

  private async generateNaturalResponse(
    params: {
      message: string;
      project: any;
      client: any;
      history: any[];
      language: Language;
    },
  ): Promise<string> {
    const systemPrompt = `
You are AIRA, the AI project consultant for AYORIX Digital Solutions.

You are professional, friendly and concise.

IMPORTANT:

- The application controls the questionnaire.
- Never restart discovery.
- Never ask multiple questions.
- Never ask for budget.
- Never ask the client to choose a timeline.
- Timeline is calculated automatically.
- Price is calculated automatically.
- Never generate or display a proposal inside chat.
- Proposal is emailed directly after all required information is collected.
- Do not expose internal workflow or database details.
- Do not skip questionnaire steps.
- If technology recommendation is needed, recommend a suitable stack based on the project.
- Keep responses short.

Language:
- English -> English
- Roman Telugu / Telugu-English -> Roman Telugu + English
- Telugu script -> Telugu script
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
  params.history.slice(-8),
  null,
  2,
)}

Respond naturally to the latest user message.
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
  ============================================================
  FALLBACK
  ============================================================
  */

  private fallbackResponse(
    language: Language,
  ): string {
    if (
      language === 'te'
    ) {
      return 'సరే, కొనసాగిద్దాం.';
    }

    if (
      language === 'te-en'
    ) {
      return 'Okay, continue cheddam.';
    }

    return 'Okay, let’s continue.';
  }

  /*
  ============================================================
  STAGE
  ============================================================
  */

  private stageForField(
    field: Field,
  ): string {
    switch (field) {
      case 'clientName':
      case 'businessName':
      case 'industry':
      case 'projectType':
      case 'goal':
      case 'audience':
      case 'features':
      case 'technology':
      case 'seo':
        return 'DISCOVERY';

      case 'phone':
      case 'email':
        return 'CONTACT';

      default:
        return 'DISCOVERY';
    }
  }

  /*
  ============================================================
  EMAIL
  ============================================================
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
  ============================================================
  PHONE
  ============================================================
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
  ============================================================
  CLEAN ANSWER
  ============================================================
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

  /*
  ============================================================
  VALIDATION
  ============================================================
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
      value.replace(
        /\s/g,
        '',
      ),
    );
  }

  /*
============================================================
ACKNOWLEDGEMENT
============================================================
*/

private isAcknowledgement(
  message: string,
): boolean {
  return [
    'ok',
    'okay',
    'thanks',
    'thank you',
    'thankyou',
    'sure',
    'great',
    'good',
    'fine',
    'alright',
    'sounds good',
    'perfect',
    'got it',
  ].includes(
    message
      .toLowerCase()
      .trim(),
  );
}

  /*
  ============================================================
  DONE
  ============================================================
  */

  private isDoneOption(
    message: string,
  ): boolean {
    return [
      'done',
      'finish',
      'finished',
      'thats all',
      "that's all",
      'nothing else',
    ].includes(
      message
        .toLowerCase()
        .trim(),
    );
  }

  /*
  ============================================================
  LIST
  ============================================================
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
          item =>
            item.trim(),
        )
        .filter(Boolean);
    }

    return value
      .split(',')
      .map(
        item =>
          item.trim(),
      )
      .filter(Boolean);
  }
}