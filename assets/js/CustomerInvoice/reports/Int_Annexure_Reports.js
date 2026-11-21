// ==========================================
// GENERATE INTERNATIONAL INVOICE PDF
// ==========================================
async function generate_International_InvoicePDF_Annexure(header, lines = []) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF("p", "mm", "a4");
        const PAGE = { x: 15, w: 190, h: 297 };
        const FONT = { header: 14, title: 10, body: 8, small: 7, tiny: 6, stiny: 5 };
        let y = 9;

        const invoiceNo = header?.InvoiceNo;
        const invoiceDate = header?.InvoiceDate;
        const companyId = header?.company_id;

        // FETCH MASTER DATA (PARALLEL)
        const [company, party, tandcData, shipmentData, bank, totalsPayment] = await Promise.all([
            fetchCompanyDetails(header),
            fetchPartyDetails(header),
            getTermsAndConditions(companyId),
            getShipmentData_int_Annexure(invoiceNo),
            getInvoiceBankDetails(invoiceNo),
            advancedPaymentDetails(invoiceNo, invoiceDate)
        ]);

        const totalPaymentReceived = round2(
            safeNumber(totalsPayment?.totalPayment) +
            safeNumber(totalsPayment?.totalOtherDeduction) +
            safeNumber(totalsPayment?.totalTDS)
        );

        // SECTIONS
        y = await drawHeader(doc, PAGE, FONT, company, y);
        y = drawTitle(doc, PAGE, FONT, y);
        y = drawPartySection(doc, PAGE, FONT, header, party, company, shipmentData?.opNo || "", y);

        // Fetch dropdown list safely
        let dropdownList = [];
        try {
            dropdownList = await fetchDropdownList();
        } catch (e) {
            console.warn("Could not fetch dropdown list, proceeding with default sort:", e);
        }

        // FIXED: Extract shipments and charges from shipmentData, use current 'y', and capture shipmentResult
        const shipmentRows = shipmentData?.shipments || [];
        const allCharges = shipmentData?.charges || [];

        const shipmentResult = await drawShipmentTable_int_Annexure(
            doc,
            PAGE,
            FONT,
            shipmentRows,
            y,
            allCharges,
            Array.isArray(dropdownList) ? dropdownList : []
        );
        y = shipmentResult?.y || y;

        y = await drawTermsAndTaxSection_int_Annexure(
            doc, PAGE, FONT, company, header, shipmentResult, y, bank, totalPaymentReceived, tandcData
        );

        y = drawAmountInWords(doc, PAGE, FONT, shipmentResult?.grandTotal || 0, y);
        y = drawBankDetailsSection(doc, PAGE, FONT, company, bank, y);

        // drawaddFooterToAllPages(doc, PAGE, y);
        drawInvoiceBorderAllPages(doc, PAGE);

        // SAVE PDF
        const fileName = `${header?.InvoiceNo || "NA"}_${party?.name || "NA"}.pdf`;
        console.log("PDF generated successfully", fileName);
        doc.save(fileName);

    } catch (error) {
        console.error("Invoice PDF Generation Failed:", error?.stack || error?.message || error);

        // FIXED: Graceful fallback so missing Swal does not trigger a second crash
        if (typeof Swal !== "undefined") {
            Swal.fire({
                icon: "error",
                title: "PDF Generation Failed",
                text: error?.message || "Unable to generate invoice PDF."
            });
        } else {
            alert("PDF Generation Failed: " + (error?.message || "Unknown error"));
        }
    }
}

