document.addEventListener('DOMContentLoaded', initializeForm);

// Cache common DOM elements
const jobNoInput = document.getElementById('jobNo'); // Assuming this exists

// ========== Core Functions ==========

async function initializeForm() {
    try {
        await Promise.all([
            // await loadJobNoSuggestions(),
            await loadSuggestions('partySuggestions', 'PartyDetails', CompanyID),
            await loadSuggestions('customsBrokerSuggestions', 'PartyDetails', CompanyID),
            await loadBlAwbNumberSuggestions(CompanyID),
            await loadBeNumberSuggestions(CompanyID),
        ]);
        const urlParams = new URLSearchParams(window.location.search);
        const incomingRequestNo = urlParams.get('pickupRequestNo');
        const headerBadge = document.getElementById("headerPickupRequestBadge");
        const headerText = document.getElementById("headerPickupRequestNoText");

        if (incomingRequestNo) {
            headerText.textContent = incomingRequestNo;
            headerBadge.classList.remove("d-none");
        }

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
        AnyInformation: document.getElementById('information').value.trim(),
        pickup_request_no: document.getElementById('headerPickupRequestNoText').textContent.trim()
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
    const requestNoText = document.getElementById("headerPickupRequestNoText").textContent.trim();
    if (!validateFormData(formData)) return;

    try {
        let response, headerData, headerRow, parentId, jobID;

        if (isUpdateMode()) {
            jobID = jobNoInput ? jobNoInput.value.trim() : '';
            if (!jobID) {
                alert('Job Number is missing for update.');
                return;
            }
            formData.update_by = UserLoginID;
            formData.update_at = localtimeStamp;

            // Get the parent id for linking to charges (needed if you want to update charges too)
            // Optionally select the record to get "id" if needed for charges linkage
            const { data: idData, error: idError } = await supabaseClient
                .from('CustomsClearance_Details')
                .select('id')
                .eq('JobID', jobID)
                .single();

            if (idError || !idData) {
                alert('Could not find record id for updating charges.');
                return;
            }
            parentId = idData.id; // id for charges table

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

            // Validate generated Job ID
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

            headerRow = data;
            parentId = data.id;
            jobID = data.JobID;

            if (error) {
                throw error;
            }

            headerRow = data;
            parentId = data.id;
            jobID = data.JobID;
        }


        document.querySelectorAll('.btn-delete-row').forEach(button => {
            button.disabled = true;
        });
        addChargesRow.disabled = true; // Enable add row button
        disableForm();

        alert('Data saved successfully!');


        // Reset save button to insert mode after successful save
        saveButton.setAttribute('data-mode', 'insert');
        saveButton.innerHTML = '<i class="bi bi-save"></i> Save';
        saveButton.disabled = true;
        if (modifyButton) modifyButton.disabled = false;

        // Save charges (for both insert/update, if needed)
        await saveChargesTableToSupabase(parentId, jobID);
        await saveEquipmentDetails(); // Save equipment details linked to this job
        await updatePickupRequestStatus(requestNoText);

    } catch (error) {
        console.error('Error saving data:', error);
        alert(`Error saving data: ${error.message || error}`);
    }
}

// ========== Event Listeners ==========

saveButton.addEventListener('click', async function () {
    await saveFormData();                // Your main form save

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
        addChargesRow.disabled = false; // Enable add row button

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



    // Also update the data-mode and enable form for updating, if applicable
    toggleContainerTab(data.ModeType);
    saveButton.setAttribute('data-mode', 'update');
    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="bi bi-save"></i> Update';

    if (data.InvoiceNo === null || data.InvoiceNo === undefined || data.InvoiceNo.trim() === "") {
        modifyButton.disabled = false;
    } else {
        modifyButton.disabled = true;
    }

    disableForm(); // Disable form inputs for viewing
    // optionally enable form editing here
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
            .single(); // since limit(1) + maybeSingle not needed

        if (error) {
            // If no record found, don't treat as critical error
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

// Event listeners - trigger on `change` or `input` as you prefer
jobNoInput.addEventListener('change', async e => {
    let record = await loadRecordByField('JobID', e.target.value.trim());
    if (record?.JobID) {
        await loadChargesByJobID(record.JobID);
        await fetchEquipmentDetails(record.id);
    }
});



newButton.addEventListener('click', () => {
    jobNoInput.value = ''; // Clear job number input
    saveButton.setAttribute('data-mode', 'insert');
    saveButton.innerHTML = '<i class="bi bi-save"></i> Save';
    enableForm();
    clearForm();
    saveButton.disabled = false;
    if (modifyButton) modifyButton.disabled = true;
    const tbody = document.querySelector('#chargesTable tbody');
    tbody.innerHTML = ''; // Clear current rows
    // Hide the Request Number container / badge if it was visible
    const requestNoEl = document.getElementById("headerPickupRequestNoText");
    const headerBadge = document.getElementById("headerPickupRequestBadge");

    if (headerBadge) {
        headerBadge.classList.add("d-none");
    }

    if (requestNoEl) {
        requestNoEl.textContent = ""; // Correct way to clear text content of a span
    }
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

                // console.log("Selected Record:", selectedDuplicateRecord);

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

    // console.log("Selected Record:", selectedDuplicateRecord);

    await loadRecordByField("JobID", selectedDuplicateRecord.JobID);

    await loadChargesByJobID(selectedDuplicateRecord.JobID);

    await fetchEquipmentDetails(selectedDuplicateRecord.id);

});