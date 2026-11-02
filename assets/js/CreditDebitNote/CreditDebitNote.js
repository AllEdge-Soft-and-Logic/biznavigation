// ==========================================
// Cache DOM Elements for Performance
// ==========================================
const els = {
    noteNo: document.getElementById("noteNo"),
    noteDate: document.getElementById("noteDate"),
    noteType: document.getElementById("noteType"),
    partyName: document.getElementById("partyName"),
    partyCode: document.getElementById("partyCode"),
    referenceType: document.getElementById("referenceType"),
    referenceInvoice: document.getElementById("referenceInvoice"),
    suggestionBox: document.getElementById("referenceSuggestions"),
    reason: document.getElementById("reason"),
    remarks: document.getElementById("remarks"),
    item: document.getElementById("item"),
    description: document.getElementById("description"),
    hsnCode: document.getElementById("hsnCode"),
    quantity: document.getElementById("quantity"),
    fullAmount: document.getElementById("fullAmount"),
    partyDefaultTax: document.getElementById("partyDefaultTax"),
    totalAmount: document.getElementById("totalAmount"),
    addCreditDebitRow: document.getElementById("addCreditDebitRow"),
    tbody: document.querySelector("#creditDebitTable tbody"),
    saveButton: document.getElementById("saveButton"),
    noteNoSuggestions: document.getElementById("noteNoSuggestions"),
    tempFormID: document.getElementById("tempFormID"),

    // Action Buttons
    newButton: document.getElementById("newButton"),
    modifyButton: document.getElementById("modifyButton"),
    deleteButton: document.getElementById("deleteButton"),
    reportButton: document.getElementById("reportButton"),
    approveButton: document.getElementById("approveButton"),

    // Approval & Status Elements
    approvalBadge: document.getElementById("approvalBadge"),
    approvalStatus: document.getElementById("approvalStatus"),

    // Modal Elements
    searchPaymentInput: document.getElementById("searchSavedPaymentInput"),
    btnTriggerSearch: document.getElementById("btnTriggerSearch"),
    searchPaymentTableBody: document.getElementById("searchPaymentTableBody"),
    searchPaymentModal: document.getElementById("searchPaymentModal")
};

let currentTable = "", currentColumn = "";
let referenceDebounceTimer, noteDebounceTimer;

document.addEventListener("DOMContentLoaded", async () => {
    try {
        deleteButton.disabled = true;
        if (typeof loadSuggestions === "function") await loadSuggestions("partySuggestions", "PartyDetails", CompanyID);
        if (typeof loadTaxData === "function") loadTaxData();
    } catch (error) {
        console.error("Initialization error:", error);
    }
});

// ==========================================
// Form Action Buttons (New, Modify)
// ==========================================

els.newButton.addEventListener("click", () => {
    document.getElementById("creditDebitForm").reset();
    els.tempFormID.value = "";
    els.tbody.innerHTML = "";
    els.noteNo.disabled = false;
    updateCreditDebitTotals();
    enableForm();
    els.saveButton.innerHTML = '<i class="bi bi-save" aria-hidden="true"></i> Save';

    // Reset Approval Badge to default
    if (els.approvalBadge) {
        els.approvalBadge.className = "badge bg-warning text-dark px-2 py-1 fs-6 d-none";
        els.approvalBadge.textContent = "Pending Approval";
    }
    if (els.approvalStatus) els.approvalStatus.value = "Draft";

    // Reset Full Amount Label
    document.querySelector('label[for="fullAmount"]').innerHTML = 'Amount <span class="text-danger">*</span>';
});

els.modifyButton.addEventListener("click", () => {
    enableForm();
    els.saveButton.innerHTML = '<i class="bi bi-save" aria-hidden="true"></i> Update';
});


// ==========================================
// Event Listeners
// ==========================================

