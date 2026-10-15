let paymentIDTimer = null;
let allBills = [];
let billsMap = {};
let deletedPaymentLines = [];
let editingLineRow = null;

// ==========================================
// 1. CACHE DOM ELEMENTS (Optimized Performance & Safety)
// ==========================================
const UI = {
    paymentID: document.getElementById("paymentID"),
    receiptOn: document.getElementById("receiptOn"),
    partyCode: document.getElementById("partyCode"),
    partyName: document.getElementById("partyName"),
    transactionType: document.getElementById("transactionType"),
    paymentMode: document.getElementById("paymentMode"),
    inputBankName: document.getElementById("inputBankName"),
    bankID: document.getElementById("bankIDs"),
    referenceNo: document.getElementById("referenceNo"),
    information: document.getElementById("information"),
    paymentAmount: document.getElementById("paymentAmount"),
    deductionAmount: document.getElementById("deductionAmount"),

    // Buttons
    saveBtn: document.getElementById("saveButton"),
    modifyBtn: document.getElementById("modifyButton"),
    newBtn: document.getElementById("newButton"),
    addBillBtn: document.getElementById("addBillDetailsButton"),

    // Bill Line Inputs
    billNumInput: document.getElementById("billNumberInput"),
    billDate: document.getElementById("billDate"),
    billAmount: document.getElementById("billAmount"),
    billBalance: document.getElementById("billBalance"),
    accountedAmount: document.getElementById("accountedAmount"),
    otherDeduction: document.getElementById("otherDeductionAmount"),
    tdsDeduction: document.getElementById("tdsDeductionAmount"),
    narration: document.getElementById("narration"),

    // Table
    tbody: document.querySelector("#paymentDetails tbody")
};

// ==========================================
// 2. INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    await loadSuggestions("partySuggestions", "PartyDetails", CompanyID);

    if (UI.receiptOn) UI.receiptOn.value = new Date().toISOString().split("T")[0];
    if (UI.transactionType) UI.transactionType.value = "Debit";
    if (UI.addBillBtn) UI.addBillBtn.disabled = false;

    loadDefaultBank();
    toggleSettlementMode();
});

// ==========================================
// 3. EVENT LISTENERS
// ==========================================
if (UI.saveBtn) UI.saveBtn.addEventListener("click", saveUpdatedDebitPayments);
if (UI.paymentMode) UI.paymentMode.addEventListener("change", toggleSettlementMode);
if (UI.paymentAmount) UI.paymentAmount.addEventListener("input", calculateSuspenseAmount);
if (UI.deductionAmount) UI.deductionAmount.addEventListener("input", calculateSuspenseAmount);

// Payment ID Watchers
if (UI.paymentID) {
    UI.paymentID.addEventListener("input", e => {
        clearTimeout(paymentIDTimer);
        paymentIDTimer = setTimeout(() => loadPaymentIDSuggestions(CompanyID, e.target.value.trim()), 300);
    });

    UI.paymentID.addEventListener("change", async e => {
        const paymentID = e.target.value.trim();
        if (paymentID) await loadPaymentDetails(paymentID);
    });
}

// Party Name Watcher
if (UI.partyName) {
    UI.partyName.addEventListener("change", async () => {
        const partyCode = UI.partyCode.value.trim();
        if (!partyCode) {
            allBills = [];
            billsMap = {};
            refreshBillDatalist();
            return;
        }
        await getPendingBillDetails(partyCode);

        // Only check suspense if inserting a new record
        if (UI.saveBtn && UI.saveBtn.dataset.mode !== "update") {
            await checkSuspensePayments(partyCode);
        }
    });
}

// New Button
if (UI.newBtn) {
    UI.newBtn.addEventListener("click", () => {
        enableForm();
        clearForm();
        if (UI.receiptOn) UI.receiptOn.value = new Date().toISOString().split("T")[0];
        if (UI.transactionType) UI.transactionType.value = "Debit";
        loadDefaultBank();

        UI.saveBtn.dataset.mode = "insert";
        UI.saveBtn.innerHTML = '<i class="bi bi-save"></i> Save';
        UI.saveBtn.disabled = false;
        if (UI.modifyBtn) UI.modifyBtn.disabled = true;

        if (UI.tbody) UI.tbody.innerHTML = "";
        deletedPaymentLines = [];

        syncTableUpdates();
        enableTableButtons();
    });
}

