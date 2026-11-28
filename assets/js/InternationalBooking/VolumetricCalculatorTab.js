// VolumetricCalculatorTab.js
tabPackingType.addEventListener('change', () =>
    handleDatalistInsert(tabPackingType, 'tabPackingTypeSuggestions', 'PackingType')
);

async function fetchCFTDetails() {
    try {
        const transitTypeInput = document.getElementById('transitTypeI')?.value;

        if (!transitTypeInput) {
            console.warn('Transit type not selected.');
            return null;
        }

        const TRANSIT_MAP = {
            'By Sea Freight': ['seaFreightInternational', 'seaInternational'],
            'By Air Freight': ['airFreightInternational', 'airInternational'],
            'By Courier': ['courierInternational']
        };

        const transitKeys = TRANSIT_MAP[transitTypeInput];

        if (!transitKeys) {
            console.warn('Unsupported transit type:', transitTypeInput);
            return null;
        }

        const { data, error } = await supabaseClient
            .from('SettingParameters')
            .select('InputFieldID, FieldValue')
            .in('InputFieldID', transitKeys)
            .eq('company_id', CompanyID);

        if (error) throw error;
        if (!data || data.length === 0) return null;

        // Check primary key first, then fallback key
        for (const key of transitKeys) {
            const match = data.find(
                row => row.InputFieldID?.trim() === key && Number(row.FieldValue) > 0
            );
            if (match) return Number(match.FieldValue);
        }

        return null;
    } catch (err) {
        console.error('Error fetching CFT details:', err.message);
        return null;
    }
}

lengthCM.addEventListener('change', () =>
    calculateVolumetric()
);
widthCM.addEventListener('change', () =>
    calculateVolumetric()
);
heightCM.addEventListener('change', () =>
    calculateVolumetric()
);
quantityV.addEventListener('change', () =>
    calculateVolumetric()
);
actualWtV.addEventListener('change', () =>
    calculateVolumetric()
);
transitTypeI.addEventListener('change', () =>
    calculateVolumetric()
);
uOMType.addEventListener('change', () =>
    calculateVolumetric()
);

async function calculateVolumetric() {
    try {
        const lengthCM = Number(document.getElementById('lengthCM')?.value);
        const widthCM = Number(document.getElementById('widthCM')?.value);
        const heightCM = Number(document.getElementById('heightCM')?.value);
        const quantity = Number(document.getElementById('quantityV')?.value);
        const actualWt = Number(document.getElementById('actualWtV')?.value);
        const transitType = document.getElementById('transitTypeI')?.value;
        let uomVal = document.getElementById('uOMType')?.value;

        if (![lengthCM, widthCM, heightCM, quantity, actualWt].every(v => v > 0)) {
            return;
        }

        const cft = await fetchCFTDetails();

        if (!cft || cft <= 0) {
            console.warn('Invalid CFT value:', cft);

            // Clear stale calculated fields
            document.getElementById('volumeWtV').value = '';
            document.getElementById('totalVolumeWtV').value = '';
            document.getElementById('chargeableWtV').value = '';

            const message = transitType
                ? `CFT value is not configured for "${transitType}". Please update CFT details in Settings.`
                : 'CFT value is missing. Please select a Transit Type and update CFT details in Settings.';

            showCFTWarning(message);
            return null;
        }

        const actualWeight = actualWt * quantity;
        const volumetricWeight = (lengthCM * widthCM * heightCM) / cft;
        const totalVolumeWeight = volumetricWeight * quantity;

        const maxChargeableWeight = Math.max(actualWeight, totalVolumeWeight);

        // Update UI
        document.getElementById('totalActualWtV').value = actualWeight.toFixed(2);
        document.getElementById('volumeWtV').value = volumetricWeight.toFixed(2);
        document.getElementById('totalVolumeWtV').value = totalVolumeWeight.toFixed(2);

        let chargeableWeight;
        uomVal = uomVal?.trim().toLowerCase();

        switch (uomVal) {
            case 'kgs':
            case 'tons':
                chargeableWeight = Math.ceil(maxChargeableWeight);
                break;

            case 'gms': {
                const integer = Math.floor(maxChargeableWeight);
                const decimal = maxChargeableWeight - integer;
                chargeableWeight = decimal <= 0.5 ? integer + 0.5 : Math.ceil(maxChargeableWeight);
                break;
            }

            case 'fixed':
            default:
                chargeableWeight = maxChargeableWeight;
        }

        document.getElementById('chargeableWtV').value = chargeableWeight.toFixed(2);

        return chargeableWeight;

    } catch (err) {
        console.error('Error calculating volumetric:', err.message);
        return null;
    }
}

