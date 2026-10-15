// ========================================================
// PICKUP REQUEST MANAGEMENT SCRIPT
// ========================================================

// Cache DOM Elements to avoid querying the DOM repeatedly
const elements = {
    pickupRequestNo: document.getElementById("pickupRequestNo"),
    pickupRequestDate: document.getElementById("pickupRequestDate"),
    partyName: document.getElementById("partyName"),
    partyCode: document.getElementById("partyCode"),
    scheduledDate: document.getElementById("scheduledDate"),
    requestMovementType: document.getElementById("requestMovementType"),
    originPinCode: document.getElementById("originPinCode"),
    originCity: document.getElementById("originCity"),
    originAddress: document.getElementById("originAddress"),
    assignedToPerson: document.getElementById("assignedToPerson"),
    assignedToPersonCode: document.getElementById("assignedToPersonCode"),
    notes: document.getElementById("notes"),
    saveButton: document.getElementById("saveButton"),
    tbody: document.getElementById("tbody")
};

document.addEventListener("DOMContentLoaded", async () => {
    if (typeof enableForm === 'function') enableForm();
    if (elements.pickupRequestDate) elements.pickupRequestDate.valueAsDate = new Date();

    try {
        await Promise.all([
            loadSuggestions('partySuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
            loadSuggestions('assignedToPersonSuggestions', 'AccountMasterView', CompanyID, 'AccountCode', 'AccountName'),
            setupPincodeListener('originPinCode', 'originCity'),
            setupPincodeListener('destinationPinCode', 'destinationCity'),
            setupPincodeListener('shipmentPinCode', 'shipmentCity'),
            loadPickupRequests()
        ]);
    } catch (error) {
        console.error("Initialization error:", error);
        showToast('error', 'Failed to initialize form.');
    }
});

// Party selection listener
if (elements.partyName) {
    elements.partyName.addEventListener("change", async function () {
        const selectedPartyName = this.value.trim();
        if (!selectedPartyName) return clearOriginFields();

        try {
            const { data: partyData, error: partyError } = await supabaseClient
                .from('PartyDetails')
                .select('PartyCode, PinCode, City, Address')
                .eq('PartyName', selectedPartyName)
                .eq('company_id', CompanyID)
                .maybeSingle();

            if (partyError) throw partyError;
            if (!partyData) return;

            elements.partyCode.value = partyData.PartyCode;

            const { data: addressData, error: addressError } = await supabaseClient
                .from('PartyBillingAddress')
                .select('Address, City, PinCode, State')
                .eq('PartyCode', partyData.PartyCode)
                .eq('company_id', CompanyID)
                .eq('Status', 'Active');

            if (addressError) throw addressError;

            if (addressData?.length > 1) {
                showAddressSelectionModal(addressData);
            } else if (addressData?.length === 1) {
                populateOriginFields(addressData[0].PinCode, addressData[0].City, addressData[0].Address);
            } else {
                populateOriginFields(partyData.PinCode, partyData.City, partyData.Address);
            }
        } catch (error) {
            console.error("Error fetching party details:", error);
        }
    });
}

function populateOriginFields(pincode = "", city = "", address = "") {
    elements.originPinCode.value = pincode;
    elements.originCity.value = city;
    elements.originAddress.value = address;
    elements.originPinCode.dispatchEvent(new Event('change'));
}

function clearOriginFields() {
    elements.partyCode.value = "";
    populateOriginFields();
}

function showAddressSelectionModal(addresses) {
    let modalEl = document.getElementById("addressSelectionModal");

    if (!modalEl) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="addressSelectionModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-md">
                <div class="modal-content shadow-lg border-0">
                    <div class="modal-header bg-light pb-2 pt-2">
                        <h6 class="modal-title mb-0">Select Pickup Address</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-0"><div class="list-group list-group-flush" id="addressModalList"></div></div>
                </div>
            </div>
        </div>`);
        modalEl = document.getElementById("addressSelectionModal");
    }

    const listContainer = document.getElementById("addressModalList");
    const modalInstance = new bootstrap.Modal(modalEl);

    listContainer.innerHTML = addresses.map(addr => `
        <button type="button" class="list-group-item list-group-item-action p-3" 
                onclick="handleAddressSelect('${addr.PinCode}', '${addr.City}', '${addr.Address}')">
            <h6 class="mb-1 text-cap">${addr.City || 'Unknown'} - ${addr.PinCode || ''}</h6>
            <p class="mb-1 small text-muted text-cap">${addr.Address || ''}</p>
        </button>
    `).join('');

    window.handleAddressSelect = (pincode, city, address) => {
        populateOriginFields(pincode, city, address);
        modalInstance.hide();
    };

    modalInstance.show();
}

async function generatePickupRequestNumber(companyId) {
    try {
        const { data, error } = await supabaseClient.rpc('generate_pickup_request_number', {
            p_company_id: String(companyId)
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error generating Pickup Request Number:', error.message);
        return null;
    }
}

if (elements.saveButton) {
    elements.saveButton.addEventListener("click", async function () {
        let requestNumber = elements.pickupRequestNo.value;
        const mode = this.dataset.mode || 'insert';
        if (!validateForm()) return;
        if (mode === "insert" && !requestNumber) {
            requestNumber = await generatePickupRequestNumber(CompanyID);
            if (!requestNumber) return alert("Failed to generate Pickup Request Number. Please try again.");
            elements.pickupRequestNo.value = requestNumber;
        }

        await savePickupRequest(requestNumber, mode);
    });
}

async function savePickupRequest(requestNumber, mode) {
    const btn = elements.saveButton;
    const originalHtml = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving…';

    const payload = {
        pickup_request_date: elements.pickupRequestDate.value,
        party_code: elements.partyCode.value,
        customer_name: elements.partyName.value,
        scheduled_date: elements.scheduledDate.value,
        request_movement_type: elements.requestMovementType.value,
        origin_pin_code: elements.originPinCode.value,
        origin_city: elements.originCity.value,
        origin_address: elements.originAddress.value,
        vendor_code: elements.assignedToPersonCode.value,
        assigned_to_person: elements.assignedToPerson.value,
        notes: elements.notes.value,
        updated_at: localtimeStamp,
        updated_by: UserLoginID
    };

    try {
        let error;
        if (mode === "insert") {
            const insertPayload = {
                ...payload,
                pickup_request_no: requestNumber,
                status: 'Pending',
                company_id: CompanyID,
                created_at: localtimeStamp,
                created_by: UserLoginID
            };
            ({ error } = await supabaseClient.from('pickup_requests').insert([insertPayload]));
        } else {
            ({ error } = await supabaseClient
                .from('pickup_requests')
                .update(payload)
                .eq('pickup_request_no', requestNumber)
                .eq('company_id', CompanyID));
        }

        if (error) throw error;

        await loadPickupRequests();

        showToast('success', mode === 'update' ? 'Pickup request updated.' : 'Pickup request saved.');
        clearForm();
    } catch (err) {
        console.error(err);
        showToast('error', err.message || 'Failed to save pickup request.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}

// Fetch data from Supabase
async function loadPickupRequests() {
    try {
        const { data, error } = await supabaseClient
            .from('pickup_requests')
            .select('*')
            .eq('status', 'Pending')
            .eq('company_id', CompanyID)
            .eq('created_by', UserLoginID)
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;
        renderRows(data || []);
    } catch (error) {
        console.error("Error loading pickup requests:", error);
        showToast('error', 'Unable to load pickup requests.');
    }
}

// Render data into the primary scheduled table
function renderRows(rows) {
    const tbody = document.querySelector("#scheduledPickupDetailsTable tbody");
    if (!tbody) return;

    if (rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="vm-empty text-center py-4 text-muted">
                    <i class="bi bi-box-seam fs-3 d-block mb-2" aria-hidden="true"></i>
                    No scheduled pickup rows added
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map((row, idx) => `
        <tr data-id="${row.id}">
            <td>${idx + 1}</td>
            <td>
                <a href="javascript:void(0);" 
                   class="text-primary text-decoration-none fw-semibold" 
                   onclick="editPickupRequest('${row.pickup_request_no}')" 
                   title="Click to edit this request">
                    ${escape(row.pickup_request_no || '')}
                </a>
            </td>
            <td>${fmtDate(row.pickup_request_date)}</td>
            <td class="text-wrap text-break">${escape(row.customer_name || '')}</td>
            <td>${fmtDateTime(row.scheduled_date)}</td>
            <td>${escape(row.request_movement_type || '')}</td>
            <td class="text-wrap text-break">${escape(row.origin_address || '')}</td>
            <td>${escape(row.assigned_to_person || '')}</td>
            <td class="text-wrap text-break">${escape(row.notes || '')}</td>
            <td class="text-wrap text-break">${escape(row.canceled_notes || '')}</td>
        </tr>
    `).join('');
}

// Utility functions
function escape(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function fmtDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-GB');
}

function fmtDateTime(dateTimeString) {
    if (!dateTimeString) return '';
    return new Date(dateTimeString).toLocaleString('en-GB', {
        dateStyle: 'short',
        timeStyle: 'short'
    });
}

// Load selected row data into form fields for editing
async function editPickupRequest(requestNo) {
    if (!requestNo) return;

    try {
        const { data, error } = await supabaseClient
            .from('pickup_requests')
            .select('*')
            .eq('pickup_request_no', requestNo)
            .eq('company_id', CompanyID)
            .single();

        if (error) throw error;
        if (!data) return showToast('error', 'Request not found.');

        elements.pickupRequestNo.value = data.pickup_request_no || '';
        elements.pickupRequestDate.value = data.pickup_request_date ? data.pickup_request_date.split('T')[0] : '';
        elements.partyName.value = data.customer_name || '';
        elements.partyCode.value = data.party_code || '';
        elements.scheduledDate.value = data.scheduled_date ? data.scheduled_date.substring(0, 16) : '';
        elements.requestMovementType.value = data.request_movement_type || '';
        elements.originPinCode.value = data.origin_pin_code || '';
        elements.originCity.value = data.origin_city || '';
        elements.originAddress.value = data.origin_address || '';
        elements.assignedToPersonCode.value = data.vendor_code || '';
        elements.assignedToPerson.value = data.assigned_to_person || '';
        elements.notes.value = data.notes || '';

        elements.saveButton.dataset.mode = 'update';
        elements.saveButton.innerHTML = '<i class="bi bi-save"></i> Update';

        const deleteButton = document.getElementById("deleteButton");
        const modifyButton = document.getElementById("modifyButton");
        const reportButton = document.getElementById("reportButton");

        if (deleteButton) deleteButton.disabled = false;
        if (modifyButton) modifyButton.disabled = false;
        if (reportButton) reportButton.disabled = false;

        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
        console.error("Error loading pickup request for edit:", error);
        showToast('error', 'Failed to load details for editing.');
    }
}

async function clearForm() {
    elements.pickupRequestNo.value = '';
    elements.pickupRequestDate.value = '';
    elements.partyName.value = '';
    elements.partyCode.value = '';
    elements.scheduledDate.value = '';
    elements.requestMovementType.value = '';
    elements.originPinCode.value = '';
    elements.originCity.value = '';
    elements.originAddress.value = '';
    elements.assignedToPersonCode.value = '';
    elements.assignedToPerson.value = '';
    elements.notes.value = '';

    elements.saveButton.dataset.mode = 'insert';
    elements.saveButton.innerHTML = '<i class="bi bi-save"></i> Save';
}

function validateForm() {
    const requiredFields = [
        elements.pickupRequestDate,
        elements.partyName,
        elements.scheduledDate,
        elements.requestMovementType,
        elements.originPinCode,
        elements.originCity,
        elements.originAddress,
        elements.assignedToPerson
    ];
    for (const field of requiredFields) {
        if (!field.value) {
            field.classList.add('is-invalid');
            return false;
        } else {
            field.classList.remove('is-invalid');
        }
    }
    return true;
}

if (newButton) {
    newButton.addEventListener("click", function () {
        clearForm();
        elements.pickupRequestDate.valueAsDate = new Date();
    });
}

let currentSelectedRequestNo = null;


if (deleteButton) {
    deleteButton.addEventListener("click", () => {
        const requestNo = elements.pickupRequestNo.value.trim();
        if (!requestNo) {
            showToast('error', 'Please select a pickup request to cancel.');
            return;
        }

        currentSelectedRequestNo = requestNo;
        document.getElementById("canceledNotesInput").value = "";

        let modalEl = document.getElementById("cancelReasonModal");
        let modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    });
}

const confirmCancelBtn = document.getElementById("confirmCancelBtn");
if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener("click", async () => {
        const canceledNotes = document.getElementById("canceledNotesInput").value.trim();

        if (!canceledNotes) {
            showToast('error', 'Canceled notes are required to cancel a request.');
            document.getElementById("canceledNotesInput").focus();
            return;
        }

        if (!currentSelectedRequestNo) return;

        const originalText = confirmCancelBtn.innerHTML;
        confirmCancelBtn.disabled = true;
        confirmCancelBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';

        try {
            const { error } = await supabaseClient
                .from('pickup_requests')
                .update({
                    status: 'Canceled',
                    canceled_notes: canceledNotes,
                    updated_at: localtimeStamp,
                    updated_by: UserLoginID
                })
                .eq('pickup_request_no', currentSelectedRequestNo)
                .eq('company_id', CompanyID);

            if (error) throw error;

            const modalEl = document.getElementById("cancelReasonModal");
            bootstrap.Modal.getInstance(modalEl).hide();

            showToast('success', 'Pickup request successfully canceled.');

            const formEl = document.getElementById("fullTruckLoadForm");
            if (formEl) formEl.reset();
            elements.saveButton.dataset.mode = 'insert';

            await loadPickupRequests();

        } catch (err) {
            console.error("Cancellation error:", err);
            showToast('error', err.message || 'Failed to cancel pickup request.');
        } finally {
            confirmCancelBtn.disabled = false;
            confirmCancelBtn.innerHTML = originalText;
        }
    });
}


if (modifyButton) {
    modifyButton.addEventListener("click", () => {
        const requestNo = elements.pickupRequestNo.value.trim();
        const movementType = elements.requestMovementType.value.trim();

        if (!requestNo) {
            showToast('error', 'Please select or load a pickup request to confirm.');
            return;
        }

        if (!movementType) {
            showToast('error', 'Please select a Movement Type before confirming.');
            return;
        }

        const routes = {
            "International": "./InternationalBooking.html",
            "Domestic": "./DomesticBooking.html",
            "Customs Clearance": "./CustomsClearance.html",
            "Full Truck Load": "./FullTruckLoad.html"
        };

        const targetUrl = routes[movementType];

        if (!targetUrl) {
            showToast('error', 'No redirect route configured for this Movement Type.');
            return;
        }

        window.location.href = `${targetUrl}?pickupRequestNo=${encodeURIComponent(requestNo)}`;
    });
}

// ========================================================
// SEARCH SAVED PICKUP REQUEST MODAL INTEGRATION
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchSavedPickupRequestInput');
    const searchButton = document.getElementById('btnTriggerSearch');
    const tableBody = document.getElementById('searchPickupRequestTableBody');
    const searchModal = document.getElementById('searchPickupRequestModal');

    if (!searchInput || !searchButton || !tableBody || !searchModal) return;

    // Trigger search when the modal opens to automatically load the last 50 records
    searchModal.addEventListener('show.bs.modal', () => {
        searchInput.value = ''; // Clear any old input
        fetchModalPickupRequests(''); // Fetch latest records immediately
    });

    searchButton.addEventListener('click', () => {
        const query = searchInput.value.trim();
        fetchModalPickupRequests(query);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = searchInput.value.trim();
            fetchModalPickupRequests(query);
        }
    });

    searchModal.addEventListener('hidden.bs.modal', () => {
        searchInput.value = '';
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="vm-empty">
                    <i class="bi bi-receipt"></i>
                    Enter search criteria to find pickup requests…
                </td>
            </tr>
        `;
    });

    async function fetchModalPickupRequests(searchQuery) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Loading pickup requests...
                </td>
            </tr>
        `;

        try {
            let query = supabaseClient
                .from('pickup_requests')
                .select('*')
                .eq('company_id', CompanyID)
                .order('created_at', { ascending: false })
                .limit(50);

            if (searchQuery) {
                query = query.or(`pickup_request_no.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%,request_movement_type.ilike.%${searchQuery}%,status.ilike.%${searchQuery}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

            renderModalTableRows(data);
        } catch (error) {
            console.error('Error fetching search results:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-danger py-3">
                        <i class="bi bi-exclamation-triangle me-1"></i> Failed to load pickup requests. Please try again.
                    </td>
                </tr>
            `;
        }
    }

    function renderModalTableRows(requests) {
        if (!requests || requests.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="vm-empty text-center py-4 text-muted">
                        <i class="bi bi-search"></i> No pickup requests found.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        requests.forEach((req, index) => {
            const pickupDate = req.pickup_request_date ? new Date(req.pickup_request_date).toLocaleDateString('en-GB') : '-';
            const scheduledDate = req.scheduled_date ? new Date(req.scheduled_date).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '-';

            let statusBadge = 'bg-secondary';
            if (req.status === 'Pending') statusBadge = 'bg-warning text-dark';
            else if (req.status === 'Canceled') statusBadge = 'bg-danger';
            else if (req.status === 'Completed') statusBadge = 'bg-success';

            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${escape(req.pickup_request_no)}</strong></td>
                    <td>${pickupDate}</td>
                    <td>${scheduledDate}</td>
                    <td class="text-start">${escape(req.customer_name || '-')}</td>
                    <td><span class="badge bg-light text-dark border">${escape(req.request_movement_type)}</span></td>
                    <td class="text-center">
                        <span class="badge ${statusBadge}">${escape(req.status || 'Unknown')}</span>
                    </td>
                    <td class="text-center">
                        <button type="button" class="btn btn-sm btn-outline-primary select-pickup-btn" 
                            data-request-no="${escape(req.pickup_request_no)}">
                            <i class="bi bi-check2"></i> Select
                        </button>
                    </td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;

        document.querySelectorAll('.select-pickup-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const requestNo = e.currentTarget.getAttribute('data-request-no');

                const modalInstance = bootstrap.Modal.getInstance(searchModal);
                if (modalInstance) modalInstance.hide();

                await editPickupRequest(requestNo);
            });
        });
    }
});