els.referenceType.addEventListener("change", function () {
    els.referenceInvoice.value = "";
    els.suggestionBox.innerHTML = "";
    els.suggestionBox.style.display = "none";

    switch (this.value) {
        case "Customer Invoice":
            currentTable = "InvoicePaymentView";
            currentColumn = "InvoiceNo";
            break;
        case "Vendor Bill":
            currentTable = "VendorBillPaymentView";
            currentColumn = "BillReferenceNo";
            break;
        default:
            currentTable = "";
            currentColumn = "";
    }
});

els.referenceInvoice.addEventListener("input", function () {
    clearTimeout(referenceDebounceTimer);
    const search = this.value.trim();

    if (!currentTable || search.length < 2) {
        els.suggestionBox.style.display = "none";
        return;
    }
    referenceDebounceTimer = setTimeout(() => searchReferences(search), 300);
});

async function searchReferences(searchText) {
    try {
        const { data, error } = await supabaseClient
            .from(currentTable)
            .select(currentColumn)
            .eq("PartyCode", els.partyCode.value)
            .eq("company_id", CompanyID)
            .neq("PaymentStatus", "Paid")
            .ilike(currentColumn, `%${searchText}%`)
            .order(currentColumn)
            .limit(20);

        if (error) throw error;
        renderSuggestions(data);
    } catch (error) {
        console.error("Error fetching references:", error);
    }
}

function renderSuggestions(data) {
    els.suggestionBox.innerHTML = "";

    if (!data || !data.length) {
        els.suggestionBox.style.display = "none";
        return;
    }

    const fragment = document.createDocumentFragment();

    data.forEach(row => {
        const value = row[currentColumn];
        const itemBtn = document.createElement("button");
        itemBtn.type = "button";
        itemBtn.className = "list-group-item list-group-item-action";
        itemBtn.textContent = value;

        itemBtn.onclick = () => {
            els.referenceInvoice.value = value;
            els.suggestionBox.style.display = "none";
        };
        fragment.appendChild(itemBtn);
    });

    els.suggestionBox.appendChild(fragment);
    els.suggestionBox.style.display = "block";
}

document.addEventListener("click", (e) => {
    if (!els.referenceInvoice.contains(e.target) && !els.suggestionBox.contains(e.target)) {
        els.suggestionBox.style.display = "none";
    }
});

els.partyCode.addEventListener("change", () => {
    els.referenceInvoice.value = "";
    els.suggestionBox.innerHTML = "";
    els.suggestionBox.style.display = "none";
});

els.fullAmount.addEventListener("input", calculateTotalAmount);
els.partyDefaultTax.addEventListener("change", calculateTotalAmount);

async function calculateTotalAmount() {
    const amount = parseFloat(els.fullAmount.value) || 0;
    const taxId = els.partyDefaultTax.value;

    if (!taxId || amount === 0) {
        els.totalAmount.value = amount ? amount.toFixed(2) : "";
        return;
    }

    try {
        const taxRates = await getTaxRatesById(taxId);
        const taxPercent = (parseFloat(taxRates.cgst) || 0) +
            (parseFloat(taxRates.sgst) || 0) +
            (parseFloat(taxRates.igst) || 0) +
            (parseFloat(taxRates.cess) || 0);

        els.totalAmount.value = (amount + (amount * taxPercent / 100)).toFixed(2);
    } catch (error) {
        console.error("Error calculating tax:", error);
    }
}

els.noteType.addEventListener("change", function () {
    const amountLabel = document.querySelector('label[for="fullAmount"]');
    if (this.value === "Credit Note") amountLabel.innerHTML = 'Credit Amount <span class="text-danger">*</span>';
    else if (this.value === "Debit Note") amountLabel.innerHTML = 'Debit Amount <span class="text-danger">*</span>';
    else amountLabel.innerHTML = 'Amount <span class="text-danger">*</span>';
});

// ==========================================
// Item Row Management (Corrected Template)
// ==========================================

