// Clear_Main_Reports.js
// ==========================================
// GENERATE CLEARANCE INVOICE PDF
// ==========================================
async function generate_Clear_InvoicePDF_Main(
    header,
    lines = [],
    reportType = null        // ← NEW: accept report type from caller
) {

    try {

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF("p", "mm", "a4");

        const { PAGE, FONT } =
            PDF_CONFIG;

        let y = 9;

        // ==========================================
        // RESOLVE EFFECTIVE REPORT TYPE
        // Priority: explicit arg → DOM select → "Main"
        // ==========================================
        const effectiveReportType =
            reportType ||
            document.getElementById("reportType")?.value ||
            "Main";

        const isDutyInvoice =
            String(effectiveReportType).trim().toLowerCase() === "duty invoice";

        // ==========================================
        // FETCH DATA (PARALLEL)
        // ==========================================
        const [
            company,
            party,
            tandcData,
            shipmentData,
            bank,
            totalsPayment
        ] = await Promise.all([

            fetchCompanyDetails(header),

            fetchPartyDetails(header),

            getTermsAndConditions(
                header?.company_id
            ),

            getShipmentData_Clear_Main(
                header?.InvoiceNo
            ),

            getInvoiceBankDetails(
                header?.InvoiceNo
            ),

            advancedPaymentDetails(
                header?.InvoiceNo,
                header?.InvoiceDate
            )
        ]);

        // ==========================================
        // PAYMENT RECEIVED
        // ==========================================
        const totalPaymentReceived =
            round2(safeNumber(totalsPayment?.totalPayment) +
                safeNumber(totalsPayment?.totalOtherDeduction) +
                safeNumber(totalsPayment?.totalTDS)
            );

        // ==========================================
        // HEADER
        // ==========================================
        y = await drawHeader(doc, PAGE, FONT, company, y);

        // ==========================================
        // TITLE  →  DUTY INVOICE  or  TAX INVOICE
        // ==========================================
        y = isDutyInvoice
            ? drawTitle_Duty_Invoice(doc, PAGE, FONT, y)
            : drawTitle(doc, PAGE, FONT, y);

        // ==========================================
        // PARTY DETAILS
        // ==========================================
        y = drawPartySection_Clearance(
            doc,
            PAGE,
            FONT,
            header,
            party,
            company,
            shipmentData?.shipments || [],
            y
        );

        // ==========================================
        // SHIPMENT TABLE
        // ==========================================
        const shipmentResult =
            await drawShipmentTable_Clear_Main(
                doc,
                PAGE,
                FONT,
                shipmentData?.shipments || [],
                y,
                shipmentData?.charges || []
            );

        y = shipmentResult.y;

        // ==========================================
        // TERMS + TAX
        // ==========================================
        y =
            await drawTermsAndTaxSection_Clear_Main(
                doc,
                PAGE,
                FONT,
                company,
                header,
                shipmentResult,
                y,
                bank,
                totalPaymentReceived,
                tandcData || []
            );

        // ==========================================
        // AMOUNT IN WORDS
        // ==========================================
        y = drawAmountInWords(
            doc,
            PAGE,
            FONT,
            shipmentResult.grandTotal,
            y
        );

        // ==========================================
        // BANK DETAILS
        // ==========================================
        y = drawBankDetailsSection(
            doc,
            PAGE,
            FONT,
            company,
            bank,
            y
        );

        // ==========================================
        // GLOBAL ITEMS
        // ==========================================
        drawaddFooterToAllPages(
            doc,
            PAGE
        );

        drawInvoiceBorderAllPages(doc, PAGE, "Customs Clearance");

        // ==========================================
        // SAVE
        // ==========================================
        const fileName =
            `${header?.InvoiceNo || "NA"}_${party?.name || "NA"}.pdf`;

        console.log(
            "PDF generated successfully",
            fileName
        );

        doc.save(fileName);

    } catch (error) {

        console.error(
            "Invoice PDF generation failed:",
            error
        );

        throw error;
    }
}