// Modify Button
if (UI.modifyBtn) {
    UI.modifyBtn.addEventListener("click", () => {
        enableForm();
        UI.modifyBtn.disabled = true;
        if (UI.transactionType) UI.transactionType.disabled = true;
        if (UI.paymentID) UI.paymentID.disabled = true;

        if (UI.saveBtn) UI.saveBtn.disabled = false;
        if (UI.addBillBtn) UI.addBillBtn.disabled = false;

        enableTableButtons();
    });
}

// Add Bill Details Button
if (UI.addBillBtn) {
    UI.addBillBtn.addEventListener("click", addBillDetailRow);
}

// ==========================================
// 4. CORE PAYMENT LOGIC
// ==========================================
async function generatePaymentID(companyID) {
    const { data, error } = await supabaseClient.rpc("generate_payment_id", { p_company_id: companyID });
    if (error) throw error;
    return data;
}

async function saveUpdatedDebitPayments() {
    if (!UI.saveBtn) return;
    const originalText = UI.saveBtn.innerHTML;

    try {
        if (!validatePaymentForm()) return;

        const suspenseAmount = calculateSuspenseAmount();
        if (suspenseAmount < 0) return alert("Allocated amount exceeds Debit Amount.");

        UI.saveBtn.disabled = true;
        UI.saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

        const paymentPayload = {
            ReceiptOn: UI.receiptOn.value,
            SuspenseAmount: suspenseAmount || 0,
            PartyCode: UI.partyCode.value.trim(),
            TransactionType: UI.transactionType.value,
            PaymentMode: UI.paymentMode.value,
            BankName: UI.inputBankName.value,
            BankID: UI.bankID.value,
            ReferenceNo: UI.referenceNo.value,
            PaymentAmount: parseFloat(UI.paymentAmount.value) || 0,
            DeductionAmount: parseFloat(UI.deductionAmount.value) || 0,
            Narration: UI.information.value,
            company_id: CompanyID
        };

        let error;

        if (UI.saveBtn.dataset.mode === "insert") {
            const paymentID = await generatePaymentID(CompanyID);
            UI.paymentID.value = paymentID;
            paymentPayload.PaymentID = paymentID;
            paymentPayload.created_by = UserLoginID;
            paymentPayload.created_at = localtimeStamp;

            ({ error } = await supabaseClient.from("PaymentDetails").insert(paymentPayload));
            if (error) throw error;

            UI.saveBtn.dataset.mode = "update";

        } else if (UI.saveBtn.dataset.mode === "update") {
            paymentPayload.PaymentID = UI.paymentID.value.trim();
            paymentPayload.update_by = UserLoginID;
            paymentPayload.update_at = localtimeStamp;

            ({ error } = await supabaseClient
                .from("PaymentDetails")
                .update(paymentPayload)
                .eq("PaymentID", paymentPayload.PaymentID)
                .eq("company_id", CompanyID));
            if (error) throw error;
        }

        await savePaymentLineItems(paymentPayload.PaymentID);
        await deleteRemovedLineItems();
        showToast("Payment saved successfully");

        deletedPaymentLines = [];
        disableForm();
        UI.saveBtn.disabled = true;
        if (UI.modifyBtn) UI.modifyBtn.disabled = false;
        disableTableButtons();

    } catch (err) {
        console.error("Save failed:", err);
        alert(`Save failed: ${err.message}`);
    } finally {
        UI.saveBtn.innerHTML = originalText;
        if (UI.saveBtn.dataset.mode === "insert") UI.saveBtn.disabled = false;
    }
}

