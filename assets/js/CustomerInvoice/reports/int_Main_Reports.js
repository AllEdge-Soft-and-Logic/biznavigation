// ==========================================
// GENERATE INTERNATIONAL INVOICE PDF
// ==========================================
async function generate_International_InvoicePDF_Main(header, lines = []) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const PAGE = { x: 15, w: 190, h: 297 };
    const FONT = { header: 14, title: 10, body: 8, small: 7, tiny: 6, stiny: 5 };
    let y = 9;

    // FETCH DATA
    const [company, party, tandcData, shipmentData, bank, totalsPayment] = await Promise.all([
        fetchCompanyDetails(header),
        fetchPartyDetails(header),
        getTermsAndConditions(header?.company_id),
        getShipmentData_int_Main(header?.InvoiceNo),
        getInvoiceBankDetails(header?.InvoiceNo),
        advancedPaymentDetails(header?.InvoiceNo, header?.InvoiceDate)
    ]);

    const opNo = shipmentData?.opNo || "";
    const shipments = shipmentData?.shipments || [];

    const totalPaymentReceived = round2(
        safeNumber(totalsPayment?.totalPayment) +
        safeNumber(totalsPayment?.totalOtherDeduction) +
        safeNumber(totalsPayment?.totalTDS)
    );

    y = await drawHeader(doc, PAGE, FONT, company, y);
    y = drawTitle(doc, PAGE, FONT, y);

    // 👉 Passed opNo to drawPartySection
    y = drawPartySection(doc, PAGE, FONT, header, party, company, opNo, y);

    const shipmentResult = await drawShipmentTable_int_Main(doc, PAGE, FONT, shipments, y);
    y = shipmentResult.y;

    y = await drawTermsAndTaxSection_int(doc, PAGE, FONT, company, header, shipmentResult, y, bank, totalPaymentReceived, tandcData);

    y = drawAmountInWords(doc, PAGE, FONT, shipmentResult.grandTotal, y);
    y = drawBankDetailsSection(doc, PAGE, FONT, company, bank, y);

    // drawaddFooterToAllPages(doc, PAGE, y);
    drawInvoiceBorderAllPages(doc, PAGE);

    const fileName = `${header?.InvoiceNo || "NA"}_${party?.name || "NA"}.pdf`;
    console.log("PDF generated successfully", fileName);
    doc.save(fileName);
}

// ==========================================
// TERMS & TAX SECTION
// ==========================================
async function drawTermsAndTaxSection_int(doc, PAGE, FONT, company, header, totals, y, bank, totalPaymentReceived, tandcData) {
    const CONFIG = { headerH: 5, lineHeight: 1, paragraphGap: 0.3, colDescription: 23, colNonTax: 23, colTax: 23, bankTopGap: 1, bankRowHeight: 4, bottomMargin: 35 };

    const COL = {
        terms: PAGE.w - (CONFIG.colDescription + CONFIG.colNonTax + CONFIG.colTax),
        desc: CONFIG.colDescription, nonTax: CONFIG.colNonTax, tax: CONFIG.colTax
    };

    const X = {
        terms: PAGE.x, desc: PAGE.x + COL.terms, nonTax: PAGE.x + COL.terms + COL.desc,
        tax: PAGE.x + COL.terms + COL.desc + COL.nonTax, end: PAGE.x + PAGE.w
    };

    const termsHeight = calculateTermsHeight(doc, tandcData, COL.terms, CONFIG);
    const tableH = Math.max(termsHeight + CONFIG.bankTopGap + 20 + 2, 9 * CONFIG.headerH);

    // PAGE BREAK LOGIC
    const bottomY = doc.internal.pageSize.getHeight() - CONFIG.bottomMargin - tableH;
    if (bottomY > y) {
        y = bottomY;
    } else {
        doc.addPage();
        y = doc.internal.pageSize.getHeight() - CONFIG.bottomMargin - tableH;
    }

    drawOuterTable(doc, PAGE, X, y, tableH);
    drawHeaderRow(doc, FONT, X, COL, y, CONFIG.headerH);
    drawTermsContent(doc, FONT, tandcData, X, COL, y, CONFIG);
    drawTaxSection(doc, FONT, totals, totalPaymentReceived, X, COL, y, CONFIG);

    return y + tableH;
}

function calculateTermsHeight(doc, tandcData, termsWidth, CONFIG) {
    let height = CONFIG.headerH + 4;
    tandcData.forEach((item, i) => {
        const split = doc.splitTextToSize(`${i + 1}. ${item.Description || ""}`, termsWidth - 10);
        height += split.length * CONFIG.lineHeight;
        if (i < tandcData.length - 1) height += CONFIG.paragraphGap;
    });
    return height;
}

