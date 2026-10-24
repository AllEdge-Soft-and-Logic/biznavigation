async function generate_DomesticReports_InvoicePDF(header, lines = []) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");

    const PAGE = { x: 10, w: 190, h: 297 };
    const FONT = { header: 14, title: 10, body: 8, small: 7, tiny: 6 };

    let y = 10;

    const [company, party, shipmentData, bank] = await Promise.all([
        fetchCompanyDetails(header),
        fetchPartyDetails(header),
        getDomesticShipmentData(header?.InvoiceNo),
        getInvoiceBankDetails(header?.InvoiceNo)
    ]);


    y = await drawHeader(doc, PAGE, FONT, company, y);

    y = drawTitle(doc, PAGE, FONT, y);


    y = drawPartySection(doc, PAGE, FONT, header, party, company, y);
    //Shipment section
    const shipmentResult = await drawShipmentTable(doc, PAGE, FONT, shipmentData, y);

    y = shipmentResult.y;
    //TermsAndTaxSection
    const totals = shipmentResult;

    y = await drawTermsAndTaxSection(doc, PAGE, FONT, company, header, totals, y, bank);

    y = drawAmountInWords(doc, PAGE, FONT, totals.grandTotal, y);

    addFooterToAllPages(doc, PAGE);

    doc.save(`Invoice_${header?.InvoiceNo || "NA"}.pdf`);
}