function validatePaymentForm() {
    if (!UI.receiptOn.value) return (alert("Payment Date is required"), UI.receiptOn.focus(), false);
    if (!UI.partyCode.value.trim()) return (alert("Vendor is required"), UI.partyName.focus(), false);
    if (!UI.transactionType.value) return (alert("Transaction Type is required"), UI.transactionType.focus(), false);
    if (!UI.paymentMode.value) return (alert("Payment Mode is required"), UI.paymentMode.focus(), false);
    if (UI.paymentMode.value !== "Cash" && !UI.inputBankName.value.trim()) return (alert("Bank Name is required"), UI.inputBankName.focus(), false);
    if ((parseFloat(UI.paymentAmount.value) || 0) <= 0) return (alert("Debit Amount must be greater than zero"), UI.paymentAmount.focus(), false);
    return true;
}

// ==========================================
// 5. LINE ITEMS & TABLE LOGIC
// ==========================================
function syncTableUpdates() {
    renumberRows();
    calculateTotals();
    refreshBillDatalist();
}

function addBillDetailRow() {
    if (!UI.billNumInput) return;

    const selectedBill = UI.billNumInput.value.trim();
    if (!selectedBill) return alert("Please select a Bill");

    const billReferenceNo = selectedBill.split(" - ")[0].trim();
    const billInfo = billsMap[billReferenceNo];

    if (!billInfo && !editingLineRow) return alert("Invalid Bill Selected");

    const narration = UI.narration ? UI.narration.value.trim() : "";
    const accountedAmount = parseFloat(UI.accountedAmount?.value) || 0;
    const otherDeduction = parseFloat(UI.otherDeduction?.value) || 0;
    const tdsDeduction = parseFloat(UI.tdsDeduction?.value) || 0;
    const totalPayment = accountedAmount + otherDeduction + tdsDeduction;

    if (!UI.tbody) return;

    if (editingLineRow) {
        // --- UPDATE EXISTING ROW ---
        const exists = [...UI.tbody.rows].some(r => r !== editingLineRow && r.cells[1]?.textContent.trim() === billReferenceNo);
        if (exists) return alert("Bill already added in another row.");

        editingLineRow.cells[1].textContent = billReferenceNo;
        // BillNo shouldn't strictly change on edit unless they re-selected, but handled here safely
        editingLineRow.cells[2].textContent = billInfo ? billInfo.BillNo : editingLineRow.cells[2].textContent;
        editingLineRow.cells[3].textContent = narration;
        editingLineRow.cells[4].textContent = accountedAmount.toFixed(2);
        editingLineRow.cells[5].textContent = otherDeduction.toFixed(2);
        editingLineRow.cells[6].textContent = tdsDeduction.toFixed(2);
        editingLineRow.cells[7].textContent = totalPayment.toFixed(2);

        if (editingLineRow.dataset.status === "Old") editingLineRow.dataset.status = "Modified";
    } else {
        // --- ADD NEW ROW ---
        const exists = [...UI.tbody.rows].some(row => row.cells[1]?.textContent.trim() === billReferenceNo);
        if (exists) return alert("Bill already added.");

        const row = document.createElement("tr");
        row.dataset.status = "New";
        row.dataset.id = "";

        row.innerHTML = `
            <td></td>
            <td>${billInfo.BillReferenceNo}</td>
            <td>${billInfo.BillNo || ""}</td>
            <td>${narration}</td>
            <td class="text-end">${accountedAmount.toFixed(2)}</td>
            <td class="text-end">${otherDeduction.toFixed(2)}</td>
            <td class="text-end">${tdsDeduction.toFixed(2)}</td>
            <td class="text-end">${totalPayment.toFixed(2)}</td>
            <td>
                <button type="button" class="btn btn-sm btn-primary edit-row me-1" title="Edit">
                    <i class="bi bi-pencil-square"></i>
                </button>
                <button type="button" class="btn btn-sm btn-danger remove-row" title="Delete">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        UI.tbody.appendChild(row);
    }
    toggleEmptyTableState("#paymentDetailsBody", "No allocation details added", 9);
    syncTableUpdates();
    clearBillInputs();
}

if (UI.tbody) {
    UI.tbody.addEventListener("click", function (e) {
        // Edit Button Click
        const editBtn = e.target.closest(".edit-row");
        if (editBtn) {
            const row = editBtn.closest("tr");
            editingLineRow = row;

            // Load row data into inputs
            UI.billNumInput.value = row.cells[1].textContent.trim();
            if (UI.narration) UI.narration.value = row.cells[3].textContent.trim();
            if (UI.accountedAmount) UI.accountedAmount.value = row.cells[4].textContent.trim();
            if (UI.otherDeduction) UI.otherDeduction.value = row.cells[5].textContent.trim();
            if (UI.tdsDeduction) UI.tdsDeduction.value = row.cells[6].textContent.trim();

            if (UI.addBillBtn) {
                UI.addBillBtn.innerHTML = '<i class="bi bi-check-circle"></i> Update';
                UI.addBillBtn.classList.replace("btn-primary", "btn-warning");
            }

            // Trigger change to load date & balances
            UI.billNumInput.dispatchEvent(new Event("change"));
            return;
        }

        // Remove Button Click
        const removeBtn = e.target.closest(".remove-row");
        if (removeBtn) {
            const row = removeBtn.closest("tr");
            if (editingLineRow === row) clearBillInputs();
            if (row.dataset.status === "Old" && row.dataset.id) deletedPaymentLines.push(row.dataset.id);

            row.remove();
            toggleEmptyTableState("#paymentDetailsBody", "No allocation details added", 9);
            syncTableUpdates();
        }
    });
}

function clearBillInputs() {
    [UI.billNumInput, UI.billDate, UI.billAmount, UI.billBalance, UI.narration]
        .forEach(el => { if (el) el.value = ""; });

    [UI.accountedAmount, UI.otherDeduction, UI.tdsDeduction]
        .forEach(el => { if (el) el.value = "0.00"; });

    editingLineRow = null;
    if (UI.addBillBtn) {
        UI.addBillBtn.innerHTML = "Add";
        UI.addBillBtn.classList.remove("btn-warning");
        UI.addBillBtn.classList.add("btn-primary");
    }
    refreshBillDatalist();
}

function calculateTotals() {
    let allocated = 0, other = 0, tds = 0, total = 0;

    document.querySelectorAll("#paymentDetails tbody tr").forEach(row => {
        allocated += parseFloat(row.cells[4]?.textContent) || 0;
        other += parseFloat(row.cells[5]?.textContent) || 0;
        tds += parseFloat(row.cells[6]?.textContent) || 0;
        total += parseFloat(row.cells[7]?.textContent) || 0;
    });

    const els = {
        alloc: document.getElementById("totalAllocatedAmount"),
        other: document.getElementById("totalOtherDeductionAmount"),
        tds: document.getElementById("totalTDSDeductionAmount"),
        tot: document.getElementById("totalPaymentAmount")
    };

    if (els.alloc) els.alloc.textContent = allocated.toFixed(2);
    if (els.other) els.other.textContent = other.toFixed(2);
    if (els.tds) els.tds.textContent = tds.toFixed(2);
    if (els.tot) els.tot.textContent = total.toFixed(2);

    calculateSuspenseAmount();
}

function calculateSuspenseAmount() {
    const paymentAmount = safeNumber(UI.paymentAmount?.value);
    const deductionAmount = safeNumber(UI.deductionAmount?.value);

    const allocEl = document.getElementById("totalAllocatedAmount");
    const otherEl = document.getElementById("totalOtherDeductionAmount");
    const tdsEl = document.getElementById("totalTDSDeductionAmount");

    const totalAllocated = allocEl ? safeNumber(allocEl.textContent) : 0;
    const totalOther = otherEl ? safeNumber(otherEl.textContent) : 0;
    const totalTDS = tdsEl ? safeNumber(tdsEl.textContent) : 0;

    const suspense = (paymentAmount + deductionAmount) - (totalAllocated + totalOther + totalTDS);
    const suspenseEl = document.getElementById("suspenseAmount");

    if (suspenseEl) {
        suspenseEl.textContent = suspense.toFixed(2);
        suspenseEl.classList.toggle("text-danger", suspense > 0);
        suspenseEl.classList.toggle("text-success", suspense <= 0);
    }
    return suspense;
}

function disableTableButtons() {
    document.querySelectorAll("#paymentDetails tbody .edit-row, #paymentDetails tbody .remove-row")
        .forEach(btn => btn.disabled = true);
}

function enableTableButtons() {
    document.querySelectorAll("#paymentDetails tbody .edit-row, #paymentDetails tbody .remove-row")
        .forEach(btn => btn.disabled = false);
}

function renumberRows() {
    document.querySelectorAll("#paymentDetails tbody tr").forEach((row, index) => {
        if (row.cells[0]) row.cells[0].textContent = index + 1;
    });
}

// ==========================================
// 6. DB OPERATIONS (Line Items & Load)
// ==========================================
async function savePaymentLineItems(paymentID) {
    const newRecords = [];
    const modifiedRecords = [];

    document.querySelectorAll("#paymentDetails tbody tr").forEach(row => {
        const status = row.dataset.status;
        if (status === "Old") return;

        const record = {
            PaymentID: paymentID,
            InvoiceNo: row.cells[1].textContent.trim(), // In Debit, this stores BillReferenceNo
            VendorBillNo: row.cells[2].textContent.trim(),
            Narration: row.cells[3].textContent.trim(),
            PaymentAmount: parseFloat(row.cells[4].textContent) || 0,
            OtherDeductionAmount: parseFloat(row.cells[5].textContent) || 0,
            TDSDeductionAmount: parseFloat(row.cells[6].textContent) || 0,
            company_id: CompanyID
        };

        if (status === "New") {
            record.created_by = UserLoginID;
            record.created_at = localtimeStamp;
            newRecords.push(record);
        } else if (status === "Modified") {
            record.id = row.dataset.id;
            modifiedRecords.push(record);
        }
    });

    if (newRecords.length > 0) {
        const { error } = await supabaseClient.from("PaymentLineItems").insert(newRecords);
        if (error) throw error;
    }

    if (modifiedRecords.length > 0) {
        for (const record of modifiedRecords) {
            const { id, ...updateData } = record;
            const { error } = await supabaseClient.from("PaymentLineItems").update(updateData).eq("id", id);
            if (error) throw error;
        }
    }
    await loadPaymentLineItems(paymentID);
}

async function deleteRemovedLineItems() {
    if (deletedPaymentLines.length === 0) return;
    const { error } = await supabaseClient.from("PaymentLineItems").delete().in("id", deletedPaymentLines);
    if (error) throw error;
    deletedPaymentLines = [];
}

async function loadPaymentLineItems(paymentID) {
    if (!UI.tbody) return;
    UI.tbody.innerHTML = "";

    const { data, error } = await supabaseClient
        .from("PaymentLineItems")
        .select("*")
        .eq("PaymentID", paymentID)
        .eq("company_id", CompanyID);

    if (error) return console.error(error);

    data?.forEach(item => {
        const row = document.createElement("tr");
        row.dataset.status = "Old";
        row.dataset.id = item.id;
        row.innerHTML = `
            <td></td>
            <td>${item.InvoiceNo || ""}</td> 
            <td>${item.VendorBillNo || ""}</td>
            <td>${item.Narration || ""}</td>
            <td class="text-end">${safeNumber(item.PaymentAmount).toFixed(2)}</td>
            <td class="text-end">${safeNumber(item.OtherDeductionAmount).toFixed(2)}</td>
            <td class="text-end">${safeNumber(item.TDSDeductionAmount).toFixed(2)}</td>
            <td class="text-end">${(safeNumber(item.PaymentAmount) + safeNumber(item.OtherDeductionAmount) + safeNumber(item.TDSDeductionAmount)).toFixed(2)}</td>
            <td>
                <button type="button" class="btn btn-sm btn-primary edit-row me-1" title="Edit">
                    <i class="bi bi-pencil-square"></i>
                </button>
                <button type="button" class="btn btn-sm btn-danger remove-row" title="Delete">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        UI.tbody.appendChild(row);
    });

    syncTableUpdates();
}

