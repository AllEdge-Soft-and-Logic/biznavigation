// FullTruckLoad.js
let movementDetails = [];
let deletedShipmentIds = [];
let currentEditShipmentId = null;

const addShipmentBtn = document.getElementById('addShipmentRow');
const shipmentTableBody = document.querySelector('#shipmentDetailsTable tbody');

// ============ UTILITIES ============
function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function notify(message, type = 'info') {
    if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        alert(message);
    }
}

function setFormStateBadge(label, badgeClass = 'text-bg-light border') {
    const badge = document.getElementById('formStateBadge');
    if (!badge) return;
    badge.textContent = label;
    badge.className = `badge rounded-pill fw-normal ${badgeClass}`;
}

function getActiveRows(tableId) {
    return Array.from(document.querySelectorAll(`#${tableId} tbody tr`)).filter(
        tr => !tr.querySelector('td.vm-empty') && tr.dataset.status !== 'deleted'
    );
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
    enableForm();

    const saveBtn = document.getElementById('saveButton');
    if (saveBtn) saveBtn.dataset.mode = 'insert';

    try {
        const suggestionTasks = [
            loadSuggestions('partySuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
            loadSuggestions('vendorSuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName')
        ];

        const dropdownConfigs = [
            ['departmentList', 'Department'],
            ['MovementType', 'movementType'],
            ['ModeType', 'modeType'],
            ['PaymentType', 'mainPaymentType'],
            ['ChargesType', 'chargesTypeList'],
            ['ChargesType', 'vendorChargesTypeList'],
            ['VehicleType', 'vehicleType']
        ];

        const urlParams = new URLSearchParams(window.location.search);
        const incomingRequestNo = urlParams.get('pickupRequestNo');
        const headerBadge = document.getElementById('headerPickupRequestBadge');
        const headerText = document.getElementById('headerPickupRequestNoText');

        if (incomingRequestNo && headerBadge && headerText) {
            headerText.textContent = incomingRequestNo;
            headerBadge.classList.remove('d-none');
        }

        const dropdownTasks = dropdownConfigs.map(([tableOrId, target]) => loadDropdownOptions(tableOrId, target));
        const otherTasks = [loadRouteSuggestions(), loadTaxData()];

        await Promise.all([...suggestionTasks, ...dropdownTasks, ...otherTasks]);

        await Promise.all([
            setupPincodeListener('originPinCode', 'originCity'),
            setupPincodeListener('destinationPinCode', 'destinationCity'),
            setupPincodeListener('shipmentPinCode', 'shipmentCity')
        ]);

        initLRSearchModal();

        const lrDateEl = document.getElementById('lrDate');
        if (lrDateEl) lrDateEl.valueAsDate = new Date();
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

// ============ LR SEARCH MODAL ============
function initLRSearchModal() {
    const lrNumberInput = document.getElementById('lrNumber');
    const modalEl = document.getElementById('lrSearchModal');
    if (!lrNumberInput || !modalEl) return;

    const lrSearchModal = new bootstrap.Modal(modalEl);

    const searchLrNumber = document.getElementById('searchLrNumber');
    const searchLrDate = document.getElementById('searchLrDate');
    const searchLrCustomer = document.getElementById('searchLrCustomer');
    const searchLrModeType = document.getElementById('searchLrModeType');
    const searchLrPickupCity = document.getElementById('searchLrPickupCity');
    const searchLrDestinationCity = document.getElementById('searchLrDestinationCity');
    const searchLrVendor = document.getElementById('searchLrVendor');
    const searchLrVehicleNo = document.getElementById('searchLrVehicleNo');
    const btnSearchLRs = document.getElementById('btnSearchLRs');
    const btnResetLrSearch = document.getElementById('btnResetLrSearch');
    const resultsBody = document.getElementById('lrSearchResultsBody');
    const resultsCount = document.getElementById('lrSearchCount');

    function syncModeTypeOptions() {
        const mainModeSelect = document.getElementById('modeType');
        if (!mainModeSelect || !searchLrModeType) return;

        const currentVal = searchLrModeType.value;
        searchLrModeType.innerHTML = '<option value="">All Modes</option>';

        Array.from(mainModeSelect.options).forEach(opt => {
            if (opt.value) {
                const clone = document.createElement('option');
                clone.value = opt.value;
                clone.textContent = opt.textContent;
                searchLrModeType.appendChild(clone);
            }
        });
        searchLrModeType.value = currentVal;
    }

    lrNumberInput.addEventListener('dblclick', () => {
        syncModeTypeOptions();
        if (searchLrNumber) searchLrNumber.value = lrNumberInput.value.trim();
        lrSearchModal.show();
        fetchLRsForModal();
    });

    modalEl.addEventListener('shown.bs.modal', () => {
        searchLrNumber?.focus();
    });

    const triggerDebouncedSearch = debounce(fetchLRsForModal, 300);

    [
        searchLrNumber,
        searchLrCustomer,
        searchLrPickupCity,
        searchLrDestinationCity,
        searchLrVendor,
        searchLrVehicleNo
    ].forEach(input => {
        if (!input) return;
        input.addEventListener('input', triggerDebouncedSearch);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                fetchLRsForModal();
            }
        });
    });

    searchLrDate?.addEventListener('change', fetchLRsForModal);
    searchLrModeType?.addEventListener('change', fetchLRsForModal);
    btnSearchLRs?.addEventListener('click', fetchLRsForModal);

    btnResetLrSearch?.addEventListener('click', () => {
        [
            searchLrNumber,
            searchLrDate,
            searchLrCustomer,
            searchLrModeType,
            searchLrPickupCity,
            searchLrDestinationCity,
            searchLrVendor,
            searchLrVehicleNo
        ].forEach(el => {
            if (el) el.value = '';
        });
        fetchLRsForModal();
    });

    async function fetchLRsForModal() {
        resultsBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-4 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Searching LR records...
                </td>
            </tr>`;

        try {
            const client = await supabaseClient;
            if (!client) throw new Error('Database client not initialized.');

            const lrVal = searchLrNumber?.value.trim() || '';
            const dateVal = searchLrDate?.value.trim() || '';
            const customerVal = searchLrCustomer?.value.trim() || '';
            const modeVal = searchLrModeType?.value.trim() || '';
            const cityVal = searchLrPickupCity?.value.trim() || '';
            const destinationVal = searchLrDestinationCity?.value.trim() || '';
            const vendorVal = searchLrVendor?.value.trim() || '';
            const vehicleVal = searchLrVehicleNo?.value.trim() || '';

            let query = client
                .from('FullLoadMovementDetailsView')
                .select('LRNumber, PickupDate, CustomerName, ModeType, OriginCity, DestinationCity, VendorName, VehicleNumber')
                .eq('company_id', CompanyID)
                .order('PickupDate', { ascending: false })
                .limit(50);

            if (lrVal) query = query.ilike('LRNumber', `%${lrVal}%`);
            if (dateVal) query = query.eq('PickupDate', dateVal);
            if (customerVal) query = query.ilike('CustomerName', `%${customerVal}%`);
            if (modeVal) query = query.eq('ModeType', modeVal);
            if (cityVal) query = query.ilike('OriginCity', `%${cityVal}%`);
            if (destinationVal) query = query.ilike('DestinationCity', `%${destinationVal}%`);
            if (vendorVal) query = query.ilike('VendorName', `%${vendorVal}%`);
            if (vehicleVal) query = query.ilike('VehicleNumber', `%${vehicleVal}%`);

            const { data, error } = await query;
            if (error) throw error;

            renderLRSearchResults(data || []);
        } catch (err) {
            console.error('LR search error:', err);
            resultsBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle me-1"></i> Failed to load LR records.
                    </td>
                </tr>`;
            if (resultsCount) resultsCount.textContent = '0 records found';
        }
    }

    function renderLRSearchResults(rows) {
        if (resultsCount) {
            resultsCount.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'} found`;
        }

        if (!rows.length) {
            resultsBody.innerHTML = `
                <tr>
                    <td colspan="9" class="vm-empty">
                        <i class="bi bi-inbox"></i>
                        No matching LR records found
                    </td>
                </tr>`;
            return;
        }

        const safe = (val) => (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(String(val ?? '')) : escapeHtml(val));

        resultsBody.innerHTML = rows.map(row => `
            <tr style="cursor: pointer;" data-lr="${safe(row.LRNumber)}">
                <td class="fw-bold text-primary">${safe(row.LRNumber)}</td>
                <td>${safe(row.PickupDate)}</td>
                <td>${safe(row.CustomerName)}</td>
                <td><span class="badge text-bg-light border">${safe(row.ModeType)}</span></td>
                <td>${safe(row.OriginCity)}</td>
                <td>${safe(row.DestinationCity)}</td>
                <td>${safe(row.VendorName)}</td>
                <td class="text-upper">${safe(row.VehicleNumber)}</td>
                <td class="text-center">
                    <button type="button" class="btn btn-outline-primary btn-sm py-0 px-2 select-lr-btn">
                        Select
                    </button>
                </td>
            </tr>
        `).join('');
    }

    const selectLR = (lrNo) => {
        if (!lrNo) return;
        lrNumberInput.value = lrNo;
        lrSearchModal.hide();
        lrNumberInput.dispatchEvent(new Event('change', { bubbles: true }));
        lrNumberInput.focus();
    };

    resultsBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.select-lr-btn');
        if (!btn) return;
        selectLR(btn.closest('tr')?.dataset.lr);
    });

    resultsBody.addEventListener('dblclick', (e) => {
        const tr = e.target.closest('tr[data-lr]');
        if (tr) selectLR(tr.dataset.lr);
    });
}

