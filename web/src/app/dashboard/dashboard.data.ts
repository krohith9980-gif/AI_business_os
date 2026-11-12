import { SupabaseClient } from '@supabase/supabase-js';
import {
  DashboardData,
  BusinessProfile,
  TodaySnapshot,
  FinancialMetrics,
  SalesPerformance,
  InventoryHealth,
  OverdueCustomer,
  OverdueSummary,
  SupplierOverview,
  SupplierSummary,
  AgriSeasonData,
  AIInsight,
  DateRangeFilter,
  UserRole,
  DailyTrendPoint,
  BestSellingProduct,
  LowStockItem,
  NearExpiryBatch,
  ExpiredBatch
} from './dashboard.types';

// =========================================================================
// PURE ACCOUNTING & NORMALIZATION FUNCTIONS (Unit Tested by test suite)
// =========================================================================

export function computeSettledPaymentsTotal(
  payments: Array<{ amount: number | string; status: string }> | null | undefined
): number {
  if (!payments || !Array.isArray(payments)) return 0;
  return payments.reduce((sum, p) => {
    const isSettled = p.status === 'PAID' || p.status === 'COMPLETED';
    return isSettled ? sum + Number(p.amount || 0) : sum;
  }, 0);
}

export function computeInvoiceDirectUnpaid(
  grandTotal: number,
  directPaid: number,
  directReturns: number = 0
): number {
  return Math.max(0, grandTotal - directPaid - directReturns);
}

export function computePeriodSalesBreakdown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sales: Array<{ grand_total?: number | string | null; payments?: Array<any> | null }>
): {
  totalSales: number;
  cashSales: number;
  creditSales: number;
  billCount: number;
} {
  let totalSales = 0;
  let cashSales = 0;
  let creditSales = 0;
  const billCount = sales ? sales.length : 0;

  for (const s of sales || []) {
    const saleTotal = Number(s.grand_total || 0);
    totalSales += saleTotal;

    const settledPaid = computeSettledPaymentsTotal(s.payments);
    if (settledPaid >= saleTotal) {
      cashSales += saleTotal;
    } else {
      cashSales += settledPaid;
      creditSales += (saleTotal - settledPaid);
    }
  }

  return {
    totalSales,
    cashSales,
    creditSales,
    billCount
  };
}

export function applyFifoGeneralCredits<T extends { remainingUnpaid: number; createdAt: string }>(
  invoices: T[],
  generalCreditPool: number
): { invoices: T[]; remainingPool: number } {
  let pool = generalCreditPool;
  // Chronological FIFO ordering
  const sorted = [...invoices].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const inv of sorted) {
    if (pool <= 0) break;
    if (pool >= inv.remainingUnpaid) {
      pool -= inv.remainingUnpaid;
      inv.remainingUnpaid = 0;
    } else {
      inv.remainingUnpaid -= pool;
      pool = 0;
    }
  }

  return { invoices: sorted, remainingPool: pool };
}

export function computeWeightedBatchCost(
  items: Array<{ quantity_received: number; purchase_cost: number }>
): number | null {
  let totalCost = 0;
  let totalQty = 0;

  for (const item of items) {
    const qty = Number(item.quantity_received || 0);
    const cost = Number(item.purchase_cost || 0);
    if (qty > 0 && cost > 0) {
      totalCost += qty * cost;
      totalQty += qty;
    }
  }

  return totalQty > 0 ? totalCost / totalQty : null;
}

export function computeVerifiedStockValuation(
  batches: Array<{ onHand: number; unitCost: number | null }>
): { verifiedValue: number; uncostedCount: number } {
  let verifiedValue = 0;
  let uncostedCount = 0;

  for (const b of batches) {
    if (b.unitCost !== null && b.unitCost > 0) {
      verifiedValue += b.onHand * b.unitCost;
    } else {
      uncostedCount++;
    }
  }

  return { verifiedValue, uncostedCount };
}

// =========================================================================
// PERIOD & DATE HELPERS
// =========================================================================

export function getFinancialPeriodString(date: Date = new Date()): string {
  const month = date.getMonth(); // 0 = Jan, 3 = Apr
  const year = date.getFullYear();
  
  // Indian Financial Year: April 1 to March 31
  const fyStart = month >= 3 ? year : year - 1;
  const fyEnd = (fyStart + 1) % 100;
  
  let quarter = 'Q4';
  if (month >= 3 && month <= 5) quarter = 'Q1';
  else if (month >= 6 && month <= 8) quarter = 'Q2';
  else if (month >= 9 && month <= 11) quarter = 'Q3';

  return `FY ${fyStart}-${fyEnd.toString().padStart(2, '0')} (${quarter})`;
}

// Indian Standard Time is UTC+05:30
export const IST_OFFSET_MINUTES = 330;

export function getNowInIST(referenceDate: Date = new Date()): { year: number; month: number; day: number; dayOfWeek: number } {
  const istTime = new Date(referenceDate.getTime() + (IST_OFFSET_MINUTES + referenceDate.getTimezoneOffset()) * 60 * 1000);
  return {
    year: istTime.getFullYear(),
    month: istTime.getMonth(), // 0 = Jan, 10 = Nov
    day: istTime.getDate(),
    dayOfWeek: istTime.getDay() // 0 = Sun, 1 = Mon
  };
}

export function createISTDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000);
}

export function createISTDayEnd(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - IST_OFFSET_MINUTES * 60 * 1000);
}

