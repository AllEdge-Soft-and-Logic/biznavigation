// ==========================================
// TEXT BALANCING HELPER
// ==========================================
function getBalancedText(doc, text, maxWidth) {
    if (!text) return [];
    const fullW = doc.getTextWidth(text);
    if (fullW <= maxWidth) return doc.splitTextToSize(text, maxWidth);

    const targetW = (fullW / 2) + 5;
    const lines = doc.splitTextToSize(text, Math.max(targetW, maxWidth * 0.55));
    return lines.length > 2 ? doc.splitTextToSize(text, maxWidth) : lines;
}

// ==========================================
// DATA FETCHING HELPERS
// ==========================================
async function getLRDetails(lrNumber) {
    const { data, error } = await supabaseClient
        .from("FullLoadMovementDetailsView")
        .select("*")
        .eq("LRNumber", lrNumber)
        .maybeSingle();

    if (error) {
        console.error("Error fetching LR details:", error);
        return null;
    }
    return data || null;
}

async function getLRShipDetails(lrNumber) {
    const { data, error } = await supabaseClient
        .from("FullLoadShipmentDetails")
        .select("*")
        .eq("lr_number", lrNumber);

    if (error) {
        console.error("Error fetching shipment details:", error);
        return null;
    }
    return data || [];
}

async function fetchCompanyDetails(header) {
    const companyId = header?.CompanyID || window.CompanyID;
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
        website: data?.web_site || "-",
        gst: data?.gst_number || "-",
        logo: publicUrl,
        uANo: data?.Udyog_aadhaar_no || "-",
        panNo: data?.pan_number || "-"
    };
}

// ==========================================
// GENERATE CONSIGNMENT NOTE PDF
// ==========================================
async function generateConsignmentNote_annexure(lrNumber) {
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
        compress: true
    });

    const PAGE = PDF_CONFIG.PAGE;
    const FONT = PDF_CONFIG.FONT;
    let y = 9;

    const header = await getLRDetails(lrNumber);
    if (!header) {
        console.error("Consignment note details not found for LR:", lrNumber);
        return;
    }

    const [shipdata, company] = await Promise.all([
        getLRShipDetails(lrNumber),
        fetchCompanyDetails(header?.company_id)
    ]);

    // Build Document Layout Sections Sequentially
    y = drawTitle(doc, PAGE, FONT, y);
    y = await drawHeader(doc, PAGE, FONT, company, y, lrNumber, header?.PickupDate);
    y = drawPickupDeliveryDetails_a(doc, PAGE, FONT, header, y);
    y = drawShipDetails_a(doc, PAGE, FONT, shipdata, y);
    y = drawTermsConditions_a(doc, PAGE, FONT, header, y);

    drawInlineFooter(doc, PAGE, y);

    const fileName = `${header?.LRNumber || "NA"}_${header?.DestinationCity || "NA"}.pdf`;
    doc.save(fileName);
}

// ==========================================
// TITLE SECTION
// ==========================================
function drawTitle(doc, PAGE, FONT, y, title = "GOODS CONSIGNMENT NOTE") {
    doc.setLineWidth(0.15);
    doc.rect(PAGE.x, y, PAGE.w, 6);
    PDF_FONT.bold(doc, FONT.title);
    doc.text(title, PAGE.x + (PAGE.w / 2), y + 4, { align: "center" });
    return y + 6;
}