function drawOuterTable(doc, PAGE, X, y, tableH) {
    doc.setLineWidth(0.1);
    doc.rect(PAGE.x, y, PAGE.w, tableH);
    [X.desc, X.nonTax, X.tax].forEach(xCol => doc.line(xCol, y, xCol, y + tableH));
}

function drawHeaderRow(doc, FONT, X, COL, y, rowH) {
    doc.line(X.terms, y + rowH, X.end, y + rowH);
    PDF_FONT.bold(doc, FONT.body);
    drawCenteredText(doc, "Terms & Conditions", X.terms, COL.terms, y, rowH);
    drawCenteredText(doc, "", X.desc, COL.desc, y, rowH);
    drawCenteredText(doc, "Non-Tax Amount", X.nonTax, COL.nonTax, y, rowH);
    drawCenteredText(doc, "Tax Amount", X.tax, COL.tax, y, rowH);
}

function drawTermsContent(doc, FONT, tandcData, X, COL, y, CONFIG) {
    PDF_FONT.normal(doc, FONT.body);
    let currentY = y + CONFIG.headerH + 4;
    const leftMargin = X.terms + 4, textWidth = COL.terms - 5, indent = 2;

    tandcData.forEach((item, index) => {
        const lines = doc.splitTextToSize(item.Description || "", textWidth - indent);
        doc.text(`${index + 1}. ${lines[0] || ""}`, leftMargin, currentY);
        currentY += 3.8;

        for (let i = 1; i < lines.length; i++) {
            doc.text(lines[i], leftMargin + indent, currentY);
            currentY += 3.8;
        }
        currentY += 1.5;
    });
    return currentY;
}

function drawTaxSection(doc, FONT, totals, totalPaymentReceived, X, COL, y, CONFIG) {
    const nonTaxable = safeNumber(totals?.nonTaxableAmount);
    const taxable = safeNumber(totals?.taxableAmount);
    const cgst = safeNumber(totals?.totalCGST);
    const sgst = safeNumber(totals?.totalSGST);
    const igst = safeNumber(totals?.totalIGST);
    const advance = safeNumber(totalPaymentReceived);

    const totalGST = cgst + sgst + igst;
    const grandTotal = Math.round(nonTaxable + taxable + totalGST);
    const balanceAmount = Math.round(grandTotal - advance);

    const rows = [
        ["Total Charges", nonTaxable, taxable],
        ["CGST 9%", 0, cgst], ["SGST 9%", 0, sgst], ["IGST 18%", 0, igst],
        ["Total GST", 0, totalGST]
    ];

    PDF_FONT.normal(doc, FONT.body);

    rows.forEach((row, i) => {
        const rowY = y + CONFIG.headerH + (i * CONFIG.headerH);
        doc.line(X.desc, rowY, X.end, rowY);
        doc.setFont("times", row[0] === "Total GST" ? "bold" : "normal");

        doc.text(row[0], X.desc + 2, rowY + 3.2);
        doc.text(safeAmount(row[1]).toFixed(2), X.nonTax + COL.nonTax - 2, rowY + 3.2, { align: "right" });
        doc.text(safeAmount(row[2]).toFixed(2), X.tax + COL.tax - 2, rowY + 3.2, { align: "right" });
    });

    const summaryStartY = y + CONFIG.headerH + (rows.length * CONFIG.headerH);
    doc.line(X.desc, summaryStartY, X.end, summaryStartY);

    const summaryRows = [
        ["Grand Total", grandTotal], ["Advance Amount", advance], ["Balance Amount", balanceAmount]
    ];

    summaryRows.forEach((row, i) => {
        const rowY = summaryStartY + (i * CONFIG.headerH);

        doc.setFillColor(230, 230, 230);
        doc.rect(X.desc, rowY, X.end - X.desc, CONFIG.headerH, "F");
        doc.rect(X.desc, rowY, X.end - X.desc, CONFIG.headerH);
        doc.line(X.desc, rowY, X.end, rowY);

        doc.setFont("times", "bold");
        doc.text(row[0], X.desc + 2, rowY + 3.2);
        doc.text(safeAmount(row[1]).toFixed(2), X.tax + COL.tax - 2, rowY + 3.2, { align: "right" });
        doc.line(X.desc, rowY + CONFIG.headerH, X.end, rowY + CONFIG.headerH);
    });

    return { grandTotal, totalGST, balanceAmount, endY: summaryStartY + (summaryRows.length * CONFIG.headerH) };
}

function drawCenteredText(doc, text, x, width, y, height) {
    doc.text(text, x + width / 2, y + height / 2, { align: "center", baseline: "middle" });
}