export function getISTDateKey(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = (ist.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = ist.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDateRangeBounds(filter: DateRangeFilter, customStart?: string, customEnd?: string) {
  const { year, month, day, dayOfWeek } = getNowInIST();
  let start: Date;
  let end: Date;
  let prevStart: Date;
  let prevEnd: Date;
  let comparisonLabel: string;
  let periodDisplayLabel: string;

  switch (filter) {
    case 'today':
      start = createISTDayStart(year, month, day);
      end = createISTDayEnd(year, month, day);
      prevStart = createISTDayStart(year, month, day - 1);
      prevEnd = createISTDayEnd(year, month, day - 1);
      comparisonLabel = 'vs. yesterday';
      periodDisplayLabel = `Today (${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year})`;
      break;

    case 'yesterday':
      start = createISTDayStart(year, month, day - 1);
      end = createISTDayEnd(year, month, day - 1);
      prevStart = createISTDayStart(year, month, day - 2);
      prevEnd = createISTDayEnd(year, month, day - 2);
      comparisonLabel = 'vs. day before yesterday';
      periodDisplayLabel = `Yesterday (${(day - 1).toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year})`;
      break;

    case 'this_week': {
      const diffToMonday = (dayOfWeek + 6) % 7;
      start = createISTDayStart(year, month, day - diffToMonday);
      end = createISTDayEnd(year, month, day);
      prevStart = createISTDayStart(year, month, day - diffToMonday - 7);
      prevEnd = createISTDayEnd(year, month, day - 7);
      comparisonLabel = 'vs. same days last week';
      const mondayDate = new Date(start.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
      periodDisplayLabel = `This Week (${mondayDate.getUTCDate().toString().padStart(2, '0')}/${(mondayDate.getUTCMonth() + 1).toString().padStart(2, '0')} - ${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year})`;
      break;
    }

    case 'last_month': {
      const lastDayOfPrevMonth = new Date(year, month, 0).getDate();
      start = createISTDayStart(year, month - 1, 1);
      end = createISTDayEnd(year, month - 1, lastDayOfPrevMonth);
      const lastDayOfPriorMonth = new Date(year, month - 1, 0).getDate();
      prevStart = createISTDayStart(year, month - 2, 1);
      prevEnd = createISTDayEnd(year, month - 2, lastDayOfPriorMonth);
      comparisonLabel = 'vs. full month prior';
      const prevMonthNum = month === 0 ? 12 : month;
      const prevYearNum = month === 0 ? year - 1 : year;
      periodDisplayLabel = `Last Month (01/${prevMonthNum.toString().padStart(2, '0')} - ${lastDayOfPrevMonth.toString().padStart(2, '0')}/${prevMonthNum.toString().padStart(2, '0')}/${prevYearNum})`;
      break;
    }

    case 'custom':
      if (customStart && customEnd) {
        const [y1, m1, d1] = customStart.split('-').map(Number);
        const [y2, m2, d2] = customEnd.split('-').map(Number);
        start = createISTDayStart(y1, m1 - 1, d1);
        end = createISTDayEnd(y2, m2 - 1, d2);
        const durationMs = end.getTime() - start.getTime();
        prevStart = new Date(start.getTime() - durationMs - 1);
        prevEnd = new Date(start.getTime() - 1);
        const days = Math.max(1, Math.round(durationMs / 86400000));
        comparisonLabel = `vs. prior ${days} days`;
        periodDisplayLabel = `Custom (${d1.toString().padStart(2, '0')}/${m1.toString().padStart(2, '0')}/${y1} - ${d2.toString().padStart(2, '0')}/${m2.toString().padStart(2, '0')}/${y2})`;
      } else {
        start = createISTDayStart(year, month, 1);
        end = createISTDayEnd(year, month, day);
        prevStart = createISTDayStart(year, month - 1, 1);
        prevEnd = createISTDayEnd(year, month - 1, day);
        comparisonLabel = 'vs. prior timeframe';
        periodDisplayLabel = 'Custom (Dates not selected)';
      }
      break;

    case 'this_month':
    default: {
      start = createISTDayStart(year, month, 1);
      end = createISTDayEnd(year, month, day);
      const lastDayOfPrevMonth = new Date(year, month, 0).getDate();
      const cappedElapsedDay = Math.min(day, lastDayOfPrevMonth);
      prevStart = createISTDayStart(year, month - 1, 1);
      prevEnd = createISTDayEnd(year, month - 1, cappedElapsedDay);
      comparisonLabel = `vs. same elapsed period last month (Day 1 - ${cappedElapsedDay})`;
      periodDisplayLabel = `This Month (01/${(month + 1).toString().padStart(2, '0')} - ${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year})`;
      break;
    }
  }

  return { start, end, prevStart, prevEnd, comparisonLabel, periodDisplayLabel };
}

// =========================================================================
// DATA PROVIDER
// =========================================================================

export async function fetchDashboardData(
  supabase: SupabaseClient,
  userId: string,
  filter: DateRangeFilter = 'this_month',
  customStart?: string,
  customEnd?: string,
  selectedStoreId?: string
): Promise<DashboardData | { error: string }> {
  try {
    // 1. Fetch Profile & Active Organization Membership
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', userId)
      .single();

    const { data: userAuth } = await supabase.auth.getUser();

    const { data: memberships } = await supabase
      .from('organization_members')
      .select(`
        role,
        organization_id,
        organizations (
          id, name, business_type, address, village, phone
        )
      `)
      .eq('profile_id', userId)
      .eq('is_active', true)
      .limit(1);

    if (!memberships || memberships.length === 0) {
      return { error: 'No active organization found' };
    }

    const membership = memberships[0];
    const userRole = (membership.role as UserRole) || 'CASHIER';
    const isOwner = userRole === 'OWNER';
    const isManagerOrOwner = userRole === 'OWNER' || userRole === 'MANAGER';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const org = membership.organizations as any;
    const orgId = membership.organization_id;

    // 2. Fetch Stores
    const { data: stores } = await supabase
      .from('stores')
      .select('id, name, location, is_active')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name');

    const availableStores = (stores || []).map(s => ({ id: s.id, name: s.name }));
    const activeStore = selectedStoreId
      ? availableStores.find(s => s.id === selectedStoreId) || availableStores[0]
      : availableStores[0];

    const currentFinancialPeriod = getFinancialPeriodString();

    const businessProfile: BusinessProfile = {
      orgName: org?.name || 'VyaparOS Agro Retail',
      businessType: org?.business_type || 'Fertilizer & Agro Inputs Retail',
      ownerName: profile?.full_name || 'Store Owner',
      ownerEmail: userAuth.user?.email || '',
      storeName: activeStore ? activeStore.name : 'Main Store',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storeLocation: (activeStore && (activeStore as any).location) || org?.village || org?.address || 'Telangana',
      currentFinancialPeriod,
      userRole
    };

    // 3. Date Bounds
    const { start, end, prevStart, prevEnd, comparisonLabel, periodDisplayLabel } = getDateRangeBounds(filter, customStart, customEnd);

    // Today's Date bounds in IST (midnight to midnight)
    const { year: nowYear, month: nowMonth, day: nowDay } = getNowInIST();
    const todayStart = createISTDayStart(nowYear, nowMonth, nowDay);
    const todayEnd = createISTDayEnd(nowYear, nowMonth, nowDay);
    const snapshotDateIST = `${nowDay.toString().padStart(2, '0')}/${(nowMonth + 1).toString().padStart(2, '0')}/${nowYear}`;

    // 4. Query Today's Completed Sales independently for Today's Business Pulse
    let todaySalesQuery = supabase
      .from('sales')
      .select(`
        id, grand_total, created_at,
        payments (
          id, amount, method, status
        )
      `)
      .eq('organization_id', orgId)
      .eq('status', 'COMPLETED')
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString());

    if (selectedStoreId) {
      todaySalesQuery = todaySalesQuery.eq('store_id', selectedStoreId);
    }

    const { data: todaySalesData, error: todaySalesErr } = await todaySalesQuery;
    if (todaySalesErr) console.error('Error fetching today sales:', todaySalesErr);

    const todayBreakdown = computePeriodSalesBreakdown(todaySalesData || []);
    const todaySales = todayBreakdown.totalSales;
    const todayBillCount = todayBreakdown.billCount;
    const todayCashSales = todayBreakdown.cashSales;
    const todayCreditSales = todayBreakdown.creditSales;

    // 5. Query Current Period Completed Sales & Sale Items
    let currentSalesQuery = supabase
      .from('sales')
      .select(`
        id, grand_total, subtotal, discount_total, tax_total, created_at, customer_id, store_id,
        sale_items (
          id, quantity, unit_purchase_cost, unit_selling_price, discount_amount, total_price, product_name, sku, batch_number
        ),
        payments (
          id, amount, method, status
        )
      `)
      .eq('organization_id', orgId)
      .eq('status', 'COMPLETED')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (selectedStoreId) {
      currentSalesQuery = currentSalesQuery.eq('store_id', selectedStoreId);
    }

    const { data: currentSalesData, error: salesErr } = await currentSalesQuery;
    if (salesErr) console.error('Error fetching current sales:', salesErr);

    const currentSales = currentSalesData || [];

    // Query Refunds in current period
    let returnsQuery = supabase
      .from('returns')
      .select(`
        id, sale_id, store_id, total_refund_amount, created_at,
        return_items (
          quantity, disposition,
          sale_items ( unit_purchase_cost )
        )
      `)
      .eq('status', 'REFUNDED')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (selectedStoreId) {
      returnsQuery = returnsQuery.eq('store_id', selectedStoreId);
    }
    const { data: returnsData } = await returnsQuery;
    const periodRefunds = (returnsData || []).reduce((sum, r) => sum + Number(r.total_refund_amount || 0), 0);

    // 6. Query Prior Period Sales for Fair Comparison
    let prevSalesQuery = supabase
      .from('sales')
      .select(`
        id, grand_total, subtotal, discount_total, tax_total,
        sale_items (
          id, quantity, unit_purchase_cost, unit_selling_price, discount_amount, total_price
        )
      `)
      .eq('organization_id', orgId)
      .eq('status', 'COMPLETED')
      .gte('created_at', prevStart.toISOString())
      .lte('created_at', prevEnd.toISOString());

    if (selectedStoreId) {
      prevSalesQuery = prevSalesQuery.eq('store_id', selectedStoreId);
    }

    const { data: prevSalesData } = await prevSalesQuery;
    const prevSales = prevSalesData || [];

    // Calculate Tax-Exclusive Product Revenue & Historical COGS for Selected Period
    let grossProductRevenue = 0;
    let totalTaxCollected = 0;
    let grossCogs = 0;

    const productSalesMap = new Map<string, { name: string; sku: string; quantity: number; revenue: number }>();
    const dailyMap = new Map<string, { sales: number; count: number }>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentSales.forEach((s: any) => {
      const saleSubtotal = Number(s.subtotal || 0);
      const saleDiscount = Number(s.discount_total || 0);
      const saleTax = Number(s.tax_total || 0);

      // Tax-exclusive product revenue: subtotal minus discount_total
      const lineRevenueTotal = saleSubtotal - saleDiscount;
      grossProductRevenue += lineRevenueTotal;
      totalTaxCollected += saleTax;

      // Grouping for Daily Trend using IST calendar day
      const dKey = getISTDateKey(new Date(s.created_at));
      const existing = dailyMap.get(dKey) || { sales: 0, count: 0 };
      dailyMap.set(dKey, { sales: existing.sales + lineRevenueTotal, count: existing.count + 1 });

      // COGS from historical unit_purchase_cost snapshots on sale_items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s.sale_items || []).forEach((item: any) => {
        const qty = Number(item.quantity || 0);
        const purchaseCost = Number(item.unit_purchase_cost || 0);
        const sellingPrice = Number(item.unit_selling_price || 0);
        const discount = Number(item.discount_amount || 0);
        const lineNet = (sellingPrice * qty) - discount;

        grossCogs += (purchaseCost * qty);

        const prodKey = item.sku || item.product_name || 'Agro Product';
        const pExisting = productSalesMap.get(prodKey) || {
          name: item.product_name || 'Product',
          sku: item.sku || 'N/A',
          quantity: 0,
          revenue: 0
        };
        productSalesMap.set(prodKey, {
          ...pExisting,
          quantity: pExisting.quantity + qty,
          revenue: pExisting.revenue + lineNet
        });
      });
    });

    // Reconcile return restock COGS adjustment:
    // Only RESELLABLE items return to sellable inventory and reduce COGS.
    // DAMAGED returns do NOT reduce COGS (the shop bears the cost of the damaged goods as a shrinkage loss).
    let resellableReturnCogsRecovery = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (returnsData || []).forEach((r: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r.return_items || []).forEach((ri: any) => {
        if (ri.disposition === 'RESELLABLE') {
          const retQty = Number(ri.quantity || 0);
          const origCost = Number(ri.sale_items?.unit_purchase_cost || 0);
          resellableReturnCogsRecovery += (retQty * origCost);
        }
      });
    });

    const netProductRevenue = Math.max(0, grossProductRevenue - periodRefunds);
    const netCogs = Math.max(0, grossCogs - resellableReturnCogsRecovery);
    const grossProfit = netProductRevenue - netCogs;
    const grossProfitMargin = netProductRevenue > 0 ? (grossProfit / netProductRevenue) * 100 : 0;

    // Prior Period Financials
    let prevGrossProductRevenue = 0;
    let prevCogs = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prevSales.forEach((s: any) => {
      const sub = Number(s.subtotal || 0);
      const disc = Number(s.discount_total || 0);
      prevGrossProductRevenue += (sub - disc);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s.sale_items || []).forEach((item: any) => {
        const qty = Number(item.quantity || 0);
        const purchaseCost = Number(item.unit_purchase_cost || 0);
        prevCogs += (purchaseCost * qty);
      });
    });

    const prevGrossProfit = prevGrossProductRevenue - prevCogs;

    const salesPercentageChange = prevGrossProductRevenue > 0
      ? ((netProductRevenue - prevGrossProductRevenue) / prevGrossProductRevenue) * 100
      : (netProductRevenue > 0 ? 100 : null);

    const profitPercentageChange = prevGrossProfit > 0
      ? ((grossProfit - prevGrossProfit) / prevGrossProfit) * 100
      : (grossProfit > 0 ? 100 : null);

    // Calculate Cash vs Credit Sales breakdown for the selected reporting period
    const periodBreakdown = computePeriodSalesBreakdown(currentSales);

    // Build Daily Trend (7 days ending at the period's end date in IST)
    const dailyTrend: DailyTrendPoint[] = [];
    const endIST = new Date(end.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(endIST.getTime() - i * 86400000);
      const y = d.getUTCFullYear();
      const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
      const dayNum = d.getUTCDate().toString().padStart(2, '0');
      const dKey = `${y}-${m}-${dayNum}`;
      const entry = dailyMap.get(dKey) || { sales: 0, count: 0 };
      const dayDate = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
      const label = dayDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
      dailyTrend.push({
        date: dKey,
        label,
        sales: entry.sales,
        count: entry.count
      });
    }

    // Top 5 Best Sellers
    const bestSellers: BestSellingProduct[] = Array.from(productSalesMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // 7. Query Customer Collections Today and Supplier Disbursements Today
    const { data: todayCustPayments } = await supabase
      .from('customer_ledger')
      .select('amount')
      .eq('organization_id', orgId)
      .eq('transaction_type', 'PAYMENT')
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString());

    const todayCollections = (todayCustPayments || []).reduce((sum, p) => sum + Math.abs(Number(p.amount || 0)), 0);

    const { data: todaySuppPayments } = await supabase
      .from('supplier_ledger')
      .select('amount')
      .eq('organization_id', orgId)
      .eq('transaction_type', 'PAYMENT')
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString());

    const rawTodaySupplierDisbursements = (todaySuppPayments || []).reduce((sum, p) => sum + Math.abs(Number(p.amount || 0)), 0);

    const todaySnapshot: TodaySnapshot = {
      todaySales,
      todayBillCount,
      todayCashSales,
      todayCreditSales,
      todayCollections,
      todaySupplierDisbursements: isOwner ? rawTodaySupplierDisbursements : null,
      snapshotDateIST
    };

    // 7. Two-Tier FIFO Customer Overdue Allocation
    const { data: customerData } = await supabase
      .from('customers')
      .select('id, name, village, phone_number, outstanding_balance, credit_limit')
      .eq('organization_id', orgId);

    const customers = customerData || [];
    let totalCustomerOutstanding = 0;
    customers.forEach(c => {
      const bal = Number(c.outstanding_balance || 0);
      if (bal > 0) totalCustomerOutstanding += bal;
    });

    // Query all completed customer sales with checkout payments and returns
    const { data: allCustSales } = await supabase
      .from('sales')
      .select(`
        id, customer_id, grand_total, due_date, created_at,
        payments ( id, amount, status ),
        returns ( id, total_refund_amount, status )
      `)
      .eq('organization_id', orgId)
      .eq('status', 'COMPLETED')
      .not('customer_id', 'is', null)
      .order('created_at', { ascending: true });

    // Query standalone payments and general credits from customer_ledger
    const { data: generalCredits } = await supabase
      .from('customer_ledger')
      .select('customer_id, transaction_type, amount, created_at, reference_id')
      .eq('organization_id', orgId)
      .in('transaction_type', ['PAYMENT', 'RETURN', 'ADJUSTMENT']);

    const nowTime = Date.now();
    const overdueList: OverdueCustomer[] = [];
    const villageSet = new Set<string>();

    customers.forEach(c => {
      const bal = Number(c.outstanding_balance || 0);
      if (c.village) villageSet.add(c.village.trim());

      // Guard: fully settled customers are NEVER flagged as overdue!
      if (bal <= 0) return;

      const custSales = (allCustSales || []).filter(s => s.customer_id === c.id);
      if (custSales.length === 0) {
        // Balance exists with no recorded invoices (e.g. legacy opening balance)
        overdueList.push({
          id: c.id,
          name: c.name,
          village: c.village || 'Not specified',
          phone: c.phone_number,
          pendingAmount: bal,
          oldestDueDate: null,
          daysOverdue: 0,
          creditLimit: c.credit_limit ? Number(c.credit_limit) : null
        });
        return;
      }

      // Tier 1: Settle direct checkout payments and direct returns per invoice
      interface InvoiceReceivable {
        saleId: string;
        grandTotal: number;
        initialCredit: number;
        remainingUnpaid: number;
        dueDate: string | null;
        createdAt: string;
      }

      const invoiceReceivables: InvoiceReceivable[] = [];
      const directCheckoutPaymentRefs = new Set<string>();
      const directReturnRefs = new Set<string>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      custSales.forEach((s: any) => {
        const grandTotal = Number(s.grand_total || 0);

        // Track settled checkout payments
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const checkoutPaid = (s.payments || []).reduce((sum: number, p: any) => {
          const isSettled = p.status === 'PAID' || p.status === 'COMPLETED';
          if (isSettled) {
            directCheckoutPaymentRefs.add(p.id);
            return sum + Number(p.amount || 0);
          }
          return sum;
        }, 0);

        // Direct return credit offsets
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const directReturns = (s.returns || []).reduce((sum: number, r: any) => {
          if (r.status === 'REFUNDED') {
            directReturnRefs.add(r.id);
            return sum + Number(r.total_refund_amount || 0);
          }
          return sum;
        }, 0);

        const initialCredit = computeInvoiceDirectUnpaid(grandTotal, checkoutPaid, directReturns);

        if (initialCredit > 0) {
          invoiceReceivables.push({
            saleId: s.id,
            grandTotal,
            initialCredit,
            remainingUnpaid: initialCredit,
            dueDate: s.due_date,
            createdAt: s.created_at
          });
        }
      });

      // Tier 2: Calculate General Credit Pool
      const custGeneralLedgerEntries = (generalCredits || []).filter(g => g.customer_id === c.id);
      let generalCreditPool = 0;
      custGeneralLedgerEntries.forEach(g => {
        const isDirectCheckout = g.reference_id && directCheckoutPaymentRefs.has(g.reference_id);
        const isDirectReturn = g.reference_id && directReturnRefs.has(g.reference_id);

        if (!isDirectCheckout && !isDirectReturn) {
          if (Number(g.amount) < 0) {
            generalCreditPool += Math.abs(Number(g.amount));
          }
        }
      });

      // Apply General Credit Pool chronologically FIFO
      applyFifoGeneralCredits(invoiceReceivables, generalCreditPool);

      // Identify genuine overdue invoices
      let oldestUnpaidOverdueDate: string | null = null;
      let maxDaysOverdue = 0;
      let totalUnpaidOverdueAmount = 0;

      invoiceReceivables.forEach(inv => {
        if (inv.remainingUnpaid > 0 && inv.dueDate) {
          const dueTime = new Date(inv.dueDate).getTime();
          if (dueTime < nowTime) {
            const daysDiff = Math.max(1, Math.floor((nowTime - dueTime) / (1000 * 60 * 60 * 24)));
            totalUnpaidOverdueAmount += inv.remainingUnpaid;
            if (daysDiff > maxDaysOverdue) {
              maxDaysOverdue = daysDiff;
              if (!oldestUnpaidOverdueDate || new Date(oldestUnpaidOverdueDate).getTime() > dueTime) {
                oldestUnpaidOverdueDate = inv.dueDate;
              }
            }
          }
        }
      });

      // Flag customer only if genuinely overdue invoice balances exist
      if (maxDaysOverdue > 0) {
        overdueList.push({
          id: c.id,
          name: c.name,
          village: c.village || 'Not specified',
          phone: c.phone_number,
          pendingAmount: Math.min(bal, totalUnpaidOverdueAmount),
          oldestDueDate: oldestUnpaidOverdueDate,
          daysOverdue: maxDaysOverdue,
          creditLimit: c.credit_limit ? Number(c.credit_limit) : null
        });
      }
    });

    // Sort overdue by days overdue descending
    overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue);

    const totalOverdueAmount = overdueList.reduce((sum, item) => sum + item.pendingAmount, 0);
    const highestOutstanding = overdueList.length > 0
      ? [...overdueList].sort((a, b) => b.pendingAmount - a.pendingAmount)[0]
      : null;
    const mostOverdue = overdueList.length > 0 ? overdueList[0] : null;

    const overdueSummary: OverdueSummary = {
      totalOverdueCount: overdueList.length,
      totalOverdueAmount,
      highestOutstanding,
      mostOverdue,
      allVillages: Array.from(villageSet).sort()
    };

    // 8. Supplier Outstanding Payables & Overview
    const { data: supplierData } = await supabase
      .from('suppliers')
      .select('id, name, phone, outstanding_balance, is_active')
      .eq('organization_id', orgId)
      .order('name');

    let totalSupplierOutstanding = 0;
    const supplierList: SupplierSummary[] = [];

    (supplierData || []).forEach(s => {
      const bal = Number(s.outstanding_balance || 0);
      if (bal > 0) totalSupplierOutstanding += bal;
      supplierList.push({
        id: s.id,
        name: s.name,
        phone: s.phone || null,
        outstandingBalance: bal,
        isActive: s.is_active ?? true
      });
    });

    const supplierOverview: SupplierOverview = {
      totalSupplierPayables: isOwner ? totalSupplierOutstanding : null,
      activeSupplierCount: supplierList.filter(s => s.isActive).length,
      suppliers: isOwner ? supplierList : []
    };

    // 9. Cartesian-Safe Batch Valuation
    let batchQuery = supabase
      .from('vw_batch_inventory')
      .select('store_id, variant_id, batch_number, mfg_date, expiry_date, on_hand_stock, available_stock');

    if (selectedStoreId) {
      batchQuery = batchQuery.eq('store_id', selectedStoreId);
    }
    const { data: batchData, error: batchErr } = await batchQuery;
    if (batchErr) console.error('Error fetching batch inventory view:', batchErr);

    const { data: variantData } = await supabase
      .from('product_variants')
      .select(`
        id, sku, purchase_cost, selling_price, tracking_mode, unit_of_measure, packaging_type, units_per_pack,
        products ( name )
      `)
      .eq('organization_id', orgId);

    // Fetch PO items to compute weighted average purchase cost per (variant_id, batch_number)
    const { data: poItemsData } = await supabase
      .from('po_items')
      .select('variant_id, batch_number, purchase_cost, quantity_received')
      .eq('organization_id', orgId)
      .not('batch_number', 'is', null)
      .gt('quantity_received', 0);

    const batchCostMap = new Map<string, { totalCost: number; totalQty: number }>();
    (poItemsData || []).forEach(p => {
      if (p.batch_number && p.variant_id) {
        const key = `${p.variant_id}_${p.batch_number}`;
        const existing = batchCostMap.get(key) || { totalCost: 0, totalQty: 0 };
        const qty = Number(p.quantity_received || 0);
        const cost = Number(p.purchase_cost || 0);
        batchCostMap.set(key, {
          totalCost: existing.totalCost + (qty * cost),
          totalQty: existing.totalQty + qty
        });
      }
    });

    const batchFinalCost = new Map<string, number>();
    batchCostMap.forEach((val, key) => {
      if (val.totalQty > 0) {
        batchFinalCost.set(key, val.totalCost / val.totalQty);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variantMap = new Map<string, any>((variantData || []).map(v => [v.id, v]));
    const storeMap = new Map<string, string>(availableStores.map(s => [s.id, s.name]));

    let currentSellableStockValue = 0;
    let totalAvailableStock = 0;
    let uncostedBatchCount = 0;
    const lowStockItems: LowStockItem[] = [];
    const nearExpiryBatches: NearExpiryBatch[] = [];
    const expiredBatches: ExpiredBatch[] = [];

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const ninetyDaysFuture = new Date(todayDate);
    ninetyDaysFuture.setDate(ninetyDaysFuture.getDate() + 90);

    const variantStockMap = new Map<string, number>();

    // Iterate exactly over vw_batch_inventory with zero row duplication
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (batchData || []).forEach((b: any) => {
      const v = variantMap.get(b.variant_id);
      if (!v) return;

      const onHand = Number(b.on_hand_stock || 0);
      const avail = Number(b.available_stock || 0);

      // Batch weighted cost or fallback to variant catalog cost
      const recordedCost = batchFinalCost.get(`${b.variant_id}_${b.batch_number}`);
      const hasRecordedCost = recordedCost !== undefined && recordedCost > 0;
      const fallbackCost = Number(v.purchase_cost || 0);
      const hasFallbackCost = fallbackCost > 0;

      let unitCost: number | null = null;
      if (hasRecordedCost) {
        unitCost = recordedCost;
      } else if (hasFallbackCost) {
        unitCost = fallbackCost;
      } else {
        uncostedBatchCount++;
      }

      const storeName = storeMap.get(b.store_id) || businessProfile.storeName;
      const prodName = (Array.isArray(v.products) ? v.products[0]?.name : (v.products as any)?.name) || 'Agro Product';

      let isExpired = false;
      if (b.expiry_date) {
        const exp = new Date(b.expiry_date);
        exp.setHours(0, 0, 0, 0);

        if (exp < todayDate) {
          isExpired = true;
          const daysExpired = Math.floor((todayDate.getTime() - exp.getTime()) / (1000 * 60 * 60 * 24));
          expiredBatches.push({
            variantId: b.variant_id,
            name: prodName,
            sku: v.sku,
            batchNumber: b.batch_number || 'No Batch',
            expiryDate: b.expiry_date,
            onHand,
            daysExpired,
            storeName
          });
        } else if (exp <= ninetyDaysFuture) {
          const daysRemaining = Math.floor((exp.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
          nearExpiryBatches.push({
            variantId: b.variant_id,
            name: prodName,
            sku: v.sku,
            batchNumber: b.batch_number || 'No Batch',
            expiryDate: b.expiry_date,
            onHand,
            daysRemaining,
            storeName
          });
        }
      }

      if (!isExpired) {
        if (unitCost !== null) {
          currentSellableStockValue += (onHand * unitCost);
        }
        totalAvailableStock += avail;
        variantStockMap.set(b.variant_id, (variantStockMap.get(b.variant_id) || 0) + onHand);
      }
    });

    // Detect Low Stock (< 10 units) and Out of Stock
    let outOfStockCount = 0;
    (variantData || []).forEach(v => {
      const totalStock = variantStockMap.get(v.id) || 0;
      if (totalStock === 0) {
        outOfStockCount++;
      } else if (totalStock <= 10) {
        lowStockItems.push({
          id: v.id,
          name: (Array.isArray(v.products) ? v.products[0]?.name : (v.products as any)?.name) || 'Agro Item',
          sku: v.sku,
          onHand: totalStock,
          storeName: businessProfile.storeName
        });
      }
    });

    // Slow moving products (stock > 10 units but zero sales in selected period)
    const activeSellingVariantSkus = new Set(Array.from(productSalesMap.keys()));
    let slowMovingCount = 0;
    (variantData || []).forEach(v => {
      const stock = variantStockMap.get(v.id) || 0;
      if (stock > 10 && !activeSellingVariantSkus.has(v.sku)) {
        slowMovingCount++;
      }
    });

    const inventoryHealth: InventoryHealth = {
      totalStockValue: isOwner ? currentSellableStockValue : null,
      totalAvailableStock,
      lowStockCount: lowStockItems.length,
      outOfStockCount,
      nearExpiryCount: nearExpiryBatches.length,
      expiredStockCount: expiredBatches.length,
      slowMovingCount,
      uncostedBatchCount,
      lowStockItems: lowStockItems.slice(0, 6),
      nearExpiryBatches: nearExpiryBatches.sort((a, b) => a.daysRemaining - b.daysRemaining).slice(0, 6),
      expiredBatches: expiredBatches.sort((a, b) => b.daysExpired - a.daysExpired).slice(0, 6)
    };

    // 10. Verified Agricultural Season Intelligence
    const { data: obsData } = await supabase
      .from('agri_observations')
      .select(`
        id, season, region, crop_name, crop_stage, progress_status, advisory_notes, freshness_status, publication_date,
        agri_observation_inputs (
          input_category, reasoning, urgency
        )
      `)
      .eq('organization_id', orgId)
      .order('publication_date', { ascending: false })
      .limit(6);

    let agriSeasonData: AgriSeasonData;

    if (obsData && obsData.length > 0) {
      const first = obsData[0];
      agriSeasonData = {
        season: first.season || 'Recorded Agricultural Observations',
        region: first.region || businessProfile.storeLocation || 'Telangana',
        crops: obsData.map(o => ({
          cropName: o.crop_name,
          cropStage: o.crop_stage,
          status: o.progress_status,
          advisoryNotes: o.advisory_notes,
          inputs: (o.agri_observation_inputs || []).map((inp: any) => ({
            category: inp.input_category,
            reasoning: inp.reasoning,
            urgency: inp.urgency || 'MEDIUM'
          }))
        })),
        freshness: first.freshness_status || 'RECORDED',
        lastUpdated: first.publication_date || new Date().toISOString().split('T')[0],
        isAvailable: true
      };
    } else {
      // Truthful empty state: No fabricated or unverified crop claims
      agriSeasonData = {
        season: 'No Recorded Season Data',
        region: businessProfile.storeLocation || 'Telangana',
        crops: [],
        freshness: 'UNRECORDED',
        lastUpdated: '--',
        isAvailable: false
      };
    }

    // 11. Deterministic Actionable AI Business Insights
    const insights: AIInsight[] = [];

    if (isOwner && salesPercentageChange !== null) {
      if (salesPercentageChange > 5) {
        insights.push({
          id: 'sales-growth',
          type: 'positive',
          title: `Sales improved by ${salesPercentageChange.toFixed(1)}%`,
          titleTe: `గత నెలతో పోలిస్తే అమ్మకాలు ${salesPercentageChange.toFixed(1)}% పెరిగాయి`,
          description: `Net product revenue reached ₹${netProductRevenue.toLocaleString('en-IN')} (excluding ₹${totalTaxCollected.toLocaleString('en-IN')} tax collected), generating ₹${grossProfit.toLocaleString('en-IN')} gross profit.`,
          actionLabel: 'View Sales Report',
          actionHref: '/dashboard/sales'
        });
      } else if (salesPercentageChange < -5) {
        insights.push({
          id: 'sales-dip',
          type: 'warning',
          title: `Sales decreased by ${Math.abs(salesPercentageChange).toFixed(1)}%`,
          titleTe: `అమ్మకాలు ${Math.abs(salesPercentageChange).toFixed(1)}% తగ్గాయి`,
          description: `Revenue is trailing the prior period. Inspect inventory for fast-moving seasonal inputs.`,
          actionLabel: 'Inspect Inventory',
          actionHref: '/dashboard/inventory'
        });
      }
    }

    const isCashier = userRole === 'CASHIER';

    if (!isCashier && overdueSummary.totalOverdueCount > 0) {
      insights.push({
        id: 'overdue-alert',
        type: 'alert',
        title: `${overdueSummary.totalOverdueCount} Farmers Have Overdue Payments`,
        titleTe: `${overdueSummary.totalOverdueCount} మంది రైతుల చెల్లింపు గడువు ముగిసింది`,
        description: `Total overdue balance past payment due date is ₹${overdueSummary.totalOverdueAmount.toLocaleString('en-IN')}. Follow up via phone or WhatsApp today to recover operating capital.`,
        actionLabel: 'View Overdue Customers',
        actionHref: '#overdue-section'
      });
    }

    if (inventoryHealth.nearExpiryCount > 0) {
      insights.push({
        id: 'expiry-alert',
        type: 'warning',
        title: `${inventoryHealth.nearExpiryCount} Batches Expiring in Next 90 Days`,
        titleTe: `90 రోజుల్లో గడువు ముగిసే ${inventoryHealth.nearExpiryCount} బ్యాచ్‌లు ఉన్నాయి`,
        description: `Prioritize selling near-expiry batches first (FIFO) or negotiate returns with suppliers before expiry.`,
        actionLabel: 'Review Batches',
        actionHref: '/dashboard/inventory'
      });
    }

    if (agriSeasonData.crops.length > 0) {
      const priorityCrop = agriSeasonData.crops[0];
      const recInput = priorityCrop.inputs[0];
      insights.push({
        id: 'seasonal-demand',
        type: 'opportunity',
        title: `Seasonal Demand Surge: ${priorityCrop.cropName}`,
        titleTe: `సీజనల్ డిమాండ్: ${priorityCrop.cropName}`,
        description: `Current stage is ${priorityCrop.cropStage}. High regional requirement for ${recInput ? recInput.category : 'fertilizers'}. Ensure sufficient stock is on hand.`,
        actionLabel: 'Order from Suppliers',
        actionHref: '/dashboard/purchases'
      });
    }

    // 12. Server-Side RBAC Enforcement on Financial Metrics
    // CASHIER: Financial overview completely redacted (null)
    // MANAGER: Operational metrics visible, but gross profit and supplier payables hidden
    // OWNER: Full access to all financial metrics
    const metrics: FinancialMetrics | null = isCashier ? null : {
      totalSales: netProductRevenue,
      totalTaxCollected,
      grossProfit: isOwner ? grossProfit : null,
      grossProfitMargin: isOwner ? grossProfitMargin : null,
      netProfit: isOwner ? grossProfit : null,
      hasRecordedExpenses: false,
      ownerCapital: null,
      currentStockValue: currentSellableStockValue, // Visible to Owner & Manager
      uncostedBatchCount,
      customerOutstanding: totalCustomerOutstanding, // Visible to Owner & Manager
      supplierOutstanding: isOwner ? totalSupplierOutstanding : null, // Hidden from Manager
      cashBankBalance: null
    };

    const performance: SalesPerformance = {
      currentSales: netProductRevenue,
      previousSales: prevGrossProductRevenue,
      percentageChange: salesPercentageChange,
      currentGrossProfit: isOwner ? grossProfit : null,
      previousGrossProfit: isOwner ? prevGrossProfit : null,
      profitPercentageChange: isOwner ? profitPercentageChange : null,
      comparisonLabel,
      periodDisplayLabel,
      dailyTrend,
      bestSellers,
      periodCashSales: periodBreakdown.cashSales,
      periodCreditSales: periodBreakdown.creditSales,
      periodTotalSales: periodBreakdown.totalSales,
      periodBillCount: periodBreakdown.billCount
    };

    return {
      profile: businessProfile,
      today: todaySnapshot,
      metrics,
      performance,
      inventory: {
        ...inventoryHealth,
        totalStockValue: isCashier ? null : currentSellableStockValue
      },
      overdue: {
        customers: isCashier ? [] : overdueList,
        summary: isCashier ? {
          totalOverdueCount: 0,
          totalOverdueAmount: 0,
          highestOutstanding: null,
          mostOverdue: null,
          allVillages: []
        } : overdueSummary
      },
      suppliers: isOwner ? supplierOverview : null,
      agri: agriSeasonData,
      insights,
      availableStores
    };
  } catch (err: any) {
    console.error('Unexpected error in fetchDashboardData:', err);
    return { error: err.message || 'Failed to load dashboard data' };
  }
}
