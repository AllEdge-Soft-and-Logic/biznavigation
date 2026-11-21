// ==========================================
// GENERATE INTERNATIONAL INVOICE PDF
// ==========================================
async function generate_FullTruckReports_InvoicePDF(header, lines = []) {

    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
        compress: true
    });

    const PAGE = { x: 15, w: 190, h: 297 };

    const FONT = { header: 14, title: 10, body: 8, small: 7, tiny: 6, stiny: 5 };

    let y = 9;

    // ==========================================
    // FETCH DATA
    // ==========================================
    const [company, party, tandcData, shipmentData, bank, totalsPayment
    ] = await Promise.all([
        fetchCompanyDetails(header),
        fetchPartyDetails(header),
        getTermsAndConditions(header?.company_id),
        getShipmentData_ftl_Main(header?.InvoiceNo),
        getInvoiceBankDetails(header?.InvoiceNo),
        advancedPaymentDetails(
            header?.InvoiceNo,
            header?.InvoiceDate
        )
    ]);

    // ==========================================
    // TOTAL PAYMENT RECEIVED
    // ==========================================
    const totalPaymentReceived = round2(
        safeNumber(totalsPayment?.totalPayment) +
        safeNumber(totalsPayment?.totalOtherDeduction) +
        safeNumber(totalsPayment?.totalTDS)

    );

    // ==========================================
    // HEADER
    // ==========================================
    y = await drawHeader(doc, PAGE, FONT, company, y);

    // ==========================================
    // TITLE
    // ==========================================
    y = drawTitle(doc, PAGE, FONT, y);

    // ==========================================
    // PARTY SECTION
    // ==========================================
    y = drawPartySection(doc, PAGE, FONT, header, party, company, y);

    // ==========================================
    // SHIPMENT TABLE
    // ==========================================
    const shipmentResult = await drawShipmentTable_ftl_Main(doc, PAGE, FONT, shipmentData, y);

    y = shipmentResult.y;

    // ==========================================
    // TERMS + TAX SECTION
    // ==========================================
    y = await drawTermsAndTaxSection_ftl(doc, PAGE, FONT, company, header, shipmentResult, y, bank, totalPaymentReceived,
        tandcData
    );

    // ==========================================
    // AMOUNT IN WORDS
    // ==========================================
    y = drawAmountInWords(doc, PAGE, FONT, shipmentResult.grandTotal, y);

    // ==========================================
    // BANK DETAILS SECTION
    // ==========================================
    y = drawBankDetailsSection(doc, PAGE, FONT, company, bank, y);
    // ==========================================
    // FOOTER
    // ==========================================
    // drawaddFooterToAllPages(doc, PAGE, y);

    // ==========================================
    // SAVE PDF
    // ==========================================
    drawInvoiceBorderAllPages(doc, PAGE);
    const fileName =
        `${header?.InvoiceNo || "NA"}_${party?.name || "NA"}.pdf`;

    // console.log(
    //     "PDF generated successfully",
    //     fileName
    // );

    doc.save(fileName);
}

