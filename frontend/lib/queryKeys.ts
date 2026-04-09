// Centrální query keys pro React Query
// Slouží k cache invalidaci po mutacích

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  accounts: ['accounts'] as const,
  budgets: ['budgets'] as const,
  budgetOverview: ['budget-overview'] as const,
  goals: ['goals'] as const,
  transactions: (filters: object) => ['transactions', filters] as const,
  investmentPortfolio: ['investment-portfolio'] as const,
  portfolioHistory: (period: string) => ['portfolio-history', period] as const,
  dividends: ['dividends'] as const,
  accountDetail: (id: string, page: number) => ['account-detail', id, page] as const,
  categories: ['categories'] as const,
  recurringExpenses: ['recurring-expenses'] as const,
  manualAccounts: ['manual-accounts'] as const,
  manualAccount: (id: string) => ['manual-account', id] as const,
  monthlyBudget: (yearMonth: string) => ['monthly-budget', yearMonth] as const,
  annualOverview: (year: number) => ['annual-overview', year] as const,
  monthlyReport: (months: number) => ['monthly-report', months] as const,
  familyAccounts: ['family-accounts'] as const,
  apiKeys: ['api-keys'] as const,
};