// ============ CONTAINER VALIDATION ============
document.getElementById('containerNumber')?.addEventListener('input', function () {
    this.value = this.value.toUpperCase();
    const feedback = document.getElementById('containerFeedback');

    if (!this.value.trim()) {
        this.classList.remove('is-invalid', 'is-valid');
        feedback?.classList.add('d-none');
        return;
    }

    const result = validateContainerNumber(this.value);
    if (!result.valid) {
        this.classList.add('is-invalid');
        this.classList.remove('is-valid');
        if (feedback) {
            feedback.textContent = result.error;
            feedback.classList.remove('d-none');
        }
    } else {
        this.classList.remove('is-invalid');
        this.classList.add('is-valid');
        feedback?.classList.add('d-none');
    }
});

// ============ LR NUMBER LOOKUP & LOADING ============
function mapMovementRow(row) {
    return {
        lrNumber: row.lr_number,
        lrDate: row.pickup_date,
        quotationID: row.quotation_id,
        movementType: row.movement_type,
        transitType: row.transit_type,
        partyCode: row.customer_code,
        partyName: row.customer_name,
        originPinCode: row.origin_pincode,
        originCity: row.origin_city,
        originAddress: row.origin_address,
        destinationPinCode: row.destination_pincode,
        destinationCity: row.destination_city,
        destinationAddress: row.destination_address,
        requestedDate: row.requested_date,
        vehicleType: row.vehicle_type,
        referenceNumber: row.reference_number,
        invoiceValue: row.invoice_value,
        vendorCode: row.vendor_code,
        vendorName: row.vendor_name,
        vehicleNumber: row.vehicle_number,
        containerNumber: row.container_number,
        modeType: row.mode_type,
        quantity: row.quantity,
        actualWT: row.actual_weight,
        chargeWT: row.charge_weight,
        paymentType: row.payment_type,
        routeDetails: row.routedetails,
        descriptionOfGoods: row.description_of_goods,
        status: row.status,
        information: row.information,
        completionDate: row.completion_date,
        waybillno: row.waybillno,
        driverCode: row.driver_code,
        driverName: row.driver_name,
        driverPhoneNo: row.driver_phone_no,
        driverDLNo: row.driver_dl_no,
        pickup_request_no: row.pickup_request_no
    };
}

async function loadMovementDetails(query = '') {
    const { data, error } = await supabaseClient
        .from('FullLoadBookingDetails')
        .select('*')
        .eq('company_id', CompanyID)
        .ilike('lr_number', `%${query}%`)
        .order('lr_number', { ascending: false })
        .limit(20);

    if (error || !data) return;

    movementDetails = data.map(mapMovementRow);
    populateLRNumberSuggestions();
}

function populateLRNumberSuggestions() {
    const dataList = document.getElementById('lrNumberSuggestions');
    if (!dataList) return;

    dataList.innerHTML = '';
    const fragment = document.createDocumentFragment();
    movementDetails.forEach(m => {
        const option = document.createElement('option');
        option.value = m.lrNumber || '';
        fragment.appendChild(option);
    });
    dataList.appendChild(fragment);
}

const debouncedLoadMovement = debounce((val) => loadMovementDetails(val), 250);

const lrNumberEl = document.getElementById('lrNumber');
lrNumberEl?.addEventListener('input', function () {
    debouncedLoadMovement(this.value.trim());
});