els.addCreditDebitRow.addEventListener("click", async function () {
    els.addCreditDebitRow.disabled = true;

    const refInvoiceVal = els.referenceInvoice.value.trim();
    const itemVal = els.item.value.trim();
    const descVal = els.description.value.trim();
    const hsnVal = els.hsnCode.value.trim();
    const quantityVal = parseFloat(els.quantity.value) || 0;
    const taxableAmount = parseFloat(els.fullAmount.value) || 0;
    const taxId = els.partyDefaultTax.value;

    if (!refInvoiceVal) return alertFocus("Please select Reference Invoice.", els.referenceInvoice);
    if (!itemVal) return alertFocus("Please select Item.", els.item);
    if (!descVal) return alertFocus("Please enter Description.", els.description);
    if (!hsnVal) return alertFocus("Please enter HSN Code.", els.hsnCode);
    if (quantityVal <= 0) return alertFocus("Please enter a valid Quantity.", els.quantity);
    if (taxableAmount <= 0) return alertFocus("Please enter a valid Amount.", els.fullAmount);
    if (!taxId) return alertFocus("Please select Tax Rate.", els.partyDefaultTax);

    try {
        const taxRates = await getTaxRatesById(taxId);

        const cgstPercent = parseFloat(taxRates.cgst) || 0;
        const sgstPercent = parseFloat(taxRates.sgst) || 0;
        const igstPercent = parseFloat(taxRates.igst) || 0;
        const cessPercent = parseFloat(taxRates.cess) || 0;
        const gstPercent = parseFloat(taxRates.tax_rate) || 0;

        const cgstAmount = (taxableAmount * cgstPercent) / 100;
        const sgstAmount = (taxableAmount * sgstPercent) / 100;
        const igstAmount = (taxableAmount * igstPercent) / 100;
        const cessAmount = (taxableAmount * cessPercent) / 100;

        const totalGST = cgstAmount + sgstAmount + igstAmount + cessAmount;
        const grandTotal = taxableAmount + totalGST;
        const nonTaxableAmount = totalGST <= 0 ? taxableAmount : 0;

        const row = els.tbody.insertRow();
        row.innerHTML = `
            <td>${els.tbody.rows.length}</td>
            <td>${itemVal}</td>
            <td>${refInvoiceVal}</td>
            <td>${descVal}</td>
            <td>${hsnVal}</td>
            <td class="text-end">${gstPercent.toFixed(2)}%</td>
            <td class="text-end">${cessPercent.toFixed(2)}%</td>
            <td class="text-end">${quantityVal.toFixed(2)}</td>
            <td class="text-end">${nonTaxableAmount.toFixed(2)}</td>
            <td class="text-end">${taxableAmount.toFixed(2)}</td>
            <td class="text-end">${sgstAmount.toFixed(2)}</td>
            <td class="text-end">${cgstAmount.toFixed(2)}</td>
            <td class="text-end">${igstAmount.toFixed(2)}</td>
            <td class="text-end">${cessAmount.toFixed(2)}</td>
            <td class="text-end">${totalGST.toFixed(2)}</td>
            <td class="text-end">${grandTotal.toFixed(2)}</td>
            <td class="text-center">
                <button type="button" class="btn btn-danger btn-sm removeRow"><i class="bi bi-trash"></i></button>
            </td>
            <td class="d-none">${cgstPercent}</td>
            <td class="d-none">${sgstPercent}</td>
            <td class="d-none">${igstPercent}</td>
            <td class="d-none">${taxId}</td>
        `;

        updateCreditDebitTotals();
        clearItemDetails();
    } catch (error) {
        console.error("Error adding row:", error);
    } finally {
        els.addCreditDebitRow.disabled = false;
    }
});

els.tbody.addEventListener("click", (e) => {
    const btn = e.target.closest(".removeRow");
    if (!btn) return;

    btn.closest("tr").remove();

    const rows = els.tbody.rows;
    for (let i = 0; i < rows.length; i++) {
        rows[i].cells[0].textContent = i + 1;
    }
    updateCreditDebitTotals();
});

