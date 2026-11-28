// International.js
const awbNoInput = document.getElementById('awbNo');
let insertedID = null;

// Utility: Debounce for live search inputs
function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// Utility: Safe toast wrapper (falls back to alert if showToast isn't loaded)
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

// Utility: Keep calculated weight fields locked
function disableCalculatedWeightFields() {
    ['totalActualWtV', 'volumeWtV', 'totalVolumeWtV', 'chargeableWtV', 'chargeableWeight'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
}

// Utility: Toggle deleted visual styling
function setDeletedFormStyle(isDeleted) {
    document.querySelectorAll('#internationalBookingForm input, #internationalBookingForm select, #internationalBookingForm textarea').forEach(el => {
        el.style.backgroundColor = isDeleted ? '#ffe5e5' : '';
        el.style.color = isDeleted ? '#b30000' : '';
        el.style.border = isDeleted ? '1px solid #ff4d4d' : '';
    });
}

// Shared handler for Mode Type -> Container/Vehicle tab visibility
async function handleModeTypeChange(modeType) {
    const containerElement = document.getElementById('containerType');
    const containerNumberElement = document.getElementById('containerNumber');
    const containerTypeLabel = document.querySelector('label[for="containerType"]');
    const containerNumberLabel = document.querySelector('label[for="containerNumber"]');
    const containerTabContent = document.getElementById('container-details');
    const containerTabButton = document.getElementById('container-details-tab');

    if (!containerElement || !containerTabContent || !containerTabButton) return;

    if (modeType === 'FTL') {
        await loadDropdownOptions('VehicleType', 'containerType');
        containerTabContent.style.display = 'block';
        containerTabButton.style.display = 'inline-block';
        containerTabButton.innerHTML = '<i class="bi bi-truck me-1"></i> Vehicle Details';
        if (containerTypeLabel) containerTypeLabel.textContent = 'Vehicle Type';
        if (containerNumberLabel) containerNumberLabel.textContent = 'Vehicle Number';
        if (containerNumberElement) containerNumberElement.placeholder = 'Enter Vehicle Number';
    } else if (modeType === 'FCL') {
        await loadDropdownOptions('ContainerType', 'containerType');
        containerTabContent.style.display = 'block';
        containerTabButton.style.display = 'inline-block';
        containerTabButton.innerHTML = '<i class="bi bi-boxes me-1"></i> Container Details';
        if (containerTypeLabel) containerTypeLabel.textContent = 'Container Type';
        if (containerNumberLabel) containerNumberLabel.textContent = 'Container Number';
        if (containerNumberElement) containerNumberElement.placeholder = 'Enter Container Number';
    } else {
        containerElement.innerHTML = '';
        containerTabContent.style.display = 'none';
        containerTabButton.style.display = 'none';
    }
}

// ============ DOMContentLoaded ============
document.addEventListener('DOMContentLoaded', async () => {
    enableForm();

    const saveBtn = document.getElementById('saveButton');
    if (saveBtn) saveBtn.dataset.mode = 'insert';

    // Load initial dropdowns & ports in parallel
    const [, , , , ports] = await Promise.all([
        loadSuggestions('partySuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
        loadSuggestions('vendorSuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
        loadSuggestions('carrierSuggestions', 'CourierRegistration', CompanyID, 'CourierCode', 'CourierName'),
        loadDatalist('departmentList', 'Department'),
        fetchPortList()
    ]);

    populateDatalist('portOfLoadingDatalist', ports);
    populateDatalist('portOfDischargeDatalist', ports);

    const bookedDateEl = document.getElementById('bookedDate');
    if (bookedDateEl) bookedDateEl.valueAsDate = new Date();

    await initChargeableWeightCalculator('#actualWeight', '#volumetricWeight', '#chargeableWeight', '#uOMType');
    disableCalculatedWeightFields();

    // Hide container tab initially
    const containerTabContent = document.getElementById('container-details');
    const containerTabButton = document.getElementById('container-details-tab');
    if (containerTabContent) containerTabContent.style.display = 'none';
    if (containerTabButton) containerTabButton.style.display = 'none';

    // Optional pickup request badge from URL
    const urlParams = new URLSearchParams(window.location.search);
    const incomingRequestNo = urlParams.get('pickupRequestNo');
    const headerBadge = document.getElementById('headerPickupRequestBadge');
    const headerText = document.getElementById('headerPickupRequestNoText');

    if (incomingRequestNo && headerBadge && headerText) {
        headerText.textContent = incomingRequestNo;
        headerBadge.classList.remove('d-none');
    }

    populateContainerTypes();
    setupEventListeners();
    initDocketSearchModal();
    loadDatalist('tabPackingTypeSuggestions', 'PackingType');
    initDatalistValidation();
    loadTaxData();
});

// ============ DOCKET SEARCH MODAL ============
function initDocketSearchModal() {
    const awbInput = document.getElementById('awbNo');
    const modalEl = document.getElementById('docketSearchModal');
    const searchInput = document.getElementById('docketModalSearchInput');
    const clearBtn = document.getElementById('clearDocketSearch');
    const tableBody = document.getElementById('docketSearchTableBody');
    const countLabel = document.getElementById('docketSearchCount');

    if (!awbInput || !modalEl) return;

    const docketModal = new bootstrap.Modal(modalEl);
    let cachedBookings = [];

    modalEl.addEventListener('shown.bs.modal', () => {
        searchInput?.focus();
    });

    awbInput.addEventListener('dblclick', async () => {
        if (searchInput) searchInput.value = '';
        docketModal.show();
        await loadBookingsForModal();
    });

    async function loadBookingsForModal() {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">
                    <span class="spinner-border spinner-border-sm me-2"></span>Loading bookings...
                </td>
            </tr>`;

        try {
            const { data, error } = await supabaseClient
                .from('InternationalBookingView')
                .select('DocketNo, BookedDate, CustomerName, ServiceProviderName, OriginName, DestinationName, InvoiceNumber, InvoiceStatus')
                .eq('company_id', CompanyID)
                .order('BookedDate', { ascending: false })
                .limit(200);

            if (error) throw error;

            cachedBookings = data || [];
            renderDocketRows(cachedBookings);
        } catch (err) {
            console.error('Error loading dockets:', err);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-danger py-4">
                        Failed to load bookings. Please try again.
                    </td>
                </tr>`;
            if (countLabel) countLabel.textContent = '0 records';
        }
    }

    function renderDocketRows(rows) {
        if (countLabel) {
            countLabel.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
        }

        if (!rows.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-4">
                        No matching bookings found.
                    </td>
                </tr>`;
            return;
        }

        tableBody.innerHTML = rows.map(row => `
            <tr class="docket-select-row" style="cursor: pointer;" data-docket="${escapeHtml(row.DocketNo || '')}">
                <td class="fw-bold text-primary text-upper">${escapeHtml(row.DocketNo || '-')}</td>
                <td>${escapeHtml(row.BookedDate || '-')}</td>
                <td>${escapeHtml(row.CustomerName || '-')}</td>
                <td>${escapeHtml(row.ServiceProviderName || '-')}</td>
                <td>${escapeHtml(row.OriginName || '-')}</td>
                <td>${escapeHtml(row.DestinationName || '-')}</td>
                <td>${escapeHtml(row.InvoiceNumber || '-')}</td>
            </tr>
        `).join('');
    }

    // Live filter across all displayed columns
    searchInput?.addEventListener('input', () => {
        const term = searchInput.value.trim().toLowerCase();
        if (!term) {
            renderDocketRows(cachedBookings);
            return;
        }

        const filtered = cachedBookings.filter(row =>
            [
                row.DocketNo,
                row.BookedDate,
                row.CustomerName,
                row.ServiceProviderName,
                row.OriginName,
                row.DestinationName,
                row.InvoiceNumber
            ].some(val => String(val || '').toLowerCase().includes(term))
        );
        renderDocketRows(filtered);
    });

    clearBtn?.addEventListener('click', () => {
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        renderDocketRows(cachedBookings);
    });

    tableBody.addEventListener('click', (e) => {
        const row = e.target.closest('.docket-select-row');
        if (!row) return;

        awbInput.value = row.dataset.docket || '';
        docketModal.hide();
        awbInput.dispatchEvent(new Event('change', { bubbles: true }));
        awbInput.focus();
    });

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

// ============ AWB / DOCKET INPUT HANDLERS ============
const debouncedLoadAWB = debounce((val) => loadAWBNoDetails(val), 250);

if (awbNoInput) {
    awbNoInput.addEventListener('input', function () {
        this.value = this.value
            .toUpperCase()
            .replace(/[\r\n]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        debouncedLoadAWB(this.value);
    });

    awbNoInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
        }
    });

    awbNoInput.addEventListener('change', async () => {
        const docketNo = awbNoInput.value.trim();
        if (!docketNo) return;

        try {
            const docketResult = await fetchDocketDetails(docketNo);
            if (!docketResult.found) return;

            await setupChargeTypeValidation();

            const tempFormID = document.getElementById('tempFormID')?.value.trim() || '';
            if (!tempFormID || tempFormID.includes('TEMP')) return;

            // Load all child tables in parallel
            await Promise.all([
                loadFreightCharges(),
                loadVolumetricDetails(),
                fetchContainerDetails(tempFormID),
                loadBookingStatus(docketNo)
            ]);

            // Check billed status directly from already-fetched docket record
            if (!docketResult.isDeleted && docketResult.invoiceNo) {
                notify(`This AWB has already been billed. Invoice Number: ${docketResult.invoiceNo}`, 'warning');
                disableForm();
                setFormStateBadge('Billed', 'text-bg-info');
                saveButton.disabled = true;
                modifyButton.disabled = true;
                deleteButton.disabled = true;
            }
        } catch (error) {
            console.error('Error loading AWB details:', error);
            notify('Failed to load docket details. Please try again.', 'error');
        }
    });
}

// ============ ACTION BAR BUTTONS ============
document.getElementById('newButton')?.addEventListener('click', () => {
    clearForm();
    enableForm();
    toggleEditMode(true);
    setDeletedFormStyle(false);
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

    const addFreightBtn = document.getElementById('addFreightRow');
    if (addFreightBtn) addFreightBtn.disabled = false;

    // Clear child tables
    ['#freightTable tbody', '#containerDetailsTable tbody', '#volumetricTable tbody', '#bookingStatusTable tbody'].forEach(selector => {
        const tbody = document.querySelector(selector);
        if (tbody) tbody.innerHTML = '';
    });

    // Reset optional pickup request badge
    const headerBadge = document.getElementById('headerPickupRequestBadge');
    const requestNoEl = document.getElementById('headerPickupRequestNoText');
    if (headerBadge) headerBadge.classList.add('d-none');
    if (requestNoEl) requestNoEl.textContent = '';

    // Hide container tab
    handleModeTypeChange('');

    // Reset totals & calculated fields
    recalcTotals();
    updateTotals();
    disableCalculatedWeightFields();
});

document.getElementById('modifyButton')?.addEventListener('click', () => {
    enableForm();
    setFormStateBadge('Editing', 'text-bg-warning');

    const saveBtn = document.getElementById('saveButton');
    const modifyBtn = document.getElementById('modifyButton');
    const deleteBtn = document.getElementById('deleteButton');
    const reportBtn = document.getElementById('reportButton');

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Update';
        saveBtn.dataset.mode = 'update';
    }
    if (modifyBtn) modifyBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = false;
    if (reportBtn) reportBtn.disabled = true;

    if (awbNoInput) awbNoInput.disabled = true;
    const addFreightBtn = document.getElementById('addFreightRow');
    if (addFreightBtn) addFreightBtn.disabled = false;

    disableCalculatedWeightFields();
    toggleEditMode(false);
});

document.getElementById('saveButton')?.addEventListener('click', async function () {
    const saveBtn = this;
    const originalHTML = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Saving...';

    try {
        const saved = await saveOrUpdateInternationalBooking();
        if (!saved) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalHTML;
            return;
        }

        // Save all child tables in parallel once parent record succeeds
        await Promise.all([
            saveFreightCharges(),
            saveNewVolumetricRows(),
            saveContainerDetails()
        ]);

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Update';
        saveBtn.dataset.mode = 'update';

        modifyButton.disabled = false;
        reportButton.disabled = false;
        deleteButton.disabled = true;

        const addFreightBtn = document.getElementById('addFreightRow');
        if (addFreightBtn) addFreightBtn.disabled = true;

        disableForm();
        toggleEditMode(true);
        setFormStateBadge('Saved', 'text-bg-success');
        insertedID = null;
    } catch (err) {
        console.error('Error during save workflow:', err);
        notify('An error occurred while saving child records.', 'error');
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
    }
});

document.getElementById('deleteButton')?.addEventListener('click', async () => {
    const docketNo = awbNoInput?.value.trim() || '';
    const deleted = await deleteDocket(docketNo);
    if (!deleted) return;

    clearForm();
    enableForm();
    toggleEditMode(true);
    setDeletedFormStyle(false);
    setFormStateBadge('New', 'text-bg-light border');
});

// ============ FIELD LISTENERS ============
document.getElementById('modeTypeI')?.addEventListener('change', function () {
    handleModeTypeChange(this.value);
});

document.getElementById('consigneeName')?.addEventListener('focus', function () {
    this.setAttribute('list', 'consigneeNameSuggestions');
});

const departmentEl = document.getElementById('department');
departmentEl?.addEventListener('change', () => {
    handleDatalistInsert(departmentEl, 'departmentList', 'Department');
});

// ============ SUPABASE OPERATIONS ============
async function loadAWBNoDetails(query) {
    if (!query) return;

    const { data, error } = await supabaseClient
        .from('international_booking')
        .select('DocketNo')
        .ilike('DocketNo', `${query}%`)
        .eq('company_id', CompanyID)
        .eq('IsDeleted', false)
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
        .from('international_booking')
        .select('*')
        .eq('DocketNo', docketNo)
        .eq('company_id', CompanyID)
        .maybeSingle();

    if (error) {
        console.error('Error fetching docket details:', error);
        return { found: false, isDeleted: false, invoiceNo: null };
    }

    if (!data) {
        return { found: false, isDeleted: false, invoiceNo: null };
    }

    if (data.IsDeleted) {
        document.getElementById('tempFormID').value = data.id;
        document.getElementById('status').value = 'DELETED';
        disableForm();
        setDeletedFormStyle(true);
        setFormStateBadge('Deleted', 'text-bg-danger');

        saveButton.disabled = true;
        modifyButton.disabled = true;
        deleteButton.disabled = true;
        reportButton.disabled = false;

        notify('Deleted docket opened in read-only mode.', 'warning');
        return { found: true, isDeleted: true, invoiceNo: data.InvoiceNumber || null };
    }

    setDeletedFormStyle(false);

    const fieldMap = {
        tempFormID: data.id,
        status: data.Status,
        partyCode: data.CustomerCode,
        partyName: data.CustomerName,
        bookedDate: data.BookedDate,
        movementTypeI: data.MovementType,
        transitTypeI: data.TransitType,
        modeTypeI: data.ModeType,
        poNo: data.PONo,
        shippingType: data.ShippingType,
        carrierName: data.CourierName,
        carrierCode: data.CourierCode,
        serviceProviderCode: data.ServiceProviderCode,
        serviceProvider: data.ServiceProviderName,
        shipperRef: data.ShipperRef,
        invoiceValue: data.ConsignmentValue,
        currencyCode: data.CurrencyType || 'INR',
        PartyAddress: data.PickupAddress,
        consigneeName: data.Consignee,
        deliveryAddress: data.DeliveryAddress,
        commodity: data.Commodity,
        clearanceMode: data.ClearanceMode,
        originCountry: data.OriginName,
        portOfLoading: data.PortofLoading,
        destinationCountry: data.DestinationName,
        portOfDischarge: data.PortofDischarge,
        packingType: data.PackingType,
        department: data.Department,
        uOMType: data.UOMType,
        quantity: data.NoofUnit,
        actualWeight: data.AcutalWeight,
        volumetricWeight: data.VolumeWeight,
        chargeableWeight: data.ChargableWeight,
        infomation: data.Infomation
    };

    Object.entries(fieldMap).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? '';
    });

    // Ensure Container/Vehicle tab visibility matches loaded ModeType
    await handleModeTypeChange(data.ModeType);

    disableForm();
    setFormStateBadge('View', 'text-bg-secondary');

    const saveBtn = document.getElementById('saveButton');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.dataset.mode = 'update';
    }
    deleteButton.disabled = true;
    modifyButton.disabled = false;
    reportButton.disabled = false;

    const addFreightBtn = document.getElementById('addFreightRow');
    if (addFreightBtn) addFreightBtn.disabled = true;

    return { found: true, isDeleted: false, invoiceNo: data.InvoiceNumber || null };
}

async function saveOrUpdateInternationalBooking() {
    const saveBtn = document.getElementById('saveButton');
    const mode = saveBtn?.dataset.mode || (saveBtn?.textContent.trim() === 'Update' ? 'update' : 'insert');
    const updateID = document.getElementById('tempFormID')?.value.trim();

    let uomType = document.getElementById('uOMType')?.value || '';
    if (uomType === 'Gms') uomType = 'Kgs';

    const headerBadge = document.getElementById('headerPickupRequestBadge');
    const rawRequestNo = document.getElementById('headerPickupRequestNoText')?.textContent?.trim() || '';
    const isBadgeVisible = Boolean(headerBadge && !headerBadge.classList.contains('d-none'));
    const finalPickupRequestNo = (isBadgeVisible && rawRequestNo) ? rawRequestNo : null;

    const originCountry = document.getElementById('originCountry')?.value || '';
    const destinationCountry = document.getElementById('destinationCountry')?.value || '';

    const basePayload = {
        DocketNo: awbNoInput?.value.trim() || '',
        BookedDate: document.getElementById('bookedDate')?.value || null,
        CustomerCode: document.getElementById('partyCode')?.value || '',
        CustomerName: document.getElementById('partyName')?.value || '',
        MovementType: document.getElementById('movementTypeI')?.value || '',
        TransitType: document.getElementById('transitTypeI')?.value || '',
        ModeType: document.getElementById('modeTypeI')?.value || '',
        Status: document.getElementById('status')?.value || 'New',
        ServiceProviderCode: document.getElementById('serviceProviderCode')?.value || '',
        ServiceProviderName: document.getElementById('serviceProvider')?.value || '',
        CourierCode: document.getElementById('carrierCode')?.value || '',
        CourierName: document.getElementById('carrierName')?.value || '',
        Consignee: document.getElementById('consigneeName')?.value || '',
        ShipperRef: document.getElementById('shipperRef')?.value || '',
        Commodity: document.getElementById('commodity')?.value || '',
        Origin: originCountry,
        OriginName: originCountry,
        PortofLoading: document.getElementById('portOfLoading')?.value || '',
        PickupAddress: document.getElementById('PartyAddress')?.value || '',
        Destination: destinationCountry,
        DestinationName: destinationCountry,
        PortofDischarge: document.getElementById('portOfDischarge')?.value || '',
        DeliveryAddress: document.getElementById('deliveryAddress')?.value || '',
        ClearanceMode: document.getElementById('clearanceMode')?.value || '',
        PackingType: document.getElementById('packingType')?.value || '',
        ConsignmentValue: parseFloat(document.getElementById('invoiceValue')?.value) || 0,
        Department: document.getElementById('department')?.value || '',
        UOMType: uomType,
        NoofUnit: parseInt(document.getElementById('quantity')?.value, 10) || 0,
        AcutalWeight: parseFloat(document.getElementById('actualWeight')?.value) || 0,
        VolumeWeight: parseFloat(document.getElementById('volumetricWeight')?.value) || 0,
        ChargableWeight: parseFloat(document.getElementById('chargeableWeight')?.value) || 0,
        CurrencyType: document.getElementById('currencyCode')?.value.trim().toUpperCase() || 'INR',
        Infomation: document.getElementById('infomation')?.value || '',
        PONo: document.getElementById('poNo')?.value || '',
        ShippingType: document.getElementById('shippingType')?.value || 'NA',
        company_id: CompanyID,
        pickup_request_no: finalPickupRequestNo
    };

    let result;

    if (mode === 'insert') {
        const insertPayload = {
            ...basePayload,
            CreatedBy: UserLoginID,
            created_at: localtimeStamp
        };

        const { data, error } = await supabaseClient
            .from('international_booking')
            .insert([insertPayload])
            .select();

        result = { data, error };

        if (!error && data && data.length > 0) {
            insertedID = data[0].id;
            document.getElementById('tempFormID').value = insertedID;

            await insertBookingStatus({
                ID_IB: insertedID,
                docketNo: basePayload.DocketNo,
                statusDate: basePayload.BookedDate,
                arrivedAt: WorkingBranch,
                information: 'Shipment Booked'
            });
        }
    } else if (mode === 'update') {
        if (!updateID) {
            notify('Missing booking ID for update.', 'error');
            return false;
        }

        const { data, error } = await supabaseClient
            .from('international_booking')
            .update(basePayload)
            .eq('id', updateID)
            .eq('company_id', CompanyID);

        result = { data, error };
    } else {
        notify('Invalid save mode.', 'error');
        return false;
    }

    if (result.error) {
        console.error('Save/Update failed:', result.error.message);
        notify(`Failed to save data: ${result.error.message}`, 'error');
        return false;
    }

    if (finalPickupRequestNo && typeof updatePickupRequestStatus === 'function') {
        await updatePickupRequestStatus(finalPickupRequestNo);
    }

    notify('Data saved successfully!', 'success');
    return true;
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
                return Math.ceil(chargeable);
            case 'gms': {
                if (Number.isInteger(chargeable)) return chargeable;
                const decimal = chargeable - Math.floor(chargeable);
                return decimal <= 0.5 ? Math.floor(chargeable) + 0.5 : Math.ceil(chargeable);
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

// Kept for backward compatibility if called by other modules
async function checkAWBBilledStatus(docketNo) {
    const { data, error } = await supabaseClient
        .from('international_booking')
        .select('InvoiceNumber')
        .eq('DocketNo', docketNo)
        .eq('company_id', CompanyID)
        .eq('IsDeleted', false)
        .maybeSingle();

    if (error || !data || !data.InvoiceNumber) {
        return { isUnbilled: true, invoiceNo: null };
    }

    return { isUnbilled: false, invoiceNo: data.InvoiceNumber };
}

async function deleteDocket(docketNo) {
    if (!docketNo) {
        notify('Invalid Docket No', 'error');
        return false;
    }

    if (!confirm(`Move Docket ${docketNo} to Trash?`)) {
        return false;
    }

    try {
        const { data, error } = await supabaseClient
            .from('international_booking')
            .update({
                IsDeleted: true,
                DeletedAt: localtimeStamp,
                DeletedBy: UserLoginID
            })
            .eq('DocketNo', docketNo)
            .eq('company_id', CompanyID)
            .eq('IsDeleted', false)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            notify('No matching docket found.', 'warning');
            return false;
        }

        notify('Docket moved to trash.', 'success');
        return true;
    } catch (err) {
        console.error('Delete failed:', err);
        notify(err.message || 'Failed to delete docket.', 'error');
        return false;
    }
}