lrNumberEl?.addEventListener('change', async function () {
    const lrNumber = this.value.trim();
    if (!lrNumber) return;

    let movementData = movementDetails.find(m => m.lrNumber === lrNumber);

    if (!movementData) {
        const { data, error } = await supabaseClient
            .from('FullLoadBookingDetails')
            .select('*')
            .eq('lr_number', lrNumber)
            .eq('company_id', CompanyID)
            .maybeSingle();

        if (error || !data) {
            notify(`No data found for LR: ${lrNumber}`, 'warning');
            return;
        }

        movementData = mapMovementRow(data);
    }

    const elementMap = {
        lrDate: 'lrDate',
        quotationID: 'quotationID',
        modeType: 'modeType',
        movementType: 'movementType',
        partyCode: 'partyCode',
        partyName: 'partyName',
        originPinCode: 'originPinCode',
        originCity: 'originCity',
        originAddress: 'originAddress',
        destinationPinCode: 'destinationPinCode',
        destinationCity: 'destinationCity',
        destinationAddress: 'destinationAddress',
        requestedDate: 'requestedDate',
        referenceNumber: 'referenceNumber',
        invoiceValue: 'invoiceValue',
        vendorCode: 'vendorCode',
        vendorName: 'vendorName',
        vehicleType: 'vehicleType',
        vehicleNumber: 'vehicleNumber',
        containerNumber: 'containerNumber',
        routeDetails: 'routeDetails',
        quantity: 'quantity',
        actualWT: 'actualWt',
        chargeWT: 'chargeWt',
        paymentType: 'mainPaymentType',
        information: 'information',
        descriptionOfGoods: 'descriptionofGoods',
        waybillno: 'wayBillNo',
        driverCode: 'driverCode',
        driverName: 'driverName',
        driverPhoneNo: 'driverPhoneNo',
        driverDLNo: 'driverDLNo'
    };

    Object.entries(elementMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.value = movementData[key] ?? '';
    });

    await Promise.all([
        loadBillingCharges(lrNumber, 'Sale', 'chargesDetailsTable'),
        loadBillingCharges(lrNumber, 'Buy', 'vendorChargesDetailsTable'),
        loadShipmentDetails(lrNumber)
    ]);

    const saveBtn = document.getElementById('saveButton');
    const modifyBtn = document.getElementById('modifyButton');
    const newBtn = document.getElementById('newButton');
    const reportBtn = document.getElementById('reportButton');
    const addFreightBtn = document.getElementById('addFreightRow');
    const addVendorBtn = document.getElementById('addVendorFreightRow');

    if (addFreightBtn) addFreightBtn.disabled = true;
    if (addVendorBtn) addVendorBtn.disabled = true;
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Update';
        saveBtn.dataset.mode = 'update';
        saveBtn.disabled = true;
    }

    disableForm();
    setFormStateBadge('View', 'text-bg-secondary');

    if (modifyBtn) modifyBtn.disabled = false;
    if (newBtn) newBtn.disabled = false;
    if (reportBtn) reportBtn.disabled = false;
});

// ============ ACTION BAR BUTTONS ============
document.getElementById('newButton')?.addEventListener('click', () => {
    enableForm();
    clearForm();
    setFormStateBadge('New', 'text-bg-light border');

    const saveBtn = document.getElementById('saveButton');
    const modifyBtn = document.getElementById('modifyButton');
    const reportBtn = document.getElementById('reportButton');
    const deleteBtn = document.getElementById('deleteButton');

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save';
        saveBtn.dataset.mode = 'insert';
    }
    if (modifyBtn) modifyBtn.disabled = true;
    if (reportBtn) reportBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = true;

    const lrDateEl = document.getElementById('lrDate');
    if (lrDateEl) lrDateEl.valueAsDate = new Date();

    const qtyEl = document.getElementById('quantity');
    if (qtyEl) qtyEl.value = '1.00';

    const addFreightBtn = document.getElementById('addFreightRow');
    const addVendorBtn = document.getElementById('addVendorFreightRow');
    if (addFreightBtn) addFreightBtn.disabled = false;
    if (addVendorBtn) addVendorBtn.disabled = false;

    const headerBadge = document.getElementById('headerPickupRequestBadge');
    const requestNoEl = document.getElementById('headerPickupRequestNoText');
    if (headerBadge) headerBadge.classList.add('d-none');
    if (requestNoEl) requestNoEl.textContent = '';

    deletedShipmentIds = [];
    currentEditShipmentId = null;

    ['selectedVendorSubPartyHint', 'selectedSubPartyHint'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = '';
            el.classList.add('d-none');
        }
    });

    ['chargesDetailsTable', 'vendorChargesDetailsTable', 'shipmentDetailsTable'].forEach(id => {
        const table = document.getElementById(id);
        if (table) {
            table.querySelector('tbody')?.replaceChildren();
            table.querySelector('tfoot')?.replaceChildren();
        }
    });
});

document.getElementById('modifyButton')?.addEventListener('click', () => {
    enableForm();
    setFormStateBadge('Editing', 'text-bg-warning');

    const saveBtn = document.getElementById('saveButton');
    const modifyBtn = document.getElementById('modifyButton');
    const reportBtn = document.getElementById('reportButton');
    const addFreightBtn = document.getElementById('addFreightRow');
    const addVendorBtn = document.getElementById('addVendorFreightRow');

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Update';
        saveBtn.dataset.mode = 'update';
    }
    if (modifyBtn) modifyBtn.disabled = true;
    if (reportBtn) reportBtn.disabled = true;
    if (addFreightBtn) addFreightBtn.disabled = false;
    if (addVendorBtn) addVendorBtn.disabled = false;

    document.querySelectorAll('.deleteRow, .delete-shipment-btn, .edit-shipment-btn').forEach(btn => {
        btn.disabled = false;
    });
    if (lrNumberEl) lrNumberEl.disabled = true;
});

function areRequiredFieldsFilled() {
    const requiredFields = [
        'lrDate', 'movementType', 'partyName', 'originPinCode', 'originCity', 'originAddress',
        'requestedDate', 'vehicleType', 'destinationPinCode', 'destinationCity', 'destinationAddress',
        'vehicleNumber', 'quantity', 'chargeWt', 'modeType'
    ];

    for (const fieldId of requiredFields) {
        const field = document.getElementById(fieldId);
        if (!field || field.closest('.d-none')) continue;

        if (!field.value.trim()) {
            field.focus();
            notify(`Please fill in all required fields. Missing: ${fieldId}`, 'error');
            return false;
        }
    }
    return true;
}