async function loadPaymentDetails(paymentID) {
    const { data, error } = await supabaseClient
        .from("PaymentDetails")
        .select("*")
        .eq("company_id", CompanyID)
        .eq("PaymentID", paymentID)
        .eq("TransactionType", "Debit")
        .maybeSingle();

    if (error || !data) return console.error("Payment load error or not found.");

    const party = await getPartyDetailsByCode(data.PartyCode);

    if (UI.receiptOn) UI.receiptOn.value = data.ReceiptOn ?? "";
    if (UI.partyCode) UI.partyCode.value = data.PartyCode ?? "";
    if (UI.partyName) UI.partyName.value = party?.PartyName || "";
    if (UI.transactionType) UI.transactionType.value = data.TransactionType ?? "";
    if (UI.paymentMode) UI.paymentMode.value = data.PaymentMode ?? "";
    if (UI.inputBankName) UI.inputBankName.value = data.BankName ?? "";
    if (UI.referenceNo) UI.referenceNo.value = data.ReferenceNo ?? "";
    if (UI.paymentAmount) UI.paymentAmount.value = data.PaymentAmount ?? 0;
    if (UI.deductionAmount) UI.deductionAmount.value = data.DeductionAmount ?? 0;
    if (UI.information) UI.information.value = data.Narration ?? "";

    if (UI.saveBtn) {
        UI.saveBtn.dataset.mode = "update";
        UI.saveBtn.innerHTML = '<i class="bi bi-pencil-square"></i> Update';
        UI.saveBtn.disabled = true;
    }
    if (UI.modifyBtn) UI.modifyBtn.disabled = false;

    disableForm();
    calculateSuspenseAmount();
    await loadPaymentLineItems(data.PaymentID);

    if (UI.addBillBtn) UI.addBillBtn.disabled = true;
    disableTableButtons();
}