// ==========================================
// TERMS & TAX SECTION (CORRECTED HEIGHT)
// ==========================================
async function drawTermsAndTaxSection_ftl(doc, PAGE, FONT, company, header, totals, y, bank, totalPaymentReceived, tandcData) {

    // ==========================================
    // CONFIG
    // ==========================================
    const CONFIG = {
        headerH: 5,
        lineHeight: 1,
        paragraphGap: 0.3,

        colDescription: 23,
        colNonTax: 23,
        colTax: 23,

        bottomMargin: 34.05,
    };

    const colTerms =
        PAGE.w -
        (
            CONFIG.colDescription +
            CONFIG.colNonTax +
            CONFIG.colTax
        );

    const COL = {
        terms: colTerms,
        desc: CONFIG.colDescription,
        nonTax: CONFIG.colNonTax,
        tax: CONFIG.colTax
    };

    const X = {
        terms: PAGE.x,
        desc: PAGE.x + COL.terms,
        nonTax: PAGE.x + COL.terms + COL.desc,
        tax: PAGE.x + COL.terms + COL.desc + COL.nonTax,
        end: PAGE.x + PAGE.w
    };

    // ==========================================
    // HEIGHT CALCULATIONS (FIXED)
    // ==========================================
    const termsHeight = calculateTermsHeight_ftl(doc, tandcData, COL.terms, CONFIG);

    // Left height is purely based on the terms content + padding
    const leftHeight = termsHeight + 4;

    // Right height: 1 Header row + 5 Tax rows + 3 Summary rows = 9 rows total
    const totalRowsCount = 9;
    const rightHeight = totalRowsCount * CONFIG.headerH;

    // Table height takes the max of terms content or tax rows, ensuring a tight, clean fit
    const tableH = Math.max(leftHeight, rightHeight);

    // ==========================================
    // POSITION AT BOTTOM OF LAST PAGE
    // ==========================================
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomY = pageHeight - CONFIG.bottomMargin - tableH;

    if (bottomY > y) {
        y = bottomY;
    } else {
        doc.addPage();
        const newPageHeight = doc.internal.pageSize.getHeight();
        y = newPageHeight - CONFIG.bottomMargin - tableH;
    }

    // ==========================================
    // DRAW SECTIONS
    // ==========================================
    drawOuterTable_ftl(doc, PAGE, X, y, tableH);
    drawHeaderRow_ftl(doc, FONT, X, COL, y, CONFIG.headerH);
    drawTermsContent_ftl(doc, FONT, tandcData, X, COL, y, CONFIG);

    const taxResult = drawTaxSection_ftl(doc, FONT, totals, totalPaymentReceived, X, COL, y, CONFIG);

    return y + tableH;
}

// ==========================================
// HEIGHT OF TERMS (FIXED LINE HEIGHT & SIZING)
// ==========================================
function calculateTermsHeight_ftl(
    doc,
    tandcData,
    termsWidth,
    CONFIG
) {
    // Set proper font size for calculation
    doc.setFont("times", "normal");
    doc.setFontSize(8); // Matches FONT.body

    let height = CONFIG.headerH - 40; // Header padding offset
    const textWidth = termsWidth - 9; // Available width considering margins

    tandcData.forEach((item, i) => {
        const txt = `${i + 1}. ${item.Description || ""}`;
        const split = doc.splitTextToSize(txt, textWidth);

        // Use realistic line height (e.g., 3mm per line for font size 8)
        height += split.length * 3;

        if (i < tandcData.length - 1) {
            height += CONFIG.paragraphGap + 1; // Gap between terms
        }
    });

    return Math.max(height, 25); // Minimum fallback height
}

// ==========================================
// TABLE BORDERS
// ==========================================
function drawOuterTable_ftl(doc, PAGE, X, y, tableH) {

    doc.setLineWidth(0.1);

    doc.rect(PAGE.x, y, PAGE.w, tableH);

    doc.line(X.desc, y, X.desc, y + tableH);

    doc.line(X.nonTax, y, X.nonTax, y + tableH);

    doc.line(X.tax, y, X.tax, y + tableH);
}

// ==========================================
// HEADER ROW
// ==========================================
function drawHeaderRow_ftl(doc, FONT, X, COL, y, rowH) {

    doc.line(X.terms, y + rowH, X.end, y + rowH);


    PDF_FONT.bold(doc, FONT.body);

    drawCenteredText_ftl(doc, "Terms & Conditions", X.terms, COL.terms, y, rowH);

    drawCenteredText_ftl(doc, "", X.desc, COL.desc, y, rowH); // Empty header for Description column

    drawCenteredText_ftl(doc, "Non-Tax Amount", X.nonTax, COL.nonTax, y, rowH);

    drawCenteredText_ftl(doc, "Tax Amount", X.tax, COL.tax, y, rowH);
}