// ==========================================
// HEADER SECTION
// ==========================================
async function drawHeader(doc, PAGE, FONT, company, y, lrNumber, lrDate) {
    const headerH = 28;
    const colLeftW = PAGE.w * 0.20;
    const colRightW = PAGE.w * 0.20;
    const colCenterW = PAGE.w - colLeftW - colRightW;

    doc.setLineWidth(0.15);
    doc.rect(PAGE.x, y, PAGE.w, headerH);
    doc.line(PAGE.x + colLeftW, y, PAGE.x + colLeftW, y + headerH);
    doc.line(PAGE.x + colLeftW + colCenterW, y, PAGE.x + colLeftW + colCenterW, y + headerH);

    // 1. Left Column: Logo
    if (company?.logo) {
        try {
            const logoImg = await loadImage(company.logo);
            if (logoImg) {
                const maxW = colLeftW - 4, maxH = headerH - 4;
                const ratio = logoImg.width / logoImg.height;
                let imgW = maxW, imgH = imgW / ratio;

                if (imgH > maxH) { imgH = maxH; imgW = imgH * ratio; }
                doc.addImage(logoImg, "PNG", PAGE.x + ((colLeftW - imgW) / 2), y + ((headerH - imgH) / 2), imgW, imgH);
            }
        } catch (err) {
            console.warn("Failed to load company logo:", err);
        }
    }

    // 2. Center Column: Company Details
    const centerX = PAGE.x + colLeftW + (colCenterW / 2);
    const addressLines = getBalancedText(doc, toProperCase(company.address || ""), colCenterW - 4);

    const isValid = (val) => val && val.trim() !== "" && val !== "-";

    const line1Items = [
        isValid(company?.gst) ? `GST: ${company.gst}` : null,
        isValid(company?.panNo) ? `PAN: ${company.panNo}` : null
    ].filter(Boolean);

    const line2Items = [
        isValid(company?.phone) ? `Contact No: ${company.phone}` : null,
        isValid(company?.email) ? company.email : null,
        isValid(company?.website) ? company.website : null
    ].filter(Boolean);

    const contactLine1 = line1Items.join(" | ");
    const contactLine2 = line2Items.join(" | ");

    const nameSpace = 5;
    const addressSpace = addressLines.length * 3.8;
    const contactSpace1 = 4.5;
    const contactSpace2 = contactLine2 ? 3.8 : 0;
    const totalCenterHeight = nameSpace + addressSpace + contactSpace1 + contactSpace2;

    let currentCenterY = y + ((headerH - totalCenterHeight) / 2) + 3.5;

    PDF_FONT.bold(doc, FONT.header + 2);
    doc.text(company.name || "", centerX, currentCenterY, { align: "center" });

    currentCenterY += nameSpace;
    PDF_FONT.normal(doc, FONT.title);
    doc.text(addressLines, centerX, currentCenterY, { align: "center", maxWidth: colCenterW - 4 });

    currentCenterY += addressSpace;
    doc.text(contactLine1, centerX, currentCenterY, { align: "center", maxWidth: colCenterW - 4 });

    if (contactLine2) {
        currentCenterY += contactSpace2;
        doc.text(contactLine2, centerX, currentCenterY, { align: "center", maxWidth: colCenterW - 4 });
    }

    // 3. Right Column: QR Code & Meta
    if (lrNumber) {
        const gap = 2, lrTextSpace = 4, dateTextSpace = lrDate ? 4 : 0;
        const totalTextSpace = lrTextSpace + dateTextSpace;
        const qrSize = Math.min(colRightW - 4, headerH - totalTextSpace - gap - 2);
        const rightCenterX = PAGE.x + colLeftW + colCenterW + (colRightW / 2);
        const totalRightHeight = qrSize + gap + totalTextSpace;
        const startRightY = y + ((headerH - totalRightHeight) / 2);

        try {
            const qrImgBase64 = await generateQRCodeBase64(lrNumber);
            if (qrImgBase64) {
                doc.addImage(qrImgBase64, "PNG", rightCenterX - (qrSize / 2), startRightY, qrSize, qrSize);
            }
        } catch (error) {
            console.warn("Could not generate QR code:", error);
        }

        let textY = startRightY + qrSize + gap + 2.5;
        PDF_FONT.bold(doc, FONT.title || 8);
        doc.text(String(lrNumber), rightCenterX, textY, { align: "center" });

        if (lrDate) {
            textY += dateTextSpace;
            PDF_FONT.normal(doc, FONT.body || 8);
            doc.text(`Booking Date: ${formatDate(lrDate)}`, rightCenterX, textY, { align: "center" });
        }
    }

    return y + headerH;
}

// ==========================================
// PICKUP & MOVEMENT DETAILS
// ==========================================
function drawPickupDeliveryDetails_a(doc, PAGE, FONT, lrDetails, y) {
    const boxH = 22;
    const colW = PAGE.w / 2;

    doc.setLineWidth(0.15);
    doc.rect(PAGE.x, y, PAGE.w, boxH);
    doc.line(PAGE.x + colW, y, PAGE.x + colW, y + boxH);

    const data = lrDetails || {};

    // 1. Left Column: Pickup Details
    let leftY = y + 3.5;
    let leftX = PAGE.x + 2;
    PDF_FONT.bold(doc, FONT.title);
    doc.text("Pickup Details (Consignor):", leftX, leftY);

    leftY += 4;
    leftX += 2;

    const custPickup = data.CustomerName || data.customer_name || data.ConsignorName || "";
    const rawPickup = [data.OriginAddress, data.OriginCity, data.OriginPincode].filter(Boolean).join(", ");

    PDF_FONT.normal(doc, FONT.body);

    if (custPickup) {
        PDF_FONT.bold(doc, FONT.body);
        const nameLines = getBalancedText(doc, toProperCase(custPickup), colW - 6);
        doc.text(nameLines, leftX, leftY);
        leftY += nameLines.length * 3.8;
        PDF_FONT.normal(doc, FONT.body);
    }

    if (rawPickup) {
        const addressLines = getBalancedText(doc, toProperCase(rawPickup), colW - 6);
        doc.text(addressLines, leftX, leftY);
    }

    // 2. Right Column: Movement Summary
    let rightY = y + 3.5;
    let rightX = PAGE.x + colW + 2;

    const rightRows = [
        { label: "Origin : ", value: data.OriginCity || "-" },
        { label: "Destination : ", value: data.DestinationCity || "-" },
        { label: "Vehicle Number / Type : ", value: [data.VehicleNumber, data.VehicleType].filter(Boolean).join(" - ") || "-" },
        { label: "Movement / Mode : ", value: [data.MovementType, data.ModeType].filter(Boolean).join(" / ") || "-" },
        { label: "Route : ", value: data.RouteDetails || "-" }
    ];

    rightRows.forEach((row) => {
        PDF_FONT.bold(doc, FONT.body);
        doc.text(row.label, rightX, rightY);
        const labelWidth = doc.getTextWidth(row.label);

        PDF_FONT.normal(doc, FONT.body);
        const valStr = String(row.value).toUpperCase();
        const availableWidth = colW - 4 - labelWidth;

        const lines = doc.splitTextToSize(valStr, availableWidth > 0 ? availableWidth : 50);
        doc.text(lines[0] ? lines[0].trim() : valStr, rightX + labelWidth, rightY);
        rightY += 4.1;
    });

    return y + boxH;
}

