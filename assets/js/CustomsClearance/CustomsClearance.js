// Cache common DOM elements
const jobNoInput = document.getElementById('jobNo');

// ==========================================
// JOB NO DOUBLE-CLICK SEARCH MODAL
// ==========================================
let cachedJobsList = [];

document.addEventListener("DOMContentLoaded", async () => {
    const jobNoInput = document.getElementById("jobNo");
    const jobSearchModalEl = document.getElementById("jobSearchModal");
    const jobSearchInput = document.getElementById("jobSearchInput");
    const clearJobSearchBtn = document.getElementById("clearJobSearch");

    if (!jobNoInput || !jobSearchModalEl) return;

    const jobSearchModal = new bootstrap.Modal(jobSearchModalEl);

    await initializeForm();

    // 1. Open modal on double-click of Job No
    jobNoInput.addEventListener("dblclick", async () => {
        jobSearchInput.value = "";
        jobSearchModal.show();
        await fetchJobsForSearchModal();
    });

    // Focus search box automatically when modal finishes opening
    jobSearchModalEl.addEventListener("shown.bs.modal", () => {
        jobSearchInput.focus();
    });

    // 2. Live filter across all 8 fields
    jobSearchInput.addEventListener("input", (e) => {
        filterJobSearchTable(e.target.value);
    });

    // Clear search button
    clearJobSearchBtn.addEventListener("click", () => {
        jobSearchInput.value = "";
        filterJobSearchTable("");
        jobSearchInput.focus();
    });
});

async function fetchJobsForSearchModal() {
    const tbody = document.getElementById("jobSearchTableBody");
    const countEl = document.getElementById("jobSearchCount");

    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="vm-empty">
                <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                <div>Loading jobs...</div>
            </td>
        </tr>`;

    try {
        const { data, error } = await supabaseClient
            .from("CustomsClearanceView")
            .select("JobID, JobDate, PartyName, TransitType, BLAWBNo, BENo, ClearancePort, CustomsBroker")
            .order("JobDate", { ascending: false })
            .eq("company_id", CompanyID)
            .limit(300);

        if (error) throw error;

        cachedJobsList = data || [];
        renderJobSearchTable(cachedJobsList);
    } catch (err) {
        console.error("Error loading jobs:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="vm-empty text-danger">
                    <i class="bi bi-exclamation-circle"></i>
                    Failed to load jobs. Please try again.
                </td>
            </tr>`;
        countEl.textContent = "Error loading records";
    }
}

function filterJobSearchTable(searchTerm) {
    const term = (searchTerm || "").trim().toLowerCase();

    if (!term) {
        renderJobSearchTable(cachedJobsList);
        return;
    }

    const filtered = cachedJobsList.filter((job) => {
        const searchableText = [
            job.JobID,
            job.JobDate,
            job.PartyName,
            job.TransitType,
            job.BLAWBNo,
            job.BENo,
            job.ClearancePort,
            job.CustomsBroker
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return searchableText.includes(term);
    });

    renderJobSearchTable(filtered);
}

function renderJobSearchTable(jobs) {
    const tbody = document.getElementById("jobSearchTableBody");
    const countEl = document.getElementById("jobSearchCount");

    countEl.textContent = `${jobs.length} record${jobs.length === 1 ? "" : "s"} found`;

    if (!jobs.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="vm-empty">
                    <i class="bi bi-search"></i>
                    No matching jobs found
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = jobs
        .map(
            (job) => `
        <tr class="job-search-row" style="cursor: pointer;" data-jobno="${DOMPurify.sanitize(job.JobID || "")}">
            <td class="fw-bold text-primary text-upper">${DOMPurify.sanitize(job.JobID || "-")}</td>
            <td class="text-nowrap">${DOMPurify.sanitize(job.JobDate || "-")}</td>
            <td>${DOMPurify.sanitize(job.PartyName || "-")}</td>
            <td>${DOMPurify.sanitize(job.TransitType || "-")}</td>
            <td class="text-upper">${DOMPurify.sanitize(job.BLAWBNo || "-")}</td>
            <td class="text-upper">${DOMPurify.sanitize(job.BENo || "-")}</td>
            <td>${DOMPurify.sanitize(job.ClearancePort || "-")}</td>
            <td>${DOMPurify.sanitize(job.CustomsBroker || "-")}</td>
        </tr>`
        )
        .join("");

    // Attach click handler to select a job
    tbody.querySelectorAll(".job-search-row").forEach((row) => {
        row.addEventListener("click", () => {
            const selectedJobNo = row.getAttribute("data-jobno");
            const jobNoInput = document.getElementById("jobNo");

            jobNoInput.value = selectedJobNo;

            // Close modal
            const modalInstance = bootstrap.Modal.getInstance(document.getElementById("jobSearchModal"));
            if (modalInstance) modalInstance.hide();

            // Trigger existing change/input handlers to load the job
            jobNoInput.dispatchEvent(new Event("change", { bubbles: true }));
            jobNoInput.dispatchEvent(new Event("input", { bubbles: true }));
        });
    });
}

// ========== Core Functions ==========

async function initializeForm() {
    try {
        await Promise.all([
            loadSuggestions('partySuggestions', 'PartyDetails', CompanyID),
            loadSuggestions('customsBrokerSuggestions', 'PartyDetails', CompanyID),
            loadBlAwbNumberSuggestions(CompanyID),
            loadBeNumberSuggestions(CompanyID),
        ]);

        loadTaxData();
    } catch (error) {
        console.error('Failed to load suggestions:', error);
    }
}

function getDateValue(id) {
    const value = document.getElementById(id).value.trim();
    return value === "" ? null : value;
}

/**
 * Retrieves trimmed form data from input fields.
 */
function getFormData() {
    return {
        JobDate: getDateValue('jobDate'),
        PartyCode: document.getElementById('partyCode').value.trim(),
        PartyName: document.getElementById('partyName').value.trim(),
        MovementType: document.getElementById('movementType').value.trim(),
        TransitType: document.getElementById('transitType').value.trim(),
        ModeType: document.getElementById('modeType').value.trim(),

        BLAWBNo: document.getElementById('blAwbNumber').value.trim().toUpperCase(),
        BLAWBDate: getDateValue('blAwbDate'),

        BENo: document.getElementById('beNumber').value.trim().toUpperCase(),
        BEDate: getDateValue('beDate'),

        Consignee: document.getElementById('consigneeName').value.trim(),
        Address: document.getElementById('deliveryAddress').value.trim(),

        Quantity: parseFloat(document.getElementById('quantity').value) || 0,
        CargoWeight: parseFloat(document.getElementById('cargoWeight').value) || 0,

        ClearanceMode: document.getElementById('clearanceMode').value.trim(),
        Commodity: document.getElementById('commodity').value.trim(),
        Origin: document.getElementById('originCountry').value.trim(),
        Destination: document.getElementById('destinationCountry').value.trim(),

        ClearancePort: clearancePortInput.value.trim(),
        CustomsBroker: document.getElementById('customsBroker').value.trim(),
        PONo: document.getElementById('poNo').value.trim(),
        AnyInformation: document.getElementById('information').value.trim()
    };
}

/**
 * Generates unique JobID based on last record for the company.
 */
async function generateJobID(companyID) {
    const { data, error } = await supabaseClient
        .from("CustomsClearance_Details")
        .select("JobID, JobRunningNo")
        .eq("company_id", companyID)
        .order("JobRunningNo", { ascending: false })
        .limit(1);

    if (error) throw error;

    // First Job
    if (!data || data.length === 0) {
        return {
            JobID: `${companyID}_CC001`,
            JobRunningNo: 1
        };
    }

    const lastRunningNo = data[0].JobRunningNo || 0;

    return {
        JobID: `${companyID}_CC${String(lastRunningNo + 1).padStart(3, "0")}`,
        JobRunningNo: lastRunningNo + 1
    };
}

/**
 * Determines if form is in update mode based on saveButton's data-mode attribute.
 */
function isUpdateMode() {
    return saveButton.getAttribute('data-mode') === 'update';
}

/**
 * Basic validation for required fields.
 */
function validateFormData(data) {
    if (!data.PartyCode) {
        alert('Party Code is required.');
        return false;
    }
    if (!data.JobDate) {
        alert('Job Date is required.');
        return false;
    }
    return true;
}

/**
 * Main Save/Update handler
 */
async function saveFormData() {
    let formData = getFormData();
    if (!validateFormData(formData)) return;

    try {
        let parentId, jobID;

        if (isUpdateMode()) {
            jobID = jobNoInput ? jobNoInput.value.trim() : '';
            if (!jobID) {
                alert('Job Number is missing for update.');
                return;
            }
            formData.update_by = UserLoginID;
            formData.update_at = localtimeStamp;

            const { data: idData, error: idError } = await supabaseClient
                .from('CustomsClearance_Details')
                .select('id')
                .eq('JobID', jobID)
                .single();

            if (idError || !idData) {
                alert('Could not find record id for updating charges.');
                return;
            }
            parentId = idData.id;

            const { data, error } = await supabaseClient
                .from("CustomsClearance_Details")
                .update(formData)
                .eq("JobID", jobID)
                .select()
                .single();

            if (error) throw error;

            parentId = data.id;
            jobID = data.JobID;

        } else {
            // Generate Job ID
            const jobIDResult = await generateJobID(CompanyID);

            if (
                !jobIDResult ||
                typeof jobIDResult !== "object" ||
                !jobIDResult.JobID
            ) {
                throw new Error("Failed to generate JobID.");
            }

            // Assign generated values
            formData.JobID = jobIDResult.JobID;
            formData.JobRunningNo = jobIDResult.JobRunningNo;

            // Update Job No textbox
            document.getElementById("jobNo").value = formData.JobID;

            // Audit fields
            formData.created_by = UserLoginID;
            formData.created_at = localtimeStamp;
            formData.company_id = CompanyID;

            // Insert record
            const { data, error } = await supabaseClient
                .from("CustomsClearance_Details")
                .insert([formData])
                .select()
                .single();

            if (error) throw error;

            parentId = data.id;
            jobID = data.JobID;
        }

        document.querySelectorAll('.btn-delete-row').forEach(button => {
            button.disabled = true;
        });
        addChargesRow.disabled = true;
        disableForm();

        alert('Data saved successfully!');

        // Reset save button to insert mode after successful save
        saveButton.setAttribute('data-mode', 'insert');
        saveButton.innerHTML = '<i class="bi bi-save"></i> Save';
        saveButton.disabled = true;
        if (modifyButton) modifyButton.disabled = false;

        // Save linked charges and equipment details
        await saveChargesTableToSupabase(parentId, jobID);
        await saveEquipmentDetails();

    } catch (error) {
        console.error('Error saving data:', error);
        alert(`Error saving data: ${error.message || error}`);
    }
}

// ========== Event Listeners ==========

saveButton.addEventListener('click', async function () {
    await saveFormData();
});

if (clearancePortInput) {
    clearancePortInput.addEventListener('input', updateSuggestionsAndCountry);

    clearancePortInput.addEventListener('change', () => {
        const val = clearancePortInput.value.trim().toLowerCase();
        const matchedPort = currentSuggestions.find(
            s => s.label.toLowerCase() === val
        );

        selectedPortData = matchedPort
            ? matchedPort.portDetails
            : null;

        console.log("Selected Port Data:", selectedPortData);
    });
}

if (modifyButton) {
    modifyButton.addEventListener('click', () => {
        modifyButton.disabled = true;
        saveButton.setAttribute('data-mode', 'update');
        enableForm();
        saveButton.innerHTML = '<i class="bi bi-save"></i> Update';
        saveButton.disabled = false;
        jobNoInput.disabled = true;
        document.querySelectorAll('.btn-delete-row').forEach(button => {
            button.disabled = false;
        });
        addChargesRow.disabled = false;
    });
}

jobNoInput.addEventListener('input', async function () {
    const searchText = this.value.trim();

    if (searchText.length < 2) return;

    try {
        const { data, error } = await supabaseClient
            .from('CustomsClearance_Details')
            .select('JobID')
            .eq('company_id', CompanyID)
            .ilike('JobID', `%${searchText}%`)
            .order('JobRunningNo', { ascending: false })
            .limit(100);

        if (error) {
            console.error(error);
            return;
        }

        const datalist = document.getElementById('jobNoSuggestions');
        datalist.innerHTML = '';

        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.JobID;
            datalist.appendChild(option);
        });
    } catch (err) {
        console.error(err);
    }
});

async function loadBlAwbNumberSuggestions(companyID) {
    try {
        const { data, error } = await supabaseClient
            .from('CustomsClearance_Details')
            .select('BLAWBNo')
            .eq('company_id', companyID)
            .limit(100)
            .order('BLAWBNo', { ascending: true });

        if (error) {
            console.error('Error fetching BLAWB suggestions:', error);
            return;
        }

        const datalist = document.getElementById('blAwbNumberSuggestions');
        datalist.innerHTML = '';

        data.forEach(item => {
            if (item.BLAWBNo) {
                const option = document.createElement('option');
                option.value = item.BLAWBNo;
                datalist.appendChild(option);
            }
        });
    } catch (err) {
        console.error('Unexpected error fetching BLAWB suggestions:', err);
    }
}

async function loadBeNumberSuggestions(companyID) {
    try {
        const { data, error } = await supabaseClient
            .from('CustomsClearance_Details')
            .select('BENo')
            .eq('company_id', companyID)
            .limit(100)
            .order('BENo', { ascending: true });

        if (error) {
            console.error('Error fetching BENo suggestions:', error);
            return;
        }

        const datalist = document.getElementById('beNumberSuggestions');
        datalist.innerHTML = '';

        data.forEach(item => {
            if (item.BENo) {
                const option = document.createElement('option');
                option.value = item.BENo;
                datalist.appendChild(option);
            }
        });
    } catch (err) {
        console.error('Unexpected error fetching BENo suggestions:', err);
    }
}

// Cache your inputs
const blAwbNumberInput = document.getElementById('blAwbNumber');
const beNumberInput = document.getElementById('beNumber');

// Helper to populate form fields from data object
function populateForm(data) {
    if (!data) return;

    document.getElementById('tempFormID').value = data.id;
    document.getElementById('jobNo').value = data.JobID || '';
    document.getElementById('jobDate').value = data.JobDate || '';
    document.getElementById('partyCode').value = data.PartyCode || '';
    document.getElementById('partyName').value = data.PartyName || '';
    document.getElementById('movementType').value = data.MovementType || '';
    document.getElementById('transitType').value = data.TransitType || '';
    document.getElementById('modeType').value = data.ModeType || '';
    document.getElementById('blAwbNumber').value = data.BLAWBNo || '';
    document.getElementById('blAwbDate').value = data.BLAWBDate || '';
    document.getElementById('beNumber').value = data.BENo || '';
    document.getElementById('beDate').value = data.BEDate || '';
    document.getElementById('consigneeName').value = data.Consignee || '';
    document.getElementById('deliveryAddress').value = data.Address || '';
    document.getElementById('quantity').value = data.Quantity || '';
    document.getElementById('cargoWeight').value = data.CargoWeight || '';
    document.getElementById('clearanceMode').value = data.ClearanceMode || '';
    document.getElementById('commodity').value = data.Commodity || '';
    document.getElementById('originCountry').value = data.Origin || '';
    document.getElementById('destinationCountry').value = data.Destination || '';
    document.getElementById('clearancePort').value = data.ClearancePort || '';
    document.getElementById('customsBroker').value = data.CustomsBroker || '';
    document.getElementById('information').value = data.AnyInformation || '';
    document.getElementById('poNo').value = data.PONo || '';

    toggleContainerTab(data.ModeType);
    saveButton.setAttribute('data-mode', 'update');
    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="bi bi-save"></i> Update';

    if (data.InvoiceNo === null || data.InvoiceNo === undefined || data.InvoiceNo.trim() === "") {
        modifyButton.disabled = false;
    } else {
        modifyButton.disabled = true;
    }

    disableForm();
}

// Function to fetch record by a field and value
async function loadRecordByField(fieldName, value) {
    const trimmedValue = value?.trim();
    if (!trimmedValue) return null;

    try {
        const { data, error } = await supabaseClient
            .from('CustomsClearance_Details')
            .select('*')
            .eq(fieldName, trimmedValue)
            .eq('company_id', CompanyID)
            .single();

        if (error) {
            if (error.code !== 'PGRST116') {
                console.error('Error fetching form data:', error);
            }
            return null;
        }

        if (data) {
            populateForm(data);
        }

        return data || null;

    } catch (err) {
        console.error('Unexpected error loading form data:', err);
        return null;
    }
}

jobNoInput.addEventListener('change', async e => {
    let record = await loadRecordByField('JobID', e.target.value.trim());
    if (record?.JobID) {
        await loadChargesByJobID(record.JobID);
        await fetchEquipmentDetails(record.id);
    }
});

newButton.addEventListener('click', () => {
    jobNoInput.value = '';
    saveButton.setAttribute('data-mode', 'insert');
    saveButton.innerHTML = '<i class="bi bi-save"></i> Save';
    enableForm();
    clearForm();
    saveButton.disabled = false;
    if (modifyButton) modifyButton.disabled = true;
    const tbody = document.querySelector('#chargesTable tbody');
    tbody.innerHTML = '';
    resetTotalsRow();
});

document.getElementById("blAwbNumber")
    .addEventListener("blur", () => checkDuplicate("BL"));

document.getElementById("beNumber")
    .addEventListener("blur", () => checkDuplicate("BE"));

let selectedDuplicateRecord = null;

// =============================
// Check Duplicate
// =============================
async function checkDuplicate(type) {
    let value = "";

    if (type === "BL") {
        value = document.getElementById("blAwbNumber").value.trim();
    }

    if (type === "BE") {
        value = document.getElementById("beNumber").value.trim();
    }

    if (!value) return;

    let query = supabaseClient
        .from("CustomsClearanceView")
        .select("id, JobID, JobDate, PartyName, BLAWBNo, BENo")
        .eq("company_id", CompanyID);

    if (type === "BL") {
        query = query.eq("BLAWBNo", value);
    }

    if (type === "BE") {
        query = query.eq("BENo", value);
    }

    const { data, error } = await query;

    if (error) {
        console.error(error);
        return;
    }

    if (!data || data.length === 0) {
        return;
    }

    populateDuplicateModal(data);
}

// =============================
// Populate Duplicate Modal
// =============================
function populateDuplicateModal(records) {
    const tbody = document.getElementById("duplicateRecordBody");

    tbody.innerHTML = "";

    selectedDuplicateRecord = records[0];

    records.forEach((row, index) => {
        tbody.innerHTML += `
            <tr>
                <td>
                    <input
                        type="radio"
                        name="duplicateRecord"
                        value="${row.id}"
                        ${index === 0 ? "checked" : ""}
                    >
                </td>
                <td>${row.JobID}</td>
                <td>${row.PartyName}</td>
                <td>${row.BLAWBNo ?? ""}</td>
                <td>${row.BENo ?? ""}</td>
            </tr>
        `;
    });

    document
        .querySelectorAll("input[name='duplicateRecord']")
        .forEach(radio => {
            radio.addEventListener("change", function () {
                const selectedId = Number(this.value);
                selectedDuplicateRecord = records.find(
                    record => record.id === selectedId
                );
            });
        });

    new bootstrap.Modal(
        document.getElementById("duplicateRecordModal")
    ).show();
}

// =============================
// Open Selected Duplicate
// =============================
document.getElementById("openDuplicateRecord").addEventListener("click", async () => {
    if (!selectedDuplicateRecord) {
        return;
    }

    bootstrap.Modal
        .getInstance(document.getElementById("duplicateRecordModal"))
        .hide();

    await loadRecordByField("JobID", selectedDuplicateRecord.JobID);
    await loadChargesByJobID(selectedDuplicateRecord.JobID);
    await fetchEquipmentDetails(selectedDuplicateRecord.id);
});