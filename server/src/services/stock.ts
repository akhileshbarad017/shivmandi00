import { getDb } from '../db/connection.js';
import { money, round2 } from '../utils/money.js';

export type StockState = 'OK' | 'LOW' | 'OUT';

export interface StockItem {
  id: number;
  code: string;
  name: string;
  category: string;
  unit: string;
  rate: number;
  rate_20kg: number;
  min_level: number;
  emoji: string | null;
  status: string;
  purchased: number;
  sold: number;
  returned: number;
  adjusted: number;
  stock: number;
  value: number;
  state: StockState;
}

interface CommodityRow {
  id: number;
  code: string;
  name: string;
  category: string;
  unit: string;
  default_rate: number;
  rate_20kg: number;
  min_level: number;
  emoji: string | null;
  status: string;
}

function qtyMap(sql: string): Map<number, number> {
  const rows = getDb().prepare(sql).all() as Array<{ id: number; q: number }>;
  return new Map(rows.map((row) => [Number(row.id), Number(row.q)]));
}

function stateFor(stock: number, minLevel: number): StockState {
  if (stock <= 0) return 'OUT';
  if (minLevel > 0 && stock <= minLevel) return 'LOW';
  return 'OK';
}

/** Stock position for every commodity, derived from movements. */
export function stockSummary(activeOnly = true): StockItem[] {
  const commodities = getDb()
    .prepare(
      `SELECT id, code, name, category, unit, default_rate, rate_20kg, min_level, emoji, status
         FROM commodities ${activeOnly ? "WHERE status = 'ACTIVE'" : ''}
        ORDER BY name`,
    )
    .all() as CommodityRow[];

  const purchased = qtyMap(
    'SELECT commodity_id AS id, COALESCE(SUM(weight), 0) AS q FROM purchase_items GROUP BY commodity_id',
  );
  const sold = qtyMap(
    'SELECT commodity_id AS id, COALESCE(SUM(weight), 0) AS q FROM sales_items GROUP BY commodity_id',
  );
  const returned = qtyMap(
    'SELECT commodity_id AS id, COALESCE(SUM(weight), 0) AS q FROM sales_return_items GROUP BY commodity_id',
  );
  const adjusted = qtyMap(
    'SELECT commodity_id AS id, COALESCE(SUM(qty), 0) AS q FROM stock_adjustments GROUP BY commodity_id',
  );

  return commodities.map((commodity) => {
    const inQty = purchased.get(commodity.id) ?? 0;
    const outQty = sold.get(commodity.id) ?? 0;
    const retQty = returned.get(commodity.id) ?? 0;
    const adjQty = adjusted.get(commodity.id) ?? 0;
    const stock = round2(inQty - outQty + retQty + adjQty);

    return {
      id: commodity.id,
      code: commodity.code,
      name: commodity.name,
      category: commodity.category,
      unit: commodity.unit,
      rate: money(commodity.default_rate),
      rate_20kg: money(commodity.rate_20kg),
      min_level: Number(commodity.min_level ?? 0),
      emoji: commodity.emoji,
      status: commodity.status,
      purchased: round2(inQty),
      sold: round2(outQty),
      returned: round2(retQty),
      adjusted: round2(adjQty),
      stock,
      value: money(stock * (commodity.default_rate ?? 0)),
      state: stateFor(stock, Number(commodity.min_level ?? 0)),
    };
  });
}

/** Live on-hand quantity (kg/units) for one commodity. */
export function liveStock(commodityId: number): number {
  const db = getDb();
  const sum = (table: string, column: string): number => {
    const row = db
      .prepare(`SELECT COALESCE(SUM(${column}), 0) AS q FROM ${table} WHERE commodity_id = ?`)
      .get(commodityId) as { q: number };
    return Number(row.q);
  };

  return round2(
    sum('purchase_items', 'weight') -
      sum('sales_items', 'weight') +
      sum('sales_return_items', 'weight') +
      sum('stock_adjustments', 'qty'),
  );
}