// ==========================================
// TERMS & TAX SECTION
// ==========================================
function drawTermsAndTaxSection_Clear_Main(
    doc,
    PAGE,
    FONT,
    company,
    header,
    totals,
    y,
    bank,
    totalPaymentReceived,
    tandcData = []
) {

    const CONFIG = {
        headerH: 4,
        lineHeight: 3.545,
        paragraphGap: 1,

        colDescription: 23,
        colNonTax: 23,
        colTax: 23,

        bottomMargin: 35
    };

    // ==========================================
    // COLUMN WIDTHS
    // ==========================================
    const COL = {
        terms:
            PAGE.w -
            CONFIG.colDescription -
            CONFIG.colNonTax -
            CONFIG.colTax,

        desc: CONFIG.colDescription,
        nonTax: CONFIG.colNonTax,
        tax: CONFIG.colTax
    };

    // ==========================================
    // X POSITIONS
    // ==========================================
    const X = {
        terms: PAGE.x,

        desc:
            PAGE.x +
            COL.terms,

        nonTax:
            PAGE.x +
            COL.terms +
            COL.desc,

        tax:
            PAGE.x +
            COL.terms +
            COL.desc +
            COL.nonTax,

        end:
            PAGE.x +
            PAGE.w
    };

    // ==========================================
    // TERMS HEIGHT
    // ==========================================
    const termsHeight =
        calculateTermsHeight_Clear_Main(
            doc,
            tandcData,
            COL.terms,
            CONFIG
        );

    // ==========================================
    // LEFT HEIGHT
    // ==========================================
    const leftHeight =
        termsHeight + 2;

    // ==========================================
    // TAX TABLE HEIGHT
    // ==========================================
    const taxRows = 8;

    const rightHeight =
        (taxRows + 1) *
        CONFIG.headerH;



    // Reduce by 1px to avoid extra bottom space
    const adjustedRightHeight =
        rightHeight - 1;

    // ==========================================
    // FINAL TABLE HEIGHT
    // ==========================================
    const rowHeight = 6;

    const taxHeight =
        CONFIG.headerH +
        (
            8 * rowHeight
        );

    const tableH =
        Math.max(
            leftHeight,
            taxHeight
        );

    // ==========================================
    // PAGE CHECK
    // ==========================================
    const pageHeight =
        doc.internal.pageSize.getHeight();

    const targetY =
        pageHeight -
        CONFIG.bottomMargin -
        tableH;

    if (targetY <= y) {

        doc.addPage();

        y =
            doc.internal.pageSize.getHeight() -
            CONFIG.bottomMargin -
            tableH;
    }
    else {

        y = targetY;
    }

    // ==========================================
    // DRAW TABLE
    // ==========================================
    drawOuterTable_Clear_Main(
        doc,
        PAGE,
        X,
        y,
        leftHeight,
        taxHeight,
        COL,
        CONFIG
    );

    drawHeaderRow_Clear_Main(
        doc,
        FONT,
        X,
        COL,
        y,
        CONFIG.headerH
    );

    drawTermsContent_Clear_Main(
        doc,
        FONT,
        tandcData,
        X,
        COL,
        y,
        CONFIG
    );

    drawTaxSection_Clear_Main(
        doc,
        FONT,
        totals,
        totalPaymentReceived,
        X,
        COL,
        y,
        CONFIG
    );

    return y + tableH;
}

// ==========================================
// CALCULATE TERMS HEIGHT
// ==========================================
function calculateTermsHeight_Clear_Main(
    doc,
    tandcData = [],
    termsWidth,
    CONFIG
) {

    const textWidth =
        termsWidth - 6;

    let totalHeight =
        CONFIG.headerH + 2;

    tandcData.forEach((item, index) => {

        const text =
            `${index + 1}. ${item?.TermsCondition || item?.Description || ""}`;

        const lines =
            doc.splitTextToSize(
                text,
                textWidth
            );

        totalHeight +=
            (lines.length * CONFIG.lineHeight) +
            CONFIG.paragraphGap;
    });

    return totalHeight;
}
// ==========================================
// DRAW TERMS CONTENT
// ==========================================
function drawTermsContent_Clear_Main(
    doc,
    FONT,
    tandcData,
    X,
    COL,
    y,
    CONFIG
) {

    const startX =
        X.terms + 2;

    const textWidth =
        COL.terms - 4;

    let currentY =
        y +
        CONFIG.headerH +
        3;

    doc.setFont("times", "normal");
    doc.setFontSize(FONT.body);

    tandcData.forEach((item, index) => {

        const text =
            `${index + 1}. ${item?.TermsCondition || item?.Description || ""}`;

        const lines =
            doc.splitTextToSize(
                text,
                textWidth
            );

        doc.text(
            lines,
            startX,
            currentY
        );

        currentY +=
            (lines.length * CONFIG.lineHeight) +
            CONFIG.paragraphGap;
    });

    return currentY;
}