// ============ SAVE / UPDATE BOOKING ============
document.getElementById('saveButton')?.addEventListener('click', async function (event) {
    event.preventDefault();

    const saveBtn = this;
    const addBtn = document.getElementById('addFreightRow');
    const vendorAddBtn = document.getElementById('addVendorFreightRow');
    const originalHTML = saveBtn.innerHTML;
    const isSaveAction = (saveBtn.dataset.mode || 'insert') === 'insert';

    let lrNumber = document.getElementById('lrNumber')?.value.trim() || '';

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Saving...';
    if (addBtn) addBtn.disabled = true;
    if (vendorAddBtn) vendorAddBtn.disabled = true;

    if (!areRequiredFieldsFilled()) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
        if (addBtn) addBtn.disabled = false;
        if (vendorAddBtn) vendorAddBtn.disabled = false;
        return;
    }

    try {
        // Apply default tariffs if no real charge rows exist
        if (getActiveRows('chargesDetailsTable').length === 0) {
            await applyCustomerTariff();
        }
        if (getActiveRows('vendorChargesDetailsTable').length === 0) {
            await applyVendorTariff();
        }

        if (!lrNumber) {
            lrNumber = await generateLRNumber();
            if (lrNumberEl) lrNumberEl.value = lrNumber;
        }

        const val = id => document.getElementById(id)?.value?.trim() || '';
        const num = id => parseFloat(document.getElementById(id)?.value) || 0;

        const modeType = val('modeType');
        const transitType = modeType === 'FTL' ? 'By Road' : 'By Sea Freight';

        const headerBadge = document.getElementById('headerPickupRequestBadge');
        const rawRequestNo = document.getElementById('headerPickupRequestNoText')?.textContent?.trim() || '';
        const isBadgeVisible = Boolean(headerBadge && !headerBadge.classList.contains('d-none'));
        const finalPickupRequestNo = (isBadgeVisible && rawRequestNo) ? rawRequestNo : null;

        const formData = {
            lr_number: lrNumber,
            pickup_date: val('lrDate') || null,
            customer_code: val('partyCode'),
            customer_name: val('partyName'),
            requested_date: val('requestedDate') || null,
            quotation_id: val('quotationID'),
            mode_type: modeType,
            movement_type: val('movementType'),
            transit_type: transitType,
            origin_pincode: val('originPinCode'),
            origin_city: val('originCity'),
            origin_address: val('originAddress'),
            destination_pincode: val('destinationPinCode'),
            destination_city: val('destinationCity'),
            destination_address: val('destinationAddress'),
            reference_number: val('referenceNumber'),
            invoice_value: num('invoiceValue'),
            vendor_code: val('vendorCode'),
            vendor_name: val('vendorName'),
            vehicle_type: val('vehicleType'),
            vehicle_number: val('vehicleNumber'),
            container_number: val('containerNumber'),
            quantity: num('quantity'),
            actual_weight: num('actualWt'),
            charge_weight: num('chargeWt'),
            payment_type: val('mainPaymentType'),
            routedetails: val('routeDetails') || null,
            information: val('information'),
            description_of_goods: val('descriptionofGoods'),
            waybillno: val('wayBillNo'),
            company_id: CompanyID,
            driver_code: val('driverCode'),
            driver_name: val('driverName'),
            driver_phone_no: val('driverPhoneNo'),
            driver_dl_no: val('driverDLNo'),
            pickup_request_no: finalPickupRequestNo
        };

        let query;
        if (isSaveAction) {
            formData.created_by = UserLoginID;
            formData.created_at = localtimeStamp;
            query = supabaseClient
                .from('FullLoadBookingDetails')
                .insert([formData])
                .select()
                .single();
        } else {
            formData.updated_by = UserLoginID;
            formData.updated_at = localtimeStamp;
            query = supabaseClient
                .from('FullLoadBookingDetails')
                .update(formData)
                .eq('lr_number', lrNumber)
                .eq('company_id', CompanyID)
                .select()
                .single();
        }

        const { data, error } = await query;
        if (error) throw error;

        const bookingId = data.id;
        const postSaveTasks = [
            saveCharges(bookingId, 'chargesDetailsTable', 'Sale'),
            saveCharges(bookingId, 'vendorChargesDetailsTable', 'Buy'),
            saveShipments(bookingId, lrNumber)
        ];

        if (finalPickupRequestNo && typeof updatePickupRequestStatus === 'function') {
            postSaveTasks.push(updatePickupRequestStatus(finalPickupRequestNo));
        }

        await Promise.all(postSaveTasks);
        await loadShipmentDetails(lrNumber);

        disableForm();
        setFormStateBadge('Saved', 'text-bg-success');

        saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Update';
        saveBtn.dataset.mode = 'update';
        saveBtn.disabled = true;

        const modifyBtn = document.getElementById('modifyButton');
        const reportBtn = document.getElementById('reportButton');
        if (modifyBtn) modifyBtn.disabled = false;
        if (reportBtn) reportBtn.disabled = false;

        notify(`Movement details ${isSaveAction ? 'saved' : 'updated'} successfully! LR Number: ${lrNumber}`, 'success');
    } catch (err) {
        console.error('Error saving data:', err);
        notify(`Error saving movement details: ${err.message || 'Unknown error'}`, 'error');
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
        if (addBtn) addBtn.disabled = false;
        if (vendorAddBtn) vendorAddBtn.disabled = false;
    }
});

// ============ SHIPMENT DETAILS TAB ============
addShipmentBtn?.addEventListener('click', () => {
    const type = document.getElementById('shipmentType')?.value || '';
    const name = document.getElementById('consigneeorConsignorName')?.value.trim() || '';
    const address = document.getElementById('consigneeorConsignorAddress')?.value.trim() || '';
    const pincode = document.getElementById('shipmentPinCode')?.value.trim() || '';
    const city = document.getElementById('shipmentCity')?.value.trim() || '';
    const refNo = document.getElementById('shipmentReferenceNumber')?.value.trim() || '';
    const eWayBillNo = document.getElementById('shipmentEWayBillNumber')?.value.trim() || '';

    const invValue = (parseFloat(document.getElementById('shipmentInvoiceValue')?.value) || 0).toFixed(2);
    const qty = (parseFloat(document.getElementById('shipmentQuantity')?.value) || 0).toFixed(2);
    const actWt = (parseFloat(document.getElementById('shipmentActualWt')?.value) || 0).toFixed(2);
    const chgWt = (parseFloat(document.getElementById('shipmentChargeWt')?.value) || 0).toFixed(2);

    if (!name || !address || !pincode || !city) {
        notify('Please fill in Name, Address, Pincode, and City before adding.', 'error');
        return;
    }

    let tr = currentEditShipmentId
        ? shipmentTableBody.querySelector(`tr[data-id="${CSS.escape(currentEditShipmentId)}"]`)
        : null;

    if (!tr) {
        tr = document.createElement('tr');
        if (currentEditShipmentId) tr.dataset.id = currentEditShipmentId;
        shipmentTableBody.appendChild(tr);
    }

    Object.assign(tr.dataset, {
        type, name, address, pincode, city, refNo, eWayBillNo, e_waybill_no: eWayBillNo, invValue, qty, actWt, chgWt
    });

    tr.innerHTML = `
        <td>${escapeHtml(type)}</td>
        <td class="text-cap">${escapeHtml(name)}</td>
        <td class="text-cap text-truncate" style="max-width: 150px;" title="${escapeHtml(address)}">${escapeHtml(address)}</td>
        <td>${escapeHtml(pincode)}</td>
        <td class="text-cap">${escapeHtml(city)}</td>
        <td class="text-upper">${escapeHtml(refNo)}</td>
        <td class="text-upper">${escapeHtml(eWayBillNo)}</td>
        <td class="text-end">${invValue}</td>
        <td class="text-end">${qty}</td>
        <td class="text-end">${actWt}</td>
        <td class="text-end">${chgWt}</td>
        <td class="text-center text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-primary py-0 px-1 edit-shipment-btn" title="Edit Row" aria-label="Edit Row"><i class="bi bi-pencil"></i></button>
            <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1 delete-shipment-btn" title="Remove Row" aria-label="Remove Row"><i class="bi bi-trash"></i></button>
        </td>
    `;

    recalculateShipmentSummary();

    currentEditShipmentId = null;
    const shipmentIdEl = document.getElementById('shipmentId');
    if (shipmentIdEl) shipmentIdEl.value = '';
    addShipmentBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Add';

    [
        'consigneeorConsignorName', 'consigneeorConsignorAddress', 'shipmentPinCode', 'shipmentCity',
        'shipmentReferenceNumber', 'shipmentInvoiceValue', 'shipmentQuantity', 'shipmentActualWt',
        'shipmentChargeWt', 'shipmentEWayBillNumber'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    document.getElementById('consigneeorConsignorName')?.focus();
});

shipmentTableBody?.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-shipment-btn');
    const editBtn = e.target.closest('.edit-shipment-btn');

    if (deleteBtn) {
        const tr = deleteBtn.closest('tr');
        const rowId = tr.dataset.id;
        // Only queue real DB IDs for deletion (skip temp_ IDs)
        if (rowId && !rowId.startsWith('temp_')) {
            deletedShipmentIds.push(rowId);
        }
        tr.remove();
        recalculateShipmentSummary();
    } else if (editBtn) {
        const tr = editBtn.closest('tr');
        currentEditShipmentId = tr.dataset.id || `temp_${Date.now()}`;
        tr.dataset.id = currentEditShipmentId;

        const fieldValues = {
            shipmentId: currentEditShipmentId,
            shipmentType: tr.dataset.type || '',
            consigneeorConsignorName: tr.dataset.name || '',
            consigneeorConsignorAddress: tr.dataset.address || '',
            shipmentPinCode: tr.dataset.pincode || '',
            shipmentCity: tr.dataset.city || '',
            shipmentReferenceNumber: tr.dataset.refNo || '',
            shipmentEWayBillNumber: tr.dataset.eWayBillNo || tr.dataset.e_waybill_no || '',
            shipmentInvoiceValue: tr.dataset.invValue || '',
            shipmentQuantity: tr.dataset.qty || '',
            shipmentActualWt: tr.dataset.actWt || '',
            shipmentChargeWt: tr.dataset.chgWt || ''
        };

        Object.entries(fieldValues).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });

        if (addShipmentBtn) addShipmentBtn.innerHTML = '<i class="bi bi-pencil"></i> Edit Item';
        document.getElementById('consigneeorConsignorName')?.focus();
    }
});

