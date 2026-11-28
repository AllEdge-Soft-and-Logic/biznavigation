// Domestic.js
const docketNoInput = document.getElementById('docketNo');
let insertedID = null;

// Utility: Debounce for live search inputs
function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// Utility: Safe toast wrapper
function notify(message, type = 'info') {
    if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        alert(message);
    }
}

// Utility: Update header state badge if present
function setFormStateBadge(label, badgeClass = 'text-bg-light border') {
    const badge = document.getElementById('formStateBadge');
    if (!badge) return;
    badge.textContent = label;
    badge.className = `badge rounded-pill fw-normal ${badgeClass}`;
}

// Utility: Lock calculated weight fields
function disableCalculatedWeightFields() {
    ['totalActualWtV', 'volumeWtV', 'totalVolumeWtV', 'chargeableWtV', 'chargeableWeight'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
}

// Utility: Toggle tab Add buttons
function setTabAddButtonsDisabled(disabled) {
    ['addFreightRow', 'addVolumetricRow', 'addContainer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });
}

// ============ DOMContentLoaded ============
document.addEventListener('DOMContentLoaded', async () => {
    enableForm();

    const saveBtn = document.getElementById('saveButton');
    if (saveBtn) saveBtn.dataset.mode = 'insert';

    await Promise.all([
        loadSuggestions('customerNameSuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
        loadSuggestions('consignorNameSuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
        loadSuggestions('serviceProviderSuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
        loadDatalist('departmentList', 'Department')
    ]);

    await setupPincodeListener('originPinCode', 'originCity');
    await initChargeableWeightCalculator('#actualWeight', '#volumetricWeight', '#chargeableWeight', '#uOMType');

    disableCalculatedWeightFields();

    populateContainerTypes();
    setupEventListeners();
    loadDatalist('tabPackingTypeSuggestions', 'PackingType');
    initDatalistValidation();
    loadTaxData();
    initDocketSearchModal();

    const urlParams = new URLSearchParams(window.location.search);
    const incomingRequestNo = urlParams.get('pickupRequestNo');
    const headerBadge = document.getElementById('headerPickupRequestBadge');
    const headerText = document.getElementById('headerPickupRequestNoText');

    if (incomingRequestNo && headerBadge && headerText) {
        headerText.textContent = incomingRequestNo;
        headerBadge.classList.remove('d-none');
    }
});

// ============ DOCKET SEARCH MODAL ============
function initDocketSearchModal() {
    const docketInput = document.getElementById('docketNo');
    const modalEl = document.getElementById('docketSearchModal');
    if (!docketInput || !modalEl) return;

    const docketSearchModal = new bootstrap.Modal(modalEl);

    const searchDocketNo = document.getElementById('searchDocketNo');
    const searchCustomerName = document.getElementById('searchCustomerName');
    const searchTransitType = document.getElementById('searchTransitType');
    const searchServiceProvider = document.getElementById('searchServiceProvider');
    const btnSearchDockets = document.getElementById('btnSearchDockets');
    const btnResetDocketSearch = document.getElementById('btnResetDocketSearch');
    const resultsBody = document.getElementById('docketSearchResultsBody');
    const resultsCount = document.getElementById('docketSearchCount');

    // 1. Open modal on double-click of Docket No
    docketInput.addEventListener('dblclick', () => {
        if (searchDocketNo) searchDocketNo.value = docketInput.value.trim();
        docketSearchModal.show();
        fetchDocketsForModal();
    });

    modalEl.addEventListener('shown.bs.modal', () => {
        searchDocketNo?.focus();
    });

    // 2. Live search (debounced) & Enter key support
    const triggerDebouncedSearch = debounce(fetchDocketsForModal, 300);

    [searchDocketNo, searchCustomerName, searchServiceProvider].forEach(input => {
        if (!input) return;
        input.addEventListener('input', triggerDebouncedSearch);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                fetchDocketsForModal();
            }
        });
    });

    searchTransitType?.addEventListener('change', fetchDocketsForModal);
    btnSearchDockets?.addEventListener('click', fetchDocketsForModal);

    // 3. Reset filters
    btnResetDocketSearch?.addEventListener('click', () => {
        if (searchDocketNo) searchDocketNo.value = '';
        if (searchCustomerName) searchCustomerName.value = '';
        if (searchTransitType) searchTransitType.value = '';
        if (searchServiceProvider) searchServiceProvider.value = '';
        fetchDocketsForModal();
    });

    // 4. Query Supabase (scoped to CompanyID, awaited AFTER chaining filters)
    async function fetchDocketsForModal() {
        resultsBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Searching dockets...
                </td>
            </tr>`;

        try {
            const docketVal = searchDocketNo?.value.trim() || '';
            const customerVal = searchCustomerName?.value.trim() || '';
            const transitVal = searchTransitType?.value.trim() || '';
            const providerVal = searchServiceProvider?.value.trim() || '';

            let query = supabaseClient
                .from('DomesticBookingView')
                .select('DocketNo, BookingDate, CustomerName, TransitType, ServiceProvider, OriginCity, DestinationCity')
                .eq('company_id', CompanyID)
                .order('BookingDate', { ascending: false })
                .limit(50);

            if (docketVal) query = query.ilike('DocketNo', `%${docketVal}%`);
            if (customerVal) query = query.ilike('CustomerName', `%${customerVal}%`);
            if (transitVal) query = query.eq('TransitType', transitVal);
            if (providerVal) query = query.ilike('ServiceProvider', `%${providerVal}%`);

            const { data, error } = await query;
            if (error) throw error;

            renderDocketSearchResults(data || []);
        } catch (err) {
            console.error('Docket search error:', err);
            resultsBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle me-1"></i> Failed to load dockets.
                    </td>
                </tr>`;
            if (resultsCount) resultsCount.textContent = '0 records found';
        }
    }

    // 5. Render rows
    function renderDocketSearchResults(rows) {
        if (resultsCount) {
            resultsCount.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'} found`;
        }

        if (!rows.length) {
            resultsBody.innerHTML = `
                <tr>
                    <td colspan="7" class="vm-empty">
                        <i class="bi bi-inbox"></i>
                        No matching dockets found
                    </td>
                </tr>`;
            return;
        }

        const safe = (val) => (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(String(val ?? '')) : String(val ?? ''));

        resultsBody.innerHTML = rows.map(row => `
            <tr style="cursor: pointer;" data-docket="${safe(row.DocketNo)}">
                <td class="fw-bold text-primary">${safe(row.DocketNo)}</td>
                <td>${safe(row.BookingDate)}</td>
                <td>${safe(row.CustomerName)}</td>
                <td><span class="badge text-bg-light border">${safe(row.TransitType)}</span></td>
                <td>${safe(row.ServiceProvider)}</td>
                <td class="small text-muted">${safe(row.OriginCity)} → ${safe(row.DestinationCity)}</td>
                <td class="text-center">
                    <button type="button" class="btn btn-outline-primary btn-sm py-0 px-2 select-docket-btn">
                        Select
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 6. Select docket (button click or row double-click)
    const selectDocket = (docketNo) => {
        if (!docketNo) return;
        docketInput.value = docketNo;
        docketSearchModal.hide();

        docketInput.dispatchEvent(new Event('change', { bubbles: true }));
        docketInput.focus();
    };

    resultsBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.select-docket-btn');
        if (!btn) return;
        const tr = btn.closest('tr');
        selectDocket(tr?.dataset.docket);
    });

    resultsBody.addEventListener('dblclick', (e) => {
        const tr = e.target.closest('tr[data-docket]');
        if (tr) selectDocket(tr.dataset.docket);
    });
}

// ============ DOCKET INPUT HANDLERS ============
const debouncedLoadDocket = debounce((val) => loadDocketDetails(val), 250);

if (docketNoInput) {
    docketNoInput.addEventListener('input', function () {
        this.value = this.value
            .toUpperCase()
            .replace(/[\r\n]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        debouncedLoadDocket(this.value);
    });

    docketNoInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
        }
    });

    docketNoInput.addEventListener('change', async () => {
        const docketNo = docketNoInput.value.trim();
        if (!docketNo) return;

        try {
            const docketResult = await fetchDocketDetails(docketNo);
            if (!docketResult.found) return;

            await setupChargeTypeValidation();

            const tempFormID = document.getElementById('tempFormID')?.value.trim() || '';
            if (!tempFormID || tempFormID.includes('TEMP')) return;

            await Promise.all([
                loadFreightCharges(),
                loadVolumetricDetails(),
                fetchEquipmentDetails(tempFormID)
            ]);

            // Check billed status directly from already-fetched docket record
            if (docketResult.invoiceNo) {
                notify(`This AWB has already been billed. Invoice Number: ${docketResult.invoiceNo}`, 'warning');
                disableForm();
                setFormStateBadge('Billed', 'text-bg-info');

                const saveBtn = document.getElementById('saveButton');
                const modifyBtn = document.getElementById('modifyButton');
                const deleteBtn = document.getElementById('deleteButton');
                if (saveBtn) saveBtn.disabled = true;
                if (modifyBtn) modifyBtn.disabled = true;
                if (deleteBtn) deleteBtn.disabled = true;
            }
        } catch (error) {
            console.error('Error loading docket details:', error);
            notify('Failed to load docket details. Please try again.', 'error');
        }
    });
}

// ============ SUPABASE QUERIES ============
async function loadDocketDetails(docketNo) {
    if (!docketNo) return;

    const { data, error } = await supabaseClient
        .from('DomesticBookingDetails')
        .select('DocketNo')
        .ilike('DocketNo', `${docketNo}%`)
        .eq('company_id', CompanyID)
        .limit(10);

    if (error) {
        console.error('Error fetching docket numbers:', error);
        return;
    }

    const dataList = document.getElementById('docketNoSuggestions');
    if (!dataList) return;

    dataList.innerHTML = '';
    const fragment = document.createDocumentFragment();
    (data || []).forEach(item => {
        const option = document.createElement('option');
        option.value = item.DocketNo;
        fragment.appendChild(option);
    });
    dataList.appendChild(fragment);
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
        return { found: false, invoiceNo: null };
    }

    if (!data) {
        return { found: false, invoiceNo: null };
    }

    const fieldMap = {
        tempFormID: data.id,
        currentStatus: data.Status,
        partyCode: data.CustomerCode,
        customerName: data.CustomerName,
        bookedDate: data.BookingDate,
        shippingTypeD: data.ShippingType,
        transitTypeD: data.TransitType,
        modeTypeD: data.ModeType,
        serviceProviderName: data.ServiceProvider,
        customerReferenceNo: data.CustomerReferenceNo,
        invoiceValue: data.InvoiceValue,
        paymentType: data.PaymentType,
        consignorName: data.ConsignorName,
        originPinCode: data.OriginPincode,
        originCity: data.OriginCity,
        originAddress: data.OriginAddress,
        consigneeName: data.ConsigneeName,
        destinationPincode: data.DestinationPincode,
        destinationCity: data.DestinationCity,
        destinationAddress: data.DestinationAddress,
        uOMType: data.UOMType,
        quantity: data.Quantity,
        actualWeight: data.ActualWeight,
        volumetricWeight: data.VolumetricWeight,
        chargeableWeight: data.ChargeableWeight,
        cargoDescription: data.CargoDescription,
        department: data.Department
    };

    Object.entries(fieldMap).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? '';
    });

    toggleContainerTab(data.ModeType);
    disableForm();
    setFormStateBadge('View', 'text-bg-secondary');

    const saveBtn = document.getElementById('saveButton');
    const modifyBtn = document.getElementById('modifyButton');
    const deleteBtn = document.getElementById('deleteButton');
    const reportBtn = document.getElementById('reportButton');

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.dataset.mode = 'update';
    }
    if (deleteBtn) deleteBtn.disabled = true;
    if (modifyBtn) modifyBtn.disabled = false;
    if (reportBtn) reportBtn.disabled = false;
    setTabAddButtonsDisabled(true);

    return { found: true, invoiceNo: data.InvoiceNumber || null };
}

// Kept for backward compatibility if called by other modules
async function checkAWBBilledStatus(docketNo) {
    const { data, error } = await supabaseClient
        .from('DomesticBookingDetails')
        .select('InvoiceNumber')
        .eq('DocketNo', docketNo)
        .eq('company_id', CompanyID)
        .maybeSingle();

    if (error || !data || !data.InvoiceNumber) {
        return { isUnbilled: true, invoiceNo: null };
    }

    return { isUnbilled: false, invoiceNo: data.InvoiceNumber };
}

// ============ CHARGEABLE WEIGHT CALCULATOR ============
async function initChargeableWeightCalculator(actualSelector, volumetricSelector, chargeableSelector, uomSelector) {
    const actualWeightInput = typeof actualSelector === 'string' ? document.querySelector(actualSelector) : actualSelector;
    const volumetricWeightInput = typeof volumetricSelector === 'string' ? document.querySelector(volumetricSelector) : volumetricSelector;
    const chargeableWeightInput = typeof chargeableSelector === 'string' ? document.querySelector(chargeableSelector) : chargeableSelector;
    const uOMTypeInput = typeof uomSelector === 'string' ? document.querySelector(uomSelector) : uomSelector;

    if (!actualWeightInput || !volumetricWeightInput || !chargeableWeightInput || !uOMTypeInput) {
        console.warn('One or more elements not found for chargeable weight calculator.');
        return;
    }

    function applyRounding(uom, chargeable, actual) {
        switch (uom?.trim().toLowerCase()) {
            case 'kgs':
            case 'tons':
                return Math.round(chargeable);
            case 'gms': {
                if (Number.isInteger(chargeable)) return chargeable;
                const decimal = chargeable - Math.floor(chargeable);
                return decimal <= 0.5 ? Math.floor(chargeable) + 0.5 : Math.round(chargeable);
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
        const uomVal = uOMTypeInput.value;

        if (actualVal === '' || volVal === '' || !uomVal) {
            chargeableWeightInput.value = '';
            return;
        }

        const actual = parseFloat(actualVal) || 0;
        const volumetric = parseFloat(volVal) || 0;
        const rawChargeable = Math.max(actual, volumetric);
        chargeableWeightInput.value = applyRounding(uomVal, rawChargeable, actual).toFixed(2);
    }

    actualWeightInput.addEventListener('input', updateChargeableWeight);
    volumetricWeightInput.addEventListener('input', updateChargeableWeight);
    uOMTypeInput.addEventListener('change', updateChargeableWeight);

    updateChargeableWeight();
}

// ============ ACTION BAR BUTTONS ============
document.getElementById('newButton')?.addEventListener('click', () => {
    clearForm();
    enableForm();
    toggleEditMode(true);
    setFormStateBadge('New', 'text-bg-light border');

    const saveBtn = document.getElementById('saveButton');
    const modifyBtn = document.getElementById('modifyButton');
    const deleteBtn = document.getElementById('deleteButton');
    const reportBtn = document.getElementById('reportButton');

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save';
        saveBtn.dataset.mode = 'insert';
    }
    if (modifyBtn) modifyBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = true;
    if (reportBtn) reportBtn.disabled = true;

    setTabAddButtonsDisabled(false);

    // Clear child tables
    ['#chargesBody', '#containerDetailsTable tbody', '#volumetricTable tbody', '#bookingStatusTable tbody'].forEach(selector => {
        const tbody = document.querySelector(selector);
        if (tbody) tbody.innerHTML = '';
    });

    // Reset pickup request badge
    const headerBadge = document.getElementById('headerPickupRequestBadge');
    const requestNoEl = document.getElementById('headerPickupRequestNoText');
    if (headerBadge) headerBadge.classList.add('d-none');
    if (requestNoEl) requestNoEl.textContent = '';

    recalcTotals();
    disableCalculatedWeightFields();
    resetVolumetricTotals();
    toggleContainerTab('');
    setTempFormID();
});

document.getElementById('modifyButton')?.addEventListener('click', () => {
    enableForm();
    setFormStateBadge('Editing', 'text-bg-warning');

    if (docketNoInput) docketNoInput.disabled = true;

    const saveBtn = document.getElementById('saveButton');
    const modifyBtn = document.getElementById('modifyButton');
    const reportBtn = document.getElementById('reportButton');

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Update';
        saveBtn.dataset.mode = 'update';
    }
    if (modifyBtn) modifyBtn.disabled = true;
    if (reportBtn) reportBtn.disabled = true;

    setTabAddButtonsDisabled(false);
    disableCalculatedWeightFields();
    toggleEditMode(false);
});

document.getElementById('saveButton')?.addEventListener('click', async function () {
    const saveBtn = this;
    const mode = saveBtn.dataset.mode || 'insert';
    const originalHTML = saveBtn.innerHTML;

    const val = id => document.getElementById(id)?.value?.trim() || '';
    const num = id => parseFloat(document.getElementById(id)?.value) || 0;
    const int = id => parseInt(document.getElementById(id)?.value, 10) || 0;

    const headerBadge = document.getElementById('headerPickupRequestBadge');
    const rawRequestNo = document.getElementById('headerPickupRequestNoText')?.textContent?.trim() || '';
    const isBadgeVisible = Boolean(headerBadge && !headerBadge.classList.contains('d-none'));
    const finalPickupRequestNo = (isBadgeVisible && rawRequestNo) ? rawRequestNo : null;

    const formData = {
        DocketNo: val('docketNo'),
        BookingDate: val('bookedDate') || null,
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
        InvoiceValue: num('invoiceValue'),
        Quantity: int('quantity'),
        ActualWeight: num('actualWeight'),
        VolumetricWeight: num('volumetricWeight'),
        ChargeableWeight: num('chargeableWeight'),
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

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Saving...';

    try {
        if (mode === 'insert') {
            const { data, error } = await supabaseClient
                .from('DomesticBookingDetails')
                .insert(formData)
                .select('id')
                .single();

            if (error) throw error;
            insertedID = data.id;
        } else {
            const { data, error } = await supabaseClient
                .from('DomesticBookingDetails')
                .update(formData)
                .eq('DocketNo', formData.DocketNo)
                .eq('company_id', CompanyID)
                .select('id')
                .single();

            if (error) throw error;
            insertedID = data.id;
        }

        const tempFormIDEl = document.getElementById('tempFormID');
        if (tempFormIDEl) tempFormIDEl.value = insertedID;

        // Save all child tables in parallel
        await Promise.all([
            saveFreightCharges(insertedID),
            saveNewVolumetricRows(),
            saveEquipmentDetails()
        ]);

        if (finalPickupRequestNo && typeof updatePickupRequestStatus === 'function') {
            await updatePickupRequestStatus(finalPickupRequestNo);
        }

        toggleEditMode(true);
        disableForm();
        setTabAddButtonsDisabled(true);
        setFormStateBadge('Saved', 'text-bg-success');

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Update';
        saveBtn.dataset.mode = 'update';

        const modifyBtn = document.getElementById('modifyButton');
        const reportBtn = document.getElementById('reportButton');
        const deleteBtn = document.getElementById('deleteButton');
        if (modifyBtn) modifyBtn.disabled = false;
        if (reportBtn) reportBtn.disabled = false;
        if (deleteBtn) deleteBtn.disabled = true;

        notify(`Booking details ${mode} successful!`, 'success');
    } catch (err) {
        console.error(`Error while ${mode}:`, err);
        notify(`Failed to ${mode} booking: ${err.message || 'Unknown error'}`, 'error');
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
    }
});

// ============ FIELD LISTENERS ============
document.getElementById('modeTypeD')?.addEventListener('change', function () {
    toggleContainerTab(this.value);
});

const departmentEl = document.getElementById('department');
departmentEl?.addEventListener('change', () => {
    handleDatalistInsert(departmentEl, 'departmentList', 'Department');
});