const docketNoInput = document.getElementById('docketNo');

document.addEventListener("DOMContentLoaded", async () => {
    enableForm();
    await Promise.all([
        await loadSuggestions('customerNameSuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
        await loadSuggestions('consignorNameSuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
        await loadSuggestions('serviceProviderSuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
        loadDatalist('departmentList', 'Department')
    ]);
    await setupPincodeListener('originPinCode', 'orgincity');
    await initChargeableWeightCalculator("#actualWeight", "#volumetricWeight", "#chargeableWeight", "#uOMType");

    document.getElementById('chargeableWeight').disabled = true;

    populateContainerTypes();
    setupEventListeners();
    loadDatalist('tabPackingTypeSuggestions', 'PackingType'); // Static data
    initDatalistValidation();
    loadTaxData();
    const urlParams = new URLSearchParams(window.location.search);
    const incomingRequestNo = urlParams.get('pickupRequestNo');
    const headerBadge = document.getElementById("headerPickupRequestBadge");
    const headerText = document.getElementById("headerPickupRequestNoText");

    if (incomingRequestNo) {
        headerText.textContent = incomingRequestNo;
        headerBadge.classList.remove("d-none");
    }
});

document.getElementById("docketNo").addEventListener("input", e => loadDocketDetails(e.target.value));

docketNoInput.addEventListener('change', async () => {
    const docketNo = docketNoInput.value;
    if (!docketNo) return;

    try {

        // 2) Load basic docket details
        await fetchDocketDetails(docketNo);

        // 3) Setup charge type validation
        await setupChargeTypeValidation();

        // 4) Read temp form ID
        const tempFormID = document.getElementById('tempFormID').value.trim();

        // If TEMP docket, stop here (do not load other details)
        if (tempFormID.includes('TEMP')) return;

        // 5) Load remaining sections in parallel (faster)
        await Promise.all([
            loadFreightCharges(),
            loadVolumetricDetails(),
            fetchEquipmentDetails(tempFormID),
            // fetchContainerDetails(tempFormID),
            // loadBookingStatus(docketNo)
        ]);

        // 1) Check billing status first
        const { isUnbilled, invoiceNo } = await checkAWBBilledStatus(docketNo);

        if (!isUnbilled) {
            showToast('This AWB has already been billed.' + ` Invoice Number: ${invoiceNo}`);
            // alert(`This AWB has already been billed.\nInvoice Number: ${invoiceNo}`);
            disableForm();
            saveButton.disabled = true;
            modifyButton.disabled = true;
            deleteButton.disabled = true;
        }

    } catch (error) {
        console.error('Error loading AWB details:', error);
        alert('Failed to load docket details. Please try again.');
    }
});
async function loadDocketDetails(docketNo) {
    if (!docketNo) return;

    const { data, error } = await supabaseClient
        .from('DomesticBookingDetails')
        .select('*')
        .ilike('DocketNo', `${docketNo}%`)
        .eq('company_id', CompanyID)
        .limit(10);

    if (error) {
        console.error('Error fetching docket numbers:', error);
        return;
    }

    const dataList = document.getElementById('docketNoSuggestions');
    dataList.innerHTML = '';

    data.forEach(item => {
        const option = document.createElement('option');
        option.value = item.DocketNo;
        dataList.appendChild(option);
    });
}

async function initChargeableWeightCalculator(actualSelector, volumetricSelector, chargeableSelector, uomSelector) {
    const actualWeightInput = typeof actualSelector === "string" ? document.querySelector(actualSelector) : actualSelector;
    const volumetricWeightInput = typeof volumetricSelector === "string" ? document.querySelector(volumetricSelector) : volumetricSelector;
    const chargeableWeightInput = typeof chargeableSelector === "string" ? document.querySelector(chargeableSelector) : chargeableSelector;
    const uOMTypeInput = typeof uomSelector === "string" ? document.querySelector(uomSelector) : uomSelector;

    if (!actualWeightInput || !volumetricWeightInput || !chargeableWeightInput || !uOMTypeInput) {
        console.warn("One or more elements not found for chargeable weight calculator.");
        return;
    }

    function applyRounding(uom, chargeable, actual) {
        uom = uom?.trim().toLowerCase();
        switch (uom) {
            case 'kgs':
                return Math.round(chargeable);
            case 'tons':
                return Math.round(chargeable);
            case 'gms':
                if (Number.isInteger(chargeable)) {
                    return chargeable;
                } else {
                    const decimal = chargeable - Math.floor(chargeable);
                    return (decimal <= 0.5) ? Math.floor(chargeable) + 0.5 : Math.round(chargeable);
                }
            case 'fixed':
                return actual;
            default:
                return chargeable;
        }
    }

    function updateChargeableWeight() {
        const actualVal = actualWeightInput.value;
        const volVal = volumetricWeightInput.value;
        const uomVal = uOMTypeInput?.value;

        if (actualVal === "" || volVal === "" || !uomVal) {
            chargeableWeightInput.value = "";
            return;
        }

        const actual = parseFloat(actualVal);
        const volumetric = parseFloat(volVal);
        const rawChargeable = Math.max(actual, volumetric);
        const roundedChargeable = applyRounding(uomVal, rawChargeable, actual);
        chargeableWeightInput.value = roundedChargeable.toFixed(2);
    }

    // Attach event listeners
    actualWeightInput.addEventListener("input", updateChargeableWeight);
    volumetricWeightInput.addEventListener("input", updateChargeableWeight);
    uOMTypeInput.addEventListener("change", updateChargeableWeight);

    // Optional: initial calculation
    updateChargeableWeight();
}

async function fetchDocketDetails(docketNo) {

    const { data, error } = await supabaseClient
        .from('DomesticBookingDetails')
        .select('*')
        .eq('DocketNo', docketNo)
        .eq('company_id', CompanyID)
        .maybeSingle();

    if (error) {
        console.error('Error fetching docket details:', error);
        return;
    }

    if (!data) {
        return;
    }
    // Map fields

    document.getElementById('tempFormID').value = data.id;
    document.getElementById('currentStatus').value = data.Status
    document.getElementById('partyCode').value = data.CustomerCode
    document.getElementById('customerName').value = data.CustomerName;
    document.getElementById('bookedDate').value = data.BookingDate;
    document.getElementById('shippingTypeD').value = data.ShippingType;
    document.getElementById('transitTypeD').value = data.TransitType;
    document.getElementById('modeTypeD').value = data.ModeType;
    document.getElementById('serviceProviderName').value = data.ServiceProvider;
    document.getElementById('customerReferenceNo').value = data.CustomerReferenceNo;
    document.getElementById('invoiceValue').value = data.InvoiceValue;
    document.getElementById('paymentType').value = data.PaymentType;
    document.getElementById('consignorName').value = data.ConsignorName;
    document.getElementById('originPinCode').value = data.OriginPincode;
    document.getElementById('originCity').value = data.OriginCity;
    document.getElementById('originAddress').value = data.OriginAddress;
    document.getElementById('consigneeName').value = data.ConsigneeName;
    document.getElementById('destinationPincode').value = data.DestinationPincode;
    document.getElementById('destinationCity').value = data.DestinationCity;
    document.getElementById('destinationAddress').value = data.DestinationAddress;
    document.getElementById('uOMType').value = data.UOMType;
    document.getElementById('quantity').value = data.Quantity;
    document.getElementById('actualWeight').value = data.ActualWeight;
    document.getElementById('volumetricWeight').value = data.VolumetricWeight;
    document.getElementById('chargeableWeight').value = data.ChargeableWeight;
    document.getElementById('cargoDescription').value = data.CargoDescription;
    document.getElementById('department').value = data.Department;

    toggleContainerTab(data.ModeType);

    disableForm();
    deleteButton.disabled = true;
    saveButton.disabled = true;
    modifyButton.disabled = false;
    reportButton.disabled = false;
    document.getElementById('addFreightRow').disabled = true;
}

async function checkAWBBilledStatus(docketNo) {
    const { data, error } = await supabaseClient
        .from('DomesticBookingDetails')
        .select('InvoiceNumber')
        .eq('DocketNo', docketNo)
        .eq('company_id', CompanyID)
        .maybeSingle();

    // If no record or no invoice → unbilled
    if (error || !data || !data.InvoiceNumber) {
        return { isUnbilled: true, invoiceNo: null };
    }

    // If invoice exists → billed
    return { isUnbilled: false, invoiceNo: data.InvoiceNumber };
}

//newbutton on click clear form & enable saveButton
document.getElementById('newButton').addEventListener('click', () => {
    clearForm();
    enableForm();
    toggleEditMode(true);

    // Button States
    saveButton.disabled = false;
    modifyButton.disabled = true;
    deleteButton.disabled = true;
    reportButton.disabled = true;
    saveButton.innerHTML = '<i class="bi bi-save"></i> Save';
    saveButton.dataset.mode = 'insert';

    // Total container refresh
    // location.reload();


    //clear domestic booking charges table
    const chargesTableBody = document.getElementById('chargesBody');
    chargesTableBody.innerHTML = '';

    // Enable the save button
    document.getElementById('saveButton').disabled = false;
    saveButton.dataset.mode = 'insert';
    enableForm();

    // Enable adding freight
    document.getElementById('addFreightRow').disabled = false;

    // Clear Freight Table
    document.querySelector('#freightTable tbody').innerHTML = '';

    // Clear Container Details Table
    document.querySelector('#containerDetailsTable tbody').innerHTML = '';

    // Clear Volumetric Table
    document.querySelector('#volumetricTable tbody').innerHTML = '';

    // Recalculate Totals
    recalcTotals();
    // updateTotals(); // Reset totals display
    document.querySelector('#bookingStatusTable tbody').innerHTML = ''; // Clear previous data
    // Hide the Request Number container / badge if it was visible
    const requestNoEl = document.getElementById("headerPickupRequestNoText");
    const headerBadge = document.getElementById("headerPickupRequestBadge");

    if (headerBadge) {
        headerBadge.classList.add("d-none");
    }

    if (requestNoEl) {
        requestNoEl.textContent = ""; // Correct way to clear text content of a span
    }

    // Disable calculated weight fields
    ['totalActualWtV', 'volumeWtV', 'totalVolumeWtV', 'chargeableWtV', 'chargeableWeight'].forEach(id => {
        document.getElementById(id).disabled = true;
    });
    resetVolumetricTotals();
    toggleContainerTab("");
    setTempFormID();
});

modifyButton.addEventListener('click', () => {
    enableForm();
    docketNoInput.disabled = true;
    saveButton.disabled = false;
    modifyButton.disabled = true;
    saveButton.innerHTML = '<i class="bi bi-save"></i> Update';
    saveButton.dataset.mode = 'update';

    toggleEditMode(false);

});

document.getElementById('saveButton').addEventListener('click', async () => {
    const docketNoInput = document.getElementById('docketNo');
    const mode = document.getElementById('saveButton').dataset.mode || 'insert';

    const val = id => document.getElementById(id)?.value || "";
    saveButton.disabled = true;
    const requestNoText = document.getElementById("headerPickupRequestNoText").textContent.trim();
    const rawRequestNo = document.getElementById('headerPickupRequestNoText').textContent.trim();
    const headerBadge = document.getElementById("headerPickupRequestBadge");

    // Determine if the badge is visible and a valid request number exists
    const isBadgeVisible = headerBadge && !headerBadge.classList.contains("d-none");
    const finalPickupRequestNo = (isBadgeVisible && rawRequestNo !== "") ? rawRequestNo : null;

    const formData = {
        DocketNo: val('docketNo'),
        BookingDate: val('bookedDate'),
        CustomerCode: val('partyCode'),
        CustomerName: val('customerName'),
        ShippingType: val('shippingTypeD'),
        ConsignorName: val('consignorName'),
        OriginPincode: val('originPinCode'),
        OriginCity: val('originCity'),
        OriginAddress: val('originAddress'),
        ConsigneeName: val('consigneeName'),
        DestinationPincode: val('destinationPincode'),
        DestinationCity: val('destinationCity'),
        DestinationAddress: val('destinationAddress'),
        TransitType: val('transitTypeD'),
        ModeType: val('modeTypeD'),
        ServiceProvider: val('serviceProviderName'),
        CustomerReferenceNo: val('customerReferenceNo'),
        InvoiceValue: val('invoiceValue'),
        Quantity: val('quantity'),
        ActualWeight: val('actualWeight'),
        VolumetricWeight: val('volumetricWeight'),
        ChargeableWeight: val('chargeableWeight'),
        CargoDescription: val('cargoDescription'),
        PaymentType: val('paymentType'),
        UOMType: val('uOMType'),
        Department: val('department'),
        pickup_request_no: finalPickupRequestNo
    };

    if (mode === 'insert') {
        Object.assign(formData, {
            created_by: UserLoginID,
            created_at: localtimeStamp,
            company_id: CompanyID
        });
    } else {
        Object.assign(formData, {
            update_by: UserLoginID,
            update_at: localtimeStamp
        });
    }

    try {
        let response;

        if (mode === 'insert') {
            const { data, error } = await supabaseClient
                .from('DomesticBookingDetails')
                .insert(formData)
                .select('id')     // IMPORTANT
                .single();        // ensures single row returned

            if (error) throw error;

            insertedID = data.id;     // <-- ID RECEIVED HERE
        } else {
            const { data, error } = await supabaseClient
                .from('DomesticBookingDetails')
                .update(formData)
                .eq('DocketNo', docketNoInput.value)
                .eq('company_id', CompanyID)
                .select('id')
                .single();

            if (error) throw error;

            insertedID = data.id;
        }

        // console.log("Inserted/Updated ID:", insertedID);
        document.getElementById('tempFormID').value = insertedID; // Store ID for related tables

        await saveFreightCharges(insertedID);
        await saveNewVolumetricRows();
        await saveEquipmentDetails();
        toggleEditMode(true);
        disableForm();
        document.getElementById('addFreightRow').disabled = true;
        document.getElementById('addVolumetricRow').disabled = true;
        document.getElementById('addContainer').disabled = true;

        await updatePickupRequestStatus(requestNoText);
        showToast(`Booking details ${mode} successful!`);

    } catch (err) {
        console.error(`Error while ${mode}:`, err);
    }
});

document.getElementById('modeTypeD').addEventListener('change', function () {
    toggleContainerTab(this.value);
});
department.addEventListener('change', () =>
    handleDatalistInsert(department, 'departmentList', 'Department')
);

docketNoInput.addEventListener('input', function () {

    this.value = this.value
        .toUpperCase()          // Capital letters
        .replace(/[\r\n]/g, '') // Remove new lines
        .replace(/\s+/g, ' ')   // Single space only
        .trim();                // Remove start/end spaces
});

// Prevent Enter key
docketNoInput.addEventListener('keydown', function (event) {

    if (event.key === 'Enter') {
        event.preventDefault();
    }
});