// Backend API klient — rozdělený na doménové moduly v lib/api/.
// Tenhle barrel zachovává původní importní cestu '@/lib/api' pro celou aplikaci.
export * from './api/core';
export * from './api/dashboard';
export * from './api/accounts';
export * from './api/transactions';
export * from './api/tags';
export * from './api/push';
export * from './api/sync';
export * from './api/settings';
export * from './api/investments';
export * from './api/contacts';
export * from './api/budgets';
export * from './api/loans';
export * from './api/salary';
export * from './api/subscriptions';
export * from './api/cashflow';