// ==========================================
// TERMS & TAX SECTION
// ==========================================
async function drawTermsAndTaxSection_int_Annexure(doc, PAGE, FONT, company, header, totals, y, bank, totalPaymentReceived, tandcData) {
    const CONFIG = { headerH: 5, lineHeight: 1, paragraphGap: 0.3, colDescription: 23, colNonTax: 23, colTax: 23, bankTopGap: 1, bankRowHeight: 4, bottomMargin: 35 };

    const COL = {
        terms: PAGE.w - (CONFIG.colDescription + CONFIG.colNonTax + CONFIG.colTax),
        desc: CONFIG.colDescription, nonTax: CONFIG.colNonTax, tax: CONFIG.colTax
    };

    const X = {
        terms: PAGE.x, desc: PAGE.x + COL.terms, nonTax: PAGE.x + COL.terms + COL.desc,
        tax: PAGE.x + COL.terms + COL.desc + COL.nonTax, end: PAGE.x + PAGE.w
    };

    const termsHeight = calculateTermsHeight_int_Annexure(doc, tandcData, COL.terms, CONFIG);
    const BANK_HEIGHT = 20;
    const TAX_ROWS = 8;

    const leftHeight = termsHeight + CONFIG.bankTopGap + BANK_HEIGHT + 2;
    const rightHeight = (TAX_ROWS + 1) * CONFIG.headerH;
    const tableH = Math.max(leftHeight, rightHeight);

    // PAGE BREAK LOGIC
    const pageHeight = doc.internal.pageSize.getHeight();
    const requiredY = pageHeight - CONFIG.bottomMargin - tableH;

    if (requiredY <= y) {
        doc.addPage();
        y = pageHeight - CONFIG.bottomMargin - tableH;
    } else {
        y = requiredY;
    }

    drawOuterTable_int_Annexure(doc, PAGE, X, y, tableH);
    drawHeaderRow_int_Annexure(doc, FONT, X, COL, y, CONFIG.headerH);
    drawTermsContent_int_Annexure(doc, FONT, tandcData, X, COL, y, CONFIG);
    drawTaxSection_int_Annexure(doc, FONT, totals, totalPaymentReceived, X, COL, y, CONFIG);

    return y + tableH;
}

function calculateTermsHeight_int_Annexure(doc, tandcData = [], termsWidth, CONFIG) {
    const wrapWidth = termsWidth - 10;
    let height = CONFIG.headerH + 4;

    tandcData.forEach((item, i) => {
        const lines = doc.splitTextToSize(`${i + 1}. ${item?.Description || ""}`, wrapWidth);
        height += lines.length * CONFIG.lineHeight;
        if (i < tandcData.length - 1) height += CONFIG.paragraphGap;
    });
    return height;
}

function drawOuterTable_int_Annexure(doc, PAGE, X, y, tableH) {
    const bottomY = y + tableH;
    doc.setLineWidth(0.1);
    doc.rect(PAGE.x, y, PAGE.w, tableH);
    [X.desc, X.nonTax, X.tax].forEach(colX => doc.line(colX, y, colX, bottomY));
}

function drawHeaderRow_int_Annexure(doc, FONT, X, COL, y, rowH) {
    const bottomY = y + rowH;
    doc.line(X.terms, bottomY, X.end, bottomY);
    PDF_FONT.bold(doc, FONT.body);

    const headers = [
        ["Terms & Conditions", X.terms, COL.terms], ["", X.desc, COL.desc],
        ["Non-Tax Amount", X.nonTax, COL.nonTax], ["Tax Amount", X.tax, COL.tax]
    ];

    headers.forEach(([text, x, width]) => drawCenteredText(doc, text, x, width, y, rowH));
}

function drawTermsContent_int_Annexure(doc, FONT, tandcData = [], X, COL, y, CONFIG) {
    PDF_FONT.normal(doc, FONT.body);
    const lineHeight = 3.8;
    const termGap = 1.5;
    const leftMargin = X.terms + 4;
    const indent = 2;
    const textWidth = COL.terms - 5;
    let currentY = y + CONFIG.headerH + 4;

    tandcData.forEach((item, index) => {
        const lines = doc.splitTextToSize(item?.Description || "", textWidth - indent);
        doc.text(`${index + 1}. ${lines[0] || ""}`, leftMargin, currentY);
        currentY += lineHeight;

        for (let i = 1; i < lines.length; i++) {
            doc.text(lines[i], leftMargin + indent, currentY);
            currentY += lineHeight;
        }
        currentY += termGap;
    });

    return currentY;
}