function showCFTWarning(message) {
    const toastEl = document.getElementById('errorToast');
    const toastMsgEl = document.getElementById('errorToastMessage');

    if (toastEl && toastMsgEl && window.bootstrap) {
        toastMsgEl.textContent = message;
        bootstrap.Toast.getOrCreateInstance(toastEl).show();
    } else {
        alert(message);
    }
}

document.getElementById("addVolumetricRow").addEventListener("click", function () {
    const packingTypeRow = document.getElementById("tabPackingType").value.trim();
    const lengthRow = parseFloat(document.getElementById("lengthCM").value) || 0;
    const widthRow = parseFloat(document.getElementById("widthCM").value) || 0;
    const heightRow = parseFloat(document.getElementById("heightCM").value) || 0;
    const quantityRow = parseInt(document.getElementById("quantityV").value) || 0;
    const actualWtRow = parseFloat(document.getElementById("actualWtV").value) || 0;
    const totalActualWtRow = parseFloat(document.getElementById("totalActualWtV").value) || 0;
    const volumeWtRow = parseFloat(document.getElementById("volumeWtV").value) || 0;
    const totalVolWtRow = parseFloat(document.getElementById("totalVolumeWtV").value) || 0;
    const chargableWtRow = parseFloat(document.getElementById("chargeableWtV").value) || 0;

    if (!packingTypeRow) {
        alert("Packing Type is required.");
        return;
    }

    if (!quantityRow || quantityRow <= 0) {
        alert("Quantity must be greater than 0");
        return;
    }

    if (!lengthRow || !widthRow || !heightRow) {
        alert("Length, Width and Height are required.");
        return;
    }

    const table = document.getElementById("volumetricTable").querySelector("tbody");

    const row = document.createElement("tr");
    row.setAttribute("data-volumetric-status", "new");

    row.innerHTML = `
        <td>${packingTypeRow}</td>
        <td>${lengthRow}</td>
        <td>${widthRow}</td>
        <td>${heightRow}</td>
        <td>${quantityRow}</td>
        <td>${actualWtRow}</td>
        <td>${totalActualWtRow}</td>
        <td>${volumeWtRow}</td>
        <td>${totalVolWtRow}</td>
        <td>${chargableWtRow}</td>
        <td><button type="button" class="btn btn-sm btn-danger remove-row">Delete</button></td>
    `;

    table.appendChild(row);

    document.querySelectorAll("#volumetric input").forEach(input => input.value = "");

    updateTotals();
});

function updateTotals() {
    let totalQuantity = 0, totalActualWt = 0, totalActualWtSum = 0;
    let totalVolumeWt = 0, totalVolWtSum = 0, totalChargableWt = 0;

    document.querySelectorAll("#volumetricTable tbody tr").forEach(row => {
        const cells = row.querySelectorAll("td");
        totalQuantity += parseFloat(cells[4].textContent) || 0;
        totalActualWt += parseFloat(cells[5].textContent) || 0;
        totalActualWtSum += parseFloat(cells[6].textContent) || 0;
        totalVolumeWt += parseFloat(cells[7].textContent) || 0;
        totalVolWtSum += parseFloat(cells[8].textContent) || 0;
        totalChargableWt += parseFloat(cells[9].textContent) || 0;
    });


    document.getElementById("totalQuantity").textContent = totalQuantity.toFixed(2);
    document.getElementById("totalActualWt").textContent = totalActualWt.toFixed(2);
    document.getElementById("totalActualWtSum").textContent = totalActualWtSum.toFixed(2);
    document.getElementById("totalVolumeWt").textContent = totalVolumeWt.toFixed(2);
    document.getElementById("totalVolWtSum").textContent = totalVolWtSum.toFixed(2);
    document.getElementById("totalChargeableWt").textContent = totalChargableWt.toFixed(2);

    document.getElementById("quantity").value = totalQuantity.toFixed(2);
    document.getElementById("actualWeight").value = totalActualWtSum.toFixed(2);
    document.getElementById("volumetricWeight").value = totalVolWtSum.toFixed(2);
    document.getElementById("chargeableWeight").value = totalChargableWt.toFixed(2);
}

