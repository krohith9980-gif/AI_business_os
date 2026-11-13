export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER';

export type DateRangeFilter = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom';

export interface BusinessProfile {
  orgName: string;
  businessType: string | null;
  ownerName: string;
  ownerEmail: string;
  storeName: string;
  storeLocation: string | null;
  currentFinancialPeriod: string;
  userRole: UserRole;
}

export interface TodaySnapshot {
  todaySales: number; // Selected period net product revenue (tax-exclusive basis)
  todayGrossProfit: number | null; // Selected period gross profit (null for non-owners)
  todayGrossProfitMargin: number | null; // Selected period gross profit margin %
  todayBillCount: number; // Selected period bill count
  todayCashSales: number; // Backwards compatible alias for paid sales
  todayPaidSales: number; // Settled revenue portion (tax-exclusive basis)
  todayCreditSales: number; // Outstanding revenue portion (tax-exclusive basis)
  todayPaidCash?: number; // Physical cash portion (tax-exclusive)
  todayPaidUpi?: number; // UPI portion (tax-exclusive)
  todayPaidCard?: number; // Card portion (tax-exclusive)
  todayTotalTaxCollected?: number; // Statutory GST collected in period
  todayTotalBilledWithTax?: number; // Gross amount billed including tax
  todayCollections: number; // Selected period customer collections
  todaySupplierDisbursements: number | null; // Selected period supplier payments (owner only)
  uncostedItemsCount?: number; // Count of items sold with zero/missing purchase cost
  snapshotDateIST: string; // Selected period label (e.g. "Today (13/11/2026)", "Custom (01/09/2026 - 05/09/2026)")
}

export interface FinancialMetrics {
  totalSales: number;
  totalTaxCollected: number;
  grossProfit: number | null; // null for non-owners
  grossProfitMargin: number | null;
  netProfit: number | null; // null for non-owners
  hasRecordedExpenses: boolean;
  ownerCapital: number | null; // null => 'Not recorded'
  currentStockValue: number | null; // null for non-owners
  uncostedBatchCount: number;
  customerOutstanding: number | null; // null for non-owners/cashiers
  supplierOutstanding: number | null; // null for non-owners
  cashBankBalance: number | null; // null => 'Not recorded'
}

export interface DailyTrendPoint {
  date: string;
  label: string;
  sales: number;
  count: number;
}

export interface BestSellingProduct {
  name: string;
  sku: string;
  quantity: number;
  revenue: number;
}

export interface SalesPerformance {
  currentSales: number;
  previousSales: number;
  percentageChange: number | null;
  currentGrossProfit: number | null;
  previousGrossProfit: number | null;
  profitPercentageChange: number | null;
  comparisonLabel: string;
  periodDisplayLabel: string;
  dailyTrend: DailyTrendPoint[];
  bestSellers: BestSellingProduct[];
  periodCashSales: number;
  periodPaidSales?: number;
  periodCreditSales: number;
  periodTotalSales: number;
  periodBillCount: number;
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  onHand: number;
  storeName: string;
}

export interface NearExpiryBatch {
  variantId: string;
  name: string;
  sku: string;
  batchNumber: string;
  expiryDate: string;
  onHand: number;
  daysRemaining: number;
  storeName: string;
}

export interface ExpiredBatch {
  variantId: string;
  name: string;
  sku: string;
  batchNumber: string;
  expiryDate: string;
  onHand: number;
  daysExpired: number;
  storeName: string;
}

export interface InventoryHealth {
  totalStockValue: number | null; // null for non-owners
  totalAvailableStock: number;
  lowStockCount: number;
  outOfStockCount: number;
  nearExpiryCount: number;
  expiredStockCount: number;
  slowMovingCount: number;
  uncostedBatchCount: number;
  lowStockItems: LowStockItem[];
  nearExpiryBatches: NearExpiryBatch[];
  expiredBatches: ExpiredBatch[];
}

export interface OverdueCustomer {
  id: string;
  name: string;
  village: string | null;
  phone: string | null;
  pendingAmount: number;
  oldestDueDate: string | null;
  daysOverdue: number;
  creditLimit: number | null;
}

export interface OverdueSummary {
  totalOverdueCount: number;
  totalOverdueAmount: number;
  highestOutstanding: OverdueCustomer | null;
  mostOverdue: OverdueCustomer | null;
  allVillages: string[];
}

export interface SupplierSummary {
  id: string;
  name: string;
  phone: string | null;
  outstandingBalance: number;
  isActive: boolean;
}

export interface SupplierOverview {
  totalSupplierPayables: number | null; // null for non-owners
  activeSupplierCount: number;
  suppliers: SupplierSummary[];
}

export interface AgriCropInput {
  category: string;
  reasoning: string | null;
  urgency: string;
}

export interface AgriCropStage {
  cropName: string;
  cropStage: string;
  status: string;
  advisoryNotes: string | null;
  inputs: AgriCropInput[];
}

export interface AgriSeasonData {
  season: string;
  region: string;
  crops: AgriCropStage[];
  freshness: string;
  lastUpdated: string;
  isAvailable: boolean;
}

export interface AIInsight {
  id: string;
  type: 'positive' | 'warning' | 'alert' | 'opportunity' | 'info';
  title: string;
  titleTe?: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export interface DashboardData {
  profile: BusinessProfile;
  today: TodaySnapshot;
  metrics: FinancialMetrics | null;
  performance: SalesPerformance;
  inventory: InventoryHealth;
  overdue: {
    customers: OverdueCustomer[];
    summary: OverdueSummary;
  };
  suppliers: SupplierOverview | null;
  agri: AgriSeasonData;
  insights: AIInsight[];
  availableStores: Array<{ id: string; name: string }>;
}