function updateCreditDebitTotals() {
    let nonTax = 0, tax = 0, sgst = 0, cgst = 0, igst = 0, cess = 0, gst = 0, grand = 0;

    for (const row of els.tbody.rows) {
        const c = row.cells;
        nonTax += parseFloat(c[8].textContent) || 0;
        tax += parseFloat(c[9].textContent) || 0;
        sgst += parseFloat(c[10].textContent) || 0;
        cgst += parseFloat(c[11].textContent) || 0;
        igst += parseFloat(c[12].textContent) || 0;
        cess += parseFloat(c[13].textContent) || 0;
        gst += parseFloat(c[14].textContent) || 0;
        grand += parseFloat(c[15].textContent) || 0;
    }

    document.getElementById("totalNonTaxAmt").textContent = nonTax.toFixed(2);
    document.getElementById("totalTaxAmt").textContent = tax.toFixed(2);
    document.getElementById("totalSGST").textContent = sgst.toFixed(2);
    document.getElementById("totalCGST").textContent = cgst.toFixed(2);
    document.getElementById("totalIGST").textContent = igst.toFixed(2);
    document.getElementById("totalCESSAmt").textContent = cess.toFixed(2);
    document.getElementById("totalGST").textContent = gst.toFixed(2);
    document.getElementById("totalGrand").textContent = grand.toFixed(2);
}

// ==========================================
// Helper Functions (Disable / Enable Form)
// ==========================================

function alertFocus(msg, element) {
    alert(msg);
    if (element && typeof element.focus === 'function') element.focus();
    els.addCreditDebitRow.disabled = false;
}

function clearItemDetails() {
    els.referenceInvoice.value = "";
    els.item.value = "";
    els.description.value = "";
    els.hsnCode.value = "";
    els.quantity.value = "";
    els.fullAmount.value = "";
    els.totalAmount.value = "";
    els.partyDefaultTax.selectedIndex = 0;
}

function disableForm() {
    els.noteDate.disabled = true;
    els.noteType.disabled = true;
    els.partyName.disabled = true;
    els.referenceType.disabled = true;
    els.reason.disabled = true;
    els.remarks.disabled = true;

    els.referenceInvoice.disabled = true;
    els.item.disabled = true;
    els.description.disabled = true;
    els.hsnCode.disabled = true;
    els.quantity.disabled = true;
    els.fullAmount.disabled = true;
    els.partyDefaultTax.disabled = true;
    els.addCreditDebitRow.disabled = true;

    document.querySelectorAll(".removeRow").forEach(btn => btn.disabled = true);

    els.saveButton.disabled = true;
    els.modifyButton.disabled = false;
    els.deleteButton.disabled = true;
    els.approveButton.disabled = false;
    els.reportButton.disabled = false;
}

function enableForm() {
    els.noteDate.disabled = false;
    els.noteType.disabled = false;
    els.partyName.disabled = false;
    els.referenceType.disabled = false;
    els.reason.disabled = false;
    els.remarks.disabled = false;

    els.referenceInvoice.disabled = false;
    els.item.disabled = false;
    els.description.disabled = false;
    els.hsnCode.disabled = false;
    els.quantity.disabled = false;
    els.fullAmount.disabled = false;
    els.partyDefaultTax.disabled = false;
    els.addCreditDebitRow.disabled = false;

    document.querySelectorAll(".removeRow").forEach(btn => btn.disabled = false);

    els.saveButton.disabled = false;
    els.modifyButton.disabled = true;
    els.deleteButton.disabled = true;
    els.approveButton.disabled = true;
    els.reportButton.disabled = true;
}


// ==========================================
// Loading Existing Note Logic
// ==========================================

