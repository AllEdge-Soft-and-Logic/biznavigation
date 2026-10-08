// report.js
const footerY = 272;
const PDF_CONFIG = {
    PAGE: { x: 5, y: 5, w: 200, h: 287 },
    FONT: { header: 14, title: 10, body: 8, small: 7, tiny: 6, stiny: 5 }
};

// ==========================================
// TEXT BALANCING HELPER (NEW)
// ==========================================
// Forces long addresses to split symmetrically across two lines
function getBalancedText(doc, text, maxWidth) {
    if (!text) return [];
    const fullW = doc.getTextWidth(text);

    // If it already fits on one line, return it
    if (fullW <= maxWidth) return doc.splitTextToSize(text, maxWidth);

    // Target half the string's width (+ a small buffer) to force a balanced two-line wrap
    const targetW = (fullW / 2) + 5;
    const lines = doc.splitTextToSize(text, Math.max(targetW, maxWidth * 0.55));

    // If it somehow broke into 3+ lines, fallback to natural max-width wrapping
    if (lines.length > 2) {
        return doc.splitTextToSize(text, maxWidth);
    }
    return lines;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
async function fetchCompanyDetails(header) {
    const companyId = header?.CompanyID || CompanyID;
    const data = await getCompanyProfile(companyId);

    const { data: { publicUrl } } = supabaseClient.storage
        .from("company-logos")
        .getPublicUrl(`${companyId}.png`);

    return {
        name: data?.company_name || "",
        address: [
            data?.address,
            data?.city && `${data.city} - ${data.pin_code}`,
            data?.state,
            data?.country
        ].filter(Boolean).join(", "),
        phone: data?.phone_no || "-",
        email: data?.e_mail || "-",
        gst: data?.gst_number || "-",
        logo: publicUrl,
        uANo: data?.Udyog_aadhaar_no || "-",
        panNo: data?.pan_number || "-"
    };
}

async function fetchPartyDetails(header) {
    if (!header?.PartyCode) {
        return { name: "-", rcm: "Yes", address: "-", gst: "-", state: "-" };
    }

    const data = await getPartyProfile(header.PartyCode);

    // 🔍 DEBUG — remove once confirmed
    console.log("[fetchPartyDetails] raw party row:", data);
    console.log("[fetchPartyDetails] RCM field:", {
        "data.RCM": data?.RCM,
        "data.rcm": data?.rcm,
        typeofRCM: typeof data?.RCM,
        typeofrcm: typeof data?.rcm
    });

    const rawRcm = data?.RCM ?? data?.rcm;

    let rcmValue = "Yes";                                // default
    if (rawRcm === false) rcmValue = "No";               // boolean column
    else if (rawRcm === true) rcmValue = "Yes";
    else if (rawRcm != null && String(rawRcm).trim() !== "") {
        rcmValue = String(rawRcm).trim();                // "Yes" / "No" / any string
    }

    return {
        name: data?.PartyName || "-",
        rcm: rcmValue,
        address: [
            data?.Address,
            data?.City && `${data.City} - ${data.PinCode}`,
            data?.State,
            data?.Country
        ].filter(Boolean).join(", "),
        gst: data?.GSTNumber || "-",
        state: data?.State || "-"
    };
}

// ================= AMOUNT IN WORDS =================
function drawAmountInWords(doc, PAGE, FONT, grandTotal, y) {
    const padding = 1;
    const text = `Amount in Words: ${numberToWordsIndian(grandTotal)}`;

    const lines = doc.splitTextToSize(text, PAGE.w - (padding * 2));
    const boxH = (lines.length * 3) + (padding * 2);

    // Contiguous border (Left, Right, Bottom) - NO overlapping top line
    doc.setLineWidth(0.15);
    doc.line(PAGE.x, y, PAGE.x, y + boxH); // Left
    doc.line(PAGE.x + PAGE.w, y, PAGE.x + PAGE.w, y + boxH); // Right
    doc.line(PAGE.x, y + boxH, PAGE.x + PAGE.w, y + boxH); // Bottom

    doc.text(lines, PAGE.x + padding, y + padding + 2);

    return y + boxH;
}

// ==========================================
// BANK DETAILS SECTION
// ==========================================
function drawBankDetailsSection(doc, PAGE, FONT, company, bank, y) {
    const padding = 2;
    const lineHeight = 4;
    const textWidth = PAGE.w - (padding * 2) - 2;

    const wrappedLines = [
        `A/c Name : ${company?.name || "-"} | A/c No : ${bank?.AccountNo || "-"}`,
        `Bank : ${bank?.BankName || "-"}`,
        `Branch : ${bank?.BranchName || "-"} | IFSC : ${bank?.IFSCCode || "-"}`
    ].map(line => doc.splitTextToSize(line, textWidth));

    const totalLines = wrappedLines.reduce((acc, curr) => acc + curr.length, 0);
    const boxHeight = (totalLines * lineHeight) + 4;

    // Contiguous border (Left, Right, Bottom) - NO overlapping top line
    doc.setLineWidth(0.15);
    doc.line(PAGE.x, y, PAGE.x, y + boxHeight); // Left
    doc.line(PAGE.x + PAGE.w, y, PAGE.x + PAGE.w, y + boxHeight); // Right
    doc.line(PAGE.x, y + boxHeight, PAGE.x + PAGE.w, y + boxHeight); // Bottom

    let currentY = y + 3;
    PDF_FONT.bold(doc, FONT.body);
    doc.text("Bank Details :-", PAGE.x + padding, currentY);

    currentY += lineHeight;
    PDF_FONT.normal(doc, FONT.body);

    wrappedLines.forEach(lines => {
        doc.text(lines, PAGE.x + padding, currentY);
        currentY += lines.length * lineHeight;
    });

    return y + boxHeight;
}

// ==========================================
// ADD FOOTER TO ALL PAGES
// ==========================================
function drawaddFooterToAllPages(doc, PAGE, y) {
    const totalPages = doc.getNumberOfPages();

    for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
        doc.setPage(pageNo);
        const footerYPos = doc.internal.pageSize.getHeight() - 4;

        PDF_FONT.bold(doc, 8);
        doc.setTextColor(0, 102, 204);
        doc.text("AllEdge Technology for BizNavigation", PAGE.x, footerYPos);

        PDF_FONT.italic(doc, 8);
        doc.setTextColor(180, 0, 0);
        doc.text("This is a computer-generated invoice. No signature required.", PAGE.x + (PAGE.w / 2), footerYPos, { align: "center" });

        PDF_FONT.normal(doc, 8);
        doc.setTextColor(180, 0, 0);
        doc.text(`Page ${pageNo} of ${totalPages}`, PAGE.x + PAGE.w, footerYPos, { align: "right" });
    }

    PDF_FONT.normal(doc, 8);
    doc.setTextColor(0, 0, 0);
}