async function saveShipments(bookingId, lrNumber) {
    const rows = document.querySelectorAll('#shipmentDetailsTable tbody tr');
    const shipmentsToInsert = [];
    const shipmentsToUpdate = [];

    rows.forEach(tr => {
        if (tr.querySelector('.vm-empty')) return;

        const shipment = {
            booking_id: bookingId,
            lr_number: lrNumber,
            shipment_type: tr.dataset.type,
            consignee_or_consignor_name: tr.dataset.name,
            consignee_or_consignor_address: tr.dataset.address,
            pincode: tr.dataset.pincode,
            city: tr.dataset.city,
            reference_number: tr.dataset.refNo,
            e_waybill_no: tr.dataset.e_waybill_no || tr.dataset.eWayBillNo || '',
            invoice_value: parseFloat(tr.dataset.invValue) || 0,
            quantity: parseFloat(tr.dataset.qty) || 0,
            actual_weight: parseFloat(tr.dataset.actWt) || 0,
            charge_weight: parseFloat(tr.dataset.chgWt) || 0
        };

        const rowId = tr.dataset.id;
        const isPersistedId = rowId && rowId !== 'null' && rowId !== 'undefined' && rowId.trim() !== '' && !rowId.startsWith('temp_');

        if (isPersistedId) {
            shipment.id = rowId;
            shipment.updated_at = new Date().toISOString();
            shipmentsToUpdate.push(shipment);
        } else {
            shipmentsToInsert.push(shipment);
        }
    });

    try {
        const promises = [];

        if (deletedShipmentIds.length > 0) {
            promises.push(
                supabaseClient.from('FullLoadShipmentDetails').delete().in('id', deletedShipmentIds)
            );
        }
        if (shipmentsToUpdate.length > 0) {
            promises.push(
                supabaseClient.from('FullLoadShipmentDetails').upsert(shipmentsToUpdate)
            );
        }
        if (shipmentsToInsert.length > 0) {
            promises.push(
                supabaseClient.from('FullLoadShipmentDetails').insert(shipmentsToInsert)
            );
        }

        if (promises.length > 0) {
            const results = await Promise.allSettled(promises);
            results.forEach((res, idx) => {
                if (res.status === 'rejected') {
                    console.warn(`Shipment operation at index ${idx} failed:`, res.reason);
                }
            });
        }
    } catch (err) {
        console.warn('Failed to update shipment details:', err);
    } finally {
        deletedShipmentIds = [];
    }
}

async function loadShipmentDetails(lrNumber) {
    const { data, error } = await supabaseClient
        .from('FullLoadShipmentDetails')
        .select('*')
        .eq('lr_number', lrNumber);

    if (error || !data || !shipmentTableBody) return;

    shipmentTableBody.innerHTML = '';
    deletedShipmentIds = [];
    currentEditShipmentId = null;

    const fragment = document.createDocumentFragment();
    data.forEach(row => {
        const tr = document.createElement('tr');
        const eWayBillNo = row.e_waybill_no || '';

        Object.assign(tr.dataset, {
            id: row.id,
            type: row.shipment_type,
            name: row.consignee_or_consignor_name,
            address: row.consignee_or_consignor_address,
            pincode: row.pincode,
            city: row.city,
            refNo: row.reference_number,
            eWayBillNo,
            e_waybill_no: eWayBillNo,
            invValue: row.invoice_value,
            qty: row.quantity,
            actWt: row.actual_weight,
            chgWt: row.charge_weight
        });

        tr.innerHTML = `
            <td>${escapeHtml(row.shipment_type)}</td>
            <td class="text-cap">${escapeHtml(row.consignee_or_consignor_name)}</td>
            <td class="text-cap text-truncate" style="max-width: 150px;" title="${escapeHtml(row.consignee_or_consignor_address)}">${escapeHtml(row.consignee_or_consignor_address)}</td>
            <td>${escapeHtml(row.pincode)}</td>
            <td class="text-cap">${escapeHtml(row.city)}</td>
            <td class="text-upper">${escapeHtml(row.reference_number || '')}</td>
            <td class="text-upper">${escapeHtml(eWayBillNo)}</td>
            <td class="text-end">${(parseFloat(row.invoice_value) || 0).toFixed(2)}</td>
            <td class="text-end">${(parseFloat(row.quantity) || 0).toFixed(2)}</td>
            <td class="text-end">${(parseFloat(row.actual_weight) || 0).toFixed(2)}</td>
            <td class="text-end">${(parseFloat(row.charge_weight) || 0).toFixed(2)}</td>
            <td class="text-center text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-primary py-0 px-1 edit-shipment-btn" title="Edit Row" aria-label="Edit Row" disabled><i class="bi bi-pencil"></i></button>
                <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1 delete-shipment-btn" title="Remove Row" aria-label="Remove Row" disabled><i class="bi bi-trash"></i></button>
            </td>
        `;
        fragment.appendChild(tr);
    });

    shipmentTableBody.appendChild(fragment);
    updateShipmentTotals();
}

