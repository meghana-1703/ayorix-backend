export const TIMELINE_RULES = {
  PROJECT_TYPE: {
    website: 5,
    portfolio: 4,
    ecommerce: 8,
    webapp: 12,
  },

  FEATURES: {
    onlineOrdering: 2,
    authentication: 2,
    paymentGateway: 2,
    adminDashboard: 3,
    bookingSystem: 2,
    cms: 2,
    contactForm: 1,
  },

  SEO: {
    basic: 1,
    local: 2,
    advanced: 3,
  },

  COMPLEXITY: {
    simple: 0,
    medium: 2,
    complex: 5,
  },
} as const;