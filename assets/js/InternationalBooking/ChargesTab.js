// Event listeners
document.getElementById('addFreightRow').addEventListener('click', addFreightRow);
document.getElementById('chargesTypeInput').addEventListener('change', onChargeTypeChange);
document.getElementById('chargesTypeInput').addEventListener('change', onChargeTypeOrPartyChange);

// Cache DOM elements that are reused
const freightElements = {
    awbNo: document.getElementById('awbNo'),
    chargesTypeInput: document.getElementById('chargesTypeInput'),
    hsnNumber: document.getElementById('hsnNumber'),
    freightAmount: document.getElementById('freightAmount'),
    remarksDetails: document.getElementById('remarksDetails'),
    partyDefaultTax: document.getElementById('partyDefaultTax'),
    freightTable: document.querySelector('#freightTable tbody'),
    tempFormID: document.getElementById('tempFormID'),
    totalElements: {
        freight: document.getElementById('totalFreight'),
        sgst: document.getElementById('totalSGST'),
        cgst: document.getElementById('totalCGST'),
        igst: document.getElementById('totalIGST'),
        gst: document.getElementById('totalGST'),
        grand: document.getElementById('totalGrand')
    }
};

// Clear form inputs
function clearFreightInputs() {
    freightElements.chargesTypeInput.value = '';
    freightElements.hsnNumber.value = '';
    freightElements.freightAmount.value = '';
    freightElements.remarksDetails.value = '';
    freightElements.partyDefaultTax.value = '';
}
async function addFreightRow() {

    const {
        awbNo,
        chargesTypeInput,
        hsnNumber,
        freightAmount,
        remarksDetails,
        partyDefaultTax
    } = freightElements;

    const tbody = document.querySelector('#freightTable tbody');

    const awbNoValue = awbNo.value.trim();
    const chargesType = chargesTypeInput.value.trim();
    const freightAmountValue =
        parseFloat(freightAmount.value) || 0;

    const chargeableWeight =
        parseFloat(document.getElementById('chargeableWeight').value) || 0;

    const uOMType =
        document.getElementById('uOMType').value;

    // =========================
    // Validation
    // =========================
    if (!awbNoValue) {
        return alert('AWB No cannot be empty!');
    }

    if (!chargesType) {
        return alert('Charges Type cannot be empty!');
    }

    if (!freightAmountValue) {
        return alert('Freight Amount cannot be empty!');
    }

    // =========================
    // FSC + HSN
    // =========================
    const fscData =
        await isFSCApplicable(chargesType);

    const isFSC =
        fscData.isApplicable;

    const freightHSN =
        fscData.hsn_code || hsnNumber.value;

    // =========================
    // Tax
    // =========================
    const taxID =
        partyDefaultTax.value.trim() || 1;

    const taxes =
        await getTaxRatesById(taxID);

    const taxCalc =
        calculateTaxes(freightAmountValue, taxes);

    // =========================
    // Quantity
    // =========================
    const quantityDisplay =
        chargesType.includes('Freight')
            ? `${chargeableWeight} ${uOMType}`
            : '1 Nos';

    // =========================
    // Fuel Surcharge Special Handling
    // =========================
    if (chargesType === 'Fuel Surcharge') {

        await recalcFSC();

        clearFreightInputs();

        return;
    }

    // =========================
    // Create Row
    // =========================
    const row = document.createElement('tr');

    row.dataset.type = 'freight';

    row.dataset.fscApplicable =
        isFSC ? 'true' : 'false';

    row.dataset.amount =
        freightAmountValue;

    row.innerHTML = `
        <td>${chargesType}</td>
        <td>${freightHSN}</td>
        <td>${remarksDetails.value}</td>

        <td class="text-end">
            ${quantityDisplay}
        </td>

        <td class="text-end">
            ${freightAmountValue.toFixed(2)}
        </td>
        
        <td class="text-end">
            ${taxCalc.totalRate}%
        </td>

        <td class="text-end">
            ${taxCalc.sgstAmt.toFixed(2)}
        </td>

        <td class="text-end">
            ${taxCalc.cgstAmt.toFixed(2)}
        </td>

        <td class="text-end">
            ${taxCalc.igstAmt.toFixed(2)}
        </td>

        <td class="text-end">
            ${taxCalc.totalGstAmt.toFixed(2)}
        </td>

        <td class="text-end">
            ${taxCalc.grandTotal.toFixed(2)}
        </td>

        <td class="text-center">
            <button type="button"
                class="btn btn-sm btn-danger delete-row">
                <i class="bi bi-trash"></i>
            </button>
        </td>

        <td class="d-none">
            ${taxID}
        </td>

        <td class="d-none">
            ${isFSC ? 'Yes' : 'No'}
        </td>
    `;

    // =========================
    // Append Row
    // =========================
    tbody.appendChild(row);

    // =========================
    // Recalculate FSC
    // =========================
    await recalcFSC();

    // =========================
    // Clear Inputs
    // =========================
    clearFreightInputs();
}
// Event delegation for delete button
document.addEventListener('click', async function (e) {
    if (e.target.classList.contains('delete-row')) {
        const row = e.target.closest('tr');
        row.remove();
        recalcTotals();
        // await recalcFSC(); // ensures totals update correctly
    }
});

