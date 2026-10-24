//vehicleMaster.js

/**
 * Vehicle Master Module - BizNavigation
 * Handles CRUD operations, searching, ID previewing, and UI bindings for VehiclesMaster table in Supabase.
 */

document.addEventListener("DOMContentLoaded", () => {

    // Form elements and state buttons
    const form = document.getElementById("vehicleMasterForm") || document.getElementById("customsClearanceForm");
    const saveButton = document.getElementById("saveButton");
    const newButton = document.getElementById("newButton");
    const modifyButton = document.getElementById("modifyButton");
    const deleteButton = document.getElementById("deleteButton");
    const reportButton = document.getElementById("reportButton");
    const formStateBadge = document.getElementById("formStateBadge");

    modifyButton.disabled = true;
    deleteButton.disabled = true;

    // Inputs
    const vehicleCodeInput = document.getElementById("vehicleCode"); // maps to vehicle_id
    const regNumberInput = document.getElementById("regNumber");     // maps to registration_number
    const chassisNumberInput = document.getElementById("chassisNumber"); // maps to chassis_number / vin
    const engineNumberInput = document.getElementById("engineNumber");   // maps to engine_number
    const makeInput = document.getElementById("make");                 // maps to make
    const modelInput = document.getElementById("model");               // maps to model
    const makeYearInput = document.getElementById("makeYear");         // maps to make_year
    const vehicleTypeSelect = document.getElementById("vehicleType");  // maps to vehicle_type
    const vehicleTypeListInput = document.getElementById("vehicleTypeList"); // maps to vehicle_sub_type
    const fuelTypeSelect = document.getElementById("fuelType");        // maps to fuel_type
    const loadCapacityInput = document.getElementById("loadCapacity");
    const currentMileage = document.getElementById("currentMileage");
    const operationalStatusSelect = document.getElementById("operationalStatus");
    const partyNameInput = document.getElementById("partyName");       // maps to owner_name
    const informationInput = document.getElementById("information");

    // Search Modal Elements
    const searchSavedVehicleInput = document.getElementById("searchSavedVehicleInput");
    const btnTriggerSearch = document.getElementById("btnTriggerSearch");
    const searchVehicleTableBody = document.getElementById("searchVehicleTableBody");
    const searchVehicleModalEl = document.getElementById("searchVehicleModal");
    let searchVehicleModal = null;

    if (searchVehicleModalEl) {
        searchVehicleModal = new bootstrap.Modal(searchVehicleModalEl);

        // NEW: Trigger search automatically when modal opens
        searchVehicleModalEl.addEventListener('show.bs.modal', () => {
            // Clear previous search text
            if (searchSavedVehicleInput) searchSavedVehicleInput.value = "";
            // Load the top 10 latest records
            performSearch("");
        });
    }

    // Helper: Toggle form inputs and action buttons
    function setFormInteraction(isEditable) {
        // Disable or enable all inputs and selects in the form
        const elements = form.querySelectorAll("input, select, textarea");
        elements.forEach(el => {
            // Don't modify the vehicleCode (keep it readonly) or the search modal inputs
            if (el.id !== "vehicleCode" && !el.closest('.modal')) {
                el.disabled = !isEditable;
            }
        });

        // Toggle action buttons
        saveButton.disabled = !isEditable;
        deleteButton.disabled = !isEditable;
    }

    // Helper: Show toast messages
    function showToast(message, isError = true) {
        const toastEl = document.getElementById("errorToast");
        const toastMsg = document.getElementById("errorToastMessage");
        if (toastEl && toastMsg) {
            toastMsg.textContent = message;
            toastEl.className = `toast align-items-center text-white ${isError ? 'bg-danger' : 'bg-success'} border-0 shadow`;
            const toast = new bootstrap.Toast(toastEl);
            toast.show();
        } else {
            alert(message);
        }
    }

    // ===========================
    // PREVIEW VEHICLE ID (RPC)
    // ===========================
    async function fetchPreviewVehicleId() {
        try {
            const { data, error } = await supabaseClient
                .rpc('generate_vehicle_id', { p_company_id: CompanyID });

            if (!error && data) {
                vehicleCodeInput.value = data;
            } else if (error) {
                console.warn('Could not fetch auto-id preview:', error);
            }
        } catch (err) {
            console.warn('Could not fetch auto-id preview:', err);
        }
    }

    // Reset Form to New Mode
    function resetFormToNew() {
        form.reset();
        vehicleCodeInput.value = "";

        saveButton.setAttribute("data-mode", "insert");
        saveButton.innerHTML = `<i class="bi bi-check2-circle"></i> Save`;

        formStateBadge.textContent = "New";
        formStateBadge.className = "badge rounded-pill text-bg-light border fw-normal";

        // Enable form for typing, disable Modify/Delete/Report
        setFormInteraction(true);
        modifyButton.disabled = true;
        deleteButton.disabled = true;
        reportButton.disabled = true;

        // Fetch preview ID for the new record
        fetchPreviewVehicleId();
    }

    if (newButton) {
        newButton.addEventListener("click", resetFormToNew);
    }

    // Enable form for editing when Modify is clicked
    if (modifyButton) {
        modifyButton.addEventListener("click", () => {
            setFormInteraction(true);

            modifyButton.disabled = true; // Disable modify button while actively editing

            saveButton.setAttribute("data-mode", "update");
            saveButton.innerHTML = `<i class="bi bi-arrow-clockwise"></i> Update`;

            formStateBadge.textContent = "Editing";
            formStateBadge.className = "badge rounded-pill text-bg-warning border fw-normal";
        });
    }

    // ===========================
    // 1. SEARCH SAVED VEHICLES
    // ===========================
    async function performSearch(query = "") {
        try {
            // Replace the plain text with a Bootstrap spinner
            searchVehicleTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-4">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <div class="text-muted mt-2 small fst-italic">Fetching vehicles...</div>
                    </td>
                </tr>
            `;

            let queryBuilder = supabaseClient
                .from("VehiclesMaster")
                .select("*")
                .eq("company_id", CompanyID)
                .order("created_at", { ascending: false })
                .limit(10);

            if (query.trim() !== "") {
                queryBuilder = queryBuilder.or(`registration_number.ilike.%${query}%,owner_name.ilike.%${query}%,make.ilike.%${query}%,model.ilike.%${query}%`);
            }

            const { data, error } = await queryBuilder;

            if (error) throw error;

            if (!data || data.length === 0) {
                searchVehicleTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted fst-italic py-3">No vehicles found.</td></tr>`;
                return;
            }

            searchVehicleTableBody.innerHTML = "";
            data.forEach(vehicle => {
                const tr = document.createElement("tr");
                tr.style.cursor = "pointer";
                tr.innerHTML = `
                    <td class="fw-bold text-primary">${vehicle.registration_number || "-"}</td>
                    <td>${vehicle.owner_name || "-"}</td>
                    <td>${vehicle.vehicle_type || "-"}</td>
                    <td>${vehicle.model || "-"}</td>
                    <td>${vehicle.make || "-"}</td>
                    <td>${vehicle.status || "-"}</td>
                `;
                tr.addEventListener("click", () => {
                    populateFormWithVehicle(vehicle);
                    if (searchVehicleModal) searchVehicleModal.hide();
                });
                searchVehicleTableBody.appendChild(tr);
            });
        } catch (err) {
            console.error("Search error:", err);
            searchVehicleTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">Error loading search results.</td></tr>`;
        }
    }

    if (btnTriggerSearch) {
        btnTriggerSearch.addEventListener("click", () => {
            performSearch(searchSavedVehicleInput.value);
        });
    }

    if (searchSavedVehicleInput) {
        searchSavedVehicleInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                performSearch(searchSavedVehicleInput.value);
            }
        });
    }

    // Populate form fields when a vehicle is selected from search
    function populateFormWithVehicle(vehicle) {
        vehicleCodeInput.value = vehicle.vehicle_id || "";
        regNumberInput.value = vehicle.registration_number || "";
        chassisNumberInput.value = vehicle.chassis_number || vehicle.vin || "";
        engineNumberInput.value = vehicle.engine_number || "";
        makeInput.value = vehicle.make || "";
        modelInput.value = vehicle.model || "";
        makeYearInput.value = vehicle.make_year || "";
        if (vehicleTypeSelect) vehicleTypeSelect.value = vehicle.vehicle_type || "Truck";
        if (vehicleTypeListInput) vehicleTypeListInput.value = vehicle.vehicle_sub_type || "";
        if (fuelTypeSelect) fuelTypeSelect.value = vehicle.fuel_type || "Diesel";
        partyNameInput.value = vehicle.owner_name || "";
        loadCapacityInput.value = vehicle.load_capacity || 0;
        currentMileage.value = vehicle.current_mileage || 0;
        operationalStatusSelect.value = vehicle.status || "";
        informationInput.value = vehicle.note || "";

        // UI updates for View-only Mode
        formStateBadge.textContent = "View";
        formStateBadge.className = "badge rounded-pill text-bg-info border fw-normal text-white";

        // Disable form inputs and save/delete buttons
        setFormInteraction(false);

        // Enable modify and report buttons
        modifyButton.disabled = false;
        reportButton.disabled = false;
    }

    // ===========================
    // 2. INSERT & UPDATE HANDLER
    // ===========================
    if (saveButton) {
        saveButton.addEventListener("click", async (e) => {
            e.preventDefault();

            // Basic Validation
            if (!regNumberInput.value || !makeInput.value || !modelInput.value) {
                showToast("Please fill in all required fields (Registration No, Make, Model).", true);
                regNumberInput.reportValidity();
                return;
            }

            const mode = saveButton.getAttribute("data-mode") || "insert";

            const payload = {
                company_id: CompanyID,
                registration_number: regNumberInput.value.trim().toUpperCase(),
                chassis_number: chassisNumberInput.value.trim().toUpperCase(),
                vin: chassisNumberInput.value.trim().toUpperCase(),
                engine_number: engineNumberInput.value.trim().toUpperCase(),
                make: makeInput.value.trim(),
                model: modelInput.value.trim().toUpperCase(),
                make_year: makeYearInput.value ? parseInt(makeYearInput.value, 10) : null,
                vehicle_type: vehicleTypeSelect ? vehicleTypeSelect.value : null,
                vehicle_sub_type: vehicleTypeListInput ? vehicleTypeListInput.value.trim() : null,
                fuel_type: fuelTypeSelect ? fuelTypeSelect.value : null,
                owner_name: partyNameInput.value.trim(),
                current_mileage: currentMileage.value.trim(),
                load_capacity: loadCapacityInput.value.trim(),
                status: operationalStatusSelect.value.trim(),
                note: informationInput.value.trim(),
            };

            try {
                saveButton.disabled = true;
                saveButton.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...`;

                if (mode === "insert") {
                    payload.created_by = UserLoginID;
                    payload.created_at = new Date().toISOString();

                    if (vehicleCodeInput.value) {
                        payload.vehicle_id = vehicleCodeInput.value.trim();
                    }

                    const { data, error } = await supabaseClient
                        .from("VehiclesMaster")
                        .insert([payload])
                        .select()
                        .single();

                    if (error) throw error;

                    showToast("Vehicle registered successfully!", false);
                    if (data) {
                        populateFormWithVehicle(data); // This switches to View mode and disables the form/buttons
                    }
                } else {
                    // Update Mode
                    const vehicleId = vehicleCodeInput.value;
                    if (!vehicleId) {
                        throw new Error("Vehicle Code is missing for update operation.");
                    }

                    payload.updated_by = UserLoginID;
                    payload.updated_at = new Date().toISOString();

                    const { data, error } = await supabaseClient
                        .from("VehiclesMaster")
                        .update(payload)
                        .eq("vehicle_id", vehicleId)
                        .eq("company_id", CompanyID)
                        .select()
                        .single();

                    if (error) throw error;

                    showToast("Vehicle updated successfully!", false);
                    if (data) {
                        populateFormWithVehicle(data); // This switches to View mode and disables the form/buttons
                    }
                }
            } catch (err) {
                console.error("Save operation error:", err);
                showToast(err.message || "An error occurred while saving the vehicle.", true);
            } finally {
                // UPDATE: Only re-enable the save button if an error occurred and we aren't in View mode.
                // populateFormWithVehicle sets the badge text to "View" on success.
                if (formStateBadge.textContent !== "View") {
                    saveButton.disabled = false;
                }

                const currentMode = saveButton.getAttribute("data-mode");
                saveButton.innerHTML = currentMode === "insert"
                    ? `<i class="bi bi-check2-circle"></i> Save`
                    : `<i class="bi bi-arrow-clockwise"></i> Update`;
            }
        });
    }

    // ===========================
    // 3. DELETE HANDLER
    // ===========================
    if (deleteButton) {
        deleteButton.addEventListener("click", async () => {
            const vehicleId = vehicleCodeInput.value;
            if (!vehicleId) return;

            showToast("Coming Soon.......")
            // if (!confirm(`Are you sure you want to delete vehicle ${regNumberInput.value}?`)) {
            //     return;
            // }

            // try {
            //     const { error } = await supabaseClient
            //         .from("VehiclesMaster")
            //         .delete()
            //         .eq("vehicle_id", vehicleId)
            //         .eq("company_id", CompanyID);

            //     if (error) throw error;

            //     showToast("Vehicle deleted successfully.", false);
            //     resetFormToNew();
            // } catch (err) {
            //     console.error("Delete error:", err);
            //     showToast(err.message || "Failed to delete vehicle.", true);
            // }
        });
    }
});