function drawTaxSection_int_Annexure(doc, FONT, totals, totalPaymentReceived, X, COL, y, CONFIG) {
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
        { label: "Total Charges", nonTax: nonTaxable, tax: taxable },
        { label: "CGST 9%", nonTax: 0, tax: cgst },
        { label: "SGST 9%", nonTax: 0, tax: sgst },
        { label: "IGST 18%", nonTax: 0, tax: igst },
        { label: "Total GST", nonTax: 0, tax: totalGST },
        { label: "Grand Total", nonTax: "", tax: grandTotal },
        { label: "Advance Amount", nonTax: "", tax: advance },
        { label: "Balance Amount", nonTax: "", tax: balanceAmount }
    ];

    const boldRows = new Set(["Total GST", "Grand Total", "Advance Amount", "Balance Amount"]);
    const highlightRows = new Set(["Grand Total", "Advance Amount", "Balance Amount"]);
    const textYOffset = 3.2;

    PDF_FONT.normal(doc, FONT.body);

    rows.forEach((row, i) => {
        const rowY = y + CONFIG.headerH + (i * CONFIG.headerH);
        const isHighlight = highlightRows.has(row.label);

        if (isHighlight) {
            doc.setFillColor(230, 230, 230);
            doc.rect(X.desc, rowY, X.end - X.desc, CONFIG.headerH, "F");
            doc.rect(X.desc, rowY, X.end - X.desc, CONFIG.headerH);
        }

        doc.line(X.desc, rowY, X.end, rowY); // Top Border
        doc.setFont("times", boldRows.has(row.label) ? "bold" : "normal");
        doc.setFontSize(FONT.body);

        doc.text(row.label, X.desc + 2, rowY + textYOffset);

        if (!isHighlight) {
            doc.text(formatAmount(row.nonTax), X.nonTax + COL.nonTax - 2, rowY + textYOffset, { align: "right" });
        }

        doc.text(formatAmount(row.tax), X.tax + COL.tax - 2, rowY + textYOffset, { align: "right" });
        doc.line(X.desc, rowY + CONFIG.headerH, X.end, rowY + CONFIG.headerH); // Bottom Border
    });

    return { totalGST, grandTotal, balanceAmount, endY: y + CONFIG.headerH + (rows.length * CONFIG.headerH) };
}

function drawCenteredText(doc, text = "", x, width, y, height) {
    doc.text(String(text), x + (width / 2), y + (height / 2), { align: "center", baseline: "middle" });
}

// ==========================================
// FETCH SHIPMENT DATA
// ==========================================
async function getShipmentData_int_Annexure(invoiceNo) {
    const EMPTY_RESULT = { invoiceDetails: null, shipments: [], charges: [], equipment: [], opNo: "" };

    try {
        const [invoiceRes, shipmentRes] = await Promise.all([
            supabaseClient.from("InvoiceDetails").select("*").eq("InvoiceNo", invoiceNo).maybeSingle(),
            supabaseClient.from("InternationalBookingView").select("*").eq("InvoiceNumber", invoiceNo).order("BookedDate", { ascending: true })
        ]);

        if (invoiceRes.error) console.error("Invoice fetch error:", invoiceRes.error);
        if (shipmentRes.error) console.error("Shipment fetch error:", shipmentRes.error);

        const invoiceDetails = invoiceRes.data || null;
        const shipments = Array.isArray(shipmentRes.data) ? shipmentRes.data : [];

        if (!shipments.length) return { ...EMPTY_RESULT, invoiceDetails };

        const opNo = [...new Set(shipments.map(row => row.PONo).filter(Boolean))].join(', ');
        const shipmentIds = shipments.map(row => row.ID_IB || row.id || row.ShipmentID).filter(Boolean);

        if (!shipmentIds.length) {
            return { invoiceDetails, shipments, charges: [], equipment: [], opNo };
        }

        const [chargesRes, equipmentRes] = await Promise.all([
            supabaseClient.from("InternationalBookingCharges").select("*").in("ID_IB", shipmentIds).order("id", { ascending: false }),
            supabaseClient.from("InternationalBookingEquipment").select("*").in("ID_IB", shipmentIds)
        ]);

        return {
            invoiceDetails,
            shipments,
            charges: Array.isArray(chargesRes.data) ? chargesRes.data : [],
            equipment: Array.isArray(equipmentRes.data) ? equipmentRes.data : [],
            opNo
        };
    } catch (error) {
        console.error("getShipmentData_int_Annexure error:", error);
        return EMPTY_RESULT;
    }
}