async function saveFreightCharges() {
    const awbNoValue = freightElements.awbNo.value.trim();

    if (!awbNoValue) return alert('AWB No (Docket No) cannot be empty!');
    const tempFormID = document.getElementById('tempFormID')?.value; // Assuming this is a hidden input field

    try {
        if (!tempFormID) {
            alert("Temp Form ID missing!");
            return;
        }

        const { error: deleteError } = await supabaseClient
            .from('InternationalBookingCharges')
            .delete()
            .eq('ID_IB', tempFormID);

        if (deleteError) throw deleteError;

        const rows = Array.from(freightElements.freightTable.querySelectorAll('tr'));

        // if (rows.length === 0) return alert('No rows to save!');
        const insertData = [];

        for (const row of rows) {
            const cells = row.querySelectorAll('td');

            insertData.push({
                DocketNo: awbNoValue,
                ID_IB: tempFormID,
                ChargesType: cells[0].textContent.trim(),
                HSNCode: cells[1].textContent.trim(),
                Remarks: cells[2].textContent.trim(),
                Quantity: cells[3].textContent.trim() || "0 Nos",
                PerQtyAmt: Number(
                    (parseFloat(cells[4].textContent || 0) /
                        (parseFloat(cells[3].textContent.trim().split(' ')[0]) || 1)
                    ).toFixed(2)), // Calculate per quantity amount, default to 0 if parsing fails
                TotalAmount: parseFloat(cells[4].textContent) || 0, // Quantity is always 1
                TaxRate: parseFloat(cells[5].textContent.trim().replace('%', '')) || 0, // Calculate tax rate, default to 0 if parsing fails.cells[3].textContent.trim().replace('%', '') || "0",
                SGSTAmt: parseFloat(cells[6].textContent) || 0,
                CGSTAmt: parseFloat(cells[7].textContent) || 0,
                IGSTAmt: parseFloat(cells[8].textContent) || 0,
                TotalGSTAmt: parseFloat(cells[9].textContent) || 0,
                GrandTotalAmt: parseFloat(cells[10].textContent) || 0,
                TaxID: cells[12].textContent.trim(), // default to 1 if tax details not found
                created_by: UserLoginID,
                created_at: localtimeStamp
            });
        }

        // if (!insertData.length) return console.log('No new charges to save (all are duplicates).');

        const { error } = await supabaseClient
            .from('InternationalBookingCharges')
            .insert(insertData);

        if (error) throw error;
        // console.log('Charges saved successfully!');
    } catch (error) {
        console.error('Error:', error.message);
        alert(error.message || 'An error occurred while saving charges.');
    }
}

async function loadFreightCharges() {
    const awbNoValue = freightElements.awbNo.value.trim();
    const tempFormID = freightElements.tempFormID.value.trim(); // Assuming this is a hidden input field

    if (!tempFormID) return alert('Please select a valid Temp Form ID!');
    if (!awbNoValue) return alert('Please select a valid AWB No!');

    freightElements.freightTable.innerHTML = ''; // Clear table

    try {
        const { data, error } = await supabaseClient
            .from('InternationalBookingCharges')
            .select('*')
            .eq('ID_IB', tempFormID)
            .order('id', { ascending: true });

        if (error) throw error;

        for (const item of data) {

            const row = document.createElement('tr');

            const fscData = await isFSCApplicable(item.ChargesType);
            const isFSC = fscData.isApplicable;

            row.innerHTML = `
        <td>${item.ChargesType || ''}</td>
        <td>${item.HSNCode || ''}</td>
        <td>${item.Remarks || ''}</td>
        <td class="text-end">${item.Quantity || 0}</td>
        <td class="text-end">${(item.TotalAmount || 0).toFixed(2)}</td>
        <td class="text-end">${(item.TaxRate || 0).toFixed(2)}%</td>
        <td class="text-end">${(item.SGSTAmt || 0).toFixed(2)}</td>
        <td class="text-end">${(item.CGSTAmt || 0).toFixed(2)}</td>
        <td class="text-end">${(item.IGSTAmt || 0).toFixed(2)}</td>
        <td class="text-end">${(item.TotalGSTAmt || 0).toFixed(2)}</td>
        <td class="text-end">${(item.GrandTotalAmt || 0).toFixed(2)}</td>
        <td class="text-center">
            <button type="button" class="btn btn-sm btn-danger delete-row"><i class="bi bi-trash"></i></button>
        </td>
        <td class="d-none">${item.TaxID}</td>
       <td class="d-none">${isFSC ? 'Yes' : 'No'}</td>
    `;

            freightElements.freightTable.appendChild(row);
        }
        toggleEditMode(true);
        recalcTotals();
    } catch (error) {
        console.error('Error:', error.message);
        alert('Failed to load charges: ' + error.message);
    }
}