// ==========================================
// FETCH SHIPMENT DATA
// ==========================================
async function getShipmentData_int_Main(invoiceNo) {
    try {
        const { data, error } = await supabaseClient
            .from("InternationalBookingView")
            .select("*")
            .eq("InvoiceNumber", invoiceNo)
            .order("BookedDate", { ascending: true });

        if (error) {
            console.error("Error fetching shipment data:", error);
            return { shipments: [], opNo: "" };
        }

        const shipments = data || [];

        // 👉 Extract all unique PO Numbers
        const opNo = [...new Set(shipments.map(row => row.PONo).filter(Boolean))].join(', ');

        return { shipments, opNo };
    } catch (err) {
        console.error("Unexpected error:", err);
        return { shipments: [], opNo: "" };
    }
}

// ==========================================
// SHIPMENT TABLE
// ==========================================
async function drawShipmentTable_int_Main(doc, PAGE, FONT, rows = [], y) {
    let freightAmount = 0, fuelSurcharge = 0, otherAmount = 0;
    let totalCGST = 0, totalSGST = 0, totalIGST = 0, totalGST = 0;
    let nonTaxableAmount = 0, taxableAmount = 0;

    if (!rows.length) console.warn("No shipment data found");

    const body = rows.map((row, i) => {
        freightAmount += safeNumber(row.FreightAmount) || 0;
        fuelSurcharge += safeNumber(row.FuelSurcharge) || 0;
        otherAmount += safeNumber(row.OtherAmount) || 0;
        totalCGST += safeNumber(row.TotalCGSTAmt);
        totalSGST += safeNumber(row.TotalSGSTAmt);
        totalIGST += safeNumber(row.TotalIGSTAmt);
        totalGST += safeNumber(row.TotalGSTAmt);
        nonTaxableAmount += safeNumber(row.NonTaxableAmount) || 0;
        taxableAmount += safeNumber(row.TaxableAmount) || 0;

        const safe = (val, fallback = "-") => (val != null && String(val).trim() !== "") ? val : fallback;
        const mode = [row.MovementType, row.ModeType].filter(Boolean).join("\n");

        return [
            i + 1, formatDate(row.BookedDate) || "", row.DocketNo || "", mode || "",
            safe(row.ClearanceMode), safe(row.Origin) || "", safe(row.Destination) || "",
            row.NoofUnit ?? "0", `${row.ChargableWeight} ${row.UOMType}`,
            row.FreightAmount ? safeNumber(row.FreightAmount).toFixed(2) : "0.00",
            row.FuelSurcharge ? safeNumber(row.FuelSurcharge).toFixed(2) : "0.00",
            row.OtherCharges ? safeNumber(row.OtherCharges).toFixed(2) : "0.00",
            row.TotalAmount ? safeNumber(row.TotalAmount).toFixed(2) : "0.00"
        ];
    });

    const grandTotal = Math.round(freightAmount + fuelSurcharge + otherAmount + totalGST);

    doc.autoTable({
        startY: y,
        margin: { left: PAGE.x, right: PAGE.x },
        tableWidth: PAGE.w,
        head: [["Sl No.", "Date", "AWB No", "Transit", "Mode", "Origin", "Dest.", "Qty", "Weight", "Frt. Amt.", "FSC. Chrgs", "Other Charges", "TotalAmt."]],
        body,
        styles: { fontSize: FONT.small, cellPadding: 1, overflow: "linebreak", textColor: 0, minCellHeight: 10, lineWidth: 0.2, lineColor: [0, 0, 0] },
        headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold", halign: "center", cellPadding: 1.5, lineWidth: 0.2, lineColor: [0, 0, 0], valign: "middle" },
        didParseCell: (data) => {
            if (data.section === "body") { data.cell.styles.fillColor = [255, 255, 255]; data.cell.styles.textColor = [0, 0, 0]; }
        },
        columnStyles: {
            0: { cellWidth: 7, halign: "center", valign: "middle" }, 1: { cellWidth: 16, valign: "middle" },
            2: { cellWidth: 19, valign: "middle" }, 3: { cellWidth: 19, valign: "middle" },
            4: { cellWidth: 15, valign: "middle" }, 5: { cellWidth: 15, valign: "middle" },
            6: { cellWidth: 15, valign: "middle" }, 7: { cellWidth: 10, halign: "right", valign: "middle" },
            8: { cellWidth: 12, halign: "right", valign: "middle" }, 9: { cellWidth: 17, halign: "right", valign: "middle" },
            10: { cellWidth: 14, halign: "right", valign: "middle" }, 11: { cellWidth: 14, halign: "right", valign: "middle" },
            12: { cellWidth: 17, halign: "right", valign: "middle" }
        }
    });

    return { y: doc.lastAutoTable.finalY, freightAmount, fuelSurcharge, otherAmount, totalCGST, totalSGST, totalIGST, totalGST, nonTaxableAmount, taxableAmount, grandTotal };
}