// ============ BILLING CHARGES TABS ============
async function loadBillingCharges(lrNumber, accountType, tableId) {
    const { data, error } = await supabaseClient
        .from('FullLoadBookingCharges')
        .select('*')
        .eq('LRNumber', lrNumber)
        .eq('AccountType', accountType);

    if (error || !data) return;

    const tableBody = document.querySelector(`#${tableId} tbody`);
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const fragment = document.createDocumentFragment();
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.dataset.status = 'old';
        tr.dataset.id = row.id;

        tr.innerHTML = `
            <td class="align-middle">${escapeHtml(row.ChargesType)}</td>
            <td class="text-end align-middle">${escapeHtml(row.TaxRate)}%</td>
            <td class="text-end align-middle">${(parseFloat(row.TotalAmount) || 0).toFixed(2)}</td>
            <td class="text-end align-middle">${(parseFloat(row.CGSTAmt) || 0).toFixed(2)}</td>
            <td class="text-end align-middle">${(parseFloat(row.SGSTAmt) || 0).toFixed(2)}</td>
            <td class="text-end align-middle">${(parseFloat(row.IGSTAmt) || 0).toFixed(2)}</td>
            <td class="text-end align-middle">${(parseFloat(row.TotalGSTAmt) || 0).toFixed(2)}</td>
            <td class="text-end align-middle">${(parseFloat(row.GrandTotalAmt) || 0).toFixed(2)}</td>
            <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger deleteRow" disabled aria-label="Delete charge"><i class="bi bi-trash"></i></button></td>
            <td class="align-middle d-none">${escapeHtml(row.HSNCode || '')}</td>
            <td class="align-middle d-none">${escapeHtml(row.TaxID || '')}</td>
        `;

        tr.querySelector('.deleteRow').onclick = () => {
            tr.dataset.status = 'deleted';
            tr.style.display = 'none';
            updateChargesTotals(tableId);
        };

        fragment.appendChild(tr);
    });

    tableBody.appendChild(fragment);
    updateChargesTotals(tableId);
}

document.getElementById('addFreightRow')?.addEventListener('click', async () => {
    await addFreightRow('chargesDetailsTable', 'chargesType', 'customerFreightAmt', 'partyDefaultTax');
    await getFixedCharges('Sell');
});

document.getElementById('addVendorFreightRow')?.addEventListener('click', async () => {
    await addFreightRow('vendorChargesDetailsTable', 'vendorChargesType', 'vendorFreightAmt', 'vendorDefaultTax');
    await getFixedCharges('Buy');
});

async function addFreightRow(tableId, chargesInput, amountInput, taxInput) {
    const chargesEl = document.getElementById(chargesInput);
    const amountEl = document.getElementById(amountInput);
    const taxEl = document.getElementById(taxInput);

    const chargesType = chargesEl?.value.trim() || '';
    const amount = parseFloat(amountEl?.value) || 0;
    const taxID = taxEl?.value || 1;

    const addVendorBtn = document.getElementById('addVendorFreightRow');
    const addFreightBtn = document.getElementById('addFreightRow');

    if (addVendorBtn) addVendorBtn.disabled = true;
    if (addFreightBtn) addFreightBtn.disabled = true;

    try {
        if (!chargesType || amount <= 0) {
            notify('Enter Charges Type and Amount', 'error');
            return null;
        }

        const tableBody = document.querySelector(`#${tableId} tbody`);
        if (!tableBody) return null;

        // Prevent duplicate active charge types
        const isDuplicate = getActiveRows(tableId).some(
            row => row.children[0]?.textContent.trim() === chargesType
        );
        if (isDuplicate) return null;

        const [HSNCode, taxes] = await Promise.all([
            getDropdownDataValue(chargesType, 'ChargesType'),
            getTaxRatesById(taxID)
        ]);

        const taxCalculations = calculateTaxes(amount, taxes);
        const tr = document.createElement('tr');
        tr.dataset.status = 'new';

        // Column order: ChargesType | GST% | Amount | CGST | SGST | IGST | Total GST | Grand Total | Action | HSN | TaxID
        tr.innerHTML = `
            <td>${escapeHtml(chargesType)}</td>
            <td class="text-end">${taxCalculations.totalRate}%</td>
            <td class="text-end">${amount.toFixed(2)}</td>
            <td class="text-end">${taxCalculations.cgstAmt.toFixed(2)}</td>
            <td class="text-end">${taxCalculations.sgstAmt.toFixed(2)}</td>
            <td class="text-end">${taxCalculations.igstAmt.toFixed(2)}</td>
            <td class="text-end">${taxCalculations.totalGstAmt.toFixed(2)}</td>
            <td class="text-end">${taxCalculations.grandTotal.toFixed(2)}</td>
            <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger deleteRow" aria-label="Delete charge"><i class="bi bi-trash"></i></button></td>
            <td class="d-none">${escapeHtml(HSNCode?.hsn_code || '0')}</td>
            <td class="d-none">${escapeHtml(taxID)}</td>
        `;

        tableBody.appendChild(tr);

        tr.querySelector('.deleteRow').onclick = () => {
            if (tr.dataset.status === 'new') {
                tr.remove();
            } else {
                tr.dataset.status = 'deleted';
                tr.style.display = 'none';
            }
            updateChargesTotals(tableId);
        };

        updateChargesTotals(tableId);

        if (chargesEl) chargesEl.value = '';
        if (amountEl) amountEl.value = '';
        if (taxEl) taxEl.selectedIndex = 0;

        return tr;
    } finally {
        if (addVendorBtn) addVendorBtn.disabled = false;
        if (addFreightBtn) addFreightBtn.disabled = false;
    }
}

function updateChargesTotals(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const rows = getActiveRows(tableId);
    const tfoot = table.querySelector('tfoot') || table.createTFoot();

    const totals = { amount: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, grand: 0 };

    rows.forEach(tr => {
        totals.amount += parseFloat(tr.children[2]?.textContent) || 0;
        totals.cgst += parseFloat(tr.children[3]?.textContent) || 0;
        totals.sgst += parseFloat(tr.children[4]?.textContent) || 0;
        totals.igst += parseFloat(tr.children[5]?.textContent) || 0;
        totals.gst += parseFloat(tr.children[6]?.textContent) || 0;
        totals.grand += parseFloat(tr.children[7]?.textContent) || 0;
    });

    tfoot.innerHTML = `
        <tr class="table-secondary fw-bold">
            <td colspan="2">Total</td>
            <td class="text-end">${totals.amount.toFixed(2)}</td>
            <td class="text-end">${totals.cgst.toFixed(2)}</td>
            <td class="text-end">${totals.sgst.toFixed(2)}</td>
            <td class="text-end">${totals.igst.toFixed(2)}</td>
            <td class="text-end">${totals.gst.toFixed(2)}</td>
            <td class="text-end">${totals.grand.toFixed(2)}</td>
            <td></td>
        </tr>
    `;
}