function recalcTotals() {
    const rows = freightElements.freightTable.querySelectorAll('tr');
    const totals = { freight: 0, sgst: 0, cgst: 0, igst: 0, gst: 0, grand: 0 };

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        // If we don’t have at least 11 data cells, skip this row
        if (cells.length < 11) return;

        totals.freight += parseFloat(cells[4].textContent) || 0;
        totals.sgst += parseFloat(cells[6].textContent) || 0;
        totals.cgst += parseFloat(cells[7].textContent) || 0;
        totals.igst += parseFloat(cells[8].textContent) || 0;
        totals.gst += parseFloat(cells[9].textContent) || 0;
        totals.grand += parseFloat(cells[10].textContent) || 0;
    });

    Object.entries(freightElements.totalElements).forEach(([key, el]) => {
        el.textContent = totals[key].toFixed(2);
    });
}

async function recalcFSC() {

    const tbody = document.querySelector('#freightTable tbody');

    if (!tbody) return;

    let totalBase = 0;

    // =========================
    // Get FSC Configuration
    // =========================
    const fsc = await getFSCCharges({
        partyCode: document.getElementById('partyCode')?.value.trim(),
        carrierCode: document.getElementById('carrierCode')?.value.trim(),
        movementType: document.getElementById('movementTypeI')?.value.trim(),
        modeType: document.getElementById('modeTypeI')?.value.trim(),
        bookingDate: document.getElementById('bookedDate')?.value.trim()
    });

    // =========================
    // FSC Percentage
    // =========================
    let fscPercent = Number(fsc?.fuelSurcharge || 0);

    // Manual FSC Override
    if (Number(fscPercentManual) > 0) {
        fscPercent = Number(fscPercentManual);
    }

    // Reset Manual Override
    fscPercentManual = 0;

    // =========================
    // Remove Existing FSC Rows
    // =========================
    tbody.querySelectorAll('tr').forEach(row => {

        const chargeName =
            row.children[0]?.innerText?.trim();

        if (chargeName === 'Fuel Surcharge') {
            row.remove();
        }
    });

    // =========================
    // Calculate FSC Base Amount
    // =========================
    tbody.querySelectorAll('tr').forEach(row => {

        const fscApplicable =
            row.children[13]?.innerText
                ?.trim()
                ?.toLowerCase();

        // Only FSC Applicable Rows
        if (fscApplicable !== 'yes') return;

        const basicAmt = parseFloat(
            row.children[4]?.innerText
                ?.replace(/,/g, '')
                ?.replace(/[^\d.-]/g, '')
        ) || 0;

        totalBase += basicAmt;
    });

    // =========================
    // Stop if Invalid
    // =========================
    if (totalBase <= 0 || fscPercent <= 0) {

        recalcTotals();
        return;
    }

    // =========================
    // FSC Amount
    // =========================
    const fscAmount =
        (totalBase * fscPercent) / 100;

    // =========================
    // Party Tax
    // =========================
    const partyCode =
        document.getElementById('partyCode')?.value.trim();

    const taxID =
        await fetchDefaultTax(partyCode);

    if (!taxID) {

        console.warn('Party Default Tax ID not found');

        recalcTotals();
        return;
    }

    // =========================
    // Tax Details
    // =========================
    const taxes =
        await getTaxRatesById(taxID);

    const taxCalc =
        calculateTaxes(fscAmount, taxes);

    // =========================
    // FSC HSN
    // =========================
    const fscHSN =
        fsc?.hsn_code ||
        await getFSCHSNFromDropdown();

    // =========================
    // Create FSC Row
    // =========================
    const fscRow = document.createElement('tr');

    fscRow.dataset.type = 'fsc';

    fscRow.innerHTML = `
        <td>Fuel Surcharge</td>
        <td>${fscHSN || ''}</td>
        <td>Fuel Surcharge ${fscPercent}%</td>

        <td class="text-end">1 Nos</td>

        <td class="text-end">
            ${fscAmount.toFixed(2)}
        </td>
        <td class="text-end">
            ${Number(taxCalc.totalRate || 0).toFixed(2)}%
        </td>
        <td class="text-end">
            ${taxCalc.sgstAmt.toFixed(2)}
        </td>

        <td class="text-end">
            ${taxCalc.cgstAmt.toFixed(2)}
        </td>

        <td class="text-end">
            ${taxCalc.igstAmt.toFixed(2)}
        </td>

        <td class="text-end">
            ${taxCalc.totalGstAmt.toFixed(2)}
        </td>

        <td class="text-end">
            ${taxCalc.grandTotal.toFixed(2)}
        </td>

        <td class="text-center">
            <button type="button"
                class="btn btn-sm btn-danger delete-row">
                <i class="bi bi-trash"></i>
            </button>
        </td>

        <td class="d-none">${taxID}</td>
        <td class="d-none">No</td>
    `;

    // =========================
    // Append FSC Row
    // =========================
    tbody.appendChild(fscRow);

    // =========================
    // Recalculate Totals
    // =========================
    recalcTotals();
}

chargesTypeInput.addEventListener('change', (event) => {

    // Existing FOV Modal
    loadFOVModal(event);

    // Fuel Surcharge
    loadFSCModal(event);
});