// ==========================================
// PDF FONT HELPER
// ==========================================
const PDF_FONT = {
    family: "times",
    set(doc, { family = PDF_FONT.family, style = "normal", size = null } = {}) {
        doc.setFont(family, style);
        if (size !== null) doc.setFontSize(size);
    },
    normal(doc, size = null) { this.set(doc, { style: "normal", size }); },
    bold(doc, size = null) { this.set(doc, { style: "bold", size }); },
    italic(doc, size = null) { this.set(doc, { style: "italic", size }); },
    boldItalic(doc, size = null) { this.set(doc, { style: "bolditalic", size }); }
};

// ==========================================
// TEXT HELPERS
// ==========================================
function drawLabelValue(doc, label, value, x, y, FONT) {
    PDF_FONT.bold(doc, FONT.title);
    doc.text(label, x, y);
    PDF_FONT.normal(doc, FONT.title);
    doc.text(String(value || "-"), x + doc.getTextWidth(label) + 2, y);
}

function drawLabelValueAligned(doc, label, value, x, y, labelWidth, FONT) {
    PDF_FONT.bold(doc, FONT.title);
    doc.text(label, x, y);
    PDF_FONT.normal(doc, FONT.title);
    doc.text(String(value || "-"), x + labelWidth, y);
}

function drawCenteredText(doc, text, x, width, y, height) {
    doc.text(text, x + (width / 2), y + (height / 2), { align: "center", baseline: "middle" });
}