// ==========================================
// OUTER TABLE
// ==========================================
function drawOuterTable_Clear_Main(
    doc,
    PAGE,
    X,
    y,
    leftHeight,
    taxHeight,
    COL,
    CONFIG
) {

    // ==========================================
    // LEFT BOX (TERMS)
    // ==========================================
    doc.rect(
        PAGE.x,
        y,
        COL.terms,
        leftHeight
    );

    // ==========================================
    // RIGHT BOX (TAX)
    // ==========================================
    doc.rect(
        X.desc,
        y,
        (
            COL.desc +
            COL.nonTax +
            COL.tax
        ),
        taxHeight
    );

    // ==========================================
    // LEFT HEADER LINE
    // ==========================================
    doc.line(
        PAGE.x,
        y + CONFIG.headerH,
        PAGE.x + COL.terms,
        y + CONFIG.headerH
    );

    // ==========================================
    // RIGHT HEADER LINE
    // ==========================================
    doc.line(
        X.desc,
        y + CONFIG.headerH,
        X.end,
        y + CONFIG.headerH
    );

    // ==========================================
    // COLUMN SEPARATORS
    // ==========================================
    doc.line(
        X.nonTax,
        y,
        X.nonTax,
        y + taxHeight - 18
    );

    doc.line(
        X.tax,
        y,
        X.tax,
        y + taxHeight - 18
    );
}
// ==========================================
// HEADER ROW
// ==========================================
function drawHeaderRow_Clear_Main(
    doc,
    FONT,
    X,
    COL,
    y,
    rowH
) {

    const bottomY = y + rowH;

    doc.line(
        X.terms,
        bottomY,
        X.end,
        bottomY
    );

    PDF_FONT.bold(doc, FONT.body);

    drawCenteredText(
        doc,
        "Terms & Conditions",
        X.terms,
        COL.terms,
        y,
        rowH
    );

    drawCenteredText(
        doc,
        "Non-Tax Amount",
        X.nonTax,
        COL.nonTax,
        y,
        rowH
    );

    drawCenteredText(
        doc,
        "Tax Amount",
        X.tax,
        COL.tax,
        y,
        rowH
    );
}