// ==========================================
// SHIPMENT TABLE
// ==========================================
async function drawShipmentTable_int_Annexure(
    doc,
    PAGE,
    FONT,
    rows = [],
    startY,
    allCharges = [],
    dropdownList = [] // <-- Pass dropdown_list table records here
) {
    let freightAmount = 0, fuelSurcharge = 0, otherAmount = 0;
    let totalCGST = 0, totalSGST = 0, totalIGST = 0, totalGST = 0;
    let taxableAmount = 0, nonTaxableAmount = 0;

    const safe = (val, fallback = "-") => (val != null && String(val).trim() !== "") ? val : fallback;

    // 1. Build dynamic charge order map
    const chargeOrder = {
        "Freight Amount": 1,
        "Fuel Surcharge": 3
    };

    // Populate order 2 for descriptions where condition contains 'fsc'
    dropdownList.forEach(item => {
        if (item.condition && String(item.condition).toLowerCase().includes("fsc")) {
            if (item.description !== "Freight Amount") {
                chargeOrder[item.description] = 2;
            }
        }
    });

    const getSortPriority = (chargeType) => chargeOrder[chargeType] ?? 999;

    const sharedStyle = { halign: "right", font: "times", textColor: [0, 0, 0], valign: "middle", minCellHeight: 1, cellPadding: 1 };
    const subtotalStyle = { halign: "right", fontStyle: "bold", fillColor: [128, 128, 128], textColor: [255, 255, 255], valign: "middle", minCellHeight: 2, cellPadding: { top: 1, bottom: 1, left: 2, right: 1 } };

    // Group charges & tally GST simultaneously
    const chargesMap = allCharges.reduce((acc, charge) => {
        const key = charge.ID_IB;
        if (key) {
            (acc[key] ??= []).push(charge);
            totalCGST += safeNumber(charge.CGSTAmt);
            totalSGST += safeNumber(charge.SGSTAmt);
            totalIGST += safeNumber(charge.IGSTAmt);
            totalGST += safeNumber(charge.TotalGSTAmt);
        }
        return acc;
    }, {});

    // 2. Sort charges by priority (1 -> 2 -> 3 -> 999)
    Object.values(chargesMap).forEach(group => {
        group.sort((a, b) => getSortPriority(a.ChargesType) - getSortPriority(b.ChargesType));
    });

    const body = [];

    rows.forEach((row, i) => {
        const shipmentKey = row.ID_IB || row.id || row.BookingID;
        const transitType = [row.MovementType, row.ModeType].filter(Boolean).join("\n");

        freightAmount += safeNumber(row.FreightAmount);
        fuelSurcharge += safeNumber(row.FuelSurcharge);
        otherAmount += safeNumber(row.OtherAmount);
        taxableAmount += safeNumber(row.TaxableAmount);
        nonTaxableAmount += safeNumber(row.NonTaxableAmount);

        body.push([
            i + 1, formatDate(row.BookedDate) || "", row.DocketNo || "", transitType, safe(row.ClearanceMode),
            safe(row.Origin), safe(row.Destination), row.Consignee || "", String(Number(row.NoofUnit || 0)).padStart(2, '0'),
            `${safeNumber(row.ChargableWeight)} ${row.UOMType || ""}`
        ]);

        const charges = chargesMap[shipmentKey] || [];
        let shipmentTotal = 0;

        charges.forEach(charge => {
            const amount = safeNumber(charge.TotalAmount);
            shipmentTotal += amount;
            body.push([
                { content: charge.ChargesType || "", colSpan: 8, styles: sharedStyle },
                { content: formatAmount(amount), colSpan: 2, styles: sharedStyle }
            ]);
        });

        if (shipmentTotal > 0) {
            body.push([
                { content: "Sub Total", colSpan: 8, styles: subtotalStyle },
                { content: formatAmount(shipmentTotal), colSpan: 2, styles: subtotalStyle }
            ]);
        }
    });

    const grandTotal = Math.round(taxableAmount + nonTaxableAmount + totalGST);

    doc.autoTable({
        startY,
        margin: { left: PAGE.x, right: PAGE.x },
        tableWidth: PAGE.w,
        head: [["Sl", "Date", "AWB No", "Transit", "Mode", "Origin", "Dest.", "Consignee / Consignor", "Qty", "Weight"]],
        body,
        theme: "grid",
        styles: { fontSize: FONT.body - 1, font: "times", fillColor: [255, 255, 255], cellPadding: 1.5, textColor: 0, lineWidth: 0.2, lineColor: [0, 0, 0], valign: "middle" },
        headStyles: { font: "times", fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold", halign: "center", valign: "middle" },
        columnStyles: {
            0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: 17 }, 2: { cellWidth: 20 }, 3: { cellWidth: 20 },
            4: { cellWidth: 20 }, 5: { cellWidth: 20 }, 6: { cellWidth: 20 }, 7: { cellWidth: 35 },
            8: { cellWidth: 15, halign: "right" }, 9: { cellWidth: 15, halign: "right" }
        }
    });

    return {
        y: doc.lastAutoTable.finalY,
        freightAmount, fuelSurcharge, otherAmount, totalCGST, totalSGST,
        totalIGST, totalGST, taxableAmount, nonTaxableAmount, grandTotal
    };
}