// ==========================================
// HEADER
// ==========================================
async function drawHeader(doc, PAGE, FONT, company, y) {
    const headerH = 28, logoW = PAGE.w * 0.20, textW = PAGE.w * 0.75;

    // Draw the main container for the Header (Top, Left, Right, Bottom)
    doc.setLineWidth(0.15);
    doc.line(PAGE.x, y, PAGE.x + PAGE.w, y); // TOP
    doc.line(PAGE.x, y, PAGE.x, y + headerH); // LEFT
    doc.line(PAGE.x + PAGE.w, y, PAGE.x + PAGE.w, y + headerH); // RIGHT
    doc.line(PAGE.x, y + headerH, PAGE.x + PAGE.w, y + headerH); // BOTTOM

    // LOGO
    const logoImg = await loadImage(company.logo);
    if (logoImg) {
        const maxW = logoW - 6, maxH = headerH - 4;
        const ratio = logoImg.width / logoImg.height;
        let w = maxW, h = w / ratio;

        if (h > maxH) { h = maxH; w = h * ratio; }
        doc.addImage(logoImg, "PNG", PAGE.x + ((logoW - w) / 2), y + ((headerH - h) / 2), w, h);
    }

    const centerX = PAGE.x + logoW + 2 + (textW / 2);

    PDF_FONT.bold(doc, FONT.header + 2);
    doc.text(company.name || "", centerX, y + 5, { align: "center" });

    // USE TEXT BALANCING AND PROPER CASE FOR COMPANY ADDRESS
    PDF_FONT.normal(doc, FONT.title - 1);
    const rawCompanyAddr = company.address || "";
    const properCaseCompanyAddr = toProperCase(rawCompanyAddr);
    const addressLines = getBalancedText(doc, properCaseCompanyAddr, textW - 2);

    doc.text(addressLines, centerX, y + 10, { align: "center", maxWidth: textW - 2 });

    const contactInfo = [
        `Ph: ${company.phone || "-"}`,
        company.email || "-",
        `GST: ${company.gst || "-"}`
    ];
    if (company?.panNo && company.panNo !== "-") contactInfo.push(`PAN: ${company.panNo}`);
    if (company?.uANo && company.uANo !== "-") contactInfo.push(`UA No: ${company.uANo}`);

    const midContact = Math.ceil(contactInfo.length / 2);
    const contactLine1 = contactInfo.slice(0, midContact).join(" | ");
    const contactLine2 = contactInfo.slice(midContact).join(" | ");

    let contactY = y + 10 + (addressLines.length * 3.8);

    doc.text(contactLine1, centerX, contactY, { align: "center", maxWidth: textW - 2 });

    if (contactLine2) {
        contactY += 3.8;
        doc.text(contactLine2, centerX, contactY, { align: "center", maxWidth: textW - 2 });
    }

    return y + headerH;
}

// ==========================================
// TITLE 
// ==========================================
function drawTitle(doc, PAGE, FONT, y, title = "TAX INVOICE") {
    // Contiguous block (Left, Right, Bottom). No Top line drawn to avoid double-thickness.
    doc.setLineWidth(0.15);
    doc.line(PAGE.x, y, PAGE.x, y + 6); // LEFT
    doc.line(PAGE.x + PAGE.w, y, PAGE.x + PAGE.w, y + 6); // RIGHT
    doc.line(PAGE.x, y + 6, PAGE.x + PAGE.w, y + 6); // BOTTOM

    PDF_FONT.bold(doc, FONT.title);
    doc.text(title, PAGE.x + (PAGE.w / 2), y + 4, { align: "center" });

    return y + 6;
}