// ==========================================
// TAX SECTION
// ==========================================
function drawTaxSection_Clear_Main(
    doc,
    FONT,
    totals,
    totalPaymentReceived,
    X,
    COL,
    y,
    CONFIG
) {

    const advance =
        safeNumber(totalPaymentReceived);

    const rowHeight = 6;

    const rows = [
        {
            label: "Total Charges",
            nonTax: totals.nonTaxableAmount,
            tax: totals.taxableAmount
        },
        {
            label: "CGST 9%",
            nonTax: 0,
            tax: totals.totalCGST
        },
        {
            label: "SGST 9%",
            nonTax: 0,
            tax: totals.totalSGST
        },
        {
            label: "IGST 18%",
            nonTax: 0,
            tax: totals.totalIGST
        },
        {
            label: "Total GST",
            nonTax: 0,
            tax: totals.totalGST,
            bold: true
        },
        {
            label: "Grand Total",
            tax: totals.grandTotal,
            merged: true,
            bold: true
        },
        {
            label: "Advance Amount",
            tax: advance,
            merged: true,
            bold: true
        },
        {
            label: "Balance Amount",
            tax: round2(
                totals.grandTotal - advance
            ),
            merged: true,
            bold: true
        }
    ];

    const textOffset = rowHeight * 0.68;

    for (
        let i = 0;
        i < rows.length;
        i++
    ) {

        const row = rows[i];

        const rowTopY =
            y +
            CONFIG.headerH +
            (i * rowHeight);

        const rowBottomY =
            rowTopY +
            rowHeight;

        // ==========================================
        // FONT STYLE
        // ==========================================
        if (row.bold) {

            PDF_FONT.bold(
                doc,
                FONT.body
            );

        } else {

            PDF_FONT.normal(
                doc,
                FONT.body
            );
        }

        // ==========================================
        // MERGED ROWS WITH BACKGROUND
        // ==========================================
        if (row.merged) {

            let fillColor = [240, 240, 240];

            if (row.label === "Grand Total") {
                fillColor = [220, 220, 220];
            }

            if (row.label === "Balance Amount") {
                fillColor = [210, 210, 210];
            }

            // Background
            doc.setFillColor(
                fillColor[0],
                fillColor[1],
                fillColor[2]
            );

            doc.rect(
                X.desc,
                rowTopY,
                X.end - X.desc,
                rowHeight,
                "F"
            );

            // Border around merged row
            doc.rect(
                X.desc,
                rowTopY,
                X.end - X.desc,
                rowHeight
            );

            PDF_FONT.bold(
                doc,
                FONT.body
            );

            doc.text(
                row.label,
                X.desc + 2,
                rowTopY + textOffset
            );

            doc.text(
                formatAmount(row.tax),
                X.tax + COL.tax - 2,
                rowTopY + textOffset,
                {
                    align: "right"
                }
            );
        } else {

            // ==========================================
            // LABEL
            // ==========================================
            doc.text(
                row.label,
                X.desc + 2,
                rowTopY + textOffset
            );

            // ==========================================
            // NON TAX
            // ==========================================
            doc.text(
                formatAmount(
                    row.nonTax || 0
                ),
                X.nonTax +
                COL.nonTax -
                2,
                rowTopY + textOffset,
                {
                    align: "right"
                }
            );

            // ==========================================
            // TAX
            // ==========================================
            doc.text(
                formatAmount(
                    row.tax || 0
                ),
                X.tax +
                COL.tax -
                2,
                rowTopY + textOffset,
                {
                    align: "right"
                }
            );
        }

        // ==========================================
        // ROW BORDER
        // ==========================================
        doc.line(
            X.desc,
            rowBottomY,
            X.end,
            rowBottomY
        );
    }

    // ==========================================
    // RETURN
    // ==========================================
    return {
        height:
            CONFIG.headerH +
            (rows.length * rowHeight),

        rowCount:
            rows.length
    };
}
// ==========================================
// FETCH SHIPMENT DATA
// ==========================================
async function getShipmentData_Clear_Main(invoiceNo) {

    try {

        // =========================
        // INVOICE DETAILS
        // =========================
        const { data: invoiceDetails, error: invError } = await supabaseClient
            .from("InvoiceDetails")
            .select("*")
            .eq("InvoiceNo", invoiceNo)
            .maybeSingle();

        if (invError) {
            console.error("Invoice fetch error:", invError);
        }

        // =========================
        // SHIPMENTS
        // =========================
        const { data: shipments, error: shipError } = await supabaseClient
            .from("CustomsClearanceView")
            .select("*")
            .eq("InvoiceNo", invoiceNo)
            .order("JobDate", { ascending: true });

        if (shipError) {
            console.error("Shipment fetch error:", shipError);
        }

        const safeShipments = Array.isArray(shipments) ? shipments : [];

        if (!safeShipments.length) {
            return {
                invoiceDetails: invoiceDetails || null,
                shipments: [],
                charges: [],
                equipment: [],
                paymentDetails: {
                    totalPayment: 0,
                    totalOtherDeduction: 0,
                    totalTDS: 0
                }
            };
        }

        // =========================
        // SAFE SHIPMENT IDS (FIXED)
        // =========================
        const shipmentIds = safeShipments
            .map(x => x.ID_CC || x.id || x.ShipmentID)
            .filter(Boolean);

        // =========================
        // CHARGES + EQUIPMENT PARALLEL FETCH
        // =========================
        const [chargesRes, equipmentRes] = await Promise.all([
            supabaseClient
                .from("CustomsClearanceCharges")
                .select("*")
                .in("ID_CC", shipmentIds)
                .order("id", { ascending: false }),

            supabaseClient
                .from("CustomsClearanceEquipment")
                .select("*")
                .in("ID_CC", shipmentIds)
        ]);

        const charges = Array.isArray(chargesRes.data) ? chargesRes.data : [];
        const equipment = Array.isArray(equipmentRes.data) ? equipmentRes.data : [];

        if (chargesRes.error) {
            console.error("Charges fetch error:", chargesRes.error);
        }

        if (equipmentRes.error) {
            console.error("Equipment fetch error:", equipmentRes.error);
        }

        // =========================
        // PAYMENT DETAILS
        // =========================
        let paymentDetails = {
            totalPayment: 0,
            totalOtherDeduction: 0,
            totalTDS: 0
        };

        try {
            paymentDetails = await advancedPaymentDetails(
                invoiceNo,
                invoiceDetails?.InvoiceDate
            ) || paymentDetails;
        } catch (err) {
            console.error("Payment fetch error:", err);
        }

        // =========================
        // FINAL RESPONSE
        // =========================
        return {
            invoiceDetails: invoiceDetails || null,
            shipments: safeShipments,
            charges,
            equipment,
            paymentDetails
        };

    } catch (err) {

        console.error("Unexpected error in getShipmentData_int_Annexure:", err);

        return {
            invoiceDetails: null,
            shipments: [],
            charges: [],
            equipment: [],
            paymentDetails: {
                totalPayment: 0,
                totalOtherDeduction: 0,
                totalTDS: 0
            }
        };
    }
}