async function saveCharges(bookingId, tableId, accountType) {
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    const insertData = [];
    const deleteIds = [];

    const { data: existingData } = await supabaseClient
        .from('FullLoadBookingCharges')
        .select('ChargesType')
        .eq('ID_FT', bookingId)
        .eq('AccountType', accountType);

    const existingChargeTypes = new Set(existingData?.map(d => d.ChargesType) || []);
    const getNumber = val => (!val || val === 'No GST') ? 0 : parseFloat(val) || 0;
    const lrNumber = document.getElementById('lrNumber')?.value.trim() || '';

    rows.forEach(row => {
        // Skip empty-state placeholder rows
        if (row.querySelector('td.vm-empty')) return;

        const status = row.dataset.status;
        const cells = row.querySelectorAll('td');
        if (cells.length < 11) return;

        const chargeType = cells[0].textContent.trim();

        if (status === 'new' && !existingChargeTypes.has(chargeType)) {
            insertData.push({
                ID_FT: bookingId,
                LRNumber: lrNumber,
                ChargesType: chargeType,
                TaxRate: getNumber(cells[1].textContent),
                Quantity: 1,
                PerQtyAmt: getNumber(cells[2].textContent),
                TotalAmount: getNumber(cells[2].textContent),
                CGSTAmt: getNumber(cells[3].textContent),
                SGSTAmt: getNumber(cells[4].textContent),
                IGSTAmt: getNumber(cells[5].textContent),
                TotalGSTAmt: getNumber(cells[6].textContent),
                GrandTotalAmt: getNumber(cells[7].textContent),
                HSNCode: cells[9].textContent || '',
                TaxID: cells[10].textContent || '',
                AccountType: accountType,
                created_by: UserLoginID,
                created_at: localtimeStamp
            });
            existingChargeTypes.add(chargeType);
        }

        if (status === 'deleted' && row.dataset.id) {
            deleteIds.push(row.dataset.id);
        }
    });

    const promises = [];
    if (insertData.length > 0) promises.push(supabaseClient.from('FullLoadBookingCharges').insert(insertData));
    if (deleteIds.length > 0) promises.push(supabaseClient.from('FullLoadBookingCharges').delete().in('id', deleteIds));
    if (promises.length > 0) await Promise.all(promises);
}

// ============ TARIFFS & FIXED CHARGES ============
async function getTariffRate(partyCode, tariffType) {
    const movementType = document.getElementById('movementType')?.value;
    const modeType = document.getElementById('modeType')?.value;
    const vehicleType = document.getElementById('vehicleType')?.value;
    const routeDetails = document.getElementById('routeDetails')?.value.toLowerCase().trim();
    const chargeWt = parseFloat(document.getElementById('chargeWt')?.value) || 0;
    const bookingDate = document.getElementById('lrDate')?.value;

    if (!partyCode || !movementType || !modeType || !vehicleType || !routeDetails) {
        return null;
    }

    const { data, error } = await supabaseClient
        .from('FTL_FCL_Tariff')
        .select('Rate')
        .eq('PartyCode', partyCode)
        .eq('MovementType', movementType)
        .eq('ModeType', modeType)
        .eq('VehicleType', vehicleType)
        .eq('RouteDetails', routeDetails)
        .eq('TariffType', tariffType)
        .gte('CargoWeight', chargeWt)
        .lte('EffectiveDate', bookingDate)
        .order('EffectiveDate', { ascending: false })
        .order('CargoWeight', { ascending: true })
        .limit(1);

    if (error) {
        console.error('Tariff fetch error:', error);
        return null;
    }

    return data?.[0]?.Rate || null;
}

async function applyCustomerTariff() {
    const partyCode = document.getElementById('partyCode')?.value;
    const rate = await getTariffRate(partyCode, 'Sell');

    const amountInput = document.getElementById('customerFreightAmt');
    const chargesInput = document.getElementById('chargesType');
    if (!amountInput || !chargesInput) return;

    if (!rate) {
        chargesInput.value = '';
        amountInput.value = '0.00';
        return;
    }

    chargesInput.value = 'Freight Amount';
    amountInput.value = rate;

    await addFreightRow('chargesDetailsTable', 'chargesType', 'customerFreightAmt', 'partyDefaultTax');
}

async function applyVendorTariff() {
    const vendorCode = document.getElementById('vendorCode')?.value;
    const rate = await getTariffRate(vendorCode, 'Buy');

    const amountInput = document.getElementById('vendorFreightAmt');
    const chargesInput = document.getElementById('vendorChargesType');
    if (!amountInput || !chargesInput) return;

    if (!rate) {
        chargesInput.value = '';
        amountInput.value = '0.00';
        return;
    }

    chargesInput.value = 'Freight Amount';
    amountInput.value = rate;

    await addFreightRow('vendorChargesDetailsTable', 'vendorChargesType', 'vendorFreightAmt', 'vendorDefaultTax');
}

['lrDate', 'partyCode', 'modeType', 'movementType', 'routeDetails', 'vehicleType', 'chargeWt', 'vendorCode'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', async () => {
        await Promise.all([applyCustomerTariff(), applyVendorTariff()]);
    });
});

function clearAutoCharges(tableId) {
    document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
        if (row.dataset.auto === 'true') row.remove();
    });
}

async function getFixedCharges(accountType = 'Sell') {
    const partyCode = accountType === 'Sell'
        ? document.getElementById('partyCode')?.value
        : document.getElementById('vendorCode')?.value;
    const movementType = document.getElementById('movementType')?.value;
    const modeType = document.getElementById('modeType')?.value;
    const bookingDate = document.getElementById('lrDate')?.value;
    const freightAmt = accountType === 'Sell'
        ? parseFloat(document.getElementById('customerFreightAmt')?.value) || 0
        : parseFloat(document.getElementById('vendorFreightAmt')?.value) || 0;

    if (!partyCode) return;

    const { data } = await supabaseClient
        .from('FixedCharges')
        .select('*')
        .eq('PartyCode', partyCode)
        .eq('FixedChargesType', accountType)
        .lte('EffectiveDate', bookingDate)
        .order('EffectiveDate', { ascending: false });

    if (!data || data.length === 0) return;

    const applicableCharges = [];
    data.forEach(row => {
        if (
            (row.MovementType === movementType || row.MovementType === 'All') &&
            row.TransitType === 'All' &&
            (row.ModeType === modeType || row.ModeType === 'All')
        ) {
            let charge = row.Percentage > 0 ? (freightAmt * row.Percentage) / 100 : 0;
            if (row.Amount > charge) charge = row.Amount;
            applicableCharges.push({ type: row.ChargesType, amount: charge });
        }
    });

    await applyFixedCharges(applicableCharges, accountType);
}