async function saveNewVolumetricRows() {
    try {
        const ID_IB = parseInt(document.getElementById('tempFormID').value) || null;
        const DocketNo = document.getElementById('awbNo').value.trim();

        if (!ID_IB || !DocketNo) {
            return {
                success: false,
                error: 'ID_IB or DocketNo missing'
            };
        }

        const newRows = Array.from(
            document.querySelectorAll(
                '#volumetricTable tbody tr[data-volumetric-status="new"]'
            )
        );

        if (!newRows.length) {
            return {
                success: true,
                count: 0,
                message: 'No rows to save'
            };
        }

        const td = val => parseFloat(val?.trim()) || 0;

        const rowsToInsert = newRows.map(tr => ({
            ID_IB: ID_IB,
            DocketNo: DocketNo,
            PackingType: tr.cells[0].textContent.trim(),
            Lengths: td(tr.cells[1].textContent),
            Widths: td(tr.cells[2].textContent),
            Heights: td(tr.cells[3].textContent),
            Quantity: td(tr.cells[4].textContent),
            ActualWtPcs: td(tr.cells[5].textContent),
            ActualWt: td(tr.cells[6].textContent),
            VolumePerPcs: td(tr.cells[7].textContent),
            VolumeWt: td(tr.cells[8].textContent),
            ChargableWt: td(tr.cells[9].textContent),
            created_by: UserLoginID,
            created_at: localtimeStamp
        }));

        const { data, error } = await supabaseClient
            .from('VolumetricDetails')
            .insert(rowsToInsert)
            .select();

        if (error) {
            console.error('Insert Error:', error);
            throw error;
        }

        data.forEach((row, i) => {
            newRows[i].dataset.volumetricStatus = 'saved';
            newRows[i].dataset.volumetricId = row.id;
        });

        return {
            success: true,
            count: data.length
        };

    } catch (error) {
        console.error(error);

        return {
            success: false,
            error: error.message
        };
    }
}
async function loadVolumetricDetails() {
    try {
        const ID_IB = document.getElementById('tempFormID').value;
        const DocketNo = document.getElementById('awbNo').value;
        const tbody = document.querySelector('#volumetricTable tbody');
        tbody.innerHTML = ''; // Clear previous rows

        const { data, error } = await supabaseClient
            .from('VolumetricDetails')
            .select('*')
            .eq('ID_IB', ID_IB)
            .eq('DocketNo', DocketNo);

        if (error) {
            console.error('Failed to load volumetric data:', error);
            return;
        }

        if (!data || data.length === 0) {
            // console.log('No volumetric records found.');
            return;
        }

        for (const row of data) {
            const tr = document.createElement('tr');
            tr.dataset.volumetricStatus = 'saved';
            tr.dataset.volumetricId = row.id;

            tr.innerHTML = `
                <td>${row.PackingType}</td>
                <td>${row.Lengths}</td>
                <td>${row.Widths}</td>
                <td>${row.Heights}</td>
                <td>${row.Quantity}</td>
                <td>${row.ActualWtPcs}</td>
                <td>${row.ActualWt}</td>
                <td>${row.VolumePerPcs}</td>
                <td>${row.VolumeWt}</td>
                <td>${row.ChargableWt}</td>
                <td><button type="button" class="btn btn-sm btn-danger remove-row"><i class="bi bi-trash"></i></button></td>
            `;
            tbody.appendChild(tr);
        }
        toggleEditMode(true); // Enable delete buttons
        updateTotals(); // Recalculate table footer totals
    } catch (err) {
        console.error('Error loading volumetric rows:', err.message);
    }
}

document.getElementById('volumetricTable').addEventListener('click', async function (e) {
    const removeBtn = e.target.closest('.remove-row');
    if (!removeBtn) return;

    e.preventDefault(); // Extra safeguard against form submission

    const row = removeBtn.closest('tr');
    const status = row.dataset.volumetricStatus;
    const id = row.dataset.volumetricId;

    // Confirm delete
    if (!confirm('Are you sure you want to delete this row?')) return;

    // If it's a saved row, delete from Supabase
    if (status === 'saved' && id) {
        const { error } = await supabaseClient
            .from('VolumetricDetails')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Error deleting row from database: ' + error.message);
            return;
        }
    }

    // Remove row from DOM
    row.remove();
    updateTotals();
});