// ==========================================
// CLEARANCE CHARGES TABLE
// ==========================================
async function drawShipmentTable_Clear_Main(
    doc,
    PAGE,
    FONT,
    rows = [],
    startY,
    allCharges = [],
    reportType
) {

    allCharges = Array.isArray(allCharges)
        ? allCharges
        : [];

    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;
    let totalGST = 0;

    let taxableAmount = 0;
    let nonTaxableAmount = 0;

    const body = [];

    // ==========================================
    // SORT CHARGES
    // Duty / Import Duty first
    // ==========================================
    allCharges.sort((a, b) => {
        console.log('loading duty invoice')
        function getPriority(chargeType = "") {
            const txt = String(chargeType).trim().toLowerCase();

            // 1. Highest priority: Import Duty
            if (txt.includes("import duty")) return 1;

            // 2. Next: Other Custom Duties
            if (txt.includes("custom duty") || txt.includes("customs duty")) return 2;

            // 3. Next: Any other duty
            if (txt.includes("duty")) return 3;

            // 4. Next: Customs Clearance charges
            if (txt.includes("customs clearance") || txt.includes("custom clearance")) return 4;

            // 5. Default priority for everything else (like Handling Charges)
            return 999;
        }

        const p1 = getPriority(a.ChargesType);
        const p2 = getPriority(b.ChargesType);

        if (p1 !== p2) return p1 - p2;

        // Keep remaining charges alphabetically sorted (e.g., Handling comes before Transportation)
        return (a.ChargesType || "").localeCompare(b.ChargesType || "");
    });
    // ==========================================
    // CHARGE ROWS
    // ==========================================
    allCharges.forEach((c, index) => {

        const amount = safeNumber(c.TotalAmount || 0);
        const gst = safeNumber(c.TotalGSTAmt || 0);

        let taxable = 0;
        let nonTaxable = 0;

        if (gst > 0) {
            taxable = amount;
        } else {
            nonTaxable = amount;
        }

        taxableAmount += taxable;
        nonTaxableAmount += nonTaxable;

        totalCGST += safeNumber(c.CGSTAmt || 0);
        totalSGST += safeNumber(c.SGSTAmt || 0);
        totalIGST += safeNumber(c.IGSTAmt || 0);
        totalGST += gst;

        body.push([
            index + 1,
            c.ChargesType || "",
            c.HSNCode || "",
            nonTaxable ? formatAmount(nonTaxable) : formatAmount(0),
            taxable ? formatAmount(taxable) : formatAmount(0)
        ]);
    });

    // ==========================================
    // TOTAL ROW
    // ==========================================
    body.push([
        {
            content: "",
            styles: {
                fillColor: [240, 240, 240]
            }
        },
        {
            content: "Total",
            styles: {
                fontStyle: "bold",
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0]
            }
        },
        {
            content: "",
            styles: {
                fillColor: [240, 240, 240]
            }
        },
        {
            content: formatAmount(nonTaxableAmount),
            styles: {
                halign: "right",
                fontStyle: "bold",
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0]
            }
        },
        {
            content: formatAmount(taxableAmount),
            styles: {
                halign: "right",
                fontStyle: "bold",
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0]
            }
        }
    ]);

    // ==========================================
    // GRAND TOTAL
    // ==========================================
    const grandTotal = Math.round(
        taxableAmount +
        nonTaxableAmount +
        totalGST
    );

    // ==========================================
    // TABLE
    // ==========================================
    doc.autoTable({

        startY,

        margin: {
            left: PAGE.x,
            right: PAGE.x
        },

        tableWidth: PAGE.w,

        head: [[
            "Sl No",
            "Particulars",
            "SAC Code",
            "Non Taxable Amount",
            "Taxable Amount"
        ]],

        body,

        styles: {
            fontSize: FONT.body,
            cellPadding: 1.5,
            textColor: [0, 0, 0],
            lineWidth: 0.2,
            lineColor: [0, 0, 0]
        },

        headStyles: {
            fillColor: [60, 60, 60],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            halign: "center",
            valign: "middle"
        },

        columnStyles: {

            // Sl No
            0: { cellWidth: 12, halign: "center" },

            // Particulars
            1: { cellWidth: 90 },

            // SAC Code
            2: { cellWidth: 28, halign: "center" },

            // Non Taxable
            3: { cellWidth: 30, halign: "right" },

            // Taxable
            4: { cellWidth: 40, halign: "right" }
        },

        didParseCell(data) {

            if (data.section === "body") {

                if (!data.cell.styles.fillColor) {
                    data.cell.styles.fillColor = [255, 255, 255];
                }

                data.cell.styles.textColor = [0, 0, 0];
            }
        }
    });

    return {

        y: doc.lastAutoTable.finalY,

        freightAmount: 0,
        fuelSurcharge: 0,
        otherAmount: 0,

        totalCGST,
        totalSGST,
        totalIGST,
        totalGST,

        taxableAmount,
        nonTaxableAmount,

        grandTotal
    };
}