async function loadPaymentIDSuggestions(companyID, inputVal = "") {
    const datalist = document.getElementById("paymentIDSuggestions");
    if (!datalist) return;
    datalist.innerHTML = "";

    const { data } = await supabaseClient.from("PaymentDetails")
        .select("PaymentID").eq("company_id", companyID).eq("TransactionType", "Debit")
        .ilike("PaymentID", `%${inputVal}%`).order("PaymentID", { ascending: true }).limit(50);

    data?.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.PaymentID;
        datalist.appendChild(opt);
    });
}

// ==========================================
// 7. BILL DROPDOWN & FILTERING
// ==========================================
if (UI.billNumInput) {
    UI.billNumInput.addEventListener("input", function () {
        const searchText = this.value.toLowerCase();
        const datalist = document.getElementById("billNumberList");
        if (!datalist) return;

        datalist.innerHTML = "";
        const addedBills = new Set();

        document.querySelectorAll("#paymentDetails tbody tr").forEach(row => {
            const billNo = row.cells[1]?.textContent?.trim();
            if (billNo) addedBills.add(billNo);
        });

        allBills
            .filter(inv => (inv.BillReferenceNo || "").toLowerCase().includes(searchText))
            .forEach(inv => {
                if (!addedBills.has(inv.BillReferenceNo)) {
                    const option = document.createElement("option");
                    option.value = inv.BillReferenceNo;
                    datalist.appendChild(option);
                }
            });
    });

    UI.billNumInput.addEventListener("change", function () {
        const bill = billsMap[this.value.trim()];
        if (!bill) return;

        if (UI.billDate) UI.billDate.value = bill.AccountedDate ? bill.AccountedDate.split("T")[0] : "";
        if (UI.billAmount) UI.billAmount.value = Number(bill.ChargeTotalAmount || 0).toFixed(2);
        if (UI.billBalance) UI.billBalance.value = Number(bill.BalanceAmount || 0).toFixed(2);
    });
}

async function getPendingBillDetails(partyCode) {
    if (!partyCode) return (allBills = [], billsMap = {}, refreshBillDatalist());

    const { data } = await supabaseClient
        .from("VendorBillPaymentView")
        .select(`BillReferenceNo, BillNo, AccountedDate, ChargeTotalAmount, BalanceAmount`)
        .neq("PaymentStatus", "Paid").eq("PartyCode", partyCode).eq("company_id", CompanyID)
        .order("AccountedDate", { ascending: false });

    allBills = data || [];
    billsMap = {};
    allBills.forEach(inv => billsMap[inv.BillReferenceNo] = inv);
    refreshBillDatalist();
}

function refreshBillDatalist() {
    const datalist = document.getElementById("billNumberList");
    if (!datalist) return;
    datalist.innerHTML = "";

    const addedBills = new Set();
    document.querySelectorAll("#paymentDetails tbody tr").forEach(row => {
        const billNo = row.cells[1]?.textContent.trim();
        if (billNo) addedBills.add(billNo);
    });

    allBills.forEach(inv => {
        if (!addedBills.has(inv.BillReferenceNo)) {
            const option = document.createElement("option");
            option.value = inv.BillReferenceNo;
            datalist.appendChild(option);
        }
    });
}

// ==========================================
// 8. UTILS & MODALS
// ==========================================
function toggleSettlementMode() {
    if (!UI.paymentMode) return;
    const mode = UI.paymentMode.value;
    const refLabel = document.getElementById("referenceNoLabel");

    if (mode === "Net Settlement") {
        if (UI.inputBankName) {
            UI.inputBankName.value = "";
            UI.inputBankName.disabled = true;
            UI.inputBankName.required = false;
        }
        if (refLabel) refLabel.textContent = "Settlement Ref No";
    } else {
        if (UI.inputBankName) {
            UI.inputBankName.disabled = false;
            UI.inputBankName.required = true;
        }
        if (refLabel) refLabel.textContent = "Reference No";
    }
}

async function checkSuspensePayments(partyCode) {
    if (!partyCode) return;
    const { data } = await supabaseClient.from("PaymentDetails")
        .select(`PaymentID, ReceiptOn, ReferenceNo, PaymentAmount, DeductionAmount, SuspenseAmount`)
        .eq("PartyCode", partyCode).eq("TransactionType", "Debit").eq("company_id", CompanyID)
        .gt("SuspenseAmount", 0).order("ReceiptOn", { ascending: false });

    if (data && data.length > 0) {
        showSuspenseModal(data);
        if (UI.saveBtn) UI.saveBtn.disabled = true;
        if (UI.addBillBtn) UI.addBillBtn.disabled = true;
    } else {
        closeSuspenseModal();
        if (UI.saveBtn) UI.saveBtn.disabled = false;
        if (UI.addBillBtn) UI.addBillBtn.disabled = false;
    }
}

function showSuspenseModal(rows) {
    const tbody = document.getElementById("suspenseTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    window.suspensePaymentSelected = false;

    rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${r.PaymentID}</td>
            <td>${typeof formatDate === 'function' ? formatDate(r.ReceiptOn) : (r.ReceiptOn || "")}</td>
            <td>${r.ReferenceNo || ""}</td>
            <td class="text-end">${safeNumber(r.PaymentAmount).toFixed(2)}</td>
            <td class="text-end">${safeNumber(r.DeductionAmount).toFixed(2)}</td>
            <td class="text-end fw-bold text-danger">${safeNumber(r.SuspenseAmount).toFixed(2)}</td>
            <td><button class="btn btn-sm btn-primary modify-suspense-btn">Modify</button></td>
        `;
        tr.querySelector(".modify-suspense-btn").onclick = () => {
            window.suspensePaymentSelected = true;
            closeSuspenseModal();
            UI.paymentID.value = r.PaymentID;
            UI.paymentID.dispatchEvent(new Event("change", { bubbles: true }));
            showToast("Modify existing payment to clear suspense");
        };
        tbody.appendChild(tr);
    });

    const modalEl = document.getElementById("suspenseModal");
    if (modalEl) (bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl, { backdrop: "static", keyboard: false })).show();
}

function closeSuspenseModal() {
    const modalEl = document.getElementById("suspenseModal");
    if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
}

const suspenseModalEl = document.getElementById("suspenseModal");
if (suspenseModalEl) {
    suspenseModalEl.addEventListener("hidden.bs.modal", () => {
        if (!window.suspensePaymentSelected) {
            if (UI.saveBtn) UI.saveBtn.disabled = false;
            if (UI.addBillBtn) UI.addBillBtn.disabled = false;
        }
        if (UI.paymentID) UI.paymentID.focus();
    });
}

// Search Modal Setup
document.addEventListener("DOMContentLoaded", () => {
    const modalEl = document.getElementById("searchPaymentModal");
    const inputEl = document.getElementById("searchSavedPaymentInput");
    const tbodyEl = document.getElementById("searchPaymentTableBody");
    const btnSearch = document.getElementById("btnTriggerSearch");

    if (modalEl && tbodyEl && inputEl) {
        modalEl.addEventListener('show.bs.modal', () => {
            inputEl.value = "";
            tbodyEl.innerHTML = `<tr><td colspan="6" class="text-center text-muted fst-italic py-3">Enter search criteria to find payments...</td></tr>`;
            searchSavedPayments();
        });

        if (btnSearch) btnSearch.addEventListener("click", searchSavedPayments);
        inputEl.addEventListener("keypress", (e) => {
            if (e.key === "Enter") { e.preventDefault(); searchSavedPayments(); }
        });

        tbodyEl.addEventListener("click", async (e) => {
            const btn = e.target.closest(".select-payment-btn");
            if (!btn) return;
            bootstrap.Modal.getInstance(modalEl)?.hide();
            if (UI.paymentID) {
                UI.paymentID.value = btn.dataset.id;
                await loadPaymentDetails(btn.dataset.id);
            }
        });
    }
});

async function searchSavedPayments() {
    const inputEl = document.getElementById("searchSavedPaymentInput");
    const tbodyEl = document.getElementById("searchPaymentTableBody");
    if (!inputEl || !tbodyEl) return;

    const query = inputEl.value.trim();
    tbodyEl.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm"></span> Searching...</td></tr>`;

    const { data: payData, error } = await supabaseClient.from("PaymentDetails")
        .select("PaymentID, ReceiptOn, PartyCode, PaymentMode, PaymentAmount, ReferenceNo")
        .eq("company_id", CompanyID).eq("TransactionType", "Debit")
        .or(`PaymentID.ilike.%${query}%,ReferenceNo.ilike.%${query}%,PartyCode.ilike.%${query}%`)
        .order("ReceiptOn", { ascending: false }).limit(50);

    if (error) return (tbodyEl.innerHTML = `<tr><td colspan="6" class="text-center text-danger fw-bold py-3">Error fetching data.</td></tr>`);
    if (!payData?.length) return (tbodyEl.innerHTML = `<tr><td colspan="6" class="text-center text-muted fst-italic py-3">No payments found.</td></tr>`);

    const pCodes = [...new Set(payData.map(i => i.PartyCode))];
    let pMap = {};
    if (pCodes.length) {
        const { data: pData } = await supabaseClient.from("PartyDetails").select("PartyCode, PartyName").eq("company_id", CompanyID).in("PartyCode", pCodes);
        pData?.forEach(p => pMap[p.PartyCode] = p.PartyName);
    }

    tbodyEl.innerHTML = "";
    payData.forEach(p => {
        const displayDate = typeof formatDate === 'function' ? formatDate(p.ReceiptOn) : p.ReceiptOn;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="badge bg-secondary">${p.PaymentID}</span></td>
            <td>${displayDate || "-"}</td>
            <td class="text-start fw-bold">${pMap[p.PartyCode] || p.PartyCode}</td>
            <td>${p.PaymentMode || "-"}</td>
            <td class="text-end fw-bold text-danger">${safeNumber(p.PaymentAmount).toFixed(2)}</td>
            <td><button type="button" class="btn btn-sm btn-success select-payment-btn" data-id="${p.PaymentID}"><i class="bi bi-check2-circle"></i> Select</button></td>
        `;
        tbodyEl.appendChild(tr);
    });
}