// ==========================================
// DRAW SHIPMENT DETAILS TABLE (ANNEXURE)
// ==========================================
function drawShipDetails_a(doc, PAGE, FONT, shipData, y) {
    const colW1 = 10, colW2 = 110, colW3 = 25, colW4 = 50;
    const rows = Array.isArray(shipData) ? shipData : (shipData ? [shipData] : []);

    const headerH = 6;
    const dividerY = y + 5.5;

    const dataRows = rows.length > 0 ? rows : [{
        shipment_type: "-",
        consignee_or_consignor_name: "-",
        consignee_or_consignor_address: "-",
        city: "",
        pincode: "",
        reference_number: "-",
        invoice_value: 0,
        quantity: 0,
        actual_weight: "0.00",
        charge_weight: "0.00",
        e_waybill_no: ""
    }];

    const lineHeight = 3;
    const maxColW2 = colW2 - 4;

    const processedRows = dataRows.map((item, index) => {
        const shipmentType = item.shipment_type ? `[${item.shipment_type}] ` : "";
        const name = item.consignee_or_consignor_name || "";

        PDF_FONT.bold(doc, FONT.body);
        const typeWidth = shipmentType ? doc.getTextWidth(shipmentType) : 0;

        const bodyParts = [
            name,
            item.consignee_or_consignor_address,
            [item.city, item.pincode].filter(Boolean).join(" - "),
            [
                item.reference_number ? `Ref: ${item.reference_number}` : "",
                item.invoice_value ? `Inv: ${item.invoice_value}` : "",
                item.actual_weight ? `Actual Wt: ${item.actual_weight}` : "",
                item.charge_weight ? `Charge Wt: ${item.charge_weight}` : ""
            ].filter(Boolean).join(" | "),
            item.e_waybill_no ? `E-Way Bill No: ${item.e_waybill_no}` : ""
        ].filter(Boolean);

        PDF_FONT.normal(doc, FONT.body);
        const fullBodyText = bodyParts.join("\n");
        const bodyLines = doc.splitTextToSize(fullBodyText, maxColW2);

        return {
            slNo: String(index + 1),
            pkgs: item.quantity ?? "0",
            shipmentType,
            bodyLines,
            typeWidth,
            rowH: Math.max(12, (bodyLines.length * lineHeight) + 4)
        };
    });

    const boxH = headerH + processedRows.reduce((sum, r) => sum + r.rowH, 0);

    doc.setLineWidth(0.15);
    doc.rect(PAGE.x, y, PAGE.w, boxH);

    const x1 = PAGE.x + colW1;
    const x2 = x1 + colW2;
    const x3 = x2 + colW3;

    doc.line(x1, y, x1, y + boxH);
    doc.line(x2, y, x2, y + boxH);
    doc.line(x3, y, x3, y + boxH);
    doc.line(PAGE.x, dividerY, PAGE.x + PAGE.w, dividerY);

    PDF_FONT.bold(doc, FONT.title || 6);
    const headerY = y + 3;
    doc.text("Sl No", PAGE.x + (colW1 / 2), headerY, { align: "center" });
    doc.text("Shipment Details (Name, Address & Ref)", x1 + 2, headerY);
    doc.text("No of Pkgs", x2 + (colW3 / 2), headerY, { align: "center" });
    doc.text("Receiver Signature", x3 + (colW4 / 2), headerY, { align: "center" });

    let currentY = dividerY;

    processedRows.forEach((row, idx) => {
        const valueY = currentY + 4;

        doc.text(row.slNo, PAGE.x + (colW1 / 2), valueY, { align: "center" });
        doc.text(String(row.pkgs), x2 + (colW3 / 2), valueY, { align: "center" });

        let lineY = valueY;
        const startX = x1 + 2;

        if (row.shipmentType) {
            PDF_FONT.bold(doc, FONT.body);
            doc.text(row.shipmentType, startX, lineY);

            PDF_FONT.normal(doc, FONT.body);
            if (row.bodyLines?.length > 0) {
                doc.text(row.bodyLines[0], startX + row.typeWidth, lineY);

                for (let i = 1; i < row.bodyLines.length; i++) {
                    lineY += lineHeight;
                    doc.text(row.bodyLines[i], startX, lineY);
                }
            }
        } else {
            PDF_FONT.normal(doc, FONT.body);
            if (row.bodyLines?.length > 0) {
                doc.text(row.bodyLines, startX, lineY);
            }
        }

        currentY += row.rowH;

        if (idx < processedRows.length - 1) {
            doc.line(PAGE.x, currentY, PAGE.x + PAGE.w, currentY);
        }
    });

    return y + boxH;
}