// ==========================================
// TERMS CONTENT (WITH AUTO-FITTING & BOUNDS)
// ==========================================
function drawTermsContent_ftl(
    doc,
    FONT,
    tandcData,
    X,
    COL,
    y,
    CONFIG
) {
    // Dynamic font size adjustment if content is too large
    let currentFontSize = FONT.body; // usually 8
    let lineHeight = 3; // standard line height in mm for body text

    doc.setFont("times", "normal");
    doc.setFontSize(currentFontSize);

    let currentY = y + CONFIG.headerH + 3.5;
    const leftMargin = X.terms + 3;
    const textWidth = COL.terms - 6;
    const indent = 2; // hanging indent for multi-line text

    tandcData.forEach((item, index) => {
        const prefix = `${index + 1}. `;
        const descriptionText = item.Description || "";

        // Split text to fit perfectly within the column width
        const lines = doc.splitTextToSize(descriptionText, textWidth - indent);

        // Safety check to ensure we don't draw outside the bottom of the box
        // (Optional safeguard: shrink font slightly if text is exceptionally long)
        if (lines.length > 15 && currentFontSize > 6) {
            currentFontSize = 6;
            doc.setFontSize(currentFontSize);
            lineHeight = 2.5;
        }

        // Render first line with the numbering prefix
        if (lines.length > 0) {
            doc.text(prefix + lines[0], leftMargin, currentY);
            currentY += lineHeight;
        }

        // Render remaining lines with hanging indent alignment
        for (let i = 1; i < lines.length; i++) {
            doc.text(lines[i], leftMargin + indent, currentY);
            currentY += lineHeight;
        }

        // Add a small paragraph gap between individual terms
        currentY += 1.5;
    });

    return currentY;
}

// ==========================================
// TAX SECTION
// ==========================================
function drawTaxSection_ftl(doc, FONT, totals, totalPaymentReceived, X, COL, y, CONFIG) {

    // =========================
    // VALUES
    // =========================
    const nonTaxable = safeNumber(totals?.nonTaxableAmount);
    const taxable = safeNumber(totals?.taxableAmount);
    const cgst = safeNumber(totals?.totalCGST);
    const sgst = safeNumber(totals?.totalSGST);
    const igst = safeNumber(totals?.totalIGST);
    const advance = safeNumber(totalPaymentReceived);

    // =========================
    // TOTALS
    // =========================
    const totalGST = cgst + sgst + igst;

    const grandTotal = Math.round(nonTaxable + taxable + totalGST);

    const balanceAmount = Math.round(grandTotal - advance);

    // =========================
    // TAX ROWS
    // =========================
    const rows = [
        ["Total Charges", nonTaxable, taxable],
        ["CGST 9%", 0, cgst],
        ["SGST 9%", 0, sgst],
        ["IGST 18%", 0, igst],
        ["Total GST", 0, totalGST]
    ];

    // =========================
    // DRAW TAX ROWS
    // =========================
    rows.forEach((row, i) => {

        const rowY = y + CONFIG.headerH + (i * CONFIG.headerH);

        // Row separator
        doc.line(X.desc, rowY, X.end, rowY);

        const isBold = row[0] === "Total GST";

        doc.setFont("times", isBold ? "bold" : "normal");

        doc.setFontSize(FONT.body);

        // Description
        doc.text(row[0], X.desc + 2, rowY + 3.2);

        // Non Taxable
        doc.text(
            safeAmount(row[1]).toFixed(2),
            X.nonTax +
            COL.nonTax -
            2,
            rowY + 3.2,
            {
                align: "right"
            }
        );

        // Taxable / Tax Column
        doc.text(
            safeAmount(row[2]).toFixed(2),
            X.tax +
            COL.tax -
            2,
            rowY + 3.2,
            {
                align: "right"
            }
        );
    });

    // =========================
    // SUMMARY SECTION
    // =========================
    const summaryStartY = y + CONFIG.headerH + (rows.length * CONFIG.headerH);

    // Top separator
    doc.line(X.desc, summaryStartY, X.end, summaryStartY);

    const summaryRows = [
        ["Grand Total", grandTotal],
        ["Advance Amount", advance],
        ["Balance Amount", balanceAmount]
    ];

    summaryRows.forEach((row, i) => {

        const rowY =
            summaryStartY +
            (i * CONFIG.headerH);

        const isHighlight =
            row[0] === "Grand Total" ||
            row[0] === "Balance Amount" ||
            row[0] === "Advance Amount";

        // =========================
        // BACKGROUND COLOR
        // =========================
        if (isHighlight) {
            doc.setFillColor(230, 230, 230); // Light Gray


            doc.rect(
                X.desc,
                rowY,
                X.end - X.desc,
                CONFIG.headerH,
                "F"
            );
            // Draw border
            doc.rect(
                X.desc,
                rowY,
                X.end - X.desc,
                CONFIG.headerH
            );
        }

        // Row border
        doc.line(
            X.desc,
            rowY,
            X.end,
            rowY
        );

        doc.setFont(
            "times",
            isHighlight ? "bold" : "normal"
        );

        doc.setFontSize(FONT.body);

        // Label
        doc.text(
            row[0],
            X.desc + 2,
            rowY + 3.2
        );

        // Amount
        doc.text(
            safeAmount(row[1]).toFixed(2),
            X.tax +
            COL.tax -
            2,
            rowY + 3.2,
            {
                align: "right"
            }
        );

        // Bottom border
        doc.line(
            X.desc,
            rowY + CONFIG.headerH,
            X.end,
            rowY + CONFIG.headerH
        );

    });

    // =========================
    // FINAL END POSITION
    // =========================
    const endY =
        summaryStartY +
        (summaryRows.length * CONFIG.headerH);

    return {
        grandTotal,
        totalGST,
        balanceAmount,
        endY
    };
}