// Utility function to fetch shipment details
async function drawShipmentTable(doc, PAGE, FONT, rows = [], y) {

    let totalFreight = 0, totalFSC = 0, totalOther = 0;
    let totalTaxable = 0, totalNonTax = 0, totalGST = 0, grandTotal = 0;
    let totalTaxFreight = 0, totalTaxFsc = 0, totalTaxOther = 0;
    let totalNonTaxFreight = 0, totalNonTaxFsc = 0, totalNonTaxOther = 0;
    let totalCGST = 0, totalSGST = 0, totalIGST = 0;

    if (!rows.length) {
        console.warn("No shipment data found");
    }

    const body = rows.map((row, i) => {

        let freight = 0, fsc = 0, other = 0;
        let taxFreight = 0, taxFsc = 0, taxOther = 0;
        let nonTaxFreight = 0, nonTaxFsc = 0, nonTaxOther = 0;

        (row.DomesticBookingCharges || []).forEach(c => {

            const amount = safeNumber(c.TotalAmount);
            const gst = safeNumber(c.TotalGSTAmt);
            const isTaxable = gst > 0;

            if (isTaxable) {
                totalCGST += safeNumber(c.CGSTAmt);
                totalSGST += safeNumber(c.SGSTAmt);
                totalIGST += safeNumber(c.IGSTAmt);
            }

            if (c.ChargesType === "Freight Amount") {
                freight += amount;
                isTaxable ? taxFreight += amount : nonTaxFreight += amount;
            } else if (c.ChargesType === "Fuel Surcharge") {
                fsc += amount;
                isTaxable ? taxFsc += amount : nonTaxFsc += amount;
            } else {
                other += amount;
                isTaxable ? taxOther += amount : nonTaxOther += amount;
            }
        });

        // totals
        totalTaxFreight += taxFreight;
        totalTaxFsc += taxFsc;
        totalTaxOther += taxOther;

        totalNonTaxFreight += nonTaxFreight;
        totalNonTaxFsc += nonTaxFsc;
        totalNonTaxOther += nonTaxOther;

        totalFreight += freight;
        totalFSC += fsc;
        totalOther += other;

        return [
            i + 1,
            formatDate(row.BookingDate),
            row.DocketNo,
            row.TransitType || "",
            row.ModeType || "",
            row.OriginCity || "",
            row.DestinationCity || "",
            row.ChargeableWeight || "",
            freight.toFixed(2),
            fsc.toFixed(2),
            other.toFixed(2),
            (freight + fsc + other).toFixed(2)
        ];
    });

    // totals
    totalTaxable = totalTaxFreight + totalTaxFsc + totalTaxOther;
    totalNonTax = totalNonTaxFreight + totalNonTaxFsc + totalNonTaxOther;

    totalGST = round2(totalCGST + totalSGST + totalIGST);
    grandTotal = Math.round(round2(totalTaxable + totalNonTax + totalGST));

    doc.autoTable({
        startY: y,
        margin: { left: PAGE.x, right: PAGE.x },
        tableWidth: PAGE.w,

        head: [[
            "Sl", "Date", "Docket", "Transit", "Mode",
            "Origin", "Dest", "Wt/CBM",
            "Freight", "FSC", "Other", "Total"
        ]],

        body,

        styles: {
            fontSize: FONT.tiny,
            cellPadding: 1,
            lineWidth: 0.1,
            textColor: 0,
            minCellHeight: 4,
            lineWidth: 0.2,              // 🔥 border thickness
            lineColor: [0, 0, 0],
        },

        headStyles: {
            fillColor: [60, 60, 60],
            textColor: 255,
            fontStyle: "bold",
            halign: "center",
            cellPadding: 1.5,
            lineWidth: 0.2,              // 🔥 header border
            lineColor: [0, 0, 0]
        },

        columnStyles: {
            0: { cellWidth: 8, halign: "center" },
            1: { cellWidth: 17 },
            2: { cellWidth: 22 },
            3: { cellWidth: 15 },
            4: { cellWidth: 12 },
            5: { cellWidth: 22 },
            6: { cellWidth: 22 },
            7: { cellWidth: 14, halign: "right" },
            8: { cellWidth: 16, halign: "right" },
            9: { cellWidth: 14, halign: "right" },
            10: { cellWidth: 14, halign: "right" },
            11: { cellWidth: 14, halign: "right" }
        },
        didDrawCell: (data) => {
            if (data.section === "body") {
                data.cell.styles.lineColor = [0, 0, 0]; // 🔥 enforce borders
                data.cell.styles.lineWidth = 0.2;
            }
        }
    });

    return {
        y: doc.lastAutoTable.finalY,
        totalFreight,
        totalFSC,
        totalOther,
        totalTaxable,
        totalNonTax,
        totalTaxFreight,
        totalTaxFsc,
        totalTaxOther,
        totalNonTaxFreight,
        totalNonTaxFsc,
        totalNonTaxOther,
        totalCGST,
        totalSGST,
        totalIGST,
        totalGST,
        grandTotal
    };
}
// ================= TERMS AND TAX SECTION =================
async function drawTermsAndTaxSection(doc, PAGE, FONT, company, header, totals, y, bank) {

    const rowH = 4;        // 🔥 fixed row height (increase for spacing)
    const rows = 10;       // total rows
    const tableH = rowH * rows;

    const col4 = 28;  // Taxable (match Total column)
    const col3 = 30;  // Non-Tax (match Freight column)
    const col2 = 24;  // Label (slightly wider for text)
    const col1 = PAGE.w - (col2 + col3 + col4); // remaining space

    const x1 = PAGE.x;
    const x2 = x1 + col1;
    const x3 = x2 + col2;
    const x4 = x3 + col3;

    // Page break
    y = checkPageBreak(doc, y, tableH, PAGE);

    // Outer border (bold)
    doc.setDrawColor(0, 0, 0);     // black
    doc.setLineWidth(0.1);         // 🔥 thicker outer border
    doc.rect(PAGE.x, y, PAGE.w, tableH);

    // Inner lines (light + thin)
    doc.setDrawColor(120, 120, 120); // 🔥 soft gray (better than black)
    doc.setLineWidth(0.2);

    // Vertical lines
    [x2, x3, x4].forEach(x => {
        doc.line(x, y, x, y + tableH);
    });

    // Horizontal lines
    for (let i = 1; i < rows; i++) {
        doc.line(PAGE.x, y + i * rowH, PAGE.x + PAGE.w, y + i * rowH);
    }

    // ================= HEADER =================
    doc.setFont("helvetica", "bold").setFontSize(FONT.body);

    const headerY = y + rowH / 2;

    doc.text("Terms & Conditions", x1 + col1 / 2, headerY, {
        align: "center",
        baseline: "middle"
    });

    doc.text("Non-Tax", x3 + col3 / 2, headerY, {
        align: "center",
        baseline: "middle"
    });

    doc.text("Taxable", x4 + col4 / 2, headerY, {
        align: "center",
        baseline: "middle"
    });

    // ================= TERMS =================
    doc.setFont("helvetica", "normal").setFontSize(FONT.tiny);

    const terms = [
        `1. Please draw cheque in favour of ${company.name}`,
        "2. Payments Should be made within 7 Days from the Date of Billing",
        "3. All Complaints must be forwarded within 8 days of receipt",
        "4. Bangalore Jurisdiction"
    ];

    terms.forEach((t, i) => {

        const rowTopY = y + rowH * (i + 1);
        const textY = rowTopY + rowH / 2;

        const text = doc.splitTextToSize(t, col1 - 4);

        doc.text(text, x1 + 2, textY, {
            align: "left",
            baseline: "middle"
        });
    });

    // ================= BANK =================
    doc.setFont("helvetica", "bold").setFontSize(FONT.body);
    doc.text("Bank Details", x1 + col1 / 2, y + rowH * 6 - 2, {
        align: "center", baseline: "middle"
    });

    doc.setFont("helvetica", "normal").setFontSize(FONT.tiny);

    const bankDetails = [
        `Account Name: ${company.name}`,
        `Account No: ${bank?.AccountNo || "-"}`,
        `Bank: ${bank?.BankName || "-"} | Branch: ${bank?.BranchName || "-"}`,
        `IFSC: ${bank?.IFSCCode || "-"}`
    ];

    bankDetails.forEach((b, i) => {

        const rowTopY = y + rowH * (6 + i);
        const textY = rowTopY + rowH / 2;

        const text = doc.splitTextToSize(b, col1 - 4);

        doc.text(text, x1 + 2, textY, {
            align: "left",
            baseline: "middle"
        });
    });
    console.log("Calculated totals for tax table:", totals);
    // ================= TAX TABLE =================
    const data = [
        ["Total Freight", totals.totalNonTaxFreight, totals.totalTaxFreight],
        ["Fuel Charges", totals.totalNonTaxFsc, totals.totalTaxFsc],
        ["Other Charges", totals.totalNonTaxOther, totals.totalTaxOther],
        ["Sub Total", totals.totalNonTax, totals.totalTaxable],
        ["CGST", "", totals.totalCGST],
        ["SGST", "", totals.totalSGST],
        ["IGST", "", totals.totalIGST],
        ["Total GST", 0, totals.totalGST],
        ["GRAND TOTAL", 0, Math.round(totals.grandTotal)]
    ];

    doc.setFontSize(FONT.small);

    data.forEach((row, i) => {

        const rowTopY = y + rowH * (i + 1);
        const textY = rowTopY + rowH / 2;

        const label = row[0];
        const nonTax = row[1];
        const taxable = row[2];

        const isMerged =
            label === "Total GST" ||
            label === "GRAND TOTAL";

        const isMergedTax =
            label === "CGST" ||
            label === "SGST" ||
            label === "IGST";

        const isHighlight =
            label === "Sub Total" ||
            isMerged;

        // ================= MERGED TAX ROWS =================
        if (isMergedTax) {

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.2);
            doc.setFillColor(255, 255, 255);

            // Label column
            doc.rect(x2, rowTopY, col2, rowH, "FD");

            // 🔥 Merge Non-Tax + Taxable
            doc.rect(x3, rowTopY, col3 + col4, rowH, "FD");

            // Label
            doc.setFont("helvetica", "normal");
            doc.text(label, x2 + 2, textY, {
                baseline: "middle"
            });

            // 🔥 ONLY ONE VALUE
            doc.text(
                safeAmount(taxable).toFixed(2),
                x3 + col3 + col4 - 2,
                textY,
                { align: "right", baseline: "middle" }
            );

            return; // 🚀 IMPORTANT: stop here
        }

        // ================= HIGHLIGHT ROWS =================
        if (isHighlight) {

            doc.setFillColor(220, 230, 241);

            // Fill
            doc.rect(x2, rowTopY, col2, rowH, "F");

            if (isMerged) {
                doc.rect(x3, rowTopY, col3 + col4, rowH, "F");
            } else {
                doc.rect(x3, rowTopY, col3, rowH, "F");
                doc.rect(x4, rowTopY, col4, rowH, "F");
            }

            // Border
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.2);

            doc.rect(x2, rowTopY, col2, rowH);

            if (isMerged) {
                doc.rect(x3, rowTopY, col3 + col4, rowH);
            } else {
                doc.rect(x3, rowTopY, col3, rowH);
                doc.rect(x4, rowTopY, col4, rowH);
            }

            doc.setFont("helvetica", "bold");

        } else {

            doc.setFont("helvetica", "normal");
        }

        // ================= TEXT =================

        // Label
        doc.text(label, x2 + 2, textY, {
            baseline: "middle"
        });

        if (isMerged) {

            // 🔥 ONE VALUE (merged)
            doc.text(
                safeAmount(taxable).toFixed(2),
                x3 + col3 + col4 - 2,
                textY,
                { align: "right", baseline: "middle" }
            );

        } else {

            // Non-Tax
            doc.text(
                safeAmount(nonTax).toFixed(2),
                x3 + col3 - 2,
                textY,
                { align: "right", baseline: "middle" }
            );

            // Taxable
            doc.text(
                safeAmount(taxable).toFixed(2),
                x4 + col4 - 2,
                textY,
                { align: "right", baseline: "middle" }
            );
        }

    });

    return y + tableH;
}
// ================= AMOUNT IN WORDS =================
function drawAmountInWords(doc, PAGE, FONT, grandTotal, y) {

    const paddingX = 3;
    const paddingY = 2;

    const text = "Amount in Words: " + numberToWordsIndian(Math.round(grandTotal));

    // 🔥 Split text based on width
    const maxWidth = PAGE.w - (paddingX * 2);
    const lines = doc.splitTextToSize(text, maxWidth);

    // 🔥 Calculate dynamic height
    const lineHeight = 2;
    const boxH = (lines.length * lineHeight) + (paddingY * 2);

    // Draw box
    doc.rect(PAGE.x, y, PAGE.w, boxH);

    // Draw text (top padding)
    doc.text(lines, PAGE.x + paddingX, y + paddingY + 2);

    return y + boxH;
}
// ================= ADD FOOTER TO ALL PAGES =================
function addFooterToAllPages(doc, PAGE) {
    const totalPages = doc.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        doc.text("Powered by AllEdge to BizNavigation", PAGE.x, PAGE.h - 5);
        doc.text(`Page ${i} of ${totalPages}`, PAGE.x + PAGE.w - 20, PAGE.h - 5);
    }
}
// ================= GET DOMESTIC SHIPMENT DATA =================
async function getDomesticShipmentData(invoiceNo) {
    try {
        const { data, error } = await supabaseClient
            .from("DomesticBookingDetails")
            .select(`
                id,
                DocketNo,
                BookingDate,
                OriginCity,
                DestinationCity,
                TransitType,
                ModeType,
                ChargeableWeight,
                UOMType,
                DomesticBookingCharges (
                    ChargesType,
                    TotalAmount,
                    TaxRate,
                    SGSTAmt,
                    CGSTAmt,
                    IGSTAmt,
                    TotalGSTAmt,
                    GrandTotalAmt
                )
            `)
            .eq("InvoiceNumber", invoiceNo);

        if (error) {
            console.error("Error fetching shipment data:", error);
            return [];
        }

        return data || [];

    } catch (err) {
        console.error("Unexpected error:", err);
        return [];
    }
}