// ==========================================
// TERMS & CONDITIONS
// ==========================================
function drawTermsConditions_a(doc, PAGE, FONT, lrDetails, y) {
    const colLeftW = PAGE.w * 0.58;
    const colRightW = PAGE.w * 0.42;
    const splitX = PAGE.x + colLeftW;

    const data = lrDetails || {};
    console.log("LR Data", data);
    const tcPoints = [
        "1. Goods are carried at owner's risk.",
        "2. Unloading to be done by consignee.",
        "3. Company is not responsible for leakage & breakage in transit & while unloading.",
        "4. Consignment will not be detained, diverted or re-booked without written request.",
        "5. All disputes are subject to local jurisdiction.",
        "",
        "Sender Name & Signature : _____________________________"
    ];
    const tcString = data.TermsAndConditions || tcPoints.join("\n");

    const deliveryArray = [
        `Driver Name : ${data.DriverName || "______________________________"}`,
        `Driver Phone No : ${data.DriverPhoneNo || "___________________________"}`,
        `Driver DL No : ${data.DriverDLNo || "___________________________"}`,
        "",
        "Out for Delivery Date & Time : ___/___/20___ @ ___:___",
        "",
        "Driver Signature : __________________________"
    ];
    const deliveryString = deliveryArray.join("\n");

    PDF_FONT.normal(doc, FONT.body || 6);
    const tcLines = doc.splitTextToSize(tcString, colLeftW - 6);
    const deliveryLines = doc.splitTextToSize(deliveryString, colRightW - 6);

    const lineSpacing = 3.6;
    const headerOffset = 4.5;
    const textStartOffset = 4.5;
    const maxLines = Math.max(tcLines.length, deliveryLines.length);
    const boxH = headerOffset + textStartOffset + (maxLines * lineSpacing) + 2;

    doc.setLineWidth(0.15);
    doc.rect(PAGE.x, y, PAGE.w, boxH);
    doc.line(splitX, y, splitX, y + boxH);

    // Left Column: Terms
    let leftY = y + headerOffset;
    PDF_FONT.bold(doc, FONT.title);
    doc.text("Terms & Conditions:", PAGE.x + 3, leftY);
    leftY += textStartOffset;
    PDF_FONT.normal(doc, FONT.body || 6);
    tcLines.forEach((line, index) => {
        doc.text(line, PAGE.x + 3, leftY + (index * lineSpacing));
    });

    // Right Column: Delivery Details
    let rightY = y + headerOffset;
    PDF_FONT.bold(doc, FONT.title);
    doc.text("Driver & Dispatch Details:", splitX + 3, rightY);
    rightY += textStartOffset;
    PDF_FONT.normal(doc, FONT.body || 6);
    deliveryLines.forEach((line, index) => {
        doc.text(line, splitX + 3, rightY + (index * lineSpacing));
    });

    return y + boxH;
}

// ==========================================
// FOOTER
// ==========================================
function drawInlineFooter(doc, PAGE, y) {
    const footerYPos = y + 6;

    PDF_FONT.bold(doc, 7);
    doc.setTextColor(0, 102, 204);
    doc.text("AllEdge Technology for BizNavigation", PAGE.x, footerYPos);

    PDF_FONT.italic(doc, 7);
    doc.setTextColor(180, 0, 0);
    doc.text("This is a computer-generated document. No signature required.", PAGE.x + (PAGE.w / 2), footerYPos, { align: "center" });

    PDF_FONT.normal(doc, 8);
    doc.setTextColor(0, 0, 0);
}