// ==========================================
// COMMON CENTER TEXT
// ==========================================
function drawCenteredText_ftl(
    doc,
    text,
    x,
    width,
    y,
    height
) {

    doc.text(
        text,
        x + width / 2,
        y + height / 2,
        {
            align: "center",
            baseline: "middle"
        }
    );
}
// ==========================================
// FETCH SHIPMENT DATA
// ==========================================
async function getShipmentData_ftl_Main(invoiceNo) {

    try {

        const {
            data: lines,
            error
        } = await supabaseClient
            .from("FullLoadMovementDetailsView")
            .select("*")
            .eq("InvoiceNumber", invoiceNo)
            .order(
                "PickupDate",
                {
                    ascending: true
                }
            );

        if (error) {

            console.error("Error fetching shipment data:", error);

            return [];

        }

        return lines || [];

    }
    catch (err) {

        console.error(
            "Unexpected error:",
            err
        );

        return [];

    }

}

// Utility function to fetch shipment details
async function drawShipmentTable_ftl_Main(doc, PAGE, FONT, rows = [], y) {

    let totalFreight = 0,
        totalOther = 0,
        totalCGST = 0,
        totalSGST = 0,
        totalIGST = 0,
        totalGST = 0;

    let nonTaxableAmount = 0, taxableAmount = 0;

    const rowHeight = 5;
    const headerHeight = 6;

    // Reserve footer space
    const LAYOUT = {
        footerReserve: 83,
        rowHeight: 5
    };

    if (!rows.length) {
        console.warn("No shipment data found");
    }

    // ================= BUILD BODY =================
    let body = rows.map((row, i) => {

        totalFreight += safeNumber(row.FreightAmountSale) || 0;
        totalOther += safeNumber(row.OtherAmountSale) || 0;
        totalCGST += safeNumber(row.CGSTAmountSale);
        totalSGST += safeNumber(row.SGSTAmountSale);
        totalIGST += safeNumber(row.IGSTAmountSale);
        totalGST += safeNumber(row.TotalGSTAmountSale);
        nonTaxableAmount += safeNumber(row.NonTaxableAmountSale) || 0;
        taxableAmount += safeNumber(row.TaxableAmountSale) || 0;

        const safe = (val, fallback = "-") =>
            val !== null &&
                val !== undefined &&
                String(val).trim() !== ""
                ? val
                : fallback;

        const origin = safe(row.OriginCity, "");
        const destination = safe(row.DestinationCity, "");

        const routeDetails =
            safe(row.RouteDetails, "") ||
            `${origin} to ${destination}`;

        const deliveryDate = row.completion_date
            ? formatDate(row.completion_date)
            : null;

        const description = [
            `${safe(row.MovementType)} / ${safe(row.ModeType)} | Ref No : ${safe(row.ReferenceNo)}`,
            `Vehicle : ${safe(row.VehicleType)} | ${safe(row.VehicleNumber)}`,
            row.ContainerNumber ? `Container : ${safe(row.ContainerNumber)}` : null,
            routeDetails,
            row.Information ? `Information : ${safe(row.Information)}` : null
        ].filter(Boolean).join("\n");

        return [
            i + 1, // Sl no
            row.LRNumber || "", // Docket no
            formatDate(row.PickupDate) || "", // Pickup date
            description, // Descriptions
            row.Quantity ?? "0", // Qty
            row.ChargeableWeight ?? "0", // Weight
            safeNumber(row.FreightAmountSale).toFixed(2), // Rate Per Unit
            safeNumber(row.OtherAmountSale).toFixed(2), // Other Charges
            (row.FreightAmountSale + row.OtherAmountSale).toFixed(2) // Amount (INR)
        ];
    });

    // ================= TOTALS =================
    totalGST = round2(totalCGST + totalSGST + totalIGST);

    const grandTotal = round2(
        totalFreight + totalOther + totalGST
    );

    // ================= TABLE =================
    doc.autoTable({

        startY: y,
        margin: {
            left: PAGE.x,
            right: PAGE.x
        },
        tableWidth: PAGE.w,

        head: [[
            "Sl", "Docket no", "Date", "Descriptions", "Qty", "Weight", "Transportation Charges", "Other Charges", "Amount (INR)"
        ]],

        body,

        styles: {
            fontSize: FONT.small,
            cellPadding: 1,
            overflow: "linebreak",
            textColor: 0,
            minCellHeight: rowHeight,
            lineWidth: 0.2,
            lineColor: [0, 0, 0],
        },

        headStyles: {
            fillColor: [60, 60, 60],
            textColor: 255,
            fontStyle: "bold",
            halign: "center",
            valign: "middle",
            cellPadding: 1.5,
            lineWidth: 0.2,
            lineColor: [0, 0, 0],
        },

        didParseCell: function (data) {
            if (data.section === "body") {
                data.cell.styles.fillColor = [255, 255, 255];
                data.cell.styles.textColor = [0, 0, 0];
            }
        },

        columnStyles: {
            0: { cellWidth: 8, halign: "center", valign: "middle" }, // Sl no
            1: { cellWidth: 20, valign: "middle" }, // Docket no
            2: { cellWidth: 15, valign: "middle" }, // Date
            3: { cellWidth: 62, valign: "middle" }, // Descriptions
            4: { cellWidth: 10, halign: "right", valign: "middle" }, // Qty
            5: { cellWidth: 15, halign: "right", valign: "middle" }, // Weight
            6: { cellWidth: 20, halign: "right", valign: "middle" }, // Transportation Charges
            7: { cellWidth: 20, halign: "right", valign: "middle" }, // Other Charges
            8: { cellWidth: 20, halign: "right", valign: "middle" }  // Amount (INR)
        },

        didDrawCell: (data) => {
            if (data.section === "body") {
                data.cell.styles.lineColor = [0, 0, 0];
                data.cell.styles.lineWidth = 0.2;
            }
        }

    });

    return {
        y: doc.lastAutoTable.finalY,
        totalFreight,
        totalOther,
        totalCGST,
        totalSGST,
        totalIGST,
        totalGST,
        grandTotal,
        nonTaxableAmount,
        taxableAmount
    };
}