// ==========================================
// PROPER CASE HELPER
// ==========================================
function toProperCase(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

// ==========================================
// PARTY SECTION
// ==========================================
function drawPartySection(doc, PAGE, FONT, header, party, company, opNo, y) {
    const startX = Number(PAGE?.x) || 15;
    const startY = Number(y) || 40;
    const pageWidth = Number(PAGE?.w) || (doc.internal.pageSize.getWidth() - startX * 2);
    const LEFT_WIDTH = pageWidth * 0.70;
    const PADDING = 5;
    const LINE_H = 3.5;

    const fontHeader = Number(FONT?.header) || 10;
    const fontTitle = Number(FONT?.title) || 9;

    const safe = (v, fallback = "-") => (v !== null && v !== undefined && String(v).trim() !== "") ? String(v).trim() : fallback;

    // 1. Fetch raw address
    let rawPartyAddr = safe(party?.address || party?.InvoiceAddress, "");

    // 2. Remove hard line breaks and clean up extra spaces so it wraps purely by box width
    rawPartyAddr = rawPartyAddr.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

    // 3. Apply Proper Case and Balance Text
    const properCaseAddr = toProperCase(rawPartyAddr);
    const partyAddrLines = getBalancedText(doc, properCaseAddr, LEFT_WIDTH - (PADDING * 2));

    const leftTextSources = [
        { text: `M/s ${safe(party?.name || party?.PartyName, "")}`.trim(), isBold: true, isName: true },
        { text: partyAddrLines, isBold: false, isName: false },
        { text: `GST No: ${safe(party?.gst || party?.GSTNo || party?.GSTIN, "")}`.trim(), isBold: true, isName: false }
    ];

    // ✅ Read whichever key exists — works with both fetchPartyDetails() and raw DB rows
    const rcmValue = safe(party?.rcm ?? party?.RCM, "Yes");

    const rightData = [
        ["Invoice No. :", safe(header?.InvoiceNo)],
        ["Invoice Date :", (typeof formatDate === "function" ? formatDate(header?.InvoiceDate) : header?.InvoiceDate) || "-"],
        ["Tax Payable under RCM :", rcmValue],   // ✅ now reads the actual value
        ["SAC Code :", safe(header?.SACCode)],
        ["PO No :", safe(opNo)]
    ];

    const boldLabels = new Set(["Invoice No. :", "Invoice Date :", "Tax Payable under RCM :", "SAC Code :", "PO No :"]);

    // Calculate Row Height dynamically
    let leftLinesCount = 1; // 1 for Name
    leftLinesCount += partyAddrLines.length; // + Address Lines
    leftLinesCount += 1; // + GST Line

    const calculatedLines = Math.max(leftLinesCount, rightData.length);
    const rowHeight = Math.max((calculatedLines * LINE_H) + (PADDING * 2) + 2, 22);

    // ------------------------------------------
    // LEFT SECTION
    // ------------------------------------------
    let leftY = startY + PADDING + 2;
    const leftX = startX + PADDING;

    leftTextSources.forEach(item => {
        if (!item.text || item.text.length === 0) return;

        if (typeof PDF_FONT !== "undefined" && PDF_FONT.bold) {
            if (item.isBold) PDF_FONT.bold(doc, item.isName ? Math.max(fontHeader - 2, 8) : Math.max(fontTitle - 1, 7));
            else PDF_FONT.normal(doc, Math.max(fontTitle - 1, 7));
        } else {
            doc.setFont("helvetica", item.isBold ? "bold" : "normal");
            doc.setFontSize(item.isName ? Math.max(fontHeader - 2, 8) : Math.max(fontTitle - 1, 7));
        }

        doc.text(item.text, leftX, leftY);
        const addedLines = Array.isArray(item.text) ? item.text.length : 1;
        leftY += addedLines * LINE_H + (item.isName ? 0 : 1);
    });

    // ------------------------------------------
    // RIGHT SECTION
    // ------------------------------------------
    let rightY = startY + PADDING + 2;
    const rightX = startX + LEFT_WIDTH + PADDING;

    rightData.forEach(([label, value]) => {
        const isBold = boldLabels.has(label.trim());
        if (typeof PDF_FONT !== "undefined") {
            if (isBold && PDF_FONT.bold) PDF_FONT.bold(doc, fontTitle);
            else if (PDF_FONT.normal) PDF_FONT.normal(doc, fontTitle);
        } else {
            doc.setFont("helvetica", isBold ? "bold" : "normal");
            doc.setFontSize(fontTitle);
        }

        doc.text(`${label} ${value}`, rightX, rightY);
        rightY += LINE_H;
    });

    return startY + rowHeight - 6;
}

// =========================
// INVOICE BORDER
// =========================
function drawInvoiceBorder(doc, PAGE, movementType, footerY = 272, { top = 9, bottom, left = 0, right = 0, lineWidth = 0.15 } = {}) {
    bottom ??= movementType === "Customs Clearance" ? 2 : 12;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(lineWidth);
    doc.rect(PAGE.x + left, top, PAGE.w - left - right, PAGE.h - top - bottom);
}

// =========================
// INVOICE BORDER ALL PAGES
// =========================
function drawInvoiceBorderAllPages(doc, PAGE, movementType, footerY = 272) {
    const currentPage = doc.getCurrentPageInfo().pageNumber;

    for (let page = 1; page <= doc.getNumberOfPages(); page++) {
        doc.setPage(page);
        drawInvoiceBorder(doc, PAGE, movementType, footerY);
    }

    doc.setPage(currentPage);
}

// ==========================================
// DUTY TITLE
// ==========================================
function drawTitle_Duty_Invoice(doc, PAGE, FONT, y) {
    doc.setLineWidth(0.15);
    doc.line(PAGE.x, y, PAGE.x, y + 6); // LEFT
    doc.line(PAGE.x + PAGE.w, y, PAGE.x + PAGE.w, y + 6); // RIGHT
    doc.line(PAGE.x, y + 6, PAGE.x + PAGE.w, y + 6); // BOTTOM

    PDF_FONT.bold(doc, FONT.title);
    doc.text("DUTY INVOICE", PAGE.x + (PAGE.w / 2), y + 4, { align: "center" });

    return y + 6;
}

// ==========================================
// DropdownList FUNCTIONS
// ==========================================
async function fetchDropdownList() {
    const { data, error } = await supabaseClient
        .from("dropdown_list")
        .select("description, condition");

    if (error) {
        console.error("Error fetching dropdown list:", error);
        return [];
    }

    return data || [];
}