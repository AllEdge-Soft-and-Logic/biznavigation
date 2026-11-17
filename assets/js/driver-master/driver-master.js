/**
 * Driver Master - Controller
 * Handles UI interactions, validation, document management, and Supabase integration.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // DOM Elements
    // ==========================================
    const form = document.getElementById('driverMasterForm');
    const formStateBadge = document.getElementById('formStateBadge');

    // Action Buttons
    const btnNew = document.getElementById('newButton');
    const btnModify = document.getElementById('modifyButton');
    const btnDelete = document.getElementById('deleteButton');
    const btnReport = document.getElementById('reportButton');
    const btnSave = document.getElementById('saveButton');

    // Hidden Fields
    const inputDriverId = document.getElementById('driverId');
    const inputCompanyId = CompanyID; // Assuming this is set globally or fetched from a config
    const inputStatus = document.getElementById('status');

    // Document Tab Elements
    const btnAddDoc = document.getElementById('addDocumentButton');
    const docTableBody = document.getElementById('documentTableBody');
    const docCountBadge = document.getElementById('docCountBadge');

    // Search Modal Elements
    const searchModalEl = document.getElementById('searchDriverModal');
    const searchModal = new bootstrap.Modal(searchModalEl);
    const searchInput = document.getElementById('searchSavedDriverInput');
    const btnSearch = document.getElementById('btnTriggerDriverSearch');
    const searchTableBody = document.getElementById('searchDriverTableBody');

    // Toasts
    const successToastEl = document.getElementById('successToast');
    const errorToastEl = document.getElementById('errorToast');
    const successToast = new bootstrap.Toast(successToastEl);
    const errorToast = new bootstrap.Toast(errorToastEl);

    // Local State
    let currentDocuments = [];

    // ==========================================
    // Initialization
    // ==========================================
    init();

    function init() {
        // Enable modify button by default so users can search
        btnModify.disabled = false;

        // Event Listeners
        btnNew.addEventListener('click', resetForm);
        btnSave.addEventListener('click', saveDriver);
        btnModify.addEventListener('click', () => searchModal.show());
        btnDelete.addEventListener('click', deleteDriver);

        btnAddDoc.addEventListener('click', addDocumentToTable);
        btnSearch.addEventListener('click', searchDrivers);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchDrivers();
        });

        // Set default company ID if applicable (assuming multi-tenant setup)
        // inputCompanyId.value = localStorage.getItem('companyId') || '1';
    }

    // ==========================================
    // Form State Management
    // ==========================================
    function resetForm() {
        form.reset();
        form.classList.remove('was-validated');

        inputDriverId.value = '';
        btnSave.dataset.mode = 'insert';
        btnSave.innerHTML = '<i class="bi bi-check2-circle"></i> Save';

        formStateBadge.textContent = 'New';
        formStateBadge.className = 'badge rounded-pill text-bg-light border fw-normal';

        btnDelete.disabled = true;
        btnReport.disabled = true;

        // Reset Documents
        currentDocuments = [];
        renderDocumentTable();

        // Generate a temporary Driver Code for UI context
        document.getElementById('driverCode').value = 'DRV-' + Date.now().toString().slice(-6);
    }

    function setEditMode(driverData) {
        form.reset();
        form.classList.remove('was-validated');

        // Populate fields
        Object.keys(driverData).forEach(key => {
            const input = form.elements[key];
            if (input) {
                input.value = driverData[key];
            }
        });

        // Update Form State
        inputDriverId.value = driverData.id;
        btnSave.dataset.mode = 'update';
        btnSave.innerHTML = '<i class="bi bi-arrow-repeat"></i> Update';

        formStateBadge.textContent = 'Editing';
        formStateBadge.className = 'badge rounded-pill text-bg-warning border fw-normal';

        btnDelete.disabled = false;
        btnReport.disabled = false;

        searchModal.hide();

        // Load Documents from DB (Mocked fetch - implement your Supabase logic here)
        fetchDocuments(driverData.id);
    }

    // ==========================================
    // CRUD Operations (Supabase logic)
    // ==========================================
    async function saveDriver() {
        // Bootstrap Validation
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            showToast('error', 'Please fill all required fields correctly.');
            return;
        }

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const mode = btnSave.dataset.mode; // 'insert' or 'update'

        try {
            // Disable button during save
            btnSave.disabled = true;
            btnSave.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

            let result;

            // NOTE: Ensure supabaseClient is initialized in your server.js
            if (mode === 'insert') {
                delete data.driverId; // Let DB handle ID auto-generation
                const { data: insertedData, error } = await supabaseClient
                    .from('DriverMaster')
                    .insert([data])
                    .select()
                    .single();

                if (error) throw error;
                result = insertedData;
            } else {
                const { data: updatedData, error } = await supabaseClient
                    .from('DriverMaster')
                    .update(data)
                    .eq('id', inputDriverId.value)
                    .select()
                    .single();

                if (error) throw error;
                result = updatedData;
            }

            // Save documents logic would go here...
            await saveDocuments(result.id);

            showToast('success', `Driver ${mode === 'insert' ? 'created' : 'updated'} successfully.`);
            setEditMode(result);

        } catch (error) {
            console.error('Save error:', error);
            showToast('error', error.message || 'Failed to save driver data.');
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = mode === 'insert'
                ? '<i class="bi bi-check2-circle"></i> Save'
                : '<i class="bi bi-arrow-repeat"></i> Update';
        }
    }

    async function deleteDriver() {
        if (!inputDriverId.value) return;

        if (!confirm('Are you sure you want to delete this driver? This action cannot be undone.')) {
            return;
        }

        try {
            btnDelete.disabled = true;
            const { error } = await supabaseClient
                .from('drivers')
                .delete()
                .eq('id', inputDriverId.value);

            if (error) throw error;

            showToast('success', 'Driver deleted successfully.');
            resetForm();
        } catch (error) {
            console.error('Delete error:', error);
            showToast('error', 'Failed to delete driver. They may be linked to existing trips.');
            btnDelete.disabled = false;
        }
    }

    async function searchDrivers() {
        const searchTerm = searchInput.value.trim();
        searchTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-3"><div class="spinner-border text-primary spinner-border-sm"></div> Loading...</td></tr>`;

        try {
            let query = supabaseClient.from('drivers').select('*');

            if (searchTerm) {
                // Search across multiple columns
                query = query.or(`driver_name.ilike.%${searchTerm}%,driver_code.ilike.%${searchTerm}%,phone_number.ilike.%${searchTerm}%,license_number.ilike.%${searchTerm}%`);
            }

            const { data, error } = await query.limit(50);

            if (error) throw error;

            if (data.length === 0) {
                searchTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No drivers found matching your criteria.</td></tr>`;
                return;
            }

            searchTableBody.innerHTML = '';
            data.forEach(driver => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.innerHTML = `
                    <td class="fw-bold">${driver.driver_code || 'N/A'}</td>
                    <td>${driver.driver_name}</td>
                    <td>${driver.phone_number}</td>
                    <td>${driver.license_number}</td>
                    <td><span class="badge ${driver.status === 'Active' ? 'bg-success' : 'bg-secondary'}">${driver.status}</span></td>
                `;
                tr.addEventListener('click', () => setEditMode(driver));
                searchTableBody.appendChild(tr);
            });

        } catch (error) {
            console.error('Search error:', error);
            searchTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">Error fetching records.</td></tr>`;
        }
    }

    // ==========================================
    // Document Handling
    // ==========================================
    function addDocumentToTable() {
        const docType = document.getElementById('documentTypeInput').value;
        const docNo = document.getElementById('documentNumber').value;
        const validUpTo = document.getElementById('validUpTo').value;
        const fileInput = document.getElementById('documentFile');

        if (!docType) {
            showToast('error', 'Document Type is required.');
            return;
        }

        const fileName = fileInput.files.length > 0 ? fileInput.files[0].name : 'No file attached';

        const newDoc = {
            id: Date.now(), // Temp ID
            type: docType,
            number: docNo,
            valid_up_to: validUpTo,
            file_name: fileName,
            file: fileInput.files[0] || null
        };

        currentDocuments.push(newDoc);
        renderDocumentTable();

        // Clear inputs
        document.getElementById('documentTypeInput').value = '';
        document.getElementById('documentNumber').value = '';
        document.getElementById('validUpTo').value = '';
        fileInput.value = '';
    }

    function removeDocument(docId) {
        currentDocuments = currentDocuments.filter(d => d.id !== docId);
        renderDocumentTable();
    }

    function renderDocumentTable() {
        docCountBadge.textContent = currentDocuments.length;

        if (currentDocuments.length === 0) {
            docTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="vm-empty">
                        <i class="bi bi-file-earmark-text"></i> No documents attached. Use the form above to add one.
                    </td>
                </tr>`;
            return;
        }

        docTableBody.innerHTML = '';
        currentDocuments.forEach(doc => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-medium">${doc.type}</td>
                <td>${doc.number || '-'}</td>
                <td>${doc.valid_up_to ? new Date(doc.valid_up_to).toLocaleDateString() : 'Lifetime'}</td>
                <td><i class="bi bi-paperclip text-muted"></i> ${doc.file_name}</td>
                <td class="text-center">
                    <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="window.removeDocumentUi(${doc.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            docTableBody.appendChild(tr);
        });
    }

    // Expose remove function to global scope for inline onclick handler
    window.removeDocumentUi = removeDocument;

    async function saveDocuments(driverId) {
        // Implementation for uploading files to Supabase Storage 
        // and inserting metadata into a `driver_documents` table goes here.
        // Requires formData / multipart handling depending on backend rules.
    }

    async function fetchDocuments(driverId) {
        // Implement Supabase select from `driver_documents` table
        // For now, reset to empty
        currentDocuments = [];
        renderDocumentTable();
    }

    // ==========================================
    // Utilities
    // ==========================================
    function showToast(type, message) {
        if (type === 'success') {
            document.getElementById('successToastMessage').textContent = message;
            successToast.show();
        } else {
            document.getElementById('errorToastMessage').textContent = message;
            errorToast.show();
        }
    }
});


const driverNameInput = document.getElementById('driverName'); // or ui.driverName if using the optimized cache

if (driverNameInput) {
    driverNameInput.addEventListener('input', function () {
        // 1. Save current cursor position
        const start = this.selectionStart;
        const end = this.selectionEnd;

        // 2. Capitalize the first letter of every word
        // Using /(^\w|\s\w)/g matches the first character of the string, and any character following a space.
        this.value = this.value.replace(/(^\w|\s\w)/g, match => match.toUpperCase());

        // 3. Restore cursor position so it doesn't jump to the end
        this.setSelectionRange(start, end);
    });
}