els.noteNo.addEventListener("change", async function () {
    const noteNoStr = this.value.trim();
    if (!noteNoStr) return;

    try {
        const { data, error } = await supabaseClient
            .from("credit_debit_notes")
            .select("*")
            .eq("company_id", CompanyID)
            .eq("note_no", noteNoStr)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            els.tempFormID.value = "";
            return;
        }

        els.tempFormID.value = data.id;
        els.noteDate.value = data.note_date;
        els.noteType.value = data.note_type;
        els.partyCode.value = data.party_id;
        els.partyName.value = data.party_name;
        els.referenceType.value = data.reference_type;
        els.reason.value = data.reason || "";
        els.remarks.value = data.remarks || "";
        els.noteNo.disabled = true;

        // Handle Approval Status UI state based on database value
        const isApproved = data.status === "Approved";
        if (els.approvalStatus) els.approvalStatus.value = isApproved ? "Approved" : "Draft";
        if (els.approvalBadge) {
            els.approvalBadge.className = isApproved ? "badge bg-success px-2 py-1 fs-6" : "badge bg-secondary px-2 py-1 fs-6";
            els.approvalBadge.textContent = isApproved ? "Approved" : "Draft";
        }

        els.noteType.dispatchEvent(new Event("change"));
        await loadCreditDebitNoteItems(data.id);

        disableForm();

        // Prevent self-approval (Creator cannot approve their own draft note)
        if (!isApproved && data.created_by === UserLoginID) {
            els.approveButton.disabled = true;
            console.warn("Self-approval restricted: You cannot approve a note created by yourself.");
        }

        // If already approved, lock down modify, delete, approve, and save buttons completely
        if (isApproved) {
            els.modifyButton.disabled = true;
            els.deleteButton.disabled = true;
            els.approveButton.disabled = true;
            els.saveButton.disabled = true;
            els.reportButton.disabled = false; // Only Report & New remain active
        }

    } catch (error) {
        console.error("Error loading note:", error);
    }
});

