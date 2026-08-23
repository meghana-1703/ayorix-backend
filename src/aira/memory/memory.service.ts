import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class MemoryService {
  private readonly prisma: PrismaClient;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

   const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

    this.prisma = new PrismaClient({
      adapter,
    });
  }

  async createClient(data: {
    name?: string;
    email?: string;
    phone?: string;
    language?: string;
  }) {
    return this.prisma.client.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        language: data.language ?? 'en',
      },
    });
  }

  async getClient(clientId: string) {
    return this.prisma.client.findUnique({
      where: {
        id: clientId,
      },
      include: {
        projects: true,
        conversations: {
          include: {
            messages: true,
          },
        },
      },
    });
  }
async updateClient(
  clientId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    language?: string;
  },
) {
  return this.prisma.client.update({
    where: {
      id: clientId,
    },
    data: {
      ...(data.name !== undefined && {
        name: data.name,
      }),
      ...(data.email !== undefined && {
        email: data.email,
      }),
      ...(data.phone !== undefined && {
        phone: data.phone,
      }),
      ...(data.language !== undefined && {
        language: data.language,
      }),
    },
  });
}


  async createProject(
    clientId: string,
    data: {
      name?: string;
      projectType?: string;
      industry?: string;
      goal?: string;
      audience?: string;
    },
  ) {
    return this.prisma.project.create({
      data: {
        clientId,
        name: data.name,
        projectType: data.projectType,
        industry: data.industry,
        goal: data.goal,
        audience: data.audience,
      },
    });
  }

  async createConversation(
    clientId: string,
    projectId?: string,
    language = 'en',
  ) {
    return this.prisma.conversation.create({
      data: {
        clientId,
        projectId,
        language,
      },
    });
  }

  async saveMessage(
    conversationId: string,
    data: {
      role: string;
      content: string;
      intent?: string;
      confidence?: number;
    },
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        role: data.role,
        content: data.content,
        intent: data.intent,
        confidence: data.confidence,
      },
    });
  }

  async getConversation(conversationId: string) {
  return this.prisma.conversation.findUnique({
    where: {
      id: conversationId,
    },
    include: {
      messages: {
        orderBy: {
          createdAt: 'asc',
        },
      },
      project: true,
    },
  });
}

async getConversationForClient(
  conversationId: string,
  clientId: string,
) {
  return this.prisma.conversation.findFirst({
    where: {
      id: conversationId,
      clientId,
    },
    include: {
      messages: {
        orderBy: {
          createdAt: 'asc',
        },
      },
      project: true,
    },
  });
}
  async updateProject(
  projectId: string,
data: {
  name?: string;
  projectType?: string;
  industry?: string;
  goal?: string;
  audience?: string;
  features?: string[];
  technology?: string;
  seo?: string;
  complexity?: string;
  timeline?: string;
  budget?: string;
  status?: string;
},
) {
  return this.prisma.project.update({
    where: {
      id: projectId,
    },
    data: {
  ...(data.name !== undefined && {
    name: data.name,
  }),
  ...(data.projectType !== undefined && {
    projectType: data.projectType,
  }),
  ...(data.industry !== undefined && {
    industry: data.industry,
  }),
  ...(data.goal !== undefined && {
    goal: data.goal,
  }),
  ...(data.audience !== undefined && {
    audience: data.audience,
  }),
  ...(data.features !== undefined && {
    features: data.features,
  }),
  ...(data.technology !== undefined && {
    technology: data.technology,
  }),
  ...(data.seo !== undefined && {
    seo: data.seo,
  }),
  ...(data.complexity !== undefined && {
    complexity: data.complexity,
  }),
  ...(data.timeline !== undefined && {
    timeline: data.timeline,
  }),
  ...(data.budget !== undefined && {
    budget: data.budget,
  }),
  ...(data.status !== undefined && {
    status: data.status,
  }),
},
  });
}
}