// ==========================================
// DRAW PARTY DETAILS SECTION - CLEARANCE
// ==========================================
function drawPartySection_Clearance(
    doc,
    PAGE,
    FONT,
    header,
    party,
    company,
    shipments = [],
    y
) {

    const LEFT_WIDTH = PAGE.w * 0.60;
    const PADDING = 3;
    const LINE_H = 3.5;
    const SECTION_GAP = 2; // mm

    // ==========================================
    // HELPERS
    // ==========================================
    const safe = (v, fallback = "-") =>
        v?.toString()?.trim() || fallback;

    const drawText = (
        text,
        x,
        y,
        bold = false,
        size = FONT.title
    ) => {

        doc.setFont(
            "times",
            bold ? "bold" : "normal"
        );

        doc.setFontSize(size);

        doc.text(text, x, y);
    };

    const drawLines = (
        lines,
        x,
        y,
        fontFn
    ) => {

        fontFn();

        doc.text(
            lines,
            x,
            y
        );

        return (
            y +
            (lines.length * LINE_H)
        );
    };

    // ==========================================
    // SHIPMENT DATA
    // ==========================================
    const firstShipment =
        shipments?.[0] || {};

    const mawb =
        firstShipment?.BLAWBNo
            ? `${safe(firstShipment.BLAWBNo)} / ${formatDate(firstShipment.BLAWBDate)}`
            : "-";

    const beNo =
        firstShipment?.BENo
            ? `${safe(firstShipment.BENo)} / ${formatDate(firstShipment.BEDate)}`
            : "-";

    const weight =
        `${safeNumber(firstShipment?.CargoWeight)} Kgs / ${safe(firstShipment?.Quantity)} Pcs`;

    const poNo =
        safe(firstShipment?.PONo, "") ||
        safe(header?.PONo, "") ||
        "-";

    // ==========================================
    // LEFT SIDE DATA
    // ==========================================
    const leftTextWidth =
        LEFT_WIDTH - (PADDING * 2);

    const partyNameLines =
        doc.splitTextToSize(
            `M/s ${safe(party?.name, "")}`,
            leftTextWidth
        );

    const partyAddrLines =
        doc.splitTextToSize(
            safe(party?.address, ""),
            leftTextWidth
        );

    const gstNoLines =
        doc.splitTextToSize(
            `GST No: ${safe(party?.gst, "")}`,
            leftTextWidth
        );

    // ==========================================
    // RIGHT SIDE DATA
    // ==========================================
    const rightData = [
        {
            label: "Invoice No.",
            value: safe(
                header?.InvoiceNo
            ),
            bold: true
        },
        {
            label: "Invoice Date",
            value:
                formatDate(
                    header?.InvoiceDate
                ) || "-",
            bold: true
        },
        {
            label: "MAWB / Dt.",
            value: mawb
        },
        {
            label: "BE No. / Dt.",
            value: beNo
        },
        {
            label: "Wt. / Qty.",
            value: weight
        },
        {
            label: "P.O No.",
            value: poNo
        }
    ];

    // ==========================================
    // HEIGHT CALCULATION
    // ==========================================
    const leftHeight =
        (
            partyNameLines.length +
            partyAddrLines.length +
            gstNoLines.length
        ) * LINE_H;

    const rightHeight =
        rightData.length * LINE_H;

    const rowHeight =
        Math.max(
            leftHeight,
            rightHeight
        ) +
        (PADDING * 2);

    // ==========================================
    // OUTER BORDER
    // ==========================================
    doc.rect(
        PAGE.x,
        y,
        PAGE.w,
        rowHeight
    );

    // Divider
    doc.line(
        PAGE.x + LEFT_WIDTH,
        y,
        PAGE.x + LEFT_WIDTH,
        y + rowHeight
    );

    // ==========================================
    // LEFT SECTION
    // ==========================================
    const leftX =
        PAGE.x + PADDING;

    let leftY =
        y + PADDING + 1;

    leftY = drawLines(
        partyNameLines,
        leftX,
        leftY,
        () =>
            PDF_FONT.bold(
                doc,
                FONT.header - 2
            )
    );

    leftY = drawLines(
        partyAddrLines,
        leftX,
        leftY,
        () =>
            PDF_FONT.normal(
                doc,
                FONT.title - 1
            )
    );

    leftY += 1;

    drawLines(
        gstNoLines,
        leftX,
        leftY,
        () =>
            PDF_FONT.bold(
                doc,
                FONT.title - 1
            )
    );

    // ==========================================
    // RIGHT SECTION
    // ==========================================
    let rightY =
        y + PADDING + 1;

    const labelX =
        PAGE.x +
        LEFT_WIDTH +
        PADDING;

    const colonX =
        labelX + 25;

    const valueX =
        colonX + 3;

    rightData.forEach(row => {

        drawText(
            row.label,
            labelX,
            rightY,
            row.bold
        );

        drawText(
            ":",
            colonX,
            rightY,
            row.bold
        );

        drawText(
            row.value,
            valueX,
            rightY,
            row.bold
        );

        // Divider below Invoice Date
        if (row.label === "Invoice Date") {

            const lineY =
                rightY +
                (LINE_H * 0.50);

            doc.line(
                PAGE.x + LEFT_WIDTH,
                lineY,
                PAGE.x + PAGE.w,
                lineY
            );

            rightY += SECTION_GAP;
        }

        rightY += LINE_H;
    });

    return y + rowHeight;
}