async function loadCreditDebitNoteItems(noteId) {
    els.tbody.innerHTML = "";

    try {
        const { data, error } = await supabaseClient
            .from("credit_debit_note_items")
            .select("*")
            .eq("note_id", noteId)
            .order("line_no");

        if (error) throw error;

        data.forEach((item, index) => {
            const totalGST =
                (parseFloat(item.cgst_amount) || 0) +
                (parseFloat(item.sgst_amount) || 0) +
                (parseFloat(item.igst_amount) || 0) +
                (parseFloat(item.cess_amount) || 0);

            const row = els.tbody.insertRow();
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${item.item_id || "-"}</td>
                <td>${item.reference_invoice || ""}</td>
                <td>${item.description || ""}</td>
                <td>${item.hsn_sac || ""}</td>
                <td class="text-end">${parseFloat(item.gst_percent || 0).toFixed(2)}%</td>
                <td class="text-end">${parseFloat(item.cess_percent || 0).toFixed(2)}%</td>
                <td class="text-end">${parseFloat(item.qty || 0).toFixed(2)}</td>
                <td class="text-end">${parseFloat(item.non_taxable_amount || 0).toFixed(2)}</td>
                <td class="text-end">${parseFloat(item.taxable_amount || 0).toFixed(2)}</td>
                <td class="text-end">${parseFloat(item.sgst_amount || 0).toFixed(2)}</td>
                <td class="text-end">${parseFloat(item.cgst_amount || 0).toFixed(2)}</td>
                <td class="text-end">${parseFloat(item.igst_amount || 0).toFixed(2)}</td>
                <td class="text-end">${parseFloat(item.cess_amount || 0).toFixed(2)}</td>
                <td class="text-end">${totalGST.toFixed(2)}</td>
                <td class="text-end">${parseFloat(item.line_total || 0).toFixed(2)}</td>
                <td class="text-center">
                    <button type="button" class="btn btn-danger btn-sm removeRow"><i class="bi bi-trash"></i></button>
                </td>
                <td class="d-none">${parseFloat(item.cgst_percent || 0).toFixed(2)}</td>
                <td class="d-none">${parseFloat(item.sgst_percent || 0).toFixed(2)}</td>
                <td class="d-none">${parseFloat(item.igst_percent || 0).toFixed(2)}</td>
                <td class="d-none"></td>
            `;
        });

        updateCreditDebitTotals();
    } catch (error) {
        console.error("Error loading items:", error);
    }
}


// ==========================================
// Saving / Updating Operations
// ==========================================

els.saveButton?.addEventListener("click", saveUpdateCreditDebitNote);

async function generateNewCreditDebitNoteNo() {
    try {
        const companyData = await getCompanyProfile(CompanyID);
        const documentType = els.noteType.value;
        const shortCode = companyData ? companyData.short_code : '';
        const selectedDate = els.noteDate.value || new Date().toISOString().split('T')[0];

        const { data, error } = await supabaseClient.rpc("generate_document_number", {
            p_company_id: CompanyID,
            p_company_short_code: shortCode || '',
            p_document_type: documentType,
            p_note_date: selectedDate
        });

        if (error) throw error;
        if (els?.noteNo) els.noteNo.value = data;
    } catch (error) {
        console.error("Error generating Note No:", error);
    }
}

async function saveCreditDebitNoteItems(noteDbId) {
    const rows = els.tbody.rows;
    if (!rows.length) return;

    const items = [];
    for (let i = 0; i < rows.length; i++) {
        const c = rows[i].cells;
        const qty = parseFloat(c[7]?.textContent) || 0;
        const taxableAmt = parseFloat(c[9]?.textContent) || 0;
        const rawItemId = c[1]?.textContent.trim();

        items.push({
            note_id: noteDbId,
            company_id: CompanyID,
            line_no: i + 1,
            item_id: /^\d+$/.test(rawItemId) ? parseInt(rawItemId, 10) : null,
            item_name: c[1]?.textContent.trim(),
            reference_invoice: c[2]?.textContent.trim(),
            description: c[3]?.textContent.trim() || null,
            hsn_sac: c[4]?.textContent.trim() || null,
            unit_id: null,
            qty: qty,
            rate: qty > 0 ? (taxableAmt / qty) : 0,
            non_taxable_amount: parseFloat(c[8]?.textContent) || 0,
            taxable_amount: taxableAmt,
            gst_percent: parseFloat(c[5]?.textContent) || 0,
            cess_percent: parseFloat(c[6]?.textContent) || 0,
            cgst_percent: parseFloat(c[17]?.textContent) || 0,
            sgst_percent: parseFloat(c[18]?.textContent) || 0,
            igst_percent: parseFloat(c[19]?.textContent) || 0,
            sgst_amount: parseFloat(c[10]?.textContent) || 0,
            cgst_amount: parseFloat(c[11]?.textContent) || 0,
            igst_amount: parseFloat(c[12]?.textContent) || 0,
            cess_amount: parseFloat(c[13]?.textContent) || 0,
            line_total: parseFloat(c[15]?.textContent) || 0
        });
    }

    const { error } = await supabaseClient.from("credit_debit_note_items").insert(items);
    if (error) throw error;
}

async function saveUpdateCreditDebitNote() {
    if (!els.saveButton) return;
    els.saveButton.disabled = true;

    try {
        const rawNoteDbId = els.tempFormID.value.trim();
        const isExistingRecord = /^\d+$/.test(rawNoteDbId);
        const noteDbId = isExistingRecord ? parseInt(rawNoteDbId, 10) : null;
        const noteNoStr = els.noteNo.value.trim();

        if (!els.noteType.value) {
            els.saveButton.disabled = false;
            return alertFocus("Please select Note Type.", els.noteType);
        }
        if (!els.noteDate.value) {
            els.saveButton.disabled = false;
            return alertFocus("Please select Note Date.", els.noteDate);
        }
        if (!els.partyCode.value) {
            els.saveButton.disabled = false;
            return alertFocus("Please select a valid Party Name.", els.partyName);
        }
        if (!els.referenceType.value) {
            els.saveButton.disabled = false;
            return alertFocus("Please select Reference Type.", els.referenceType);
        }
        if (els.tbody.rows.length === 0) {
            els.saveButton.disabled = false;
            return alert("Please add at least one item.");
        }

        if (!isExistingRecord && !noteNoStr) await generateNewCreditDebitNoteNo();
        if (!els.noteNo.value) {
            alert("Note No is required.");
            els.saveButton.disabled = false;
            return;
        }

        const headerRecord = {
            company_id: CompanyID,
            note_no: els.noteNo.value.trim(),
            note_type: els.noteType.value,
            note_date: els.noteDate.value,
            party_id: els.partyCode.value.trim(),
            party_name: els.partyName.value.trim(),
            reference_type: els.referenceType.value.trim(),
            reference_id: null,
            reason: els.reason.value.trim() || null,
            remarks: els.remarks.value.trim() || null,
            taxable_amount: parseFloat(document.getElementById("totalTaxAmt")?.textContent) || 0,
            non_taxable_amount: parseFloat(document.getElementById("totalNonTaxAmt")?.textContent) || 0,
            sgst_amount: parseFloat(document.getElementById("totalSGST")?.textContent) || 0,
            cgst_amount: parseFloat(document.getElementById("totalCGST")?.textContent) || 0,
            igst_amount: parseFloat(document.getElementById("totalIGST")?.textContent) || 0,
            cess_amount: parseFloat(document.getElementById("totalCESSAmt")?.textContent) || 0,
            total_gst: parseFloat(document.getElementById("totalGST")?.textContent) || 0,
            total_amount: parseFloat(document.getElementById("totalGrand")?.textContent) || 0,
            round_off: 0,
            status: 'Draft'
        };

        let headerID = noteDbId;

        if (isExistingRecord) {
            headerRecord.updated_by = UserLoginID;
            headerRecord.updated_at = new Date().toISOString();

            const { error: updError } = await supabaseClient
                .from("credit_debit_notes")
                .update(headerRecord)
                .eq("id", noteDbId);
            if (updError) throw updError;

            const { error: delError } = await supabaseClient
                .from("credit_debit_note_items")
                .delete()
                .eq("note_id", noteDbId);
            if (delError) throw delError;

        } else {
            headerRecord.created_by = UserLoginID;
            headerRecord.updated_by = UserLoginID;

            const { data, error: insError } = await supabaseClient
                .from("credit_debit_notes")
                .insert(headerRecord)
                .select("id")
                .single();
            if (insError) throw insError;

            headerID = data.id;
            els.tempFormID.value = headerID;
        }

        await saveCreditDebitNoteItems(headerID);

        // Update status badge to Draft upon save
        if (els.approvalStatus) els.approvalStatus.value = "Draft";
        if (els.approvalBadge) {
            els.approvalBadge.className = "badge bg-secondary px-2 py-1 fs-6";
            els.approvalBadge.textContent = "Draft";
        }

        alert("Credit Debit Note saved successfully.");
        disableForm();

        // If the current user saved it, keep the approve button disabled (self-approval prevention)
        els.approveButton.disabled = true;

    } catch (error) {
        console.error("Save Error:", error);
        alert(error.message || "An error occurred while saving.");
        els.saveButton.disabled = false;
    }
}

// ==========================================
// Saved Notes Search Modal Logic
// ==========================================

els.btnTriggerSearch.addEventListener("click", () => {
    searchSavedNotes(els.searchPaymentInput.value.trim());
});

els.searchPaymentInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        searchSavedNotes(els.searchPaymentInput.value.trim());
    }
});

els.searchPaymentModal.addEventListener('shown.bs.modal', () => {
    els.searchPaymentInput.focus();
    if (els.searchPaymentTableBody.children.length <= 1) {
        searchSavedNotes("");
    }
});

async function searchSavedNotes(searchTerm) {
    els.searchPaymentTableBody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-4">
                <div class="spinner-border spinner-border-sm text-primary me-2"></div> Loading...
            </td>
        </tr>`;

    try {
        let query = supabaseClient
            .from("credit_debit_notes")
            .select("id, note_no, note_date, party_name, total_amount")
            .eq("company_id", CompanyID)
            .order("note_date", { ascending: false })
            .limit(50);

        if (searchTerm) {
            query = query.or(`note_no.ilike.%${searchTerm}%,party_name.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        renderSearchModalTable(data);
    } catch (error) {
        console.error("Error searching notes:", error);
        els.searchPaymentTableBody.innerHTML = `
            <tr><td colspan="5" class="text-center text-danger py-3">Error loading data. Please try again.</td></tr>`;
    }
}

function renderSearchModalTable(data) {
    els.searchPaymentTableBody.innerHTML = "";

    if (!data || data.length === 0) {
        els.searchPaymentTableBody.innerHTML = `
            <tr><td colspan="5" class="text-center text-muted fst-italic py-4">No records found matching your search.</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    data.forEach(row => {
        const tr = document.createElement("tr");
        const dateObj = new Date(row.note_date);
        const formattedDate = !isNaN(dateObj) ? dateObj.toLocaleDateString('en-IN') : row.note_date;
        const amount = parseFloat(row.total_amount || 0).toFixed(2);

        tr.innerHTML = `
            <td class="fw-bold">${row.note_no}</td>
            <td>${formattedDate}</td>
            <td class="text-start">${row.party_name || '-'}</td>
            <td class="text-end fw-bold text-primary">${amount}</td>
            <td>
                <button type="button" class="btn btn-sm btn-primary select-note-btn" data-noteno="${row.note_no}">
                    <i class="bi bi-check2-circle"></i> Select
                </button>
            </td>
        `;
        fragment.appendChild(tr);
    });

    els.searchPaymentTableBody.appendChild(fragment);
}

els.searchPaymentTableBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".select-note-btn");
    if (!btn) return;

    const selectedNoteNo = btn.getAttribute("data-noteno");

    els.noteNo.value = selectedNoteNo;
    els.noteNo.dispatchEvent(new Event("change"));

    const modalInstance = bootstrap.Modal.getInstance(els.searchPaymentModal);
    if (modalInstance) {
        modalInstance.hide();
    }
});

// ==========================================
// Generate PDF Report Logic
// ==========================================

els.reportButton.addEventListener("click", generatePDF);


// ==========================================
// Approval Event Listener
// ==========================================

els.approveButton?.addEventListener("click", async () => {
    const noteDbId = parseInt(els.tempFormID?.value, 10);

    if (!noteDbId || isNaN(noteDbId)) {
        alert("Please load a saved note before approving.");
        return;
    }

    if (!confirm("Are you sure you want to approve this Credit/Debit Note?")) return;

    try {
        const { error } = await supabaseClient
            .from("credit_debit_notes")
            .update({
                status: "Approved",
                approved_by: UserLoginID,
                approved_at: new Date().toISOString()
            })
            .eq("id", noteDbId);

        if (error) throw error;

        // Update UI State to Approved
        if (els.approvalStatus) els.approvalStatus.value = "Approved";
        if (els.approvalBadge) {
            els.approvalBadge.className = "badge bg-success px-2 py-1 fs-6";
            els.approvalBadge.textContent = "Approved";
        }

        // Lock form inputs and disable modification controls completely
        els.modifyButton.disabled = true;
        els.deleteButton.disabled = true;
        els.approveButton.disabled = true;
        els.saveButton.disabled = true;
        els.reportButton.disabled = false; // Keep Report enabled

        alert("Note approved successfully!");
    } catch (err) {
        console.error("Approval error:", err);
        alert("Failed to approve the note. Please try again.");
    }
});