/**
 * fuelPricesRouter.ts
 * tRPC procedures for:
 *  1. Daily fuel retail price entry (staff logs today's selling price)
 *  2. Purchase receipt scanning (AI vision extracts invoice data → purchase order)
 */
import { z } from "zod";
import { router, protectedProcedure, operationalProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import { storagePut } from "../storage";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import { dailyFuelPrices, scannedReceipts, products, purchaseOrders } from "../../drizzle/schema";

let _db: MySql2Database<Record<string, never>> | null = null;
async function getDb(): Promise<MySql2Database<Record<string, never>>> {
  if (!_db) {
    const mysql = await import("mysql2/promise");
    const pool = mysql.createPool(process.env.DATABASE_URL!);
    _db = drizzle(pool) as unknown as MySql2Database<Record<string, never>>;
  }
  return _db!;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Cascade a new cost price to all cost-related tables */
async function cascadeCostUpdate(
  db: MySql2Database<Record<string, never>>,
  fuelType: "petrol" | "diesel",
  newCostPrice: number,
  invoiceDate: string,
  invoiceNumber: string,
  supplierName: string,
  confirmedBy: string
) {
  const productName = fuelType === "petrol" ? "Petrol (MS)" : "Diesel (HSD)";

  // 1. Update fuel_config (drives Fuel Intelligence WACP fallback)
  await db.execute(sql`
    UPDATE fuel_config
    SET latest_cost_price = ${newCostPrice}, updated_by = ${confirmedBy}
    WHERE fuel_type = ${fuelType}
  `);

  // 2. Update products table (purchase price + recalculate margin)
  await db.execute(sql`
    UPDATE products
    SET purchasePrice = ${newCostPrice},
        margin = sellingPrice - ${newCostPrice}
    WHERE name = ${productName}
  `);

  // 3. Upsert daily_fuel_prices for the invoice date
  await db.execute(sql`
    INSERT INTO daily_fuel_prices (price_date, fuel_type, retail_price, cost_price, source, notes, recorded_by)
    VALUES (
      ${invoiceDate},
      ${fuelType},
      (SELECT retail_price FROM fuel_config WHERE fuel_type = ${fuelType} LIMIT 1),
      ${newCostPrice},
      'receipt_scan',
      ${`Invoice ${invoiceNumber} from ${supplierName}`},
      ${confirmedBy}
    )
    ON DUPLICATE KEY UPDATE
      cost_price = ${newCostPrice},
      source = 'receipt_scan',
      notes = ${`Invoice ${invoiceNumber} from ${supplierName}`}
  `);
}

/** Enhanced LLM extraction prompt for Indian fuel receipts */
const EXTRACTION_PROMPT = `You are an expert at reading Indian petroleum fuel delivery receipts and invoices from oil marketing companies (OMCs) such as HPCL, BPCL, Indian Oil (IOC), Essar, Shell, and Nayara Energy.

These documents may be:
- Retail Outlet Delivery Challans (RODC)
- Tax Invoices / GST Invoices
- Delivery Advice / Lorry Receipts
- Digital or printed receipts from tanker deliveries

Carefully analyse the image and extract the following fields. Return ONLY a valid JSON object — no markdown, no explanation, no extra text.

{
  "supplierName": "Full oil company name (e.g. Hindustan Petroleum Corporation Limited, Bharat Petroleum, Indian Oil Corporation)",
  "invoiceNumber": "Invoice / challan / delivery note number as printed",
  "invoiceDate": "Date in YYYY-MM-DD format — look for delivery date, invoice date, or challan date",
  "fuelType": "petrol OR diesel OR lubricant — MS = petrol, HSD = diesel, ATF = aviation (map to diesel)",
  "quantityLitres": "Numeric litres delivered — IMPORTANT: if shown in KL (kilolitres), multiply by 1000. If shown in MT (metric tonnes), multiply by 1176 for petrol or 1163 for diesel",
  "unitPrice": "Price per LITRE in ₹ — look for 'rate per litre', 'unit price', 'basic price'. If shown per KL, divide by 1000",
  "totalAmount": "Total invoice value in ₹ including all taxes",
  "taxAmount": "GST / excise / cess amount in ₹ (0 if not shown separately)",
  "confidenceScore": "Integer 0-100: your overall confidence in the extraction accuracy. 90+ = all fields clearly visible, 70-89 = most fields clear, 50-69 = some fields unclear, <50 = poor image quality or unusual format",
  "fieldConfidence": {
    "supplierName": 0-100,
    "invoiceNumber": 0-100,
    "invoiceDate": 0-100,
    "fuelType": 0-100,
    "quantityLitres": 0-100,
    "unitPrice": 0-100,
    "totalAmount": 0-100
  },
  "notes": "Any important observations: image quality issues, unusual format, fields that needed inference, unit conversions applied"
}

Critical rules:
- quantityLitres MUST be in litres (L), not KL or MT
- unitPrice MUST be ₹ per litre
- If a field is genuinely not visible, use null (not 0, not empty string)
- For fuelType: MS/Motor Spirit/Petrol → "petrol", HSD/High Speed Diesel/Diesel → "diesel"
- Do NOT guess — if unsure, lower the confidence score and note it`;

// ─── Router ───────────────────────────────────────────────────────────────────
const dailyPriceInput = z.object({
  priceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fuelType: z.enum(["petrol", "diesel"]),
  retailPrice: z.number().min(50).max(300),
  costPrice: z.number().min(40).max(280).optional(),
  notes: z.string().max(500).optional(),
});

export const fuelPricesRouter = router({
  // ─── Save / update today's price ────────────────────────────────────────
  saveDailyPrice: operationalProcedure
    .input(dailyPriceInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const recordedBy = ctx.user?.name ?? "Staff";

      // Upsert: delete existing entry for same date+fuelType, then insert
      await db.execute(sql`
        DELETE FROM daily_fuel_prices
        WHERE price_date = ${input.priceDate} AND fuel_type = ${input.fuelType}
      `);
      await db.insert(dailyFuelPrices).values({
        priceDate: input.priceDate,
        fuelType: input.fuelType,
        retailPrice: String(input.retailPrice),
        costPrice: input.costPrice ? String(input.costPrice) : null,
        source: "manual",
        notes: input.notes ?? null,
        recordedBy,
      });

      // Also update fuel_config and products table so Fuel Intelligence picks it up
      await db.execute(sql`
        UPDATE fuel_config
        SET retail_price = ${input.retailPrice},
            ${input.costPrice ? sql`latest_cost_price = ${input.costPrice},` : sql``}
            updated_by = ${recordedBy}
        WHERE fuel_type = ${input.fuelType}
      `);

      if (input.costPrice) {
        const productName = input.fuelType === "petrol" ? "Petrol (MS)" : "Diesel (HSD)";
        await db.execute(sql`
          UPDATE products
          SET sellingPrice = ${input.retailPrice},
              purchasePrice = ${input.costPrice},
              margin = ${input.retailPrice - input.costPrice}
          WHERE name = ${productName}
        `);
      }

      return { success: true, message: `${input.fuelType} price saved for ${input.priceDate}` };
    }),

  // ─── Get price history ───────────────────────────────────────────────────
  getDailyPrices: protectedProcedure
    .input(z.object({
      fuelType: z.enum(["petrol", "diesel"]).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.execute(sql`
        SELECT id, price_date, fuel_type, retail_price, cost_price, source, notes, recorded_by, createdAt
        FROM daily_fuel_prices
        WHERE 1=1
          ${input.fuelType ? sql`AND fuel_type = ${input.fuelType}` : sql``}
          ${input.startDate ? sql`AND price_date >= ${input.startDate}` : sql``}
          ${input.endDate ? sql`AND price_date <= ${input.endDate}` : sql``}
        ORDER BY price_date DESC, fuel_type ASC
        LIMIT ${input.limit}
      `) as any;
      return (rows[0] as any[]).map((r: any) => ({
        id: r.id,
        priceDate: String(r.price_date),
        fuelType: r.fuel_type as "petrol" | "diesel",
        retailPrice: Number(r.retail_price),
        costPrice: r.cost_price ? Number(r.cost_price) : null,
        margin: r.cost_price ? Number(r.retail_price) - Number(r.cost_price) : null,
        source: r.source as "manual" | "receipt_scan",
        notes: r.notes ?? null,
        recordedBy: r.recorded_by ?? null,
        createdAt: r.createdAt,
      }));
    }),

  // ─── Get latest price for a fuel type ───────────────────────────────────
  getLatestPrice: protectedProcedure
    .input(z.object({ fuelType: z.enum(["petrol", "diesel"]) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.execute(sql`
        SELECT price_date, retail_price, cost_price, source
        FROM daily_fuel_prices
        WHERE fuel_type = ${input.fuelType}
        ORDER BY price_date DESC
        LIMIT 1
      `) as any;
      const r = (rows[0] as any[])[0];
      if (!r) return null;
      return {
        priceDate: String(r.price_date),
        retailPrice: Number(r.retail_price),
        costPrice: r.cost_price ? Number(r.cost_price) : null,
        source: r.source,
      };
    }),

  // ─── Upload receipt image and extract data via AI vision ─────────────────
  uploadAndScanReceipt: operationalProcedure
    .input(z.object({
      imageBase64: z.string().min(100),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]).default("image/jpeg"),
      fileName: z.string().default("receipt.jpg"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const uploadedBy = ctx.user?.name ?? "Staff";

      // 1. Upload image to S3
      const buffer = Buffer.from(input.imageBase64, "base64");
      const suffix = Date.now().toString(36);
      const fileKey = `receipts/${suffix}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url: imageUrl } = await storagePut(fileKey, buffer, input.mimeType);

      // 2. Create pending receipt record
      const [insertResult] = await db.insert(scannedReceipts).values({
        imageUrl,
        status: "pending",
        uploadedBy,
      }) as any;
      const receiptId = (insertResult as any).insertId;

      // 3. Call LLM vision with enhanced prompt
      let extractedData: any = null;
      let rawJson = "";
      let extractionStatus: "extracted" | "failed" = "extracted";

      try {
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: "user" as const,
              content: [
                { type: "text" as const, text: EXTRACTION_PROMPT },
                { type: "image_url" as const, image_url: { url: imageUrl, detail: "high" as const } },
              ],
            },
          ],
        } as any);

        const msgContent = llmResponse.choices?.[0]?.message?.content;
        rawJson = typeof msgContent === "string" ? msgContent : JSON.stringify(msgContent ?? "");
        // Strip markdown code blocks if present
        const cleaned = rawJson.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        extractedData = JSON.parse(cleaned);
      } catch (err) {
        console.error("Receipt extraction failed:", err);
        extractionStatus = "failed";
      }

      // 4. Update receipt record with extracted data
      if (extractedData) {
        await db.execute(sql`
          UPDATE scanned_receipts SET
            status = 'extracted',
            supplier_name   = ${extractedData.supplierName ?? null},
            invoice_number  = ${extractedData.invoiceNumber ?? null},
            invoice_date    = ${extractedData.invoiceDate ?? null},
            fuel_type       = ${extractedData.fuelType ?? null},
            quantity_litres = ${extractedData.quantityLitres ?? null},
            unit_price      = ${extractedData.unitPrice ?? null},
            total_amount    = ${extractedData.totalAmount ?? null},
            tax_amount      = ${extractedData.taxAmount ?? 0},
            confidence_score = ${extractedData.confidenceScore ?? 50},
            raw_extracted_json = ${rawJson}
          WHERE id = ${receiptId}
        `);
      } else {
        await db.execute(sql`
          UPDATE scanned_receipts SET status = 'failed', raw_extracted_json = ${rawJson}
          WHERE id = ${receiptId}
        `);
      }

      // 5. Fetch current cost price for cost-change delta preview
      let currentCostPrice: number | null = null;
      if (extractedData?.fuelType && extractedData.fuelType !== "lubricant") {
        const cfRows = await db.execute(sql`
          SELECT latest_cost_price FROM fuel_config WHERE fuel_type = ${extractedData.fuelType} LIMIT 1
        `) as any;
        const cfRow = (cfRows[0] as any[])[0];
        currentCostPrice = cfRow ? Number(cfRow.latest_cost_price) : null;
      }

      return {
        receiptId,
        imageUrl,
        status: extractionStatus,
        extracted: extractedData,
        currentCostPrice,
        fieldConfidence: extractedData?.fieldConfidence ?? null,
      };
    }),

  // ─── Re-scan an existing receipt (re-run LLM on stored image) ────────────
  rescanReceipt: operationalProcedure
    .input(z.object({ receiptId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // Fetch the stored image URL
      const rows = await db.execute(sql`
        SELECT image_url, uploaded_by FROM scanned_receipts WHERE id = ${input.receiptId} LIMIT 1
      `) as any;
      const row = (rows[0] as any[])[0];
      if (!row) throw new Error(`Receipt #${input.receiptId} not found`);

      const imageUrl: string = row.image_url;

      // Reset to pending
      await db.execute(sql`
        UPDATE scanned_receipts SET status = 'pending', raw_extracted_json = NULL WHERE id = ${input.receiptId}
      `);

      // Re-run LLM extraction
      let extractedData: any = null;
      let rawJson = "";
      let extractionStatus: "extracted" | "failed" = "extracted";

      try {
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: "user" as const,
              content: [
                { type: "text" as const, text: EXTRACTION_PROMPT },
                { type: "image_url" as const, image_url: { url: imageUrl, detail: "high" as const } },
              ],
            },
          ],
        } as any);

        const msgContent = llmResponse.choices?.[0]?.message?.content;
        rawJson = typeof msgContent === "string" ? msgContent : JSON.stringify(msgContent ?? "");
        const cleaned = rawJson.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        extractedData = JSON.parse(cleaned);
      } catch (err) {
        console.error("Re-scan extraction failed:", err);
        extractionStatus = "failed";
      }

      if (extractedData) {
        await db.execute(sql`
          UPDATE scanned_receipts SET
            status = 'extracted',
            supplier_name   = ${extractedData.supplierName ?? null},
            invoice_number  = ${extractedData.invoiceNumber ?? null},
            invoice_date    = ${extractedData.invoiceDate ?? null},
            fuel_type       = ${extractedData.fuelType ?? null},
            quantity_litres = ${extractedData.quantityLitres ?? null},
            unit_price      = ${extractedData.unitPrice ?? null},
            total_amount    = ${extractedData.totalAmount ?? null},
            tax_amount      = ${extractedData.taxAmount ?? 0},
            confidence_score = ${extractedData.confidenceScore ?? 50},
            raw_extracted_json = ${rawJson}
          WHERE id = ${input.receiptId}
        `);
      } else {
        await db.execute(sql`
          UPDATE scanned_receipts SET status = 'failed', raw_extracted_json = ${rawJson}
          WHERE id = ${input.receiptId}
        `);
      }

      let currentCostPrice: number | null = null;
      if (extractedData?.fuelType && extractedData.fuelType !== "lubricant") {
        const cfRows = await db.execute(sql`
          SELECT latest_cost_price FROM fuel_config WHERE fuel_type = ${extractedData.fuelType} LIMIT 1
        `) as any;
        const cfRow = (cfRows[0] as any[])[0];
        currentCostPrice = cfRow ? Number(cfRow.latest_cost_price) : null;
      }

      return {
        receiptId: input.receiptId,
        imageUrl,
        status: extractionStatus,
        extracted: extractedData,
        currentCostPrice,
        fieldConfidence: extractedData?.fieldConfidence ?? null,
      };
    }),

  // ─── Confirm scanned receipt and create purchase order ───────────────────
  confirmReceipt: operationalProcedure
    .input(z.object({
      receiptId: z.number().int().positive(),
      supplierName: z.string().min(1),
      invoiceNumber: z.string().min(1),
      invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fuelType: z.enum(["petrol", "diesel", "lubricant"]),
      quantityLitres: z.number().positive(),
      unitPrice: z.number().positive(),
      totalAmount: z.number().positive(),
      taxAmount: z.number().min(0).default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const confirmedBy = ctx.user?.name ?? "Staff";

      // Fetch old cost price for delta calculation
      let oldCostPrice: number | null = null;
      if (input.fuelType !== "lubricant") {
        const cfRows = await db.execute(sql`
          SELECT latest_cost_price FROM fuel_config WHERE fuel_type = ${input.fuelType} LIMIT 1
        `) as any;
        const cfRow = (cfRows[0] as any[])[0];
        oldCostPrice = cfRow ? Number(cfRow.latest_cost_price) : null;
      }

      // Find the product ID for this fuel type
      const productName = input.fuelType === "petrol" ? "Petrol (MS)"
        : input.fuelType === "diesel" ? "Diesel (HSD)" : "Lubricants";
      const productRows = await db.execute(sql`
        SELECT id, sellingPrice FROM products WHERE name = ${productName} LIMIT 1
      `) as any;
      const productRow = (productRows[0] as any[])[0];
      const productId = productRow?.id ?? 1;
      const currentRetailPrice = productRow?.sellingPrice ? Number(productRow.sellingPrice) : null;

      // Create purchase order
      const [poResult] = await db.insert(purchaseOrders).values({
        productId,
        supplier: input.supplierName,
        invoiceNo: input.invoiceNumber,
        orderDate: input.invoiceDate,
        deliveryDate: input.invoiceDate,
        quantityOrdered: String(input.quantityLitres),
        quantityReceived: String(input.quantityLitres),
        unitPrice: String(input.unitPrice),
        totalAmount: String(input.totalAmount),
        status: "delivered",
        notes: input.notes ?? `Auto-created from scanned receipt #${input.receiptId}`,
      }) as any;
      const purchaseOrderId = (poResult as any).insertId;

      // Mark receipt as confirmed
      await db.execute(sql`
        UPDATE scanned_receipts SET
          status = 'confirmed',
          purchase_order_id = ${purchaseOrderId},
          confirmed_by = ${confirmedBy},
          confirmedAt = NOW()
        WHERE id = ${input.receiptId}
      `);

      // Cascade cost update to all cost-related tables
      if (input.fuelType !== "lubricant") {
        await cascadeCostUpdate(
          db,
          input.fuelType,
          input.unitPrice,
          input.invoiceDate,
          input.invoiceNumber,
          input.supplierName,
          confirmedBy
        );
      }

      // Compute cost delta and new margin
      const costDelta = oldCostPrice !== null ? input.unitPrice - oldCostPrice : null;
      const newMargin = currentRetailPrice !== null ? currentRetailPrice - input.unitPrice : null;
      const oldMargin = (oldCostPrice !== null && currentRetailPrice !== null)
        ? currentRetailPrice - oldCostPrice : null;

      // Notify owner
      const deltaStr = costDelta !== null
        ? `${costDelta >= 0 ? "+" : ""}₹${costDelta.toFixed(2)}/L change`
        : "first entry";
      const marginStr = newMargin !== null ? `New margin: ₹${newMargin.toFixed(2)}/L` : "";
      await notifyOwner({
        title: `📄 Receipt Confirmed — ${input.fuelType.toUpperCase()} @ ₹${input.unitPrice.toFixed(2)}/L`,
        content: [
          `Supplier: ${input.supplierName}`,
          `Invoice: ${input.invoiceNumber} (${input.invoiceDate})`,
          `Quantity: ${input.quantityLitres.toLocaleString("en-IN")} L`,
          `Cost: ₹${input.unitPrice.toFixed(2)}/L (${deltaStr})`,
          marginStr,
          `Total: ₹${input.totalAmount.toLocaleString("en-IN")}`,
          `Confirmed by: ${confirmedBy}`,
          `PO #${purchaseOrderId} created`,
        ].filter(Boolean).join("\n"),
      });

      return {
        success: true,
        purchaseOrderId,
        costDelta,
        oldCostPrice,
        newCostPrice: input.unitPrice,
        oldMargin,
        newMargin,
        message: `Purchase order #${purchaseOrderId} created. Cost updated from ₹${oldCostPrice?.toFixed(2) ?? "—"} → ₹${input.unitPrice.toFixed(2)}/L`,
      };
    }),

  // ─── Get scanned receipts history ────────────────────────────────────────
  getReceipts: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "extracted", "confirmed", "failed", "all"]).default("all"),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.execute(sql`
        SELECT id, image_url, status, supplier_name, invoice_number, invoice_date,
               fuel_type, quantity_litres, unit_price, total_amount, confidence_score,
               purchase_order_id, confirmed_by, uploaded_by, createdAt
        FROM scanned_receipts
        WHERE ${input.status === "all" ? sql`1=1` : sql`status = ${input.status}`}
        ORDER BY createdAt DESC
        LIMIT ${input.limit}
      `) as any;
      return (rows[0] as any[]).map((r: any) => ({
        id: r.id,
        imageUrl: r.image_url,
        status: r.status as "pending" | "extracted" | "confirmed" | "failed",
        supplierName: r.supplier_name,
        invoiceNumber: r.invoice_number,
        invoiceDate: r.invoice_date ? String(r.invoice_date) : null,
        fuelType: r.fuel_type as "petrol" | "diesel" | "lubricant" | null,
        quantityLitres: r.quantity_litres ? Number(r.quantity_litres) : null,
        unitPrice: r.unit_price ? Number(r.unit_price) : null,
        totalAmount: r.total_amount ? Number(r.total_amount) : null,
        confidenceScore: r.confidence_score ? Number(r.confidence_score) : null,
        purchaseOrderId: r.purchase_order_id,
        confirmedBy: r.confirmed_by,
        uploadedBy: r.uploaded_by,
        createdAt: r.createdAt,
      }));
    }),
});