async function applyFixedCharges(charges, accountType) {
    const tableId = accountType === 'Sell' ? 'chargesDetailsTable' : 'vendorChargesDetailsTable';
    const chargesInput = accountType === 'Sell' ? 'chargesType' : 'vendorChargesType';
    const amountInput = accountType === 'Sell' ? 'customerFreightAmt' : 'vendorFreightAmt';
    const taxInput = accountType === 'Sell' ? 'partyDefaultTax' : 'vendorDefaultTax';

    clearAutoCharges(tableId);

    for (const ch of charges) {
        const chargesEl = document.getElementById(chargesInput);
        const amountEl = document.getElementById(amountInput);
        if (chargesEl) chargesEl.value = ch.type;
        if (amountEl) amountEl.value = ch.amount.toFixed(2);

        const newRow = await addFreightRow(tableId, chargesInput, amountInput, taxInput);
        if (newRow) newRow.dataset.auto = 'true';
    }
}

async function generateLRNumber() {
    const companyId = localStorage.getItem('CompanyID');
    const companyProfile = await getCompanyProfile(companyId);
    const { data } = await supabaseClient.rpc('generate_lr_number', {
        p_company_id: companyId,
        p_short_code: companyProfile.short_code
    });
    return data;
}

// ============ PRINT DROPDOWN ============
document.querySelectorAll('.dropdown-menu [data-print-type]').forEach(item => {
    item.addEventListener('click', async (e) => {
        e.preventDefault();
        const printType = e.currentTarget.getAttribute('data-print-type');
        const lrNumber = document.getElementById('lrNumber')?.value.trim() || '';

        if (!lrNumber) {
            notify('Please enter or select an LR Number first.', 'warning');
            return;
        }

        if (printType === 'lr_report') {
            await generateConsignmentNote(lrNumber);
        } else if (printType === 'lr_annexure_Report') {
            await generateConsignmentNote_annexure(lrNumber);
        }
    });
});

// ============ PARTY & ORIGIN AUTO-FILL ============
document.getElementById('partyName')?.addEventListener('change', async function () {
    const selectedPartyName = this.value.trim();
    if (!selectedPartyName) {
        clearOriginFields();
        return;
    }

    const { data: partyData } = await supabaseClient
        .from('PartyDetails')
        .select('PartyCode, PinCode, City, Address')
        .eq('PartyName', selectedPartyName)
        .eq('company_id', CompanyID)
        .maybeSingle();

    if (partyData) {
        const partyCodeEl = document.getElementById('partyCode');
        if (partyCodeEl) partyCodeEl.value = partyData.PartyCode;

        const { data: addressData } = await supabaseClient
            .from('PartyBillingAddress')
            .select('Address, City, PinCode, State')
            .eq('PartyCode', partyData.PartyCode)
            .eq('company_id', CompanyID)
            .eq('Status', 'Active');

        if (addressData?.length === 1) {
            populateOriginFields(addressData[0].PinCode, addressData[0].City, addressData[0].Address);
        } else {
            populateOriginFields(partyData.PinCode, partyData.City, partyData.Address);
        }
    }
});

function populateOriginFields(pincode, city, address) {
    const pinEl = document.getElementById('originPinCode');
    const cityEl = document.getElementById('originCity');
    const addrEl = document.getElementById('originAddress');

    if (pinEl) {
        pinEl.value = pincode || '';
        pinEl.dispatchEvent(new Event('change'));
    }
    if (cityEl) cityEl.value = city || '';
    if (addrEl) addrEl.value = address || '';

    applyCustomerTariff();
}

function clearOriginFields() {
    ['partyCode', 'originPinCode', 'originCity', 'originAddress'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// ============ SHIPMENT SUMMARY & TOTALS ============
function updateShipmentTotals() {
    let totalQty = 0;
    let totalActWt = 0;
    let totalChgWt = 0;

    document.querySelectorAll('#shipmentDetailsTable tbody tr').forEach(tr => {
        if (tr.querySelector('td.vm-empty')) return;
        totalQty += parseFloat(tr.dataset.qty) || 0;
        totalActWt += parseFloat(tr.dataset.actWt) || 0;
        totalChgWt += parseFloat(tr.dataset.chgWt) || 0;
    });

    const qtyEl = document.getElementById('quantity');
    const actWtEl = document.getElementById('actualWt');
    const chargeWtEl = document.getElementById('chargeWt');

    if (qtyEl) qtyEl.value = totalQty.toFixed(2);
    if (actWtEl) actWtEl.value = totalActWt.toFixed(2);
    if (chargeWtEl) {
        chargeWtEl.value = totalChgWt.toFixed(2);
        chargeWtEl.dispatchEvent(new Event('change'));
    }
}

function recalculateShipmentSummary() {
    const allRows = Array.from(shipmentTableBody?.querySelectorAll('tr') || []).filter(
        tr => !tr.querySelector('td.vm-empty')
    );

    if (allRows.length === 0) {
        updateShipmentTotals();
        return;
    }

    const pickupCities = new Set();
    const deliveryCities = new Set();
    const uniqueRefs = new Set();
    let totalInvoiceValue = 0;

    let deliveryRow = null;
    let pickupRow = null;

    allRows.forEach(row => {
        if (row.dataset.refNo) uniqueRefs.add(row.dataset.refNo);
        totalInvoiceValue += parseFloat(row.dataset.invValue) || 0;

        const type = (row.dataset.type || '').toLowerCase();
        if (type === 'delivery') {
            if (!deliveryRow) deliveryRow = row;
            if (row.dataset.city) deliveryCities.add(row.dataset.city);
        } else if (type === 'pickup') {
            if (!pickupRow) pickupRow = row;
            if (row.dataset.city) pickupCities.add(row.dataset.city);
        }
    });

    if (deliveryRow) {
        const destPin = document.getElementById('destinationPinCode');
        const destCity = document.getElementById('destinationCity');
        const destAddr = document.getElementById('destinationAddress');
        if (destPin) destPin.value = deliveryRow.dataset.pincode || '';
        if (destCity) destCity.value = Array.from(deliveryCities).join(', ');
        if (destAddr) destAddr.value = deliveryRow.dataset.address || '';
    }

    if (pickupRow) {
        const origPin = document.getElementById('originPinCode');
        const origCity = document.getElementById('originCity');
        const origAddr = document.getElementById('originAddress');
        if (origPin) origPin.value = pickupRow.dataset.pincode || '';
        if (origCity) origCity.value = Array.from(pickupCities).join(', ');
        if (origAddr) origAddr.value = pickupRow.dataset.address || '';
    }

    const refEl = document.getElementById('referenceNumber');
    const invEl = document.getElementById('invoiceValue');
    if (refEl) refEl.value = Array.from(uniqueRefs).join(', ');
    if (invEl) invEl.value = totalInvoiceValue.toFixed(2);

    updateShipmentTotals();
}