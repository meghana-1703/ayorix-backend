import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { IntentService } from '../intent/intent.service';
import { DecisionService } from '../decision/decision.service';
import { PricingService } from '../pricing/pricing.service';
import { TimelineService } from '../timeline/timeline.service';
import { MemoryService } from '../memory/memory.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ProposalService } from '../proposal/proposal.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class AiraOrchestratorService {
  constructor(
    private readonly intentService: IntentService,
    private readonly decisionService: DecisionService,
    private readonly pricingService: PricingService,
    private readonly timelineService: TimelineService,
    private readonly memoryService: MemoryService,
    private readonly workflowService: WorkflowService,
    private readonly proposalService: ProposalService,
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
    const message = input.message?.trim();

    if (!message) {
      throw new BadRequestException('Message is required');
    }

    let client = input.client;
    let project = input.project;
    let history = input.conversationHistory ?? [];
    let pricing: any = undefined;
    let timeline: any = undefined;

    /*
    ============================================================
    1. LOAD EXISTING CONVERSATION
    ============================================================
    */

    if (input.conversationId) {
      if (!input.clientId) {
        throw new BadRequestException('Client ID is required');
      }

      const conversation =
        await this.memoryService.getConversationForClient(
          input.conversationId,
          input.clientId,
        );

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      project = conversation.project;
      history = conversation.messages ?? [];

      client = await this.memoryService.getClient(
        conversation.clientId,
      );
    }

    /*
    ============================================================
    2. LANGUAGE
    ============================================================
    */

    const language = this.detectLanguage(message);

    /*
    ============================================================
    3. INTENT
    ============================================================
    */

    const intent = this.intentService.detect(message);

    const decision = this.decisionService.decide(
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
    5. EXTRACT CLIENT INFORMATION
    ============================================================
    */

    if (input.clientId) {
      const extractedName =
        this.extractClientName(message);

      if (extractedName) {
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
        this.extractPhone(message);

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
============================================================
6. EXTRACT PROJECT INFORMATION
============================================================
*/

if (project?.id) {
  const extracted =
    this.extractProjectData(
      message,
      project,
    );

  if (Object.keys(extracted).length > 0) {
    const updatedProject =
      await this.memoryService.updateProject(
        project.id,
        extracted,
      );

    // Keep local state updated even if updateProject
    // does not return the complete project object.
    project = {
      ...project,
      ...extracted,
      ...(updatedProject ?? {}),
    };
  }

  /*
FEATURES
*/

const features =
  this.extractFeatures(message);

if (features.length > 0) {
  const existing =
    this.toList(project?.features);

  const merged = [
    ...new Set([
      ...existing,
      ...features,
    ]),
  ];

  const updatedProject =
    await this.memoryService.updateProject(
      project.id,
      {
        features: merged,
      },
    );

  project = {
    ...project,
    ...(updatedProject ?? {}),
    features: merged,
  };
}

/*
TECHNOLOGY
*/
const isTechnologyDecision =
  message.trim().toLowerCase() === 'you decide';

const technology =
  this.extractTechnology(
    message,
    project,
  );

if (technology) {
  const updatedProject =
    await this.memoryService.updateProject(
      project.id,
      {
        technology,
      },
    );

  if (
    isTechnologyDecision &&
    technology
  ) {
    return this.respond(
      input,
      this.localize(
        language,
        `Based on your project requirements, I’d recommend ${technology}. It provides a strong foundation for your website and can be scaled as your project grows.`,
        `Mee project requirements batti, ${technology} ni recommend chesthanu. Idi mee website ki strong foundation istundi and future lo project grow ayina easy ga scale cheyyachu.`,
      ),
      [],
      intent,
      decision,
      project,
      client,
      pricing,
      project.timeline,
    );
  }

  project = {
    ...project,
    ...(updatedProject ?? {}),
    technology,
  };
}

/*
SEO
*/

const seo =
  this.extractSeo(message);

if (seo) {
  const updatedProject =
    await this.memoryService.updateProject(
      project.id,
      {
        seo,
      },
    );

  project = {
    ...project,
    ...(updatedProject ?? {}),
    seo,
  };
}

/*
TIMELINE
*/

const projectTimeline =
  this.extractTimeline(message);

if (projectTimeline) {
  const updatedProject =
    await this.memoryService.updateProject(
      project.id,
      {
        timeline: projectTimeline,
      },
    );

  project = {
    ...project,
    ...(updatedProject ?? {}),
    timeline: projectTimeline,
  };
}
}

   
/*
============================================================
7. THANKS AFTER PROPOSAL ONLY
============================================================
*/

if (
  this.isThanks(message) &&
  this.wasProposalSent(history)
) {
  return this.respond(
    input,
    this.localize(
      language,
      'You’re welcome! Thank you for choosing AYORIX Digital Solutions. AYORIX will be in touch with you shortly. Wishing you the best with your project.',
      'You’re welcome bro! AYORIX Digital Solutions ni choose chesinanduku thanks. AYORIX team nunchi meeku shortly contact chestham. Mee project ki all the best!'
    ),
    [],
    intent,
    decision,
    project,
    client,
    pricing,
    timeline,
  );
}

/*
============================================================
8. GREETING
============================================================
*/

if (this.isGreeting(message)) {
  return this.respond(
    input,
    this.greeting(language, project),
    [],
    intent,
    decision,
    project,
    client,
    pricing,
    timeline,
  );
}

    /*
    ============================================================
    8. DETERMINE NEXT QUESTION
    ============================================================
    */

    let workflow =
      this.workflowService.determine({
        project,
        client,
      });

    const nextField =
      this.getNextField(
        project,
        client,
      );

    /*
    ============================================================
    9. CALCULATE PRICE / TIMELINE
    ============================================================
    */

    if (project?.projectType) {
      pricing =
        this.pricingService.calculate({
          projectType:
            project.projectType,
          features:
            this.toList(project.features),
          seo: project.seo,
          complexity:
            project.complexity,
        });

      timeline =
        this.timelineService.calculate({
          projectType:
            project.projectType,
          features:
            this.toList(project.features),
          seo: project.seo,
          complexity:
            project.complexity,
        });
    }

    /*
    ============================================================
    10. STORE AUTOMATIC TIMELINE + PRICE
    ============================================================
    */

    if (
      input.conversationId &&
      project?.id &&
      pricing &&
      timeline
    ) {
      project =
        await this.memoryService.updateProject(
          project.id,
          {
            budget:
              `${pricing.currency} ${pricing.estimatedPrice}`,
            timeline:
              project.timeline ||
              `${timeline.estimatedDays} days`,
          },
        );
    }

    /*
============================================================
11. EMAIL RECEIVED AFTER PROPOSAL CONFIRMATION
============================================================
*/

const extractedEmail =
  this.extractEmail(message);

if (
  extractedEmail &&
  project?.id &&
  this.wasProposalQuestionShown(history)
) {
  client =
    await this.memoryService.updateClient(
      input.clientId!,
      {
        email: extractedEmail,
      },
    );

  return this.sendProposal(
    input,
    client,
    project,
    pricing,
    timeline,
    language,
    intent,
    decision,
  );
}

    /*
    ============================================================
    11. REFRESH NEXT FIELD
    ============================================================
    */

    const refreshedField =
      this.getNextField(
        project,
        client,
      );

    /*
    ============================================================
    12. PHONE IS MANDATORY
    ============================================================
    */

    if (
      refreshedField === 'phone'
    ) {
      return this.respond(
        input,
        this.question(
          'phone',
          language,
        ),
        this.options(
          'phone',
          language,
        ),
        intent,
        decision,
        project,
        client,
        pricing,
        timeline,
      );
    }

    /*
    ============================================================
    13. PROJECT QUESTIONS
    ============================================================
    */

    if (refreshedField) {
      return this.respond(
        input,
        this.question(
          refreshedField,
          language,
        ),
        this.options(
          refreshedField,
          language,
        ),
        intent,
        decision,
        project,
        client,
        pricing,
        timeline,
      );
    }

    /*
    ============================================================
    14. EVERYTHING COMPLETE
    ============================================================
    */

    const complete =
      this.isRequirementsComplete(
        project,
        client,
      );

    if (complete) {
      /*
      If proposal has not been confirmed yet,
      show summary first.
      */

      const proposalWasShown =
        this.wasProposalQuestionShown(
          history,
        );

      const proposalConfirmed =
        this.isConfirmation(message);

      const proposalDeclined =
        this.isDecline(message);

      /*
      DECLINED
      */

      if (
        proposalWasShown &&
        proposalDeclined
      ) {
        return this.respond(
          input,
          this.localize(
            language,
            'Thanks for visiting AYORIX Digital Solutions. All the best with your project!',
            'AYORIX Digital Solutions ki visit chesinanduku thanks bro. Mee project ki all the best!',
          ),
          [],
          intent,
          decision,
          project,
          client,
          pricing,
          timeline,
        );
      }

      /*
      CONFIRMED
      */

      if (
        proposalWasShown &&
        proposalConfirmed
      ) {
        if (!client?.email) {
          return this.respond(
            input,
            this.question(
              'email',
              language,
            ),
            [],
            intent,
            decision,
            project,
            client,
            pricing,
            timeline,
          );
        }

        return this.sendProposal(
          input,
          client,
          project,
          pricing,
          timeline,
          language,
          intent,
          decision,
        );
      }

      /*
      SHOW PROPOSAL CONFIRMATION
      */

      if (!proposalWasShown) {
        return this.respond(
          input,
          this.proposalQuestion(
            language,
          ),
          this.options(
            'proposal',
            language,
          ),
          intent,
          decision,
          project,
          client,
          pricing,
          timeline,
        );
      }

      /*
      EMAIL AFTER CONFIRMATION
      */

      if (
        proposalWasShown &&
        !client?.email
      ) {
        return this.respond(
          input,
          this.question(
            'email',
            language,
          ),
          [],
          intent,
          decision,
          project,
          client,
          pricing,
          timeline,
        );
      }
    }

    /*
    ============================================================
    15. SAFE FALLBACK
    ============================================================
    */

    return this.respond(
      input,
      this.localize(
        language,
        'Tell me what you would like to build.',
        'Em build cheyyalanukuntunnaro cheppandi bro.',
      ),
      [],
      intent,
      decision,
      project,
      client,
      pricing,
      timeline,
    );
  }

  /*
  ============================================================
  NEXT FIELD
  ============================================================
  */

  private getNextField(
    project: any,
    client: any,
  ): string | undefined {
   if (
  !project?.name ||
  this.isInvalidBusinessName(project.name)
) {
  return 'businessName';
}
    if (!project?.projectType) {
      return 'projectType';
    }

    if (!project?.industry) {
      return 'industry';
    }

    if (!project?.goal) {
      return 'goal';
    }

    if (!project?.audience) {
      return 'audience';
    }

    if (
      this.toList(project?.features).length === 0
    ) {
      return 'features';
    }

    if (!project?.technology) {
      return 'technology';
    }

    if (!project?.seo) {
      return 'seo';
    }

    /*
    Timeline is calculated automatically.
    */

    if (!project?.timeline) {
      return 'timeline';
    }

    /*
    NEVER ask budget.
    */

    if (!client?.phone) {
      return 'phone';
    }

    return undefined;
  }

  /*
  ============================================================
  QUESTIONS
  ============================================================
  */

  private question(
    field: string,
    language: 'en' | 'te-en',
  ): string {
    const questions: Record<
      string,
      [string, string]
    > = {
      businessName: [
  'What is the name of your business or brand?',
  'Mee business or brand name enti?',
],

projectType: [
  'What type of website are you looking to build?',
  'Meeku ye type of website build cheyyali?',
],

industry: [
  'Which industry or business category best describes your business?',
  'Mee business ye industry or category ki belong avtundi?',
],

goal: [
  'What would you like the website to achieve for your business?',
  'Mee business kosam website em achieve cheyyali?',
],

audience: [
  'Who are you primarily looking to reach with the website?',
  'Website tho mainly evarini reach avvali?',
],

features: [
  'What functionality would you like your website to offer?',
  'Website lo ye functionality kavali?',
],

technology: [
  'Do you have a preferred technology or tech stack?',
  'Meeku preferred technology or tech stack emaina unda?',
],

seo: [
  'Would you like SEO optimization to be included?',
  'SEO optimization include cheyyala?',
],

timeline: [
  'When would you ideally like your website to be completed?',
  'Website ideally eppatiki complete kavali?',
],

phone: [
  'What is the best phone number to reach you regarding this project?',
  'Ee project kosam mimmalni contact cheyyadaniki best phone number enti?',
],

email: [
  'Which email address should I use to send your proposal?',
  'Proposal send cheyyadaniki ye email address use cheyyali?',
],
    };

    const pair = questions[field];

    if (!pair) {
      return '';
    }

    return language === 'te-en'
      ? pair[1]
      : pair[0];
  }

  /*
  ============================================================
  OPTIONS
  ============================================================
  */

  private options(
    field: string,
    language: 'en' | 'te-en',
  ): string[] {
    const en: Record<
      string,
      string[]
    > = {
      projectType: [
        'Business Website',
        'E-commerce Website',
        'Web Application',
        'Portfolio Website',
        'Other',
      ],

      industry: [
        'Restaurant / Food',
        'Software / Technology',
        'Education',
        'Healthcare',
        'Real Estate',
        'Beauty / Salon',
        'Photography',
        'Other',
      ],

      goal: [
        'Get more customers',
        'Generate leads',
        'Sell products online',
        'Build brand presence',
        'Provide information',
        'Other',
      ],

     audience: [
  'Local businesses',
  'Startups',
  'General consumers',
  'Students',
  'Professionals',
  'Other',
],

      features: [
        'Online ordering',
        'Contact form',
        'Payment gateway',
        'Booking system',
        'Authentication',
        'Admin dashboard',
        'CMS',
        'Search',
        'Live chat',
        'Reviews / Testimonials',
      ],

      technology: [
        'React + Tailwind CSS',
        'Next.js',
        'Custom stack',
        'You decide',
      ],

      seo: [
        'Yes, include SEO',
        'No SEO',
      ],

      timeline: [
        '1–2 weeks',
        '2–4 weeks',
        '1–2 months',
        'Flexible',
      ],

      proposal: [
        'Yes, send proposal',
        'No, not now',
      ],
    };

    const teEn: Record<
      string,
      string[]
    > = {
      projectType: [
        'Business Website',
        'E-commerce Website',
        'Web Application',
        'Portfolio Website',
        'Other',
      ],

      industry: [
        'Restaurant / Food',
        'Software / Technology',
        'Education',
        'Healthcare',
        'Real Estate',
        'Beauty / Salon',
        'Photography',
        'Other',
      ],

      goal: [
        'More customers kavali',
        'Leads generate cheyyali',
        'Products online sell cheyyali',
        'Brand presence build cheyyali',
        'Information provide cheyyali',
        'Other',
      ],

      audience: [
        'Local customers',
        'Small businesses',
        'General consumers',
        'Students',
        'Professionals',
        'Other',
      ],

      features: [
        'Online ordering',
        'Contact form',
        'Payment gateway',
        'Booking system',
        'Authentication',
        'Admin dashboard',
        'CMS',
        'Search',
        'Live chat',
        'Reviews / Testimonials',
      ],

      technology: [
        'React + Tailwind CSS',
        'Next.js',
        'Custom stack',
        'You decide',
      ],

      seo: [
        'Yes, SEO include cheyyandi',
        'No SEO',
      ],

      timeline: [
        '1–2 weeks',
        '2–4 weeks',
        '1–2 months',
        'Flexible',
      ],

      proposal: [
        'Yes, proposal send cheyyandi',
        'No, ippudu vaddu',
      ],
    };

    return language === 'te-en'
      ? teEn[field] ?? []
      : en[field] ?? [];
  }

  /*
  ============================================================
  GREETING
  ============================================================
  */

  private greeting(
    language: 'en' | 'te-en',
    project: any,
  ): string {
   if (project?.name) {
      return this.localize(
        language,
        `Welcome back. Let's continue your project.`,
        `Welcome back bro. Mana project ni continue cheddam.`,
      );
    }

    return this.localize(
      language,
      `Hi, I’m AIRA. Tell me what you have in mind — it doesn’t have to be fully figured out.`,
      `Hi, nenu AIRA. Mee mind lo unna idea ni cheppandi — complete ga figured out avvalsina avasaram ledu.`,
    );
  }

  /*
============================================================
PROJECT EXTRACTION
============================================================
*/

private extractProjectData(
  message: string,
  project: any,
): Record<string, any> {
  const data: Record<string, any> = {};
  const text = message.trim();
  const lower = text.toLowerCase();

/*
BUSINESS NAME
*/

if (
  !project?.name ||
  this.isInvalidBusinessName(project.name)
) {
  const businessName =
    this.extractBusinessName(message);

  if (businessName) {
    data.name = businessName;
  }
}

/*
PROJECT TYPE
*/

if (
  lower.includes('ecommerce') ||
  lower.includes('e-commerce') ||
  lower.includes('online store') ||
  lower.includes('online shop') ||
  lower.includes('ecommerce website') ||
  lower.includes('online store website')
) {
  data.projectType = 'E-commerce Website';

} else if (
  lower.includes('web application') ||
  lower.includes('web app') ||
  lower.includes('web application website')
) {
  data.projectType = 'Web Application';

} else if (
  lower.includes('portfolio') ||
  lower.includes('portfolio website') ||
  lower.includes('personal website')
) {
  data.projectType = 'Portfolio Website';

} else if (
  lower === 'website' ||
  lower === 'a website' ||
  lower === 'need a website' ||
  lower === 'i need a website' ||
  lower === 'want a website' ||
  lower === 'i want a website' ||
  lower === 'looking for a website' ||
  lower === 'looking to build a website' ||
  lower === 'build a website' ||
  lower === 'create a website' ||
  lower === 'make a website' ||
  lower === 'need website' ||
  lower === 'want website' ||
  lower.includes('business website')
) {
  data.projectType = 'Business Website';
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
  data.industry = 'Restaurant / Food';

} else if (
  lower.includes('software') ||
  lower.includes('technology') ||
  lower.includes('tech')
) {
  data.industry = 'Software / Technology';

} else if (
  lower.includes('school') ||
  lower.includes('college') ||
  lower.includes('education')
) {
  data.industry = 'Education';

} else if (
  lower.includes('hospital') ||
  lower.includes('clinic') ||
  lower.includes('healthcare')
) {
  data.industry = 'Healthcare';

} else if (
  lower.includes('real estate') ||
  lower.includes('property')
) {
  data.industry = 'Real Estate';

} else if (
  lower.includes('salon') ||
  lower.includes('beauty') ||
  lower.includes('spa')
) {
  data.industry = 'Beauty / Salon';

} else if (
  lower.includes('photography') ||
  lower.includes('photographer')
) {
  data.industry = 'Photography';
}

/*
GOAL
*/

if (
  lower.includes('more customers') ||
  lower.includes('more clients')
) {
  data.goal = 'Get more customers';

} else if (
  lower.includes('generate leads') ||
  lower.includes('more leads') ||
  lower.includes('lead generation')
) {
  data.goal = 'Generate leads';

} else if (
  lower.includes('sell products') ||
  lower.includes('sell online')
) {
  data.goal = 'Sell products online';

} else if (
  lower.includes('brand presence') ||
  lower.includes('branding')
) {
  data.goal = 'Build brand presence';
}

/*
AUDIENCE
*/

if (
  lower.includes('local businesses') ||
  lower.includes('local business')
) {
  data.audience = 'Local businesses';

} else if (
  lower.includes('startup') ||
  lower.includes('startups')
) {
  data.audience = 'Startups';

} else if (
  lower.includes('general consumers') ||
  lower.includes('consumers')
) {
  data.audience = 'General consumers';

} else if (
  lower.includes('students') ||
  lower.includes('student')
) {
  data.audience = 'Students';

} else if (
  lower.includes('professionals') ||
  lower.includes('professional')
) {
  data.audience = 'Professionals';
}

/*
IMPORTANT:
Always return extracted data.
*/

return data;
}
  /*
  ============================================================
  FEATURES
  ============================================================
  */

  private extractFeatures(
    message: string,
  ): string[] {
    const text =
      message.toLowerCase();

    const features: string[] = [];

    const map: Record<
      string,
      string
    > = {
      'online ordering':
        'Online ordering',
      'online order':
        'Online ordering',
      'payment':
        'Payment gateway',
      'razorpay':
        'Payment gateway',
      'stripe':
        'Payment gateway',
      'checkout':
        'Payment gateway',
      'contact form':
        'Contact form',
      'booking':
        'Booking system',
      'appointment':
        'Booking system',
      'reservation':
        'Booking system',
      'login':
        'Authentication',
      'authentication':
        'Authentication',
      'admin dashboard':
        'Admin dashboard',
      'admin panel':
        'Admin dashboard',
      'dashboard':
        'Admin dashboard',
      'cms':
        'CMS',
      'search':
        'Search',
      'live chat':
        'Live chat',
      'chat':
        'Live chat',
      'reviews':
        'Reviews / Testimonials',
      'testimonials':
        'Reviews / Testimonials',
    };

    for (const key of Object.keys(map)) {
      if (text.includes(key)) {
        features.push(map[key]);
      }
    }

    return [
      ...new Set(features),
    ];
  }

  /*
  ============================================================
  TECHNOLOGY
  ============================================================
  */

private extractTechnology(
  message: string,
  project?: any,
): string | undefined {
  const text = message.toLowerCase().trim();

  if (
    text === 'you decide' ||
    text.includes('you decide')
  ) {
    return this.recommendTechnology(project);
  }

  if (
    text.includes('react') &&
    text.includes('tailwind')
  ) {
    return 'React + Tailwind CSS';
  }

  if (text.includes('react')) {
    return 'React';
  }

  if (
    text.includes('next.js') ||
    text.includes('nextjs')
  ) {
    return 'Next.js';
  }

  if (
    text.includes('custom stack')
  ) {
    return 'Custom stack';
  }

  return undefined;
}


private recommendTechnology(
  project: any,
): string {
  const projectType =
    String(project?.projectType ?? '').toLowerCase();

  const features =
    this.toList(project?.features)
      .map((feature) => feature.toLowerCase());

  const seo =
    String(project?.seo ?? '').toLowerCase();

  const hasComplexFeatures =
    features.some((feature) =>
      [
        'authentication',
        'admin dashboard',
        'payment gateway',
        'booking system',
        'live chat',
        'cms',
      ].some((item) =>
        feature.includes(item),
      ),
    );

  if (
    projectType.includes('web application') ||
    hasComplexFeatures
  ) {
    return 'Next.js';
  }

  if (
    seo.includes('seo') ||
    projectType.includes('business') ||
    projectType.includes('portfolio')
  ) {
    return 'Next.js';
  }

  return 'React + Tailwind CSS';
}
  /*
  ============================================================
  SEO
  ============================================================
  */

  private extractSeo(
    message: string,
  ): string | undefined {
    const text =
      message.toLowerCase();

    if (
      text.includes('no seo') ||
      text.includes('without seo')
    ) {
      return 'No SEO';
    }

    if (
      text.includes('seo') ||
      text.includes('google ranking')
    ) {
      return 'SEO optimization';
    }

    return undefined;
  }

  /*
  ============================================================
  TIMELINE
  ============================================================
  */

  private extractTimeline(
    message: string,
  ): string | undefined {
    const text =
      message.toLowerCase();

    const weeks =
      text.match(
        /(\d+)\s*weeks?/i,
      );

    if (weeks?.[1]) {
      return `${weeks[1]} weeks`;
    }

    const days =
      text.match(
        /(\d+)\s*days?/i,
      );

    if (days?.[1]) {
      return `${days[1]} days`;
    }

    return undefined;
  }

  /*
  ============================================================
  CLIENT NAME
  ============================================================
  */

  private extractClientName(
    message: string,
  ): string | undefined {
    const match =
      message.match(
        /(?:my name is|i am|i'm|this is)\s+([a-zA-Z][a-zA-Z\s]{1,40})(?:[.!?,]|$)/i,
      );

    return match?.[1]
      ?.trim();
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

    return match?.[0]
      ?.trim();
  }

  /*
  ============================================================
  PHONE
  ============================================================
  */

  private extractPhone(
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
  REQUIREMENTS COMPLETE
  ============================================================
  */

  private isRequirementsComplete(
    project: any,
    client: any,
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
      project?.timeline &&
      project?.budget &&
      client?.phone,
    );
  }

  /*
  ============================================================
  PROPOSAL
  ============================================================
  */

  private proposalQuestion(
    language: 'en' | 'te-en',
  ): string {
    return this.localize(
      language,
      'Your project details are ready. Would you like me to send the proposal?',
      'Mee project details ready unnayi. Proposal send cheyyana bro?',
    );
  }

  private async sendProposal(
    input: any,
    client: any,
    project: any,
    pricing: any,
    timeline: any,
    language: 'en' | 'te-en',
    intent: any,
    decision: any,
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

    await this.emailService.sendProposalEmail({
      to: client.email,
      clientName: client.name,
      proposal,
    });

    if (project?.id) {
      project =
        await this.memoryService.updateProject(
          project.id,
          {
            status: 'COMPLETE',
          },
        );
    }

    return this.respond(
      input,
      this.localize(
        language,
        `Perfect. The proposal has been sent to ${client.email}.`,
        `Perfect bro. Proposal ${client.email} ki send chesanu.`,
      ),
      [],
      intent,
      decision,
      project,
      client,
      pricing,
      timeline,
      proposal,
    );
  }

  /*
  ============================================================
  CONFIRMATION
  ============================================================
  */

  private isConfirmation(
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
    ].includes(text);
  }

  private isDecline(
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
      'no, not now',
      'maybe later',
      'dont send',
      "don't send",
      'vaddu',
      'ippudu vaddu',
    ].includes(text);
  }

  private wasProposalQuestionShown(
    history: any[],
  ): boolean {
    return (history ?? [])
      .filter(
        (item) =>
          item.role === 'assistant',
      )
      .slice(-5)
      .some(
        (item) =>
          item.content
            ?.toLowerCase()
            .includes(
              'would you like me to send the proposal',
            ) ||
          item.content
            ?.toLowerCase()
            .includes(
              'proposal send cheyyana',
            ),
      );
  }

private wasProposalSent(
  history: any[],
): boolean {
  return (history ?? [])
    .filter(
      (item) =>
        item.role === 'assistant',
    )
    .some((item) => {
      const content =
        item.content?.toLowerCase() ?? '';

      return (
        content.includes(
          'the proposal has been sent',
        ) ||
        (
          content.includes('proposal') &&
          content.includes('ki send chesanu')
        )
      );
    });
}

  /*
  ============================================================
  LANGUAGE
  ============================================================
  */

  private detectLanguage(
    message: string,
  ): 'en' | 'te-en' {
    /*
    Telugu Unicode is intentionally NOT supported.
    */

    const text =
      message.toLowerCase();

    const romanTelugu = [
      'nenu',
      'mana',
      'manam',
      'naku',
      'naaku',
      'meeku',
      'meeru',
      'cheppu',
      'cheppandi',
      'kavali',
      'kavaali',
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
      'ikkada',
      'akkada',
      'ippudu',
      'inka',
      'kuda',
      'chesanu',
      'chesam',
      'cheyyali',
      'cheyali',
      'bro',
    ];

    return romanTelugu.some(
      (word) =>
        new RegExp(
          `\\b${word}\\b`,
          'i',
        ).test(text),
    )
      ? 'te-en'
      : 'en';
  }



  
/*
============================================================
GREETING DETECTION
============================================================
*/

private isGreeting(
  message: string,
): boolean {
  return /^(hi|hii|hello|hey|helo|good morning|good afternoon|good evening)$/i.test(
    message.trim(),
  );
}

/*
============================================================
THANKS DETECTION
============================================================
*/

private isThanks(
  message: string,
): boolean {
  const text = message.toLowerCase().trim();

  return [
    'thanks',
    'thank you',
    'thankyou',
    'thx',
    'thanks a lot',
    'thank you so much',
  ].includes(text);
}
  /*
  ============================================================
  LOCALIZATION
  ============================================================
  */

  private localize(
    language: 'en' | 'te-en',
    en: string,
    teEn: string,
  ): string {
    return language === 'te-en'
      ? teEn
      : en;
  }

  /*
  ============================================================
  RESPONSE
  ============================================================
  */

  private async respond(
    input: {
      conversationId?: string;
    },
    message: string,
    options: string[],
    intent: any,
    decision: any,
    project: any,
    client: any,
    pricing?: any,
    timeline?: any,
    proposal?: any,
  ) {
    if (input.conversationId) {
      await this.memoryService.saveMessage(
        input.conversationId,
        {
          role: 'assistant',
          content: message,
          intent:
            intent?.intent,
          confidence:
            intent?.confidence,
        },
      );
    }

    return {
      message,

      /*
      FRONTEND WILL RENDER THESE.
      */

      options,

      intent,
      decision,

      workflow: {
        currentStage:
          project?.status ??
          'DISCOVERY',

        nextMissingField:
          this.getNextField(
            project,
            client,
          ),

        shouldAskQuestion:
          Boolean(
            this.getNextField(
              project,
              client,
            ),
          ),
      },

      pricing,
      timeline,
      proposal,

      llm: {
        provider: 'deterministic',
        model: 'questionnaire',
      },
    };
  }

  private isInvalidBusinessName(
  name?: string,
): boolean {
  if (!name) {
    return true;
  }

  const value = name.trim().toLowerCase();

  return [
    'hi',
    'hii',
    'hello',
    'hey',
    'helo',
    'good morning',
    'good afternoon',
    'good evening',
  ].includes(value);
}

private extractBusinessName(
  message: string,
): string | undefined {
  const text = message.trim();

  const patterns = [
    // My business name is Family Daba
    /^(?:my|our)\s+(?:business|brand|company)\s+name\s+is\s+(.+)$/i,

    // My business is Family Daba
    /^(?:my|our)\s+(?:business|brand|company)\s+is\s+(.+)$/i,

    // Business name is Family Daba
    /^(?:business|brand|company)\s+name\s+is\s+(.+)$/i,

    // Family Daba is my business name
    /^(.+?)\s+is\s+my\s+(?:business|brand|company)\s+name$/i,

    // Family Daba is my business
    /^(.+?)\s+is\s+my\s+(?:business|brand|company)$/i,

    // My business: Family Daba
    /^(?:my|our)\s+(?:business|brand|company)\s*[:\-]\s*(.+)$/i,

    // Business: Family Daba
    /^(?:business|brand|company)\s*[:\-]\s*(.+)$/i,

    // Business name: Family Daba
    /^(?:business|brand|company)\s+name\s*[:\-]\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      const name = match[1]
        .trim()
        .replace(/[.!?,]+$/, '')
        .trim();

      if (
        name.length > 1 &&
        !this.isGreeting(name) &&
        !this.isThanks(name)
      ) {
        return name;
      }
    }
  }

  /*
   * Plain business names:
   *
   * Only accept a plain message as a business name when it
   * actually looks like a name, not a normal sentence/request.
   */
  const lower = text.toLowerCase();

  const invalidBusinessNamePhrases = [
    'i need',
    'i want',
    'i would like',
    'i am looking',
    'i’m looking',
    'im looking',
    'looking for',
    'looking to',
    'need a',
    'want a',
    'need an',
    'want an',
    'build a',
    'create a',
    'make a',
    'website',
    'web app',
    'web application',
    'ecommerce',
    'online store',
    'portfolio',
    'hello',
    'hi',
    'hey',
  ];

  const looksLikeNormalSentence =
    invalidBusinessNamePhrases.some((phrase) =>
      lower.includes(phrase),
    );

  if (
    !looksLikeNormalSentence &&
    text.length > 1 &&
    text.length <= 60 &&
    /^[a-zA-Z][a-zA-Z0-9&'.\-\s]*$/.test(text) &&
    !this.isGreeting(text) &&
    !this.isThanks(text)
  ) {
    return text;
  }

  return undefined;
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

    if (Array.isArray(value)) {
      return value
        .map(String)
        .map(
          (x) => x.trim(),
        )
        .filter(Boolean);
    }

    return value
      .split(',')
      .map(
        (x) => x.trim(),
      )
      .filter(Boolean);
  }
}