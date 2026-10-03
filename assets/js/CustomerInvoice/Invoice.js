/* =========================================================
   CONSTANTS & UTILITIES
========================================================= */
const FORWARDING_TYPES = ['Forwarding', 'Import', 'Export'];
const totalFreight = 0;

// Safe Math Utilities: Convert to integers (paise/cents) before calculating
const toCents = (amount) => Math.round((parseFloat(amount) || 0) * 100);
const toCurrency = (cents) => cents / 100;

/* =========================================================
   STRATEGY CONFIGURATION (The Router)
========================================================= */
const MOVEMENT_STRATEGIES = {
    'Forwarding': {
        fetchPending: async () => await getPendingInvoiceDetails(),
        addShipment: async (shipNo, invNo) => await addSingleShipmentToInvoice(shipNo, invNo),
        createHeaders: async () => await createPendingShipmentTableHeaderAndFooter_ib(),
        loadBookings: async (invNo) => await loadInvoiceBookings(invNo),
        updateInvoiceNo: async (invNo) => await updateInvoiceNumbers(invNo),
        generateReport: async (details, reportType) => {
            if (reportType === 'Main') await generate_International_InvoicePDF_Main(details);
            else if (reportType === 'Print Annexure') await generate_International_InvoicePDF_Annexure(details);
        },
        basicAmountId: 'totalFreight',
        hasOtherCharges: true,
        taxSuffix: ''
    },
    'Customs Clearance': {
        fetchPending: async () => await CustomsClearanceInvoiceDetails(),
        addShipment: async (shipNo, invNo) => await addSingleShipmentToInvoice_cc(shipNo, invNo),
        createHeaders: async () => await createPendingShipmentTableHeaderAndFooter(),
        loadBookings: async (invNo) => await loadInvoiceLineItems_cc(invNo),
        updateInvoiceNo: async (invNo) => await updateInvoiceNumbers_cc(invNo),
        generateReport: async (details) => await generate_Clear_InvoicePDF_Main(details),
        basicAmountId: 'totalFreight_sc',
        hasOtherCharges: false,
        taxSuffix: '_sc'
    },
    'Domestic': {
        fetchPending: async () => await d_getPendingInvoiceDetails(),
        addShipment: async (shipNo, invNo) => await d_addSingleShipmentToInvoice(shipNo, invNo),
        createHeaders: async () => await d_createPendingShipmentTableHeaderAndFooter_ib(),
        loadBookings: async (invNo) => await d_loadInvoiceBookings(invNo),
        updateInvoiceNo: async (invNo) => await d_updateInvoiceNumbers(invNo),
        generateReport: async (details) => await generate_DomesticReports_InvoicePDF(details),
        basicAmountId: 'totalFreight_d',
        hasOtherCharges: true,
        taxSuffix: ''
    },
    'Full Truck Load': {
        fetchPending: async () => await FTL_FCL_getPendingInvoiceDetails(),
        addShipment: async (shipNo, invNo) => await ftl_addSingleShipmentToInvoice(shipNo, invNo),
        createHeaders: async () => await FTL_FCL_createPendingShipmentTableHeaderAndFooter(),
        loadBookings: async (invNo) => await ftl_loadInvoiceBookings(invNo),
        updateInvoiceNo: async (invNo) => await ftl_updateInvoiceNumbers(invNo),
        generateReport: async (details) => await generate_FullTruckReports_InvoicePDF(details),
        basicAmountId: 'totalFreight',
        hasOtherCharges: true,
        taxSuffix: ''
    }
};

MOVEMENT_STRATEGIES['Import'] = { ...MOVEMENT_STRATEGIES['Forwarding'] };
MOVEMENT_STRATEGIES['Export'] = { ...MOVEMENT_STRATEGIES['Forwarding'] };

/* =========================================================
   GLOBAL DATA
========================================================= */
let invoiceData = {};
let invoiceChargesData = {};

/* =========================================================
   DOM READY
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
    await loadSuggestions('partySuggestions', 'PartyDetails', CompanyID);
    await loadBankNameSuggestions();
    await loadDefaultBank();
    await loadInvoiceNoSuggestions();
    await loadDatalist('departmentList', 'Department');

    const bankInput = document.getElementById('inputBankName');
    const bankIDInput = document.getElementById('bankIDs');

    if (bankInput) {
        bankInput.addEventListener('input', function () {
            const selectedValue = this.value.trim();
            if (bankMap[selectedValue]) {
                bankID = bankMap[selectedValue];
                bankIDInput.value = bankID;
                console.log('Selected Bank ID:', bankID);
            } else {
                bankID = null;
                bankIDInput.value = '';
            }
        });
    }

    const params = new URLSearchParams(window.location.search);
    const invoiceNo = params.get("invoiceNo");

    if (invoiceNo) {
        const invoiceInput = document.getElementById("invoiceNo");
        if (invoiceInput) {
            invoiceInput.value = invoiceNo;
            invoiceInput.dispatchEvent(new Event("change"));
            await loadInvoice(invoiceNo);
        }
    }
});

/* =========================================================
   CUSTOMER SELECTION
========================================================= */
const partyNameInput = document.getElementById('partyName');
if (partyNameInput) {
    partyNameInput.addEventListener('change', async function () {
        const selectedPartyName = this.value.trim();
        const options = Array.from(document.getElementById('partySuggestions').options);
        const option = options.find(opt => opt.value === selectedPartyName);

        if (!option) {
            alert('Invalid customer selection.');
            return;
        }

        const partyCode = document.getElementById('partyCode').value;
        try {
            const { data, error } = await supabaseClient
                .from('PartyBillingAddress')
                .select('*')
                .eq('PartyCode', partyCode)
                .eq('Status', 'Active');

            if (error) throw error;
            if (!data.length) {
                alert('No active billing address found.');
                return;
            }

            data.length === 1
                ? (fillInvoiceAddress(data[0]), document.getElementById('invoiceDate').focus())
                : showAddressSelectionModal(data);

        } catch (err) {
            console.error(err);
        }
    });

    partyNameInput.addEventListener('input', function () {
        const partyValue = this.value.trim();
        const btn = document.getElementById('addShipmentNo');
        if (btn) btn.disabled = !partyValue;
    });
}

function fillInvoiceAddress(addr) {
    const el = document.getElementById('invoiceAddress');
    if (el) el.value = formatAddress(addr);
}

function formatAddress(a) {
    return `${a.Address}, ${a.City}, ${a.PinCode}, ${a.State}, ${a.Country}`;
}

/* =========================================================
   INVOICE NUMBER GENERATION
========================================================= */
async function generateInvoiceNumber(invoiceDateValue) {
    if (!invoiceDateValue) return '';

    try {
        const { data: company } = await supabaseClient
            .from('company_profile')
            .select('short_code')
            .eq('company_id', CompanyID)
            .maybeSingle();

        if (!company) return '';

        const d = new Date(invoiceDateValue);
        const fyStart = d.getMonth() >= 3 ? d.getFullYear() % 100 : (d.getFullYear() - 1) % 100;
        const fyEnd = (fyStart + 1) % 100;
        const fy = `${fyStart.toString().padStart(2, '0')}-${fyEnd.toString().padStart(2, '0')}`;

        const { data: last } = await supabaseClient
            .from('InvoiceDetails')
            .select('InvoiceNo')
            .like('InvoiceNo', `${company.short_code}/${fy}/%`)
            .eq('company_id', CompanyID)
            .order('InvoiceNo', { ascending: false })
            .limit(1)
            .maybeSingle();

        const next = last ? parseInt(last.InvoiceNo.split('/').pop()) + 1 : 1;
        return `${company.short_code}/${fy}/${next.toString().padStart(4, '0')}`;
    } catch {
        return '';
    }
}

/* =========================================================
   FETCH PENDING INVOICES
========================================================= */
const fetchPendingBtn = document.getElementById('fetchPendingInvoices');
if (fetchPendingBtn) {
    fetchPendingBtn.addEventListener('click', async () => {
        const type = document.getElementById('movementType').value;
        const strategy = MOVEMENT_STRATEGIES[type];

        if (strategy && strategy.fetchPending) {
            try {
                await strategy.fetchPending();
            } catch (e) {
                alert('Failed to fetch invoices');
            }
        } else {
            alert('Select valid Movement Type');
        }
    });
}

/* =========================================================
   SAVE INVOICE
========================================================= */
if (saveButton) {
    saveButton.addEventListener('click', async () => {
        const saveBtn = document.getElementById('saveButton');
        const spinner = document.getElementById('saveSpinnerBtn');

        if (saveBtn.disabled) return;
        const originalButtonHTML = '<i class="bi bi-save"></i> Save';

        saveBtn.disabled = true;
        if (spinner) spinner.classList.remove('d-none');
        saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Processing...`;

        try {
            const bankIDVal = document.getElementById('bankIDs')?.value.trim() || '';
            const partyCode = document.getElementById('partyCode')?.value.trim() || '';
            const invoiceDate = document.getElementById('invoiceDate')?.value || '';
            const invoiceType = document.getElementById('movementType')?.value || '';
            const invoiceAddress = document.getElementById('invoiceAddress')?.value.trim() || '';
            const remarks = document.getElementById('invoiceInformation')?.value.trim() || '';
            const isInsert = saveBtn.dataset.mode === 'insert';

            if (!partyCode || !invoiceDate || !invoiceType || !invoiceAddress) throw new Error('Fill all required fields');
            if (!bankIDVal) throw new Error('Select valid Bank Name');
            if (!CompanyID) throw new Error('Company ID is missing');

            const strategy = MOVEMENT_STRATEGIES[invoiceType];
            if (!strategy) throw new Error('Invalid Invoice Type strategy');

            let invoiceNo = document.getElementById('invoiceNo')?.value.trim() || '';
            if (isInsert) {
                invoiceNo = await generateInvoiceNumber(invoiceDate);
                if (!invoiceNo) throw new Error('Invoice number generation failed');
                document.getElementById('invoiceNo').value = invoiceNo;
            }
            if (!invoiceNo) throw new Error('Invoice number is required');

            // --- BULLETPROOF HTML SCRAPER ---
            const getSafeAmount = (id, fallbackId = null) => {
                let el = document.getElementById(id);
                if (!el && fallbackId) el = document.getElementById(fallbackId);
                if (!el) return 0;

                let rawValue = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
                    ? el.value
                    : el.textContent;

                if (!rawValue || rawValue.trim() === '') rawValue = '0';
                return parseFloat(String(rawValue).replace(/,/g, '').trim()) || 0;
            };

            const basicCents = toCents(getSafeAmount(strategy.basicAmountId));
            let otherCents = 0;
            let fscCents = 0;
            let otherChargesCents = 0;

            if (strategy.hasOtherCharges) {
                fscCents = toCents(getSafeAmount('totalFSCAmt'));
                otherChargesCents = toCents(getSafeAmount('totalOtherAmt'));
                otherCents = fscCents + otherChargesCents;
            }

            const cgstCents = toCents(getSafeAmount(`totalCGST${strategy.taxSuffix}`, 'cgstAmount'));
            const sgstCents = toCents(getSafeAmount(`totalSGST${strategy.taxSuffix}`, 'sgstAmount'));
            const igstCents = toCents(getSafeAmount(`totalIGST${strategy.taxSuffix}`, 'igstAmount'));
            const totalGstCents = cgstCents + sgstCents + igstCents;

            const exactGrandTotalCents = basicCents + otherCents + totalGstCents;
            const calculatedGrandTotalCents = Math.round(exactGrandTotalCents / 100) * 100;

            let scrapedGrandTotalCents = toCents(getSafeAmount('totalGrand', 'totalAmount'));
            if (scrapedGrandTotalCents === 0) {
                scrapedGrandTotalCents = toCents(getSafeAmount('totalGrandAmt'));
            }

            if (scrapedGrandTotalCents === 0 && calculatedGrandTotalCents > 0) {
                console.warn("UI Grand Total element not found or is 0. Trusting internal calculation.");
                scrapedGrandTotalCents = calculatedGrandTotalCents;
            }

            if (Math.abs(calculatedGrandTotalCents - scrapedGrandTotalCents) > 1) {
                console.error('Mismatch details:', { calculatedGrandTotalCents, scrapedGrandTotalCents });
                throw new Error(`Invoice total mismatch. Calculated: ${toCurrency(calculatedGrandTotalCents)}`);
            }

            const amounts = {
                BasicAmount: toCurrency(basicCents),
                OtherAmount: toCurrency(otherCents),
                CGSTAmount: toCurrency(cgstCents),
                SGSTAmount: toCurrency(sgstCents),
                IGSTAmount: toCurrency(igstCents),
                TotalGSTAmount: toCurrency(totalGstCents),
                GrandTotalAmount: toCurrency(calculatedGrandTotalCents)
            };

            const invoiceDataObj = {
                InvoiceNo: invoiceNo,
                InvoiceDate: invoiceDate,
                InvoiceType: invoiceType,
                PartyCode: partyCode,
                InvoiceAddress: invoiceAddress,
                BankID: bankIDVal,
                company_id: CompanyID,
                BasicAmount: amounts.BasicAmount,
                OtherAmount: amounts.OtherAmount,
                CGSTAmount: amounts.CGSTAmount,
                SGSTAmount: amounts.SGSTAmount,
                IGSTAmount: amounts.IGSTAmount,
                TotalGSTAmount: amounts.TotalGSTAmount,
                GrandTotalAmount: amounts.GrandTotalAmount,
                Remarks: remarks
            };

            if (isInsert) {
                invoiceDataObj.created_by = UserLoginID;
                invoiceDataObj.created_at = localtimeStamp;
                const { error } = await supabaseClient.from('InvoiceDetails').insert([invoiceDataObj]);
                if (error) throw error;
            } else {
                invoiceDataObj.updated_by = UserLoginID;
                invoiceDataObj.updated_at = localtimeStamp;
                const { error } = await supabaseClient.from('InvoiceDetails')
                    .update(invoiceDataObj)
                    .eq('InvoiceNo', invoiceNo)
                    .eq('company_id', CompanyID);
                if (error) throw error;
            }

            showToast(`Invoice ${isInsert ? 'Saved' : 'Updated'} Successfully`);

            // --- FIX: Clear the table and reset global state after successful save ---
            const tbd = document.querySelector('#pendingShipmentTable tbody');
            if (tbd) tbd.innerHTML = '';
            clearInvoiceTotals();
            clearChargesTable();
            invoiceData = {};
            invoiceChargesData = {};
            // ---------------------------------------------------------------------

            if (strategy.updateInvoiceNo) await strategy.updateInvoiceNo(invoiceNo);

            disableForm();
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.disabled = true;
                btn.classList.add('disabled');
            });

            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="bi bi-check-circle"></i> Updated';

            if (typeof modifyButton !== 'undefined') modifyButton.disabled = false;
            if (typeof reportButton !== 'undefined') reportButton.disabled = false;
            if (typeof fetchPendingInvoices !== 'undefined') fetchPendingInvoices.disabled = true;

        } catch (error) {
            console.error('Invoice save/update failed:', error);
            showToast(error?.message || 'Invoice save failed');
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalButtonHTML;
        } finally {
            if (spinner) spinner.classList.add('d-none');
        }
    });
}

/* =========================================================
   SAFE UNLOCK ON EXIT
========================================================= */
window.addEventListener('beforeunload', async () => {
    try {
        await autoUnlockRecords("FullLoadBookingDetails");
        await autoUnlockRecords("international_booking");
        await unlockBooking_ib(UserLoginID);
        await unlockBooking_cc(UserLoginID);
        console.log('Unlocking records for user:', UserLoginID);
    } catch (e) {
        console.error('Unlock failed:', e);
    }
});

const newBtn = document.getElementById('newButton');
if (newBtn) newBtn.addEventListener('click', newInvoice);

async function newInvoice() {
    try {
        await autoUnlockRecords("FullLoadBookingDetails");
        await autoUnlockRecords("international_booking");
        await unlockBooking_ib(UserLoginID);
        await unlockBooking_cc(UserLoginID);
        await d_unlockBooking_db(UserLoginID);
        await ftl_unlockBooking(UserLoginID);

        document.getElementById('addShipmentNo').disabled = true;
        document.getElementById('fetchPendingInvoices').disabled = true;
        document.getElementById('movementType').value = '';
        const tbd = document.querySelector('#pendingShipmentTable tbody');
        if (tbd) tbd.innerHTML = '';
        document.getElementById('invoiceInformation').value = '';
        document.getElementById('addShipmentNo').disabled = false;
    } catch (e) {
        console.error('Unlock failed:', e);
    }

    const form = document.getElementById('container');
    if (form) form.reset();

    const saveBtn = document.getElementById('saveButton');
    saveBtn.dataset.mode = 'insert';
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="bi bi-save"></i> Save';

    document.getElementById('modifyButton').disabled = true;
    document.getElementById('deleteButton').disabled = true;
    document.getElementById('reportButton').disabled = true;
    document.getElementById('fetchPendingInvoices').disabled = false;
    document.getElementById('addShipmentNo').disabled = true;
    document.getElementById('newButton').disabled = false;

    [
        'invoiceNo', 'partyName', 'partyCode', 'invoiceAddress',
        'movementType', 'transitType', 'department', 'modeType',
        'shipmentNo', 'reportType'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    document.getElementById('invoiceDate').value = new Date().toISOString().split('T')[0];

    invoiceData = {};
    invoiceChargesData = {};

    clearInvoiceTotals();
    clearChargesTable();

    await loadInvoiceNoSuggestions();
    enableForm();
    document.getElementById('partyName').focus();
    showToast('🚀 New Invoice Ready');
}

// Ensure all possible element IDs are cleared
function clearInvoiceTotals() {
    const table = document.getElementById('pendingShipmentTable');
    if (table?.tBodies?.[0]) table.tBodies[0].innerHTML = '';

    const totalIds = [
        'totalFreight', 'totalFSCAmt', 'totalOtherAmt', 'totalSGST', 'totalChargeableWeight', 'totalQuantity',
        'totalCGST', 'totalIGST', 'totalGST', 'totalGrand',
        'cgstAmount', 'sgstAmount', 'igstAmount', 'gstAmount', 'totalAmount'
    ];
    totalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = '0.00';
            else el.textContent = '0.00';
        }
    });
}

function clearChargesTable() {
    const tbody = document.querySelector('#pendingShipmentCharges tbody');
    if (tbody) tbody.innerHTML = '';

    ['totalFreightAmt', 'totalSGSTAmt', 'totalCGSTAmt', 'totalIGSTAmt', 'totalGSTAmt', 'totalGrandAmt'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = '0.00';
            else el.textContent = '0.00';
        }
    });
}

function updateTotals(totals) {
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            const formattedValue = value.toFixed(2);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = formattedValue;
            else el.textContent = formattedValue;
        }
    };

    setValue('totalFreight', totals.totalFreight);
    setValue('totalFSCAmt', totals.totalFSCAmt);
    setValue('totalOtherAmt', totals.totalOtherAmt);
    setValue('totalSGST', totals.totalSGST);
    setValue('totalCGST', totals.totalCGST);
    setValue('totalIGST', totals.totalIGST);
    setValue('totalGST', totals.totalGST);
    setValue('totalGrand', Math.round(totals.totalGrand));
}

const setSafeText = (id, value) => {
    const el = document.getElementById(id);
    if (el) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = value;
        else el.textContent = value;
    }
};

function renderChargesTable(chargesMap) {
    const tbody = document.querySelector('#pendingShipmentCharges tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totalAmount = 0, totalSGST = 0, totalCGST = 0, totalIGST = 0, totalGSTAmt = 0, totalGrandAmt = 0;
    const chargeOrder = ['Freight Amount', 'Custom Clearance Charges', 'Duty'];

    const sortedEntries = Object.entries(chargesMap).sort(([a], [b]) => {
        const indexA = chargeOrder.indexOf(a);
        const indexB = chargeOrder.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
    });

    sortedEntries.forEach(([type, amounts]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${type}</td>
            <td class="text-end">${formatAmount(amounts.TotalAmount)}</td>
            <td class="text-end">${formatAmount(amounts.SGSTAmt)}</td>
            <td class="text-end">${formatAmount(amounts.CGSTAmt)}</td>
            <td class="text-end">${formatAmount(amounts.IGSTAmt)}</td>
            <td class="text-end">${formatAmount(amounts.TotalGSTAmt)}</td>
            <td class="text-end">${formatAmount(amounts.GrandTotalAmt)}</td>
        `;
        tbody.appendChild(row);

        totalAmount += amounts.TotalAmount;
        totalSGST += amounts.SGSTAmt;
        totalCGST += amounts.CGSTAmt;
        totalIGST += amounts.IGSTAmt;
        totalGSTAmt += amounts.TotalGSTAmt;
        totalGrandAmt += amounts.GrandTotalAmt;
    });

    setSafeText('totalFreightAmt', formatAmount(totalAmount));
    setSafeText('totalSGSTAmt', formatAmount(totalSGST));
    setSafeText('totalCGSTAmt', formatAmount(totalCGST));
    setSafeText('totalIGSTAmt', formatAmount(totalIGST));
    setSafeText('totalGSTAmt', formatAmount(totalGSTAmt));
    setSafeText('totalGrandAmt', formatAmount(Math.round(totalGrandAmt)));
}

async function getInvoiceDetails(invoiceNo) {
    showSpinner();
    try {
        const { data, error } = await supabaseClient
            .from('InvoiceDetails')
            .select('*')
            .eq('InvoiceNo', invoiceNo)
            .eq('company_id', CompanyID)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            showToast('Invoice not found');
            return null;
        }
        return data;
    } catch (err) {
        console.error('Error fetching invoice details:', err.message);
        alert('Error loading invoice: ' + err.message);
        return null;
    } finally {
        hideSpinner();
    }
}

const mvTypeEl = document.getElementById('movementType');
if (mvTypeEl) {
    mvTypeEl.addEventListener('change', async (e) => {
        const movementType = e.target.value.trim();
        const strategy = MOVEMENT_STRATEGIES[movementType];
        if (strategy && strategy.createHeaders) {
            await strategy.createHeaders();
        } else {
            console.warn('Unknown movement type:', movementType);
        }
    });
}

const invNoEl = document.getElementById("invoiceNo");
if (invNoEl) {
    invNoEl.addEventListener("change", async (e) => {
        await loadInvoice(e.target.value);
    });
}

async function loadInvoice(invoiceNo) {
    if (!invoiceNo || invoiceNo.trim() === "") return;
    invoiceNo = invoiceNo.trim();

    // --- FIX: Clear previous table data and global state before loading new invoice ---
    const tbd = document.querySelector('#pendingShipmentTable tbody');
    if (tbd) tbd.innerHTML = '';
    invoiceData = {};
    invoiceChargesData = {};
    clearInvoiceTotals();
    clearChargesTable();
    // ---------------------------------------------------------------------------------

    const invoiceDetails = await getInvoiceDetails(invoiceNo);
    if (!invoiceDetails) {
        alert("Invoice not found.");
        return;
    }

    document.getElementById("invoiceNo").value = invoiceNo;
    document.getElementById("partyCode").value = invoiceDetails.PartyCode || "";
    document.getElementById("invoiceDate").value = invoiceDetails.InvoiceDate || "";
    document.getElementById("invoiceAddress").value = invoiceDetails.InvoiceAddress || "";
    document.getElementById("movementType").value = invoiceDetails.InvoiceType || "";
    document.getElementById("bankIDs").value = getBankNameByCode(invoiceDetails.BankID) || "";
    document.getElementById("inputBankName").value = invoiceDetails.id || "";
    document.getElementById("invoiceInformation").value = invoiceDetails.Remarks || "";
    document.getElementById("tempFormID").value = invoiceDetails.id || "";

    const partyData = await getPartyDetailsByCode(invoiceDetails.PartyCode);
    if (partyData) {
        document.getElementById("partyName").value = partyData.PartyName || "";
    } else {
        alert("Party not found.");
    }

    const paymentInfo = await paymentDetails(invoiceNo);
    document.getElementById("modifyButton").disabled = paymentInfo.rows.length > 0;

    disableForm();
    saveButton.disabled = true;
    document.getElementById("deleteButton").disabled = true;
    document.getElementById("reportButton").disabled = false;
    document.getElementById("fetchPendingInvoices").disabled = true;

    const strategy = MOVEMENT_STRATEGIES[invoiceDetails.InvoiceType];
    if (strategy) {
        await strategy.createHeaders();
        await strategy.loadBookings(invoiceNo);
    } else {
        console.warn("Unknown Invoice Type:", invoiceDetails.InvoiceType);
    }

    document.querySelectorAll(".delete-btn").forEach(btn => btn.disabled = true);
}

const addShipBtn = document.getElementById('addShipmentNo');
if (addShipBtn) {
    addShipBtn.addEventListener('click', async () => {
        const shipmentNo = document.getElementById('shipmentNo').value.trim();
        const invoiceNo = document.getElementById('invoiceNo').value.trim();
        const saveSpinner = document.getElementById('saveSpinner');
        const movementType = document.getElementById('movementType').value.trim();

        if (!shipmentNo) {
            alert('Please enter/select a Shipment Number.');
            return;
        }

        if (saveSpinner) saveSpinner.classList.remove('d-none');

        const strategy = MOVEMENT_STRATEGIES[movementType];
        if (strategy && strategy.addShipment) {
            await strategy.addShipment(shipmentNo, invoiceNo);
        } else {
            console.warn('Unknown movement type:', movementType);
        }

        hideSpinner();
    });
}

const modifyBtn = document.getElementById('modifyButton');
if (modifyBtn) {
    modifyBtn.addEventListener('click', () => {
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="bi bi-save"></i> Update';
        saveButton.dataset.mode = 'update';

        document.getElementById('modifyButton').disabled = true;
        document.getElementById('deleteButton').disabled = true;
        document.getElementById('reportButton').disabled = true;

        enableForm();
        document.getElementById('invoiceNo').disabled = true;
        document.getElementById('movementType').disabled = false;
        document.getElementById('partyName').disabled = false;
        document.getElementById('fetchPendingInvoices').disabled = false;

        document.querySelectorAll('.delete-btn').forEach(button => button.disabled = false);
        document.getElementById('addShipmentNo').disabled = false;
    });
}

const delBtn = document.getElementById('deleteButton');
if (delBtn) delBtn.addEventListener('click', () => alert('Delete functionality not implemented yet.'));

document.getElementById('reportButton').addEventListener('click', async function () {

    const btn = this;
    const originalText = btn.innerHTML;

    try {
        const invoiceNo = document.getElementById('invoiceNo').value.trim();

        if (!invoiceNo) {
            alert('Please enter/select an Invoice Number.');
            return;
        }

        // Show processing state
        btn.disabled = true;
        btn.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2"></span>
            Processing...
        `;

        reportType = document.getElementById('reportType').value;

        const invoiceDetails = await getInvoiceDetails(invoiceNo);

        if (!invoiceDetails) return;

        if (FORWARDING_TYPES.includes(invoiceDetails.InvoiceType)) {

            if (reportType === 'Main') {
                await generate_International_InvoicePDF_Main(invoiceDetails);
            } else if (reportType === 'Print Annexure') {
                await generate_International_InvoicePDF_Annexure(invoiceDetails);
            }

        } else if (invoiceDetails.InvoiceType === 'Customs Clearance') {

            await generate_Clear_InvoicePDF_Main(invoiceDetails);

        } else if (invoiceDetails.InvoiceType === 'Domestic') {

            await generate_DomesticReports_InvoicePDF(invoiceDetails);

        } else if (invoiceDetails.InvoiceType === 'Full Truck Load') {

            await generate_FullTruckReports_InvoicePDF(invoiceDetails);

        } else {

            console.warn('Unknown movement type:', invoiceDetails.InvoiceType);

        }

    } catch (error) {
        console.error("Invoice PDF Generation Failed:", error?.stack || error?.message || error);

        if (typeof Swal !== "undefined") {
            Swal.fire("Error", error?.message || "PDF generation failed", "error");
        } else {
            alert("Report generation failed: " + (error?.message || error));
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

function showAddressSelectionModal(addresses) {
    const container = document.getElementById('addressListContainer');
    const modalEl = document.getElementById('addressSelectionModal');
    const invoiceAddressInput = document.getElementById('invoiceAddress');

    container.innerHTML = '';
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    modalEl.addEventListener('hide.bs.modal', function () {
        if (modalEl.contains(document.activeElement)) {
            document.activeElement.blur();
        }
    }, { once: true });

    modalEl.addEventListener('hidden.bs.modal', function () {
        invoiceAddressInput?.focus();
    }, { once: true });

    addresses.forEach((address) => {
        const formattedAddress = formatAddress(address);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-outline-primary w-100 mb-2';
        button.textContent = formattedAddress;

        button.addEventListener('click', () => {
            invoiceAddressInput.value = formattedAddress;
            button.blur();
            modal.hide();
        });

        container.appendChild(button);
    });

    modal.show();
}

/* =========================================================
   ROW DELETION & RECALCULATION LOGIC
========================================================= */

const pendingTable = document.getElementById('pendingShipmentTable');
if (pendingTable) {
    pendingTable.addEventListener('click', function (e) {
        const deleteBtn = e.target.closest('.delete-btn');

        if (deleteBtn && !deleteBtn.disabled) {
            const row = deleteBtn.closest('tr');
            if (!row) return;

            const shipmentNo = deleteBtn.dataset.shipmentNo || row.cells[0]?.textContent.trim();

            row.remove();

            if (shipmentNo) {
                if (invoiceData && invoiceData[shipmentNo]) delete invoiceData[shipmentNo];
                if (invoiceChargesData && invoiceChargesData[shipmentNo]) delete invoiceChargesData[shipmentNo];
            }

            const tbody = document.querySelector('#pendingShipmentTable tbody');
            const remainingRows = tbody ? tbody.querySelectorAll('tr').length : 0;

            if (remainingRows === 0) {
                clearChargesTable();
                clearInvoiceTotals();
            } else {
                const updatedChargesMap = aggregateRemainingCharges(invoiceChargesData);
                renderChargesTable(updatedChargesMap);

                recalculateShipmentTotals();
                recalculateChargesTotals();
            }
        }
    });
}

function aggregateRemainingCharges(chargesState) {
    const aggregated = {};
    if (!chargesState) return aggregated;

    Object.values(chargesState).forEach(shipmentCharges => {
        Object.entries(shipmentCharges).forEach(([type, amounts]) => {
            if (!aggregated[type]) {
                aggregated[type] = { TotalAmount: 0, SGSTAmt: 0, CGSTAmt: 0, IGSTAmt: 0, TotalGSTAmt: 0, GrandTotalAmt: 0 };
            }
            aggregated[type].TotalAmount += amounts.TotalAmount || 0;
            aggregated[type].SGSTAmt += amounts.SGSTAmt || 0;
            aggregated[type].CGSTAmt += amounts.CGSTAmt || 0;
            aggregated[type].IGSTAmt += amounts.IGSTAmt || 0;
            aggregated[type].TotalGSTAmt += amounts.TotalGSTAmt || 0;
            aggregated[type].GrandTotalAmt += amounts.GrandTotalAmt || 0;
        });
    });
    return aggregated;
}

const getSafeCellVal = (cell) => {
    if (!cell) return 0;
    let text = cell.tagName === 'INPUT' ? cell.value : cell.textContent;
    return parseFloat(text.replace(/,/g, '').trim()) || 0;
};

function recalculateShipmentTotals() {
    const tbody = document.querySelector('#pendingShipmentTable tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');

    let totals = {
        quantity: 0, chargeableWeight: 0, freight: 0, fsc: 0,
        other: 0, sgst: 0, cgst: 0, igst: 0, gst: 0, grand: 0
    };

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 17) {
            totals.quantity += getSafeCellVal(cells[7]);
            totals.chargeableWeight += getSafeCellVal(cells[9]);

            totals.freight += toCents(getSafeCellVal(cells[10]));
            totals.fsc += toCents(getSafeCellVal(cells[11]));
            totals.other += toCents(getSafeCellVal(cells[12]));
            totals.sgst += toCents(getSafeCellVal(cells[13]));
            totals.cgst += toCents(getSafeCellVal(cells[14]));
            totals.igst += toCents(getSafeCellVal(cells[15]));
            totals.gst += toCents(getSafeCellVal(cells[16]));
            totals.grand += toCents(getSafeCellVal(cells[17]));
        }
    });

    const format = (val) => val.toFixed(2);

    setSafeText('totalQuantity', format(totals.quantity));
    setSafeText('totalChargeableWeight', format(totals.chargeableWeight));
    setSafeText('totalFreight', format(totals.freight / 100));
    setSafeText('totalFSCAmt', format(totals.fsc / 100));
    setSafeText('totalOtherAmt', format(totals.other / 100));
    setSafeText('totalSGST', format(totals.sgst / 100));
    setSafeText('totalCGST', format(totals.cgst / 100));
    setSafeText('totalIGST', format(totals.igst / 100));
    setSafeText('totalGST', format(totals.gst / 100));

    setSafeText('totalGrand', Math.round(totals.grand / 100).toFixed(2));
    setSafeText('totalAmount', Math.round(totals.grand / 100).toFixed(2));

    setSafeText('totalFreight_sc', format(totals.freight / 100));
    setSafeText('totalFreight_d', format(totals.freight / 100));
    setSafeText('totalCGST_sc', format(totals.cgst / 100));
    setSafeText('totalSGST_sc', format(totals.sgst / 100));
    setSafeText('totalIGST_sc', format(totals.igst / 100));
}

function recalculateChargesTotals() {
    const tbody = document.querySelector('#pendingShipmentCharges tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    let totals = { freight: 0, sgst: 0, cgst: 0, igst: 0, gst: 0, grand: 0 };

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 7) {
            totals.freight += toCents(getSafeCellVal(cells[1]));
            totals.sgst += toCents(getSafeCellVal(cells[2]));
            totals.cgst += toCents(getSafeCellVal(cells[3]));
            totals.igst += toCents(getSafeCellVal(cells[4]));
            totals.gst += toCents(getSafeCellVal(cells[5]));
            totals.grand += toCents(getSafeCellVal(cells[6]));
        }
    });

    const format = (val) => (val / 100).toFixed(2);

    setSafeText('totalFreightAmt', format(totals.freight));
    setSafeText('totalSGSTAmt', format(totals.sgst));
    setSafeText('totalCGSTAmt', format(totals.cgst));
    setSafeText('totalIGSTAmt', format(totals.igst));
    setSafeText('totalGSTAmt', format(totals.gst));
    setSafeText('totalGrandAmt', Math.round(totals.grand / 100).toFixed(2));
}

/* =========================================================
   SEARCH SAVED INVOICES — MODAL WIRING + DATA FETCH
========================================================= */

/**
 * Opens the invoice search modal, auto-loads recent invoices,
 * wires Enter key + search button, and handles row selection.
 */
(function wireInvoiceSearchModal() {
    function init() {
        const openBtn = document.getElementById('invoiceNoSearch');
        const modalEl = document.getElementById('searchInvoiceModal');
        const inputEl = document.getElementById('searchSavedInvoiceInput');
        const tbodyEl = document.getElementById('searchInvoiceTableBody');
        const btnSearch = document.getElementById('btnTriggerSearch');

        if (!modalEl || !inputEl || !tbodyEl) return;

        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);

        /* ---- Open modal (🔍 button next to Invoice No) ---- */
        if (openBtn) {
            openBtn.addEventListener('click', function () {
                inputEl.value = '';
                modalInstance.show();
                searchSavedInvoice();
                setTimeout(() => inputEl.focus(), 250);
            });
        }

        /* ---- Auto-load when modal opens via any trigger ---- */
        modalEl.addEventListener('shown.bs.modal', function () {
            if (!inputEl.value.trim()) searchSavedInvoice();
        });

        /* ---- Search button inside modal ---- */
        if (btnSearch) {
            btnSearch.addEventListener('click', searchSavedInvoice);
        }

        /* ---- Enter key inside search input ---- */
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchSavedInvoice();
            }
        });

        /* ---- Row selection ---- */
        tbodyEl.addEventListener('click', async function (e) {
            const btn = e.target.closest('.select-invoice-btn');
            if (!btn) return;

            const invoiceNoVal = btn.dataset.id;
            modalInstance.hide();

            if (invoiceNoVal) {
                await loadInvoice(invoiceNoVal);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* =========================================================
   FETCH SAVED INVOICES FOR THE MODAL
========================================================= */
async function searchSavedInvoice() {
    const inputEl = document.getElementById("searchSavedInvoiceInput");
    const tbodyEl = document.getElementById("searchInvoiceTableBody");
    if (!inputEl || !tbodyEl) return;

    const query = inputEl.value.trim();

    // Loading state (7 columns)
    tbodyEl.innerHTML = `
        <tr>
            <td colspan="7" class="text-center text-muted py-3">
                <span class="spinner-border spinner-border-sm me-2"></span>
                Searching...
            </td>
        </tr>`;

    /* ---- Build query ---- */
    let q = supabaseClient
        .from("InvoicePaymentView")
        .select("InvoiceNo, InvoiceDate, InvoiceType, PartyCode, PartyName, GrandTotalAmount, BalanceAmount")
        .eq("company_id", CompanyID)

    if (query) {
        q = q.or(
            `InvoiceNo.ilike.%${query}%,` +
            `PartyCode.ilike.%${query}%,` +
            `PartyName.ilike.%${query}%,` +
            `InvoiceType.ilike.%${query}%`
        );
    }

    const { data: payData, error } = await q
        .order("InvoiceDate", { ascending: false })
        .limit(50);

    if (error) {
        console.error("searchSavedInvoice error:", error);
        tbodyEl.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-danger fw-bold py-3">
                    <i class="bi bi-exclamation-triangle me-1"></i> Error fetching data.
                </td>
            </tr>`;
        return;
    }

    if (!payData || !payData.length) {
        tbodyEl.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted fst-italic py-3">
                    <i class="bi bi-inbox fs-4 d-block mb-2 opacity-50"></i>
                    No invoices found.
                </td>
            </tr>`;
        return;
    }

    /* ---- Fetch party names for rows missing PartyName ---- */
    const missingCodes = [...new Set(
        payData.filter(i => !i.PartyName && i.PartyCode).map(i => i.PartyCode)
    )];
    const pMap = {};
    if (missingCodes.length) {
        const { data: pData } = await supabaseClient
            .from("PartyDetails")
            .select("PartyCode, PartyName")
            .eq("company_id", CompanyID)
            .in("PartyCode", missingCodes);
        pData?.forEach(p => (pMap[p.PartyCode] = p.PartyName));
    }

    /* ---- Render rows using DOM APIs (XSS-safe) ---- */
    const frag = document.createDocumentFragment();

    payData.forEach((p, idx) => {
        const displayDate = typeof formatDate === 'function'
            ? formatDate(p.InvoiceDate)
            : (p.InvoiceDate || "-");
        const customerName = p.PartyName || pMap[p.PartyCode] || p.PartyCode || "-";
        const movementType = p.InvoiceType || "-";
        const total = typeof safeNumber === 'function'
            ? safeNumber(p.GrandTotalAmount).toFixed(2)
            : Number(p.GrandTotalAmount || 0).toFixed(2);

        const tr = document.createElement("tr");

        const tdIdx = document.createElement("td");
        tdIdx.className = "text-center";
        tdIdx.textContent = idx + 1;

        const tdInv = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = "badge bg-secondary";
        badge.textContent = p.InvoiceNo || "";
        tdInv.appendChild(badge);

        const tdDate = document.createElement("td");
        tdDate.textContent = displayDate;

        const tdCust = document.createElement("td");
        tdCust.className = "text-start fw-bold";
        tdCust.textContent = customerName;

        const tdMove = document.createElement("td");
        tdMove.textContent = movementType;

        const tdAmt = document.createElement("td");
        tdAmt.className = "text-end fw-bold text-success";
        tdAmt.textContent = total;

        const tdAct = document.createElement("td");
        tdAct.className = "text-center";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-sm btn-success select-invoice-btn";
        btn.dataset.id = p.InvoiceNo || "";
        btn.title = "Select this invoice";
        btn.innerHTML = '<i class="bi bi-check2-circle"></i> Select';
        tdAct.appendChild(btn);

        tr.append(tdIdx, tdInv, tdDate, tdCust, tdMove, tdAmt, tdAct);
        frag.appendChild(tr);
    });

    tbodyEl.innerHTML = "";
    tbodyEl.appendChild(frag);
}