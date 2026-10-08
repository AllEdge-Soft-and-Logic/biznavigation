document.addEventListener('DOMContentLoaded', async () => {
    try {
        const accountedDate = document.getElementById('accountedDate');
        if (accountedDate) {
            accountedDate.value = new Date().toISOString().split('T')[0];
        }
        await loadAccountSuggestions(
            "partySuggestions",
            "partyName",
            "partyCode",
            CompanyID
        );

        const chargesType = document.getElementById('chargesType');
        if (chargesType) {
            chargesType.addEventListener(
                'change',
                onChargeTypeOrPartyChange
            );
        }
        await loadExpenseTypeDropdown();


        await loadTaxData();
        loadDatalistSuggestions({
            inputId: "billReferenceNo",
            datalistId: "billReferenceNoSuggestions",
            tableName: "VendorBillingDetails",
            columnName: "BillReferenceNo"
        });

        loadDatalistSuggestions({
            inputId: "vendorBillNo",
            datalistId: "vendorBillNoSuggestions",
            tableName: "VendorBillingDetails",
            columnName: "BillNo"
        });
        document.getElementById("expenseType").value = "Purchase";
        document.getElementById("expenseFor").value = "Service";
    } catch (error) {
        console.error('Initialization Error:', error);
    }
});

document.getElementById("expenseType").onchange = loadExpenseForDropdown;
saveButton.addEventListener('click', saveAndUpdateVendorBills);
// Save & Update Vendor Bill
async function saveAndUpdateVendorBills() {
    if (saveButton.disabled) return;

    saveButton.disabled = true;
    try {

        const mode = document.getElementById('mode').value;
        let billReferenceNo = document.getElementById('billReferenceNo').value;
        const billedAmount =
            Number(document.getElementById("vendorBilledAmount").value || 0);

        if (billedAmount <= 0) {
            alert("Vendor Bill Amount must be greater than zero.");
            saveButton.disabled = false;
            return;
        }
        if (!validateBillTotal()) {
            saveButton.disabled = false;
            return;
        }
        // Check shipment table
        const rows = document.querySelectorAll("#pendingShipmentTable tbody tr");

        if (rows.length === 0) {
            alert("Please add at least one shipment before saving the Vendor Bill.");
            saveButton.disabled = false;
            return;
        }

        const $ = id => document.getElementById(id);
        const billDate = $("vendorBillDate").value;
        let dueDate = $("vendorDueDate").value;

        if (!dueDate && billDate) {
            const date = new Date(billDate);
            date.setDate(date.getDate() + 30);
            dueDate = date.toISOString().split("T")[0]; // YYYY-MM-DD
            document.getElementById("vendorDueDate").value = dueDate;
        }


        const vBillsDetails = {
            ExpenseType: $("expenseType").value,
            ExpenseFor: $("expenseFor").value,
            AccountedDate: $("accountedDate").value,
            PartyCode: $("partyCode").value,
            PartyName: $("partyName").value,
            BillNo: $("vendorBillNo").value,
            BillDate: billDate,
            BilledAmount: Number($("vendorBilledAmount").value || 0),
            DueDate: dueDate,
            Information: $("vendorBillInformation").value
        };
        console.log('Vendor Bill Details:', vBillsDetails);

        let error;

        if (mode === 'insert') {
            billReferenceNo = await generateBillReferenceNo();

            document.getElementById("billReferenceNo").value = billReferenceNo;

            Object.assign(vBillsDetails, {
                BillReferenceNo: billReferenceNo,
                company_id: CompanyID,
                created_by: UserLoginID,
                created_at: localtimeStamp,
                Status: 'Pending'
            });

            ({ error } = await supabaseClient
                .from('VendorBillingDetails')
                .insert([vBillsDetails]));
            if (error) throw error;
        } else {

            Object.assign(vBillsDetails, {
                updated_by: UserLoginID,
                updated_at: localtimeStamp
            });

            ({ error } = await supabaseClient
                .from('VendorBillingDetails')
                .update(vBillsDetails)
                .eq('company_id', CompanyID)
                .eq('BillReferenceNo', billReferenceNo));

            if (error) throw error;
        }

        disableForm();
        modifyButton.disabled = false;

        document.getElementById("addChargesDetails").disabled = true;
        document.querySelectorAll(".delete-row").forEach(btn => {
            btn.disabled = true;
        });
        await saveVendorBillingCharges();
        await unlockVendorBill();

        showToast(
            mode === 'insert'
                ? 'Vendor Bill Saved Successfully'
                : 'Vendor Bill Updated Successfully'
        );
        document.getElementById("mode").value = "update";

        saveButton.innerHTML =
            '<i class="bi bi-save"></i> Update';
    } catch (error) {
        console.error('Vendor Bill Save Error:', error);
        showToast(error.message || 'Failed to save Vendor Bill');
        saveButton.disabled = false;
        throw error;
    }
}

async function loadExpenseTypeDropdown() {
    const expenseTypeList = document.getElementById('expenseTypeList');

    expenseTypeList.innerHTML = '';

    const { data, error } = await supabaseClient
        .from('dropdown_list')
        .select('description')
        .eq('type_of_value', 'expenseType')
        .order('description', { ascending: true });

    if (error) {
        console.error('Error loading expense types:', error);
        return;
    }

    data.forEach(item => {
        const option = document.createElement('option');
        option.value = item.description;
        expenseTypeList.appendChild(option);
    });
}

// Expense For Load
async function loadExpenseForDropdown() {

    const expenseType = document.getElementById('expenseType').value.trim();

    const expenseForList = document.getElementById('expenseForList');
    const expenseForInput = document.getElementById('expenseFor');

    expenseForList.innerHTML = '';
    expenseForInput.value = '';

    if (!expenseType) return;

    // Convert:
    // "Administrative Expenses" => "administrativeExpenses"
    const typeOfValue = expenseType
        .split(/\s+/)
        .map((word, index) =>
            index === 0
                ? word.toLowerCase()
                : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join('');

    const { data, error } = await supabaseClient
        .from('dropdown_list')
        .select('description')
        .eq('type_of_value', typeOfValue)
        .order('description', { ascending: true });

    if (error) {
        console.error('Error loading expense for list:', error);
        return;
    }

    data.forEach(item => {
        const option = document.createElement('option');
        option.value = item.description;
        expenseForList.appendChild(option);
    });
}

function debounce(fn, delay = 300) {

    let timer;

    return (...args) => {

        clearTimeout(timer);

        timer = setTimeout(
            () => fn(...args),
            delay
        );
    };
}
// Populate form fields
function populateVendorBillingForm(data) {
    const fields = {
        expenseType: data.ExpenseType,
        expenseFor: data.ExpenseFor,
        billReferenceNo: data.BillReferenceNo,
        accountedDate: data.AccountedDate,
        partyCode: data.PartyCode,
        partyName: data.PartyName,
        vendorBillNo: data.BillNo,
        vendorBillDate: data.BillDate,
        vendorBilledAmount: data.BilledAmount,
        vendorDueDate: data.DueDate,
        vendorBillInformation: data.Information
    };
    Object.entries(fields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value ?? "";
        }
    });
}

// Get billing details by column/value
async function getVendorBillingDetails(column, value) {
    try {

        const { data, error } = await supabaseClient
            .from("VendorBillingDetails")
            .select("*")
            .eq("company_id", CompanyID)
            .eq(column, value)
            .maybeSingle();

        if (error) throw error;

        if (!data) return;

        // Check lock status

        const lockedByAnotherUser =
            data.IsLocked === true &&
            data.LockedBy &&
            data.LockedBy !== UserLoginID;

        modifyButton.disabled = lockedByAnotherUser;

        saveButton.disabled = true;

        populateVendorBillingForm(data);

        await loadVendorBillingCharges(data.BillReferenceNo);

        disableForm();
        saveButton.innerHTML =
            '<i class="bi bi-save"></i> Update';

        document.getElementById(
            "addChargesDetails"
        ).disabled = true;

    } catch (err) {
        console.error(
            `Error loading billing details by ${column}:`,
            err
        );
    }
}
// Search by Reference No
document.getElementById("billReferenceNo").addEventListener("change", function () {

    const refNo = this.value.trim();

    if (!refNo) return;

    getVendorBillingDetails("BillReferenceNo", refNo);
});

// Search by Bill No
document.getElementById("vendorBillNo").addEventListener("change", function () {

    const billNo = this.value.trim();

    if (!billNo) return;

    getVendorBillingDetails("BillNo", billNo);
});

modifyButton.addEventListener('click', async () => {
    const locked = await lockVendorBill();

    if (!locked) return;
    enableForm();
    document.getElementById('billReferenceNo').disabled = true;
    saveButton.disabled = false;
    modifyButton.disabled = true;
    document.getElementById("mode").value = "update";
    saveButton.dataset.mode = 'update';
    document.getElementById("addChargesDetails").disabled = false;
    document.querySelectorAll(".delete-row").forEach(btn => {
        btn.disabled = false;
    });

})

newButton.addEventListener("click", async () => {
    const billReferenceNo = document.getElementById("billReferenceNo").value;

    await unlockVendorBill();
    // Clear form fields
    clearForm();

    // Enable form controls
    enableForm();

    // Set current date
    const accountedDate = document.getElementById("accountedDate");
    if (accountedDate) {
        accountedDate.value = new Date().toISOString().split("T")[0];
    }

    // Clear shipment table
    if (pendingShipmentTable?.tBodies?.[0]) {
        pendingShipmentTable.tBodies[0].innerHTML = "";
    }

    // Reset totals
    [
        "totalNonTaxableAmount",
        "totalTaxableAmount",
        "totalSGSTAmount",
        "totalCGSTAmount",
        "totalIGSTAmount",
        "totalGSTAmount",
        "grandTotalAmount"
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = "0.00";
        }
    });

    // Reset Save button
    if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="bi bi-save"></i> Save';
        saveButton.dataset.mode = "insert";
    }
    document.getElementById("mode").value = "insert";
    // Reset Modify button
    if (modifyButton) {
        modifyButton.disabled = true;
    }
    document.getElementById("addChargesDetails").disabled = false;
    document.getElementById("billReferenceNo").value = "";
    // Focus first field
    document.getElementById("billReferenceNo")?.focus();
    document.getElementById("expenseType").value = "Purchase";
    document.getElementById("expenseFor").value = "Service";
});

document.getElementById("addChargesDetails").addEventListener("click", addChargesDetails);

async function addChargesDetails() {

    const chargesType = document.getElementById("chargesType").value.trim();
    const shipmentNo = document.getElementById("shipmentNo").value.trim();

    const nonTaxable = parseFloat(document.getElementById("nonTaxableAmount").value || 0);
    const taxableAmt = parseFloat(document.getElementById("taxableAmount").value || 0);
    const taxID = parseInt(document.getElementById("partyDefaultTax").value || 0);

    if (!chargesType || !shipmentNo) {
        alert("Please select Charges Type and Shipment No.");
        return false;
    }

    const tableBody = document.querySelector("#pendingShipmentTable tbody");

    // Duplicate Check
    const exists = [...tableBody.rows]
        .filter(row => {
            const status = row.querySelector(".status")?.innerText.trim() || "";
            return status !== "Deleted";
        })
        .some(row =>
            row.cells[1]?.textContent.trim() === chargesType &&
            row.cells[2]?.textContent.trim() === shipmentNo
        );

    if (exists) {
        alert("This Charges Type and Shipment No already exists.");
        return false;
    }

    try {

        // Get Tax Details
        const taxes = await getTaxRatesById(taxID);

        if (!taxes) {
            alert("Tax configuration not found.");
            return false;
        }

        // GST Calculation
        const {
            sgstAmt,
            cgstAmt,
            igstAmt,
            totalGstAmt,
            totalRate
        } = calculateTaxes(taxableAmt, taxes);

        const totalAmount = Number(
            (nonTaxable + taxableAmt + totalGstAmt).toFixed(2)
        );

        // Vendor Bill Amount
        const vendorBillAmount = parseFloat(
            document.getElementById("vendorBilledAmount").value || 0
        );

        // Current Total (Ignore Round Off & Deleted Rows)
        let currentGrandTotal = 0;

        [...tableBody.rows].forEach(row => {

            if (row.style.display === "none") return;

            const status = row.querySelector(".status")?.innerText.trim() || "";

            if (status === "Deleted") return;

            // Ignore Round Off Row
            if (row.cells[1]?.innerText.trim() === "Round Off") return;

            currentGrandTotal += parseFloat(row.cells[10].innerText || 0);

        });

        currentGrandTotal = Number(currentGrandTotal.toFixed(2));

        // New Total
        const newGrandTotal = Number(
            (currentGrandTotal + totalAmount).toFixed(2)
        );

        // Check Vendor Bill has decimal value
        const hasDecimal = (vendorBillAmount % 1) !== 0;

        let roundOff = 0;
        let finalTotal = newGrandTotal;

        if (!hasDecimal) {

            // Apply Round Off only for whole-number Vendor Bill
            const roundedTotal = Math.round(newGrandTotal);

            roundOff = Number(
                (roundedTotal - newGrandTotal).toFixed(2)
            );

            finalTotal = Number(
                (newGrandTotal + roundOff).toFixed(2)
            );
        }

        // Validation
        if (vendorBillAmount > 0 && finalTotal > vendorBillAmount) {

            alert(
                `Total amount cannot exceed Vendor Bill Amount.

Vendor Bill Amount : ${vendorBillAmount.toFixed(2)}
Current Total      : ${currentGrandTotal.toFixed(2)}
Adding Amount      : ${totalAmount.toFixed(2)}
Round Off          : ${roundOff.toFixed(2)}
Final Total        : ${finalTotal.toFixed(2)}
Excess Amount      : ${(finalTotal - vendorBillAmount).toFixed(2)}`
            );

            return false;
        }

        // Add Row
        const row = tableBody.insertRow();

        row.dataset.chargeId = "";

        row.innerHTML = `
            <td></td>
            <td>${chargesType}</td>
            <td>${shipmentNo}</td>
            <td>${totalRate}%</td>

            <td class="text-end">${nonTaxable.toFixed(2)}</td>
            <td class="text-end">${taxableAmt.toFixed(2)}</td>
            <td class="text-end">${sgstAmt.toFixed(2)}</td>
            <td class="text-end">${cgstAmt.toFixed(2)}</td>
            <td class="text-end">${igstAmt.toFixed(2)}</td>
            <td class="text-end">${totalGstAmt.toFixed(2)}</td>
            <td class="text-end fw-bold">${totalAmount.toFixed(2)}</td>

            <td>
                <button type="button"
                        class="btn btn-danger btn-sm delete-row">
                    <i class="bi bi-trash"></i>
                </button>
            </td>

            <td class="tax-id d-none">${taxID}</td>
            <td class="status d-none">New</td>
        `;

        reindexRows();
        updateTotals();
        clearChargesInputs();

        return true;

    }
    catch (error) {

        console.error("Error adding charges:", error);
        alert("Failed to add charges.");

        return false;
    }
}
function calculateRoundOff(amount) {

    amount = Number(amount.toFixed(2));

    const roundedAmount = Math.round(amount);

    return {
        roundOff: Number((roundedAmount - amount).toFixed(2)),
        finalAmount: roundedAmount
    };
}

function updateTotals() {

    const tbody = document.querySelector("#pendingShipmentTable tbody");

    // Remove existing Round Off row
    [...tbody.rows].forEach(row => {

        if (row.cells[1]?.innerText.trim() === "Round Off") {
            row.remove();
        }

    });

    let totalNonTaxable = 0;
    let totalTaxable = 0;
    let totalSGST = 0;
    let totalCGST = 0;
    let totalIGST = 0;
    let totalGST = 0;
    let grandTotal = 0;

    [...tbody.rows].forEach(row => {

        if (row.style.display === "none") return;

        const status = row.querySelector(".status")?.innerText.trim() || "";

        if (status === "Deleted") return;

        totalNonTaxable += parseFloat(row.cells[4].innerText || 0);
        totalTaxable += parseFloat(row.cells[5].innerText || 0);
        totalSGST += parseFloat(row.cells[6].innerText || 0);
        totalCGST += parseFloat(row.cells[7].innerText || 0);
        totalIGST += parseFloat(row.cells[8].innerText || 0);
        totalGST += parseFloat(row.cells[9].innerText || 0);
        grandTotal += parseFloat(row.cells[10].innerText || 0);

    });

    totalNonTaxable = Number(totalNonTaxable.toFixed(2));
    totalTaxable = Number(totalTaxable.toFixed(2));
    totalSGST = Number(totalSGST.toFixed(2));
    totalCGST = Number(totalCGST.toFixed(2));
    totalIGST = Number(totalIGST.toFixed(2));
    totalGST = Number(totalGST.toFixed(2));
    grandTotal = Number(grandTotal.toFixed(2));

    // Vendor Bill Amount
    const vendorBillAmount = parseFloat(
        document.getElementById("vendorBilledAmount").value || 0
    );

    // Apply Round Off only if Vendor Bill is whole number
    const hasDecimal = (vendorBillAmount % 1) !== 0;

    if (!hasDecimal) {

        const result = calculateRoundOff(grandTotal);

        if (result.roundOff !== 0) {

            const row = tbody.insertRow();

            row.dataset.chargeId = "";

            row.innerHTML = `
                <td></td>
                <td><b>Round Off</b></td>
                <td>-</td>
                <td>0%</td>

                <td class="text-end">${result.roundOff.toFixed(2)}</td>
                <td class="text-end">0.00</td>
                <td class="text-end">0.00</td>
                <td class="text-end">0.00</td>
                <td class="text-end">0.00</td>
                <td class="text-end">0.00</td>

                <td class="text-end fw-bold">${result.roundOff.toFixed(2)}</td>

                <td></td>

                <td class="tax-id d-none">0</td>
                <td class="status d-none">RoundOff</td>
            `;

            totalNonTaxable += result.roundOff;
            grandTotal = result.finalAmount;
        }

    }

    reindexRows();

    document.getElementById("totalNonTaxableAmount").innerText = totalNonTaxable.toFixed(2);
    document.getElementById("totalTaxableAmount").innerText = totalTaxable.toFixed(2);
    document.getElementById("totalSGSTAmount").innerText = totalSGST.toFixed(2);
    document.getElementById("totalCGSTAmount").innerText = totalCGST.toFixed(2);
    document.getElementById("totalIGSTAmount").innerText = totalIGST.toFixed(2);
    document.getElementById("totalGSTAmount").innerText = totalGST.toFixed(2);
    document.getElementById("grandTotalAmount").innerText = grandTotal.toFixed(2);
}
function clearChargesInputs() {
    document.getElementById("chargesType").value = "";
    document.getElementById("shipmentNo").value = "";
    document.getElementById("nonTaxableAmount").value = "";
    document.getElementById("taxableAmount").value = "";
    document.getElementById("partyDefaultTax").value = "";
}

async function loadVendorBillingCharges(billReferenceNo) {
    const tbody = document.querySelector("#pendingShipmentTable tbody");
    tbody.innerHTML = "";

    const { data, error } = await supabaseClient
        .from("VendorBillingCharges")
        .select("*")
        .eq("company_id", CompanyID)
        .eq("BillReferenceNo", billReferenceNo);

    if (error) {
        console.error(error);
        return;
    }

    for (const [index, item] of data.entries()) {
        const row = tbody.insertRow();
        row.dataset.chargeId = item.id;

        // Wait for tax details
        const taxData = await getTaxRatesById(item.TaxID);
        const taxPercent = parseFloat(taxData.tax_rate) || 0;

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.ChargesType}</td>
            <td>${item.ShipmentNo}</td>
            <td>${taxPercent.toFixed(2)}%</td>
            <td class="text-end">${item.NonTaxableAmount.toFixed(2)}</td>
            <td class="text-end">${item.TaxableAmount.toFixed(2)}</td>
            <td class="text-end">${item.SGSTAmount.toFixed(2)}</td>
            <td class="text-end">${item.CGSTAmount.toFixed(2)}</td>
            <td class="text-end">${item.IGSTAmount.toFixed(2)}</td>
            <td class="text-end">${item.TotalGSTAmount.toFixed(2)}</td>
            <td class="text-end">${item.TotalAmount.toFixed(2)}</td>
            <td>
                <button class="btn btn-danger btn-sm delete-row" disabled>
                    <i class="bi bi-trash"></i>
                </button>
            </td>
            <td class="tax-id d-none">${item.TaxID}</td>
            <td class="status text-center d-none">Old</td>
        `;
    }

    updateTotals();
}
async function saveVendorBillingCharges() {

    try {
        const billReferenceNo = document.getElementById("billReferenceNo").value.trim();
        const rows = document.querySelectorAll("#pendingShipmentTable tbody tr");

        const insertRows = [];
        const deleteIds = [];

        rows.forEach(row => {

            const status = row.querySelector(".status")?.innerText?.trim();

            const chargeId = row.dataset.chargeId || null;

            // INSERT NEW ROWS
            if (status === "New") {

                insertRows.push({

                    BillReferenceNo: billReferenceNo,

                    ChargesType: row.cells[1].innerText.trim(),
                    ShipmentNo: row.cells[2].innerText.trim(),
                    TaxPercent: parseFloat(row.cells[3].innerText.replace("%", "")) || 0,
                    NonTaxableAmount: parseFloat(row.cells[4].innerText) || 0,
                    TaxableAmount: parseFloat(row.cells[5].innerText) || 0,
                    SGSTAmount: parseFloat(row.cells[6].innerText) || 0,
                    CGSTAmount: parseFloat(row.cells[7].innerText) || 0,
                    IGSTAmount: parseFloat(row.cells[8].innerText) || 0,
                    TotalGSTAmount: parseFloat(row.cells[9].innerText) || 0,
                    TotalAmount: parseFloat(row.cells[10].innerText) || 0,
                    TaxID: row.querySelector(".tax-id")?.innerText || null,
                    company_id: CompanyID,
                    created_by: UserLoginID,
                    created_at: localtimeStamp
                });
            }

            // DELETE OLD ROWS
            if (status === "Deleted" && chargeId) {
                deleteIds.push(Number(chargeId));
            }

        });

        // INSERT
        if (insertRows.length > 0) {

            const { error } = await supabaseClient
                .from("VendorBillingCharges")
                .insert(insertRows);

            if (error) throw error;
        }

        // DELETE
        if (deleteIds.length > 0) {

            const { error } = await supabaseClient
                .from("VendorBillingCharges")
                .delete()
                .eq("company_id", CompanyID)
                .in("id", deleteIds);

            if (error) throw error;
        }

    } catch (err) {
        saveButton.disabled = false;
        console.error("saveVendorBillingCharges Error:", err);
        throw err;
    }
}

// Delete row
document.addEventListener("click", function (e) {

    const btn = e.target.closest(".delete-row");

    if (!btn) return;

    const row = btn.closest("tr");
    const statusCell = row.querySelector(".status");

    if (statusCell.innerText.trim() === "Old") {

        statusCell.innerText = "Deleted";

        row.style.display = "none";
    }
    else {
        row.remove();
        reindexRows();
    }

    updateTotals();
});

function validateBillTotal() {

    const vendorBilledAmount = parseFloat(
        document.getElementById("vendorBilledAmount").value || 0
    );

    const grandTotal = parseFloat(
        document.getElementById("grandTotalAmount").innerText || 0
    );

    if (grandTotal !== vendorBilledAmount) {

        alert(
            `Grand Total (${grandTotal.toFixed(2)}) must match Vendor Bill Amount (${vendorBilledAmount.toFixed(2)}).`
        );

        return false;
    }

    return true;
}

function reindexRows() {

    document
        .querySelectorAll(
            "#pendingShipmentTable tbody tr:not([style*='display: none'])"
        )
        .forEach((row, index) => {

            row.cells[0].innerText = index + 1;
        });
}

function enforceDatalistSelection(inputId, datalistId) {

    const input = document.getElementById(inputId);

    input.addEventListener("change", function () {

        const value = this.value.trim();

        const validOptions = [
            ...document.querySelectorAll(`#${datalistId} option`)
        ].map(option => option.value);

        if (!validOptions.includes(value)) {
            // alert(`Please select a valid value from the list.`);
            this.value = "";
            this.focus();
        }
    });
}

enforceDatalistSelection("expenseType", "expenseTypeList");
enforceDatalistSelection("expenseFor", "expenseForList");
enforceDatalistSelection("partyName", "partySuggestions");
enforceDatalistSelection("billReferenceNo", "billReferenceNoSuggestions");


async function loadDatalistSuggestions({
    inputId,
    datalistId,
    tableName,
    columnName,
    minLength = 2
}) {

    const input = document.getElementById(inputId);
    const datalist = document.getElementById(datalistId);

    input.addEventListener("input", debounce(async function (e) {

        const keyword = e.target.value.trim();

        if (keyword.length < minLength) {
            datalist.innerHTML = "";
            return;
        }

        const { data, error } = await supabaseClient
            .from(tableName)
            .select(columnName)
            .eq("company_id", CompanyID)
            .ilike(columnName, `%${keyword}%`)
            .limit(20);

        if (error) {
            console.error(error);
            return;
        }

        const uniqueValues = [...new Set(
            data.map(row => row[columnName])
        )];

        datalist.innerHTML = uniqueValues
            .map(v => `<option value="${v}"></option>`)
            .join("");

    }, 300));
}

document.getElementById('vendorBillDate').addEventListener('change', function () {

    const billDateValue = this.value;

    if (!billDateValue) return;

    const dueDate = new Date(billDateValue);

    // Add 30 days
    dueDate.setDate(dueDate.getDate() + 30);

    document.getElementById('vendorDueDate').value =
        dueDate.toISOString().split('T')[0];

});
document.getElementById("vendorBillNo")
    .addEventListener("input", function () {
        this.value = this.value.toUpperCase();
    });

// New Generate Bill Reference No
async function generateBillReferenceNo() {
    const accountedDate =
        document.getElementById("accountedDate").value ||
        new Date().toISOString().split("T")[0];

    const { data, error } =
        await supabaseClient.rpc(
            "generate_vendor_bill_reference",
            {
                p_company_id: CompanyID,
                p_accounted_date: accountedDate
            }
        );

    if (error) throw error;

    return data;
}

// Unlock Vendor Bill
async function unlockVendorBill() {
    const billReferenceNo =
        document.getElementById("billReferenceNo").value;

    if (!billReferenceNo) return;

    const { data, error } = await supabaseClient.rpc("unlock_vendor_bill_safe", {
        p_company_id: CompanyID,
        p_bill_reference: billReferenceNo,
        p_user: UserLoginID,
        p_timeout_minutes: 5
    });

    if (error) {
        console.error("Unlock error:", error);
        return;
    }

    if (!data.success) {
        console.warn(data.message);
    }
}

async function lockVendorBill() {

    const billReferenceNo =
        document.getElementById("billReferenceNo").value;

    const { data, error } = await supabaseClient
        .from("VendorBillingDetails")
        .select("IsLocked, LockedBy")
        .eq("company_id", CompanyID)
        .eq("BillReferenceNo", billReferenceNo)
        .single();

    if (error) throw error;

    if (
        data.IsLocked &&
        data.LockedBy &&
        data.LockedBy !== UserLoginID
    ) {
        alert(
            `This bill is currently being modified by ${data.LockedBy}`
        );
        return false;
    }

    const { error: updateError } = await supabaseClient
        .from("VendorBillingDetails")
        .update({
            IsLocked: true,
            LockedBy: UserLoginID,
            LockedAt: new Date().toISOString()
        })
        .eq("company_id", CompanyID)
        .eq("BillReferenceNo", billReferenceNo);

    if (updateError) throw updateError;

    return true;
}

// ============================================================
//     SEARCH SAVED BILL REFERENCE(modal wiring)
//         ============================================================
const searchBillReferenceModalEl = document.getElementById('searchBillReferenceModal');
const searchSavedBillReferenceInput = document.getElementById('searchSavedBillReferenceInput');
const btnTriggerSearch = document.getElementById('btnTriggerSearch');
const searchBillReferenceTableBody = document.getElementById('searchBillReferenceTableBody');

/* Small HTML escaper (defence-in-depth; DOMPurify also loaded) */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ---------- Load results ---------- */
async function loadSavedBillReferences(keyword = '') {
    searchBillReferenceTableBody.innerHTML = `
        <tr>
            <td colspan="7" class="vm-empty">
                <span class="spinner-border spinner-border-sm me-2"></span>
                Loading references…
            </td>
        </tr>`;

    try {
        let query = supabaseClient
            .from('VendorBillingDetails')
            .select(`
                BillReferenceNo,
                AccountedDate,
                PartyName,
                ExpenseType,
                BilledAmount
            `)
            .eq('company_id', CompanyID)
            .order('AccountedDate', { ascending: false })
            .limit(100);

        if (keyword) {
            // Strip characters that break the PostgREST `or` filter
            const safe = keyword.replace(/[,()%*]/g, ' ').trim();

            if (safe) {
                query = query.or(
                    [
                        `BillReferenceNo.ilike.%${safe}%`,
                        `PartyName.ilike.%${safe}%`,
                        `ExpenseType.ilike.%${safe}%`
                    ].join(',')
                );
            }
        }

        const { data, error } = await query;
        if (error) throw error;

        renderSavedBillReferences(data || []);

    } catch (err) {
        console.error('loadSavedBillReferences Error:', err);

        searchBillReferenceTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="vm-empty text-danger">
                    <i class="bi bi-exclamation-triangle"></i>
                    Failed to load references. Please try again.
                </td>
            </tr>`;
    }
}

/* ---------- Render results ---------- */
function renderSavedBillReferences(rows) {
    if (!rows.length) {
        searchBillReferenceTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="vm-empty">
                    <i class="bi bi-receipt"></i>
                    No saved references found.
                </td>
            </tr>`;
        return;
    }

    searchBillReferenceTableBody.innerHTML = rows.map((row, index) => `
        <tr>
            <td>${index + 1}</td>
            <td class="fw-semibold text-primary">${escapeHtml(row.BillReferenceNo)}</td>
            <td>${escapeHtml(row.AccountedDate || '-')}</td>
            <td class="text-start">${escapeHtml(row.PartyName || '-')}</td>
            <td>${escapeHtml(row.ExpenseType || '-')}</td>
            <td class="text-end">${Number(row.BilledAmount || 0).toFixed(2)}</td>
            <td class="text-center">
                <button type="button"
                        class="btn btn-primary btn-sm select-bill-ref"
                        data-ref="${escapeHtml(row.BillReferenceNo)}"
                        title="Load this reference">
                    <i class="bi bi-box-arrow-in-down"></i> Select
                </button>
            </td>
        </tr>
    `).join('');
}

/* ---------- Select a reference → load into the form ---------- */
async function selectBillReference(billReferenceNo) {
    if (!billReferenceNo) return;

    const modalInstance = bootstrap.Modal.getInstance(searchBillReferenceModalEl);
    if (modalInstance) modalInstance.hide();

    document.getElementById('billReferenceNo').value = billReferenceNo;

    await getVendorBillingDetails('BillReferenceNo', billReferenceNo);
}

/* ---------- Event wiring ---------- */
searchBillReferenceTableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.select-bill-ref');
    if (!btn) return;

    selectBillReference(btn.dataset.ref);
});

btnTriggerSearch.addEventListener('click', () => {
    loadSavedBillReferences(searchSavedBillReferenceInput.value.trim());
});

searchSavedBillReferenceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        loadSavedBillReferences(searchSavedBillReferenceInput.value.trim());
    }
});

/* Live search (debounced) */
searchSavedBillReferenceInput.addEventListener(
    'input',
    debounce(() => {
        loadSavedBillReferences(searchSavedBillReferenceInput.value.trim());
    }, 400)
);

/* On open → reset + load recent 100 records */
searchBillReferenceModalEl.addEventListener('shown.bs.modal', () => {
    searchSavedBillReferenceInput.value = '';
    loadSavedBillReferences();
    searchSavedBillReferenceInput.focus();
});