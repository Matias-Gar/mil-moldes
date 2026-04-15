const ALLOWED_TYPES = new Set(["income", "expense"]);
const ALLOWED_METHODS = new Set(["cash", "qr", "card", "transfer", "other"]);

function parseAmount(value, fieldName = "amount") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid ${fieldName}: must be a number greater than 0`);
  }
  return Number(numeric.toFixed(2));
}

function normalizeDateInput(value, fieldName) {
  if (!value || typeof value !== "string") {
    throw new Error(`Missing ${fieldName}`);
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid ${fieldName}: expected YYYY-MM-DD`);
  }
  return trimmed;
}

function buildRange(startDate, endDate) {
  if (startDate > endDate) {
    throw new Error("start_date cannot be greater than end_date");
  }

  return {
    startISO: `${startDate}T00:00:00.000Z`,
    endISO: `${endDate}T23:59:59.999Z`,
  };
}

function methodTemplate() {
  return { cash: 0, qr: 0, card: 0, transfer: 0, other: 0 };
}

function normalizeSalePaymentMethod(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "efectivo" || raw === "cash") return "cash";
  if (raw === "qr") return "qr";
  if (raw === "tarjeta" || raw === "card") return "card";
  if (raw === "transferencia" || raw === "transfer") return "transfer";
  return "other";
}

function isAutoSaleIncomeMovement(row) {
  if (!row || row.type !== "income") return false;
  const description = String(row.description || "").toLowerCase();
  return description.includes("ingreso automatico por venta #");
}

function extractSaleIdFromAutoMovement(description) {
  const text = String(description || "");
  const match = text.match(/venta\s*#\s*(\d+)/i);
  return match?.[1] || null;
}

function movementTimestamp(row) {
  if (!row) return 0;
  const candidate = row.created_at || row.fecha || row.date;
  const time = candidate ? new Date(candidate).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function affectsCash(method) {
  return method === "cash";
}

function affectsBank(method) {
  return method === "qr" || method === "card" || method === "transfer";
}

function previousDateISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function calculateBankCarryFromHistory(supabase, params) {
  const startDate = normalizeDateInput(params?.start_date, "start_date");
  const endDate = normalizeDateInput(params?.end_date, "end_date");
  const userId = params?.user_id ? String(params.user_id) : null;
  const cashboxId = params?.cashbox_id ? String(params.cashbox_id) : "main";
  const { startISO, endISO } = buildRange(startDate, endDate);

  let movementQuery = supabase
    .from("cash_movements")
    .select("id, type, payment_method, amount, description")
    .gte("date", startISO)
    .lte("date", endISO)
    .eq("cashbox_id", cashboxId);

  if (userId) {
    movementQuery = movementQuery.eq("user_id", userId);
  }

  const { data: movements, error: movementError } = await movementQuery;
  if (movementError) {
    throw new Error(movementError.message || "Failed to calculate bank carry from movements");
  }

  let salesQuery = supabase
    .from("ventas")
    .select("id, total, modo_pago, usuario_id")
    .gte("fecha", startISO)
    .lte("fecha", endISO);

  if (userId) {
    salesQuery = salesQuery.or(`usuario_id.eq.${userId},usuario_id.is.null`);
  }

  const { data: sales, error: salesError } = await salesQuery;
  if (salesError) {
    throw new Error(salesError.message || "Failed to calculate bank carry from sales");
  }

  const salesIncomeByMethod = methodTemplate();
  for (const sale of sales || []) {
    const method = normalizeSalePaymentMethod(sale?.modo_pago);
    const amount = Number(sale?.total || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    salesIncomeByMethod[method] += amount;
  }

  const autoSaleMovementIds = new Set((sales || []).map((sale) => String(sale.id)));
  const fallbackAutoSales = (movements || []).filter((row) => {
    if (!isAutoSaleIncomeMovement(row)) return false;
    const saleId = extractSaleIdFromAutoMovement(row.description);
    return saleId ? !autoSaleMovementIds.has(String(saleId)) : true;
  });

  const manualRows = (movements || []).filter((row) => !isAutoSaleIncomeMovement(row));
  const movementSummary = summarizeMovements([...manualRows, ...fallbackAutoSales]);

  const incomeBank =
    salesIncomeByMethod.qr
    + salesIncomeByMethod.card
    + salesIncomeByMethod.transfer
    + movementSummary.incomeByMethod.qr
    + movementSummary.incomeByMethod.card
    + movementSummary.incomeByMethod.transfer;

  const expenseBank =
    movementSummary.expenseByMethod.qr
    + movementSummary.expenseByMethod.card
    + movementSummary.expenseByMethod.transfer;

  return Number((incomeBank - expenseBank).toFixed(2));
}

function summarizeMovements(rows = []) {
  const incomeByMethod = methodTemplate();
  const expenseByMethod = methodTemplate();

  for (const row of rows) {
    const method = ALLOWED_METHODS.has(row.payment_method) ? row.payment_method : "other";
    const amount = Number(row.amount || 0);

    if (row.type === "income") {
      incomeByMethod[method] += amount;
    }
    if (row.type === "expense") {
      expenseByMethod[method] += amount;
    }
  }

  const totalIncome = Object.values(incomeByMethod).reduce((acc, val) => acc + val, 0);
  const totalExpense = Object.values(expenseByMethod).reduce((acc, val) => acc + val, 0);
  const net = totalIncome - totalExpense;

  return {
    incomeByMethod,
    expenseByMethod,
    totalIncome,
    totalExpense,
    net,
  };
}

export async function createCashMovement(supabase, payload) {
  const date = normalizeDateInput(payload?.date, "date");
  const type = String(payload?.type || "").toLowerCase();
  const paymentMethod = String(payload?.payment_method || "").toLowerCase();
  const amount = parseAmount(payload?.amount);
  const description = String(payload?.description || "").trim();
  const userId = payload?.user_id ? String(payload.user_id) : null;
  const cashboxId = payload?.cashbox_id ? String(payload.cashbox_id) : "main";

  if (!ALLOWED_TYPES.has(type)) {
    throw new Error("Invalid type: must be income or expense");
  }
  if (!ALLOWED_METHODS.has(paymentMethod)) {
    throw new Error("Invalid payment_method: must be cash, qr, card, transfer or other");
  }

  const row = {
    date: `${date}T12:00:00.000Z`,
    type,
    payment_method: paymentMethod,
    amount,
    description,
    user_id: userId,
    cashbox_id: cashboxId,
  };

  let { data, error } = await supabase
    .from("cash_movements")
    .insert(row)
    .select("id, date, type, payment_method, amount, description, user_id, cashbox_id")
    .single();

  if (error && paymentMethod === "card") {
    const message = String(error.message || "").toLowerCase();
    const cardRejectedBySchema =
      message.includes("payment_method")
      && (message.includes("check") || message.includes("violates") || message.includes("constraint"));

    if (cardRejectedBySchema) {
      const fallback = await supabase
        .from("cash_movements")
        .insert({ ...row, payment_method: "other" })
        .select("id, date, type, payment_method, amount, description, user_id, cashbox_id")
        .single();

      data = fallback.data;
      error = fallback.error;
    }
  }

  if (error) {
    throw new Error(error.message || "Failed to create movement");
  }

  return data;
}

export async function getCashSummary(supabase, params) {
  const startDate = normalizeDateInput(params?.start_date, "start_date");
  const endDate = normalizeDateInput(params?.end_date, "end_date");
  const userId = params?.user_id ? String(params.user_id) : null;
  const cashboxId = params?.cashbox_id ? String(params.cashbox_id) : "main";
  const manualOpening = params?.opening_balance;
  const manualOpeningQr = params?.opening_qr;

  let openingBalance = Number(manualOpening ?? NaN);
  let openingQr = Number(manualOpeningQr ?? NaN);

  if (!Number.isFinite(openingBalance) || !Number.isFinite(openingQr)) {
    let closureBeforeStartQuery = supabase
      .from("cash_closures")
      .select("*")
      .eq("cashbox_id", cashboxId)
      .lt("end_date", startDate)
      .order("end_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (userId) {
      closureBeforeStartQuery = closureBeforeStartQuery.eq("user_id", userId);
    }

    const { data: beforeClosures, error: beforeClosureError } = await closureBeforeStartQuery;
    if (beforeClosureError) {
      throw new Error(beforeClosureError.message || "Failed to fetch previous closure");
    }

    const previousClosure = beforeClosures?.[0] || null;
    const baseClosure = previousClosure;

    if (!Number.isFinite(openingBalance)) {
      openingBalance = Number(baseClosure?.real_cash ?? baseClosure?.expected_cash ?? 0);
    }

    if (!Number.isFinite(openingQr)) {
      const closureBankCandidate = baseClosure?.real_qr ?? baseClosure?.expected_qr;
      if (closureBankCandidate !== null && closureBankCandidate !== undefined) {
        const parsedClosureBank = Number(closureBankCandidate);
        if (Number.isFinite(parsedClosureBank)) {
          openingQr = parsedClosureBank;
        }
      }
    }

  }

  if (!Number.isFinite(openingBalance)) {
    openingBalance = 0;
  }
  if (!Number.isFinite(openingQr)) {
    const carryEndDate = previousDateISO(startDate);
    if (carryEndDate < startDate) {
      openingQr = await calculateBankCarryFromHistory(supabase, {
        start_date: "1970-01-01",
        end_date: carryEndDate,
        user_id: userId,
        cashbox_id: cashboxId,
      });
    } else {
      openingQr = 0;
    }
  }

  const { startISO, endISO } = buildRange(startDate, endDate);

  let movementQuery = supabase
    .from("cash_movements")
    .select("id, date, created_at, type, payment_method, amount, description, user_id, cashbox_id")
    .gte("date", startISO)
    .lte("date", endISO)
    .eq("cashbox_id", cashboxId)
    .order("date", { ascending: true });

  if (userId) {
    movementQuery = movementQuery.eq("user_id", userId);
  }

  const { data: movements, error: movementError } = await movementQuery;
  if (movementError) {
    throw new Error(movementError.message || "Failed to fetch movements");
  }

  const allMovements = movements || [];
  const autoSaleMovements = allMovements.filter((row) => isAutoSaleIncomeMovement(row));
  const manualMovementRows = allMovements.filter((row) => !isAutoSaleIncomeMovement(row));

  let salesQuery = supabase
    .from("ventas")
    .select("id, fecha, total, modo_pago, usuario_id")
    .gte("fecha", startISO)
    .lte("fecha", endISO)
    .order("fecha", { ascending: true });

  if (userId) {
    salesQuery = salesQuery.or(`usuario_id.eq.${userId},usuario_id.is.null`);
  }

  const { data: sales, error: salesError } = await salesQuery;
  if (salesError) {
    throw new Error(salesError.message || "Failed to fetch sales for cash summary");
  }

  const normalizedSales = sales.map((sale) => ({
    ...sale,
    flow_date: sale.fecha || null,
  }));

  const salesIncomeByMethod = methodTemplate();
  for (const sale of normalizedSales || []) {
    const method = normalizeSalePaymentMethod(sale?.modo_pago);
    const amount = Number(sale?.total || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    salesIncomeByMethod[method] += amount;
  }

  const saleIdsInSummary = new Set((normalizedSales || []).map((sale) => String(sale.id)));
  const fallbackAutoSaleMovements = autoSaleMovements.filter((row) => {
    const saleId = extractSaleIdFromAutoMovement(row.description);
    return saleId ? !saleIdsInSummary.has(String(saleId)) : true;
  });

  const movementRowsForSummary = [...manualMovementRows, ...fallbackAutoSaleMovements];
  const movementSummary = summarizeMovements(movementRowsForSummary);

  const incomeByMethod = {
    cash: salesIncomeByMethod.cash + movementSummary.incomeByMethod.cash,
    qr: salesIncomeByMethod.qr + movementSummary.incomeByMethod.qr,
    card: salesIncomeByMethod.card + movementSummary.incomeByMethod.card,
    transfer: salesIncomeByMethod.transfer + movementSummary.incomeByMethod.transfer,
    other: salesIncomeByMethod.other + movementSummary.incomeByMethod.other,
  };

  const expenseByMethod = movementSummary.expenseByMethod;
  const totalIncome = Object.values(incomeByMethod).reduce((acc, val) => acc + val, 0);
  const totalExpense = Object.values(expenseByMethod).reduce((acc, val) => acc + val, 0);
  const net = totalIncome - totalExpense;

  const expectedCash = Number((openingBalance + incomeByMethod.cash - expenseByMethod.cash).toFixed(2));
  const expectedQr = Number((openingQr + incomeByMethod.qr - expenseByMethod.qr).toFixed(2));
  const incomeBank = Number((incomeByMethod.qr + incomeByMethod.card + incomeByMethod.transfer).toFixed(2));
  const expenseBank = Number((expenseByMethod.qr + expenseByMethod.card + expenseByMethod.transfer).toFixed(2));
  const bankNet = Number((incomeBank - expenseBank).toFixed(2));
  const expectedBank = Number((openingQr + bankNet).toFixed(2));

  const manualLedgerEntries = manualMovementRows.map((row) => ({
    id: row.id,
    source: "manual",
    source_ref: row.id,
    date: row.date,
    created_at: row.created_at || row.date,
    type: row.type,
    payment_method: row.payment_method,
    amount: Number(row.amount || 0),
    user_id: row.user_id || null,
    description: row.description || "Movimiento manual",
  }));

  const fallbackAutoSalesLedgerEntries = fallbackAutoSaleMovements.map((row) => ({
    id: `auto-${row.id}`,
    source: "sale-fallback",
    source_ref: extractSaleIdFromAutoMovement(row.description) || row.id,
    date: row.date,
    created_at: row.created_at || row.date,
    type: row.type,
    payment_method: row.payment_method,
    amount: Number(row.amount || 0),
    user_id: row.user_id || null,
    description: row.description || "Ingreso por venta (fallback)",
  }));

  const salesLedgerEntries = (normalizedSales || []).map((sale) => {
    const method = normalizeSalePaymentMethod(sale?.modo_pago);
    return {
      id: `sale-${sale.id}`,
      source: "sale",
      source_ref: sale.id,
      date: sale.flow_date,
      created_at: sale.flow_date,
      type: "income",
      payment_method: method,
      amount: Number(sale?.total || 0),
      user_id: sale?.usuario_id || null,
      description: `Ingreso por venta #${sale.id}`,
    };
  });

  const ledgerEntries = [...manualLedgerEntries, ...salesLedgerEntries, ...fallbackAutoSalesLedgerEntries]
    .sort((left, right) => {
      const byTime = movementTimestamp(left) - movementTimestamp(right);
      if (byTime !== 0) return byTime;
      return String(left.id).localeCompare(String(right.id));
    })
    .reduce(
      (acc, entry) => {
        const method = ALLOWED_METHODS.has(entry.payment_method) ? entry.payment_method : "other";
        const amount = Number(entry.amount || 0);
        const sign = entry.type === "income" ? 1 : -1;

        let nextCash = acc.cashBalance;
        let nextBank = acc.bankBalance;

        if (affectsCash(method)) {
          nextCash += sign * amount;
        }
        if (affectsBank(method)) {
          nextBank += sign * amount;
        }

        const enriched = {
          ...entry,
          running_cash: Number(nextCash.toFixed(2)),
          running_bank: Number(nextBank.toFixed(2)),
          running_total: Number((nextCash + nextBank).toFixed(2)),
        };

        acc.cashBalance = nextCash;
        acc.bankBalance = nextBank;
        acc.rows.push(enriched);
        return acc;
      },
      {
        cashBalance: Number(openingBalance || 0),
        bankBalance: Number(openingQr || 0),
        rows: [],
      }
    ).rows;

  const autoSalesRows = [...salesLedgerEntries, ...fallbackAutoSalesLedgerEntries]
    .sort((left, right) => {
      const byTime = movementTimestamp(left) - movementTimestamp(right);
      if (byTime !== 0) return byTime;
      return String(left.id).localeCompare(String(right.id));
    });

  return {
    range: {
      start_date: startDate,
      end_date: endDate,
      cashbox_id: cashboxId,
      user_id: userId,
    },
    opening_balance: Number(openingBalance.toFixed(2)),
    opening_qr: Number(openingQr.toFixed(2)),
    opening_bank: Number(openingQr.toFixed(2)),
    income_by_method: {
      cash: Number(incomeByMethod.cash.toFixed(2)),
      qr: Number(incomeByMethod.qr.toFixed(2)),
      card: Number(incomeByMethod.card.toFixed(2)),
      transfer: Number(incomeByMethod.transfer.toFixed(2)),
      other: Number(incomeByMethod.other.toFixed(2)),
    },
    expense_by_method: {
      cash: Number(expenseByMethod.cash.toFixed(2)),
      qr: Number(expenseByMethod.qr.toFixed(2)),
      card: Number(expenseByMethod.card.toFixed(2)),
      transfer: Number(expenseByMethod.transfer.toFixed(2)),
      other: Number(expenseByMethod.other.toFixed(2)),
    },
    totals: {
      income: Number(totalIncome.toFixed(2)),
      expense: Number(totalExpense.toFixed(2)),
      net: Number(net.toFixed(2)),
    },
    income_bank: incomeBank,
    expense_bank: expenseBank,
    net_bank: bankNet,
    expected_bank: expectedBank,
    expected_cash: expectedCash,
    expected_qr: expectedQr,
    movements: manualMovementRows,
    sales: normalizedSales || [],
    auto_sales_rows: autoSalesRows,
    ledger_entries: ledgerEntries,
  };
}

export async function listCashMovements(supabase, params = {}) {
  const limitRaw = Number(params?.limit || 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
  const userId = params?.user_id ? String(params.user_id) : null;
  const cashboxId = params?.cashbox_id ? String(params.cashbox_id) : "main";

  let query = supabase
    .from("cash_movements")
    .select("id, date, type, payment_method, amount, description, user_id, cashbox_id, created_at")
    .eq("cashbox_id", cashboxId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const hasStart = Boolean(params?.start_date);
  const hasEnd = Boolean(params?.end_date);
  if (hasStart || hasEnd) {
    const startDate = normalizeDateInput(params?.start_date || params?.end_date, "start_date");
    const endDate = normalizeDateInput(params?.end_date || params?.start_date, "end_date");
    const { startISO, endISO } = buildRange(startDate, endDate);
    query = query.gte("date", startISO).lte("date", endISO);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "Failed to fetch cash movements");
  }

  return data || [];
}

export async function deleteCashMovement(supabase, movementId) {
  if (!movementId) {
    throw new Error("Movement ID is required");
  }

  const { error } = await supabase
    .from("cash_movements")
    .delete()
    .eq("id", movementId);

  if (error) {
    throw new Error(error.message || "Failed to delete cash movement");
  }

  return { success: true };
}

export async function createCashClosure(supabase, payload) {
  const startDate = normalizeDateInput(payload?.start_date, "start_date");
  const endDate = normalizeDateInput(payload?.end_date, "end_date");
  const userId = payload?.user_id ? String(payload.user_id) : null;
  const cashboxId = payload?.cashbox_id ? String(payload.cashbox_id) : "main";

  const summary = await getCashSummary(supabase, {
    start_date: startDate,
    end_date: endDate,
    cashbox_id: cashboxId,
    opening_balance: payload?.opening_balance,
    opening_qr: payload?.opening_qr,
  });

  const openingBalance = Number(summary.opening_balance);
  const openingQr = Number(summary.opening_qr || 0);
  const realCash = parseAmount(payload?.real_cash, "real_cash");
  const expectedBank = Number((summary.expected_bank ?? summary.expected_qr) || 0);
  const realQrRaw = payload?.real_qr;
  const realQr = realQrRaw === undefined || realQrRaw === null || realQrRaw === ""
    ? expectedBank
    : parseAmount(realQrRaw, "real_qr");
  const expectedCash = Number(summary.expected_cash);
  const expectedQr = Number(summary.expected_qr || 0);
  const difference = Number((realCash - expectedCash).toFixed(2));
  const qrDifference = Number((realQr - expectedBank).toFixed(2));

  let existingQuery = supabase
    .from("cash_closures")
    .select("id")
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .eq("cashbox_id", cashboxId)
    .limit(1);

  const { data: existing, error: existingError } = await existingQuery;
  if (existingError) {
    throw new Error(existingError.message || "Failed to validate existing closure");
  }

  const closureRow = {
    start_date: startDate,
    end_date: endDate,
    opening_balance: openingBalance,
    opening_qr: openingQr,
    expected_cash: expectedCash,
    expected_qr: expectedQr,
    real_cash: realCash,
    real_qr: realQr,
    difference,
    qr_difference: qrDifference,
    user_id: userId,
    cashbox_id: cashboxId,
  };

  if (existing?.length) {
    const existingClosureIds = existing
      .map((row) => row?.id)
      .filter(Boolean);

    const { error: deleteError } = await supabase
      .from("cash_closures")
      .delete()
      .in("id", existingClosureIds);

    if (deleteError) {
      const dbError = new Error(deleteError.message || "Failed to replace existing closure");
      dbError.statusCode = 500;
      throw dbError;
    }
  }

  let closure = null;
  let insertError = null;

  const withQr = await supabase
    .from("cash_closures")
    .insert(closureRow)
    .select("*")
    .single();

  closure = withQr.data;
  insertError = withQr.error;

  if (insertError) {
    const message = String(insertError.message || "").toLowerCase();
    const missingQrColumn = message.includes("opening_qr")
      || message.includes("expected_qr")
      || message.includes("real_qr")
      || message.includes("qr_difference");

    if (missingQrColumn) {
      const fallbackRow = {
        start_date: startDate,
        end_date: endDate,
        opening_balance: openingBalance,
        expected_cash: expectedCash,
        real_cash: realCash,
        difference,
        user_id: userId,
        cashbox_id: cashboxId,
      };

      const fallbackInsert = await supabase
        .from("cash_closures")
        .insert(fallbackRow)
        .select("*")
        .single();

      closure = fallbackInsert.data;
      insertError = fallbackInsert.error;
    }
  }

  if (insertError) {
    const message = insertError.message || "Failed to create closure";
    const isConflict = message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique");
    const dbError = new Error(message);
    dbError.statusCode = isConflict ? 409 : 500;
    throw dbError;
  }

  return {
    closure,
    summary,
    updated: Boolean(existing?.length),
  };
}

export async function listCashClosures(supabase, params) {
  const limitRaw = Number(params?.limit || 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const userId = params?.user_id ? String(params.user_id) : null;
  const cashboxId = params?.cashbox_id ? String(params.cashbox_id) : "main";

  let query = supabase
    .from("cash_closures")
    .select("*")
    .eq("cashbox_id", cashboxId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "Failed to fetch closures");
  }

  return data || [];
}
