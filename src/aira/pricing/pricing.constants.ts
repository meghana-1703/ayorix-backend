export const PRICING_RULES = {
  WEBSITE_BASE: 15000,

  PROJECT_TYPE: {
    website: 0,
    portfolio: 5000,
    ecommerce: 15000,
    webapp: 25000,
  },

  FEATURES: {
    onlineOrdering: 5000,
    authentication: 5000,
    paymentGateway: 7500,
    adminDashboard: 10000,
    bookingSystem: 7500,
    cms: 5000,
    contactForm: 1000,
  },

  SEO: {
    basic: 3000,
    local: 5000,
    advanced: 10000,
  },

  COMPLEXITY: {
    simple: 0,
    medium: 10000,
    complex: 25000,
  },
} as const;