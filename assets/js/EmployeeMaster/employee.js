/* ============================================================
 * employee.js — Employee Master controller
 * ------------------------------------------------------------
 * Pairs with : pages/employee/employee-master.html
 * Depends on : server.js  -> supabaseClient, CompanyID, UserLoginID,
 *                            localtimeStamp, reSetPass
 *              utils.js   -> loadDatalist / loadUserTypes /
 *                            getUserWorkingBranch (all optional)
 *              employee-master.html (inline)
 *                         -> window.EmployeeMasterUI
 *
 * NOTE: change FAMILY_TABLE below if your family-details table
 *       has a different name.
 * ============================================================ */
'use strict';

(() => {

    /* ==========================================================
     * 1 · Micro helpers
     * ======================================================== */
    const $ = (id) => document.getElementById(id);

    const getVal = (id) => ($(id)?.value ?? '').trim();
    const setVal = (id, v) => { const el = $(id); if (el) el.value = v ?? ''; };
    const setText = (id, t) => { const el = $(id); if (el) el.textContent = t ?? ''; };
    const setHidden = (id, v) => { const el = $(id); if (el) el.value = v ?? ''; };

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const fmtDate = (v) => {
        if (!v) return '—';
        const d = new Date(v);
        return Number.isNaN(d.getTime())
            ? esc(v)
            : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const todayISO = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    /** Replace a button's inner markup keeping the icon + responsive labels. */
    function setBtnLabel(btn, icon, longLabel, shortLabel) {
        if (!btn) return;
        btn.innerHTML =
            `<i class="bi ${icon}"></i>` +
            `<span class="d-lg-none ms-1">${esc(shortLabel)}</span>` +
            `<span class="d-none d-lg-inline ms-1">${esc(longLabel)}</span>`;
    }

    /* ==========================================================
     * 2 · UI bridge (EmployeeMasterUI with safe fallbacks)
     * ======================================================== */
    const ui = () => window.EmployeeMasterUI || {};

    function toast(type, message) {
        const api = ui();
        if (typeof api.toast === 'function') return api.toast(type, message);
        (type === 'error' ? console.error : console.log)('[Employee]', message);
    }
    const ok = (m) => toast('success', m);
    const fail = (m) => toast('error', m);

    const busy = (on) => {
        const api = ui();
        if (on) api.showLoading?.(); else api.hideLoading?.();
    };

    /* ==========================================================
     * 3 · Module state
     * ======================================================== */
    const FAMILY_TABLE = 'EmployeeFamilyDetails';

    let empID = null;   // EmployeeMaster.id (uuid) of loaded record
    let currentCode = null;   // EmployeeMaster.EmployeeCode of loaded record
    let familyMembers = [];    // in-memory family rows
    let familyDirty = false;
    let formEditable = false;

    /* ==========================================================
     * 4 · Form enable / disable
     * ======================================================== */
    const NEVER_EDITABLE = new Set(['employeeCode']);

    function toggleFields(enabled) {
        formEditable = enabled;

        const form = $('employeeForm');
        if (form) {
            form.querySelectorAll('input, select, textarea').forEach((el) => {
                if (el.type === 'hidden') return;
                if (NEVER_EDITABLE.has(el.id)) { el.disabled = true; return; }
                el.disabled = !enabled;
            });
        }

        const addBtn = $('addFamilyBtn');
        if (addBtn) addBtn.disabled = !enabled;

        syncExitFields();
        renderFamilyTable();          // remove-buttons follow editability
    }

    /** Status Date / Leaving Reason unlock only for Inactive | Left. */
    function syncExitFields() {
        const status = getVal('employeeStatus');
        const exiting = status === 'Inactive' || status === 'Left';
        const editable = formEditable && exiting;

        const sd = $('statusDate');
        const lr = $('leavingReason');

        if (sd) sd.disabled = !editable;
        if (lr) lr.disabled = !editable;

        if (formEditable && !exiting) {
            if (sd) sd.value = '';
            if (lr) lr.value = '';
        }
    }

    /* ==========================================================
     * 5 · Action-bar state helpers
     * ======================================================== */
    function setStateBadge(text, variant) {
        const b = $('formStateBadge');
        if (!b) return;
        b.textContent = text;
        b.className = `badge rounded-pill fw-normal ${variant}`;
    }

    function refreshChip() {
        const chip = $('employeeChip');
        if (!chip) return;

        const name = getVal('employeeName');
        if (!name) { chip.classList.add('d-none'); return; }

        chip.classList.remove('d-none');
        setText('employeeChipName', name);
        setText('employeeChipInitials',
            name.split(/\s+/).filter(Boolean).slice(0, 2)
                .map((p) => p[0].toUpperCase()).join('') || '–');
    }

    /** Read-only view of a loaded record. */
    function setViewMode() {
        const saveBtn = $('saveButton');
        if (saveBtn) {
            saveBtn.dataset.mode = 'update';
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Update';
        }

        toggleFields(false);

        if ($('modifyButton')) $('modifyButton').disabled = false;
        if ($('deleteButton')) $('deleteButton').disabled = false;
        if ($('reportButton')) $('reportButton').disabled = false;
        if ($('promoteToDriverBtn')) $('promoteToDriverBtn').disabled = false;

        if ($('setUserID')) $('setUserID').disabled = true;
        if ($('resetPassword')) $('resetPassword').disabled = true;

        setHidden('status', 'Modify');
        setStateBadge('Saved', 'text-bg-secondary');
        refreshChip();
    }

    /** Editable mode for an existing record. */
    function enableModifyMode() {
        const saveBtn = $('saveButton');
        if (saveBtn) {
            saveBtn.dataset.mode = 'update';
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Update';
        }

        toggleFields(true);

        if ($('modifyButton')) $('modifyButton').disabled = true;
        if ($('deleteButton')) $('deleteButton').disabled = false;
        if ($('reportButton')) $('reportButton').disabled = false;

        const code = getVal('employeeCode');
        const loginId = getVal('loginID');
        const setBtn = $('setUserID');
        const rstBtn = $('resetPassword');

        if (code && loginId && code === loginId) {
            // No real login assigned yet → allow creating one
            if (setBtn) { setBtn.disabled = false; setBtn.innerHTML = '<i class="bi bi-person-plus"></i><span class="d-none d-lg-inline ms-1">Create User ID</span>'; }
            if (rstBtn) rstBtn.disabled = true;
            if ($('loginID')) $('loginID').disabled = false;
        } else {
            // Login exists → only user-type can change
            if (setBtn) { setBtn.disabled = false; setBtn.innerHTML = '<i class="bi bi-person-gear"></i><span class="d-none d-lg-inline ms-1">Update User Type</span>'; }
            if (rstBtn) rstBtn.disabled = false;
            if ($('loginID')) $('loginID').disabled = true;
        }

        setHidden('status', 'Editing');
        setStateBadge('Editing', 'text-bg-warning');
    }

    /** Blank form / new record. */
    function resetEmployeeForm() {
        empID = null;
        currentCode = null;
        familyMembers = [];
        familyDirty = false;

        const form = $('employeeForm');
        if (form) {
            form.reset();
            form.classList.remove('was-validated');
        }

        setVal('employeeCode', '');
        setHidden('employeeId', '');
        setHidden('status', 'New');
        setHidden('tempFormID', '');

        const saveBtn = $('saveButton');
        if (saveBtn) {
            saveBtn.dataset.mode = 'insert';
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save';
        }

        if ($('modifyButton')) $('modifyButton').disabled = true;
        if ($('deleteButton')) $('deleteButton').disabled = true;
        if ($('reportButton')) $('reportButton').disabled = true;
        if ($('promoteToDriverBtn')) $('promoteToDriverBtn').disabled = true;
        if ($('setUserID')) $('setUserID').disabled = true;
        if ($('resetPassword')) $('resetPassword').disabled = true;

        ui().hideDriverLink?.();

        toggleFields(true);
        if ($('employeeCode')) $('employeeCode').disabled = true;

        setStateBadge('New', 'text-bg-light border');
        refreshChip();
        renderFamilyTable();
    }

    /* ==========================================================
     * 6 · Datalists / dropdowns
     * ======================================================== */
    async function loadEmployeeList() {
        try {
            const { data, error } = await supabaseClient
                .from('EmployeeMaster')
                .select('EmployeeCode, EmployeeName')
                .eq('company_id', CompanyID)
                .order('EmployeeName', { ascending: true });

            if (error) throw error;

            const datalist = $('employeeList');
            if (!datalist) return;

            datalist.innerHTML = '';
            const frag = document.createDocumentFragment();

            (data || []).forEach((emp) => {
                const option = document.createElement('option');
                option.value = emp.EmployeeName || '';
                option.dataset.code = emp.EmployeeCode || '';
                frag.appendChild(option);
            });

            datalist.appendChild(frag);
        } catch (err) {
            console.error('Error loading employee list:', err);
            fail('Failed to load employee list.');
        }
    }

    async function loadUserTypesSafe() {
        try {
            if (typeof window.loadUserTypes === 'function') await window.loadUserTypes();
        } catch (err) {
            console.warn('User types not loaded:', err);
        }
    }

    function loadBloodGroups() {
        try {
            if (typeof window.loadDatalist === 'function') {
                window.loadDatalist('bloodGroupList', 'BloodGroup');
            }
        } catch (err) {
            console.warn('Blood group datalist not loaded:', err);
        }
    }

    /* ==========================================================
     * 7 · Employee selection & loading
     * ======================================================== */
    async function onEmployeeSelect() {
        const input = $('employeeName');
        if (!input) return;

        const selectedName = input.value.trim();
        if (!selectedName) {
            // user cleared the field → back to a fresh form
            if (currentCode) resetEmployeeForm();
            return;
        }

        const option = [...($('employeeList')?.options || [])]
            .find((opt) => opt.value === selectedName);

        if (!option) {
            console.warn('[Employee] typed name not found in list:', selectedName);
            return;
        }

        const employeeCode = option.dataset.code;
        if (!employeeCode) return;

        setVal('employeeCode', employeeCode);
        await loadEmployeeDetails(employeeCode);
    }

    async function loadEmployeeDetails(employeeCode) {
        busy(true);
        try {
            const { data, error } = await supabaseClient
                .from('EmployeeMaster')
                .select('*')
                .eq('company_id', CompanyID)
                .eq('EmployeeCode', employeeCode)
                .single();

            if (error) throw error;

            empID = data.id ?? null;
            currentCode = data.EmployeeCode;

            populateEmployeeForm(data);
            await loadFamilyMembers(employeeCode);
            await refreshDriverLink(empID);          // ✅ numeric EmployeeMaster.id
            setViewMode();

            ui().onRecordLoaded?.({
                ...data,
                driver: window.__linkedDriver || null
            });
        } catch (err) {
            console.error('Failed to load employee details:', err);
            fail(err.message || 'Unable to load employee details.');
        } finally {
            busy(false);
        }
    }

    function populateEmployeeForm(emp) {
        setHidden('employeeId', empID ?? '');
        setHidden('companyId', CompanyID ?? '');

        setVal('employeeCode', emp.EmployeeCode);
        if ($('employeeCode')) $('employeeCode').disabled = true;

        setVal('employeeName', emp.EmployeeName);
        setVal('employeeType', emp.EmployeeType);
        setVal('dateOfJoining', emp.DateofJoining);
        setVal('gender', emp.Gender);
        setVal('maritalStatus', emp.MaritalStatus);
        setVal('dateOfBirth', emp.DateofBirth);
        setVal('bloodGroup', emp.BloodGroup);
        setVal('panNumber', emp.PanNumber);
        setVal('passportNumber', emp.PassportNumber);
        setVal('aadharNumber', emp.AadharNumber);
        setVal('uanNumber', emp.UANNumber);
        setVal('personalContactNo', emp.PersonalContactNo);
        setVal('personalEmail', emp.PersonalEmailID);
        setVal('permanentAddress', emp.PermanentAddress);
        setVal('currentAddress', emp.CurrentAddress);
        setVal('employeeStatus', emp.EmployeeStatus);
        setVal('statusDate', emp.StatusDate);
        setVal('leavingReason', emp.LeavingReason);

        // Employment tab
        setVal('department', emp.Department);
        setVal('designation', emp.Designation);
        setVal('ctc', emp.CTC ?? '');
        setVal('reportingTo', emp.ReportingTo);
        setVal('workLocation', emp.WorkLocation);
        setVal('shift', emp.Shift);

        // Credentials tab
        setVal('loginID', emp.LoginID);
        setVal('userType', emp.LoginType);

        refreshChip();
        syncExitFields();
    }

    /* ==========================================================
     * 8 · Linked driver banner (optional / defensive)
     * ======================================================== */
    async function refreshDriverLink(employeeId) {
        window.__linkedDriver = null;
        if (!employeeId) { ui().hideDriverLink?.(); return; }

        try {
            const { data, error } = await supabaseClient
                .from('DriverMaster')
                .select('id, driver_code, status')
                .eq('company_id', CompanyID)
                .eq('employee_id', employeeId)
                .eq('is_deleted', false)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                window.__linkedDriver = data;
                ui().showDriverLink?.(data);
            } else {
                ui().hideDriverLink?.();
            }
        } catch (err) {
            console.warn('[Employee] driver link lookup skipped:', err.message);
            ui().hideDriverLink?.();
        }
    }

    /* ==========================================================
     * 9 · Form data & validation
     * ======================================================== */
    function collectFormData() {
        return {
            company_id: CompanyID,
            EmployeeCode: getVal('employeeCode'),
            EmployeeName: getVal('employeeName'),
            EmployeeType: getVal('employeeType'),
            DateofJoining: getVal('dateOfJoining') || null,
            Gender: getVal('gender'),
            MaritalStatus: getVal('maritalStatus'),
            DateofBirth: getVal('dateOfBirth') || null,
            BloodGroup: getVal('bloodGroup'),
            PanNumber: getVal('panNumber').toUpperCase(),
            PassportNumber: getVal('passportNumber').toUpperCase(),
            AadharNumber: getVal('aadharNumber'),
            UANNumber: getVal('uanNumber'),
            PersonalContactNo: getVal('personalContactNo'),
            PersonalEmailID: getVal('personalEmail'),
            PermanentAddress: getVal('permanentAddress'),
            CurrentAddress: getVal('currentAddress'),
            EmployeeStatus: getVal('employeeStatus'),
            StatusDate: getVal('statusDate') || null,
            LeavingReason: getVal('leavingReason'),

            // Employment tab
            Department: getVal('department'),
            Designation: getVal('designation'),
            CTC: getVal('ctc') === '' ? null : Number(getVal('ctc')),
            ReportingTo: getVal('reportingTo'),
            WorkLocation: getVal('workLocation'),
            Shift: getVal('shift'),
        };
    }

    function validateEmployee(d) {
        if (!d.EmployeeName) return 'Employee Name is required.';
        if (!d.EmployeeType) return 'Employee Type is required.';
        if (!d.DateofJoining) return 'Date of Joining is required.';
        if (!d.DateofBirth) return 'Date of Birth is required.';

        if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(d.PanNumber)) {
            return 'Enter a valid PAN (e.g. ABCDE1234F).';
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.PersonalEmailID)) {
            return 'Enter a valid personal email address.';
        }
        if (d.AadharNumber && !/^\d{12}$/.test(d.AadharNumber)) {
            return 'Aadhaar must be exactly 12 digits.';
        }
        if (d.PersonalContactNo && !/^\d{10}$/.test(d.PersonalContactNo)) {
            return 'Contact number must be 10 digits.';
        }
        if (d.DateofBirth && d.DateofJoining && d.DateofBirth > d.DateofJoining) {
            return 'Date of Birth cannot be after Date of Joining.';
        }
        return null;
    }

    /* ==========================================================
     * 10 · Employee code generation
     * ======================================================== */
    async function generateEmployeeCode() {
        const { data, error } = await supabaseClient.rpc('generate_employee_code', {
            p_company_id: CompanyID,
        });
        if (error) throw error;

        setVal('employeeCode', data);
        if ($('employeeCode')) $('employeeCode').readOnly = true;

        return data;
    }

    /* ==========================================================
     * 11 · Save (insert / update)
     * ======================================================== */
    async function saveEmployee() {
        const btn = $('saveButton');
        const spinner = $('saveSpinnerBtn');
        const form = $('employeeForm');
        const mode = btn?.dataset.mode || 'insert';

        if (form && !form.checkValidity()) {
            form.classList.add('was-validated');
            fail('Please correct the highlighted fields.');
            return;
        }

        const payload = collectFormData();
        const problem = validateEmployee(payload);
        if (problem) { fail(problem); return; }

        btn.disabled = true;
        spinner?.classList.remove('d-none');

        let saved = false;
        let familyWarning = null;

        try {
            if (mode === 'insert') {
                const code = await generateEmployeeCode();
                if (!code) throw new Error('Unable to generate Employee Code.');

                payload.EmployeeCode = code;
                payload.LoginID = code;          // sentinel: no real login yet
                payload.LoginType = null;
                payload.created_by = UserLoginID;
                payload.created_at = localtimeStamp;

                const { data: inserted, error } = await supabaseClient
                    .from('EmployeeMaster')
                    .insert([payload])
                    .select('id');

                if (error) throw error;

                empID = inserted?.[0]?.id ?? null;
                currentCode = code;

            } else {
                if (!currentCode) throw new Error('No employee selected for update.');

                payload.EmployeeCode = currentCode;
                payload.updated_by = UserLoginID;
                payload.updated_at = localtimeStamp;

                const { error } = await supabaseClient
                    .from('EmployeeMaster')
                    .update(payload)
                    .eq('company_id', CompanyID)
                    .eq('EmployeeCode', currentCode);

                if (error) throw error;
            }

            // Family details are saved together with the employee
            try {
                await saveFamilyMembers(currentCode);
            } catch (famErr) {
                console.error('Family details save failed:', famErr);
                familyWarning = famErr.message || 'Family details could not be saved.';
            }

            saved = true;
            ok(mode === 'insert'
                ? 'Employee saved successfully.'
                : 'Employee updated successfully.');

            if (familyWarning) fail(familyWarning);

        } catch (err) {
            console.error('Save failed:', err);
            fail(err.code === '23505'
                ? 'Employee Code already exists.'
                : (err.message || 'Failed to save employee.'));
        } finally {
            spinner?.classList.add('d-none');
            if (!saved) btn.disabled = false;
        }

        if (saved) {
            await loadEmployeeList();
            await loadEmployeeDetails(currentCode);   // refresh + switch to view mode
        }
    }

    /* ==========================================================
     * 12 · Delete
     * ======================================================== */
    async function deleteEmployee() {
        if (!currentCode) return;

        const name = getVal('employeeName') || currentCode;
        const linked = $('linkedDriverId')?.value;

        const msg = linked
            ? `"${name}" is linked to a driver record.\n\nDelete the employee anyway?`
            : `Delete employee "${name}" (${currentCode})?\n\nThis cannot be undone.`;

        if (!window.confirm(msg)) return;

        busy(true);
        try {
            // Best-effort cleanup of child rows
            await supabaseClient
                .from(FAMILY_TABLE)
                .delete()
                .eq('company_id', CompanyID)
                .eq('employee_code', currentCode)  // ✅
                .then(() => { }, () => { });

            const { error } = await supabaseClient
                .from('EmployeeMaster')
                .delete()
                .eq('company_id', CompanyID)
                .eq('EmployeeCode', currentCode);

            if (error) throw error;

            ok('Employee deleted successfully.');
            resetEmployeeForm();
            await loadEmployeeList();

        } catch (err) {
            console.error('Delete failed:', err);
            fail(err.message || 'Failed to delete employee.');
        } finally {
            busy(false);
        }
    }

    /* ==========================================================
     * 13 · Print
     * ======================================================== */
    function printEmployee() {
        if (!currentCode) return;
        window.print();
    }

    /* ==========================================================
     * 14 · Family details
     * ======================================================== */
    function renderFamilyTable() {
        const tbody = $('familyTable');
        if (!tbody) return;

        setText('familyCountBadge', String(familyMembers.length));

        if (!familyMembers.length) {
            tbody.innerHTML =
                '<tr data-empty><td colspan="5" class="em-empty">' +
                '<i class="bi bi-people"></i>No family members added yet.</td></tr>';
            return;
        }

        tbody.innerHTML = familyMembers.map((m, i) => `
      <tr data-index="${i}">
        <td>${esc(m.Relation) || '—'}</td>
        <td>${esc(m.Name)}</td>
        <td>${fmtDate(m.DOB)}</td>
        <td>${esc(m.Contact) || '—'}</td>
        <td class="text-center">
          <button type="button"
                  class="btn btn-sm btn-outline-danger"
                  data-remove-family="${i}"
                  title="Remove"
                  ${formEditable ? '' : 'disabled'}>
            <i class="bi bi-x-lg"></i>
          </button>
        </td>
      </tr>`).join('');
    }

    function addFamilyMember() {
        const relation = getVal('relation');
        const name = getVal('familyName');
        const dob = getVal('familyDOB');
        const contact = getVal('familyContact');

        if (!name) { fail('Family member name is required.'); return; }

        if (contact && !/^\d{7,15}$/.test(contact)) {
            fail('Family contact must be 7–15 digits.');
            return;
        }

        familyMembers.push({ Relation: relation, Name: name, DOB: dob || null, Contact: contact });
        familyDirty = true;
        renderFamilyTable();

        setVal('relation', '');
        setVal('familyName', '');
        setVal('familyDOB', '');
        setVal('familyContact', '');
        $('relation')?.focus();
    }

    function removeFamilyMember(index) {
        if (!formEditable) return;
        if (index < 0 || index >= familyMembers.length) return;

        familyMembers.splice(index, 1);
        familyDirty = true;
        renderFamilyTable();
    }

    async function loadFamilyMembers(employeeCode) {
        familyMembers = [];
        familyDirty = false;

        try {
            const { data, error } = await supabaseClient
                .from(FAMILY_TABLE)                       // 'EmployeeFamilyDetails'
                .select('relation, name, dob, contact')   // ✅ lowercase
                .eq('company_id', CompanyID)
                .eq('employee_code', employeeCode)        // ✅ lowercase
                .eq('is_deleted', false);                 // ✅ hide soft-deleted

            if (error) throw error;

            familyMembers = (data || []).map((r) => ({
                Relation: r.relation,
                Name: r.name,
                DOB: r.dob,
                Contact: r.contact,
            }));
        } catch (err) {
            console.warn('[Employee] family details not loaded:', err.message);
        }

        renderFamilyTable();
    }

    async function saveFamilyMembers(employeeCode) {
        if (!familyDirty || !employeeCode) return;

        const { error: delError } = await supabaseClient
            .from(FAMILY_TABLE)
            .delete()
            .eq('company_id', CompanyID)
            .eq('employee_code', employeeCode);        // ✅ lowercase

        if (delError) throw delError;

        if (familyMembers.length) {
            const rows = familyMembers.map((m) => ({
                company_id: CompanyID,
                employee_id: empID,                    // ✅ numeric FK
                employee_code: employeeCode,             // ✅ lowercase
                relation: m.Relation,               // ✅ lowercase keys
                name: m.Name,
                dob: m.DOB || null,
                contact: m.Contact || null,
                created_by: UserLoginID,
                created_at: localtimeStamp,
            }));

            const { error } = await supabaseClient.from(FAMILY_TABLE).insert(rows);
            if (error) throw error;
        }

        familyDirty = false;
    }

    /* ==========================================================
     * 15 · User credentials
     * ======================================================== */
    async function resolveWorkingBranch(employeeId) {
        try {
            if (typeof window.getUserWorkingBranch === 'function') {
                return await window.getUserWorkingBranch(employeeId);
            }
        } catch (err) {
            console.warn('[Employee] working branch lookup failed:', err);
        }
        return null;
    }

    async function saveUpdateUserCredentials() {
        const setBtn = $('setUserID');

        try {
            const userID = getVal('loginID');
            const userType = getVal('userType');
            const employeeCode = getVal('employeeCode');
            const employeeName = getVal('employeeName');

            if (!employeeCode) { fail('Save the employee before creating a login.'); return; }
            if (!userID) { fail('Login ID cannot be empty.'); return; }
            if (!userType) { fail('Please select a User Type.'); return; }
            if (employeeCode === userID) {
                fail('Login ID cannot be the same as Employee Code.');
                return;
            }

            setBtn && (setBtn.disabled = true);

            const workingBranch = await resolveWorkingBranch(empID);
            if (!workingBranch) {
                fail('Unable to determine the working branch for this employee.');
                setBtn && (setBtn.disabled = false);
                return;
            }

            // Duplicate login check (excluding this employee)
            const { data: dupUser, error: dupError } = await supabaseClient
                .from('user_login')
                .select('emp_code')
                .eq('user_login_id', userID)
                .neq('emp_code', employeeCode)
                .maybeSingle();

            if (dupError) throw dupError;
            if (dupUser) { fail('Login ID already exists.'); setBtn && (setBtn.disabled = false); return; }

            // 1 — EmployeeMaster
            const { error: empError } = await supabaseClient
                .from('EmployeeMaster')
                .update({
                    LoginID: userID,
                    LoginType: userType,
                    updated_by: UserLoginID,
                    updated_at: localtimeStamp,
                })
                .eq('company_id', CompanyID)
                .eq('EmployeeCode', employeeCode);

            if (empError) throw empError;

            // 2 — user_login (upsert)
            const { data: existingLogin, error: existErr } = await supabaseClient
                .from('user_login')
                .select('emp_code')
                .eq('emp_code', employeeCode)
                .maybeSingle();

            if (existErr) throw existErr;

            const loginPayload = {
                emp_code: employeeCode,
                user_login_id: userID,
                user_name: employeeName,
                user_type: userType,
                company_id: CompanyID,
                working_branch: workingBranch,
                created_by: UserLoginID,
                created_at: localtimeStamp,
            };

            if (!existingLogin) {
                loginPayload.user_password = sha256(reSetPass);   // default, hashed
            }

            const { error: loginError } = await supabaseClient
                .from('user_login')
                .upsert(loginPayload, { onConflict: 'user_login_id' });

            if (loginError) throw loginError;

            ok('User credentials saved successfully.');
            setBtn && (setBtn.disabled = true);

            if ($('resetPassword')) $('resetPassword').disabled = false;
            if ($('loginID')) $('loginID').disabled = true;

        } catch (err) {
            console.error('Failed to save/update user credentials:', err);
            fail(err.message || 'Error saving user credentials.');
            setBtn && (setBtn.disabled = false);
        }
    }

    async function resetUserPassword() {
        const rstBtn = $('resetPassword');

        try {
            const userID = getVal('loginID');
            const employeeCode = getVal('employeeCode');

            if (!userID) { fail('Login ID cannot be empty.'); return; }
            if (employeeCode === userID) {
                fail('Login ID cannot be the same as Employee Code.');
                return;
            }
            if (!window.confirm('Reset this user\'s password to the default?')) return;

            rstBtn && (rstBtn.disabled = true);

            const { error } = await supabaseClient
                .from('user_login')
                .update({ user_password: sha256(reSetPass) })
                .eq('emp_code', employeeCode)
                .eq('user_login_id', userID);

            if (error) throw error;

            ok('Password reset to the default successfully.');

        } catch (err) {
            console.error('Failed to reset user password:', err);
            fail(err.message || 'Error resetting user password.');
        } finally {
            rstBtn && (rstBtn.disabled = false);
        }
    }

    /* ==========================================================
     * 16 · Search saved employees modal
     * ======================================================== */
    function openSearchModal() {
        const modalEl = $('searchEmployeeModal');
        if (!modalEl || !window.bootstrap) return;
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
        setTimeout(() => $('searchSavedEmployeeInput')?.focus(), 250);
    }

    async function searchSavedEmployees(term) {
        const tbody = $('searchEmployeeTableBody');
        if (!tbody) return;

        tbody.innerHTML =
            '<tr><td colspan="5" class="text-center text-muted py-3">' +
            '<span class="spinner-border spinner-border-sm me-2"></span>Searching…</td></tr>';

        try {
            let query = supabaseClient
                .from('EmployeeMaster')
                .select('EmployeeCode, EmployeeName, PersonalContactNo, PersonalEmailID, EmployeeStatus')
                .eq('company_id', CompanyID)
                .order('EmployeeName', { ascending: true })
                .limit(50);

            const clean = (term || '').replace(/[,()%]/g, '').trim();
            if (clean) {
                const like = `%${clean}%`;
                query = query.or(
                    [
                        `EmployeeName.ilike.${like}`,
                        `EmployeeCode.ilike.${like}`,
                        `PersonalContactNo.ilike.${like}`,
                        `PersonalEmailID.ilike.${like}`,
                    ].join(',')
                );
            }

            const { data, error } = await query;
            if (error) throw error;

            if (!data || !data.length) {
                tbody.innerHTML =
                    '<tr><td colspan="5" class="text-center text-muted fst-italic py-3">' +
                    'No matching employees found.</td></tr>';
                return;
            }

            tbody.innerHTML = data.map((e) => `
        <tr data-code="${esc(e.EmployeeCode)}" style="cursor:pointer">
          <td class="fw-semibold">${esc(e.EmployeeCode)}</td>
          <td>${esc(e.EmployeeName)}</td>
          <td>${esc(e.PersonalContactNo) || '—'}</td>
          <td class="text-truncate" style="max-width:180px">${esc(e.PersonalEmailID) || '—'}</td>
          <td>${esc(e.EmployeeStatus) || '—'}</td>
        </tr>`).join('');

        } catch (err) {
            console.error('Employee search failed:', err);
            tbody.innerHTML =
                '<tr><td colspan="5" class="text-center text-danger py-3">' +
                'Search failed. Please try again.</td></tr>';
        }
    }

    /* ==========================================================
     * 17 · Event wiring
     * ======================================================== */
    function bindEvents() {
        // --- Employee picker ---
        $('employeeName')?.addEventListener('change', onEmployeeSelect);

        // clickable magnifier icon inside the input group
        const nameIcon = $('employeeName')?.closest('.input-group')?.querySelector('.input-group-text');
        if (nameIcon) {
            nameIcon.style.cursor = 'pointer';
            nameIcon.title = 'Search saved employees (Ctrl + K)';
            nameIcon.addEventListener('click', openSearchModal);
        }

        // --- Action bar ---
        $('newButton')?.addEventListener('click', resetEmployeeForm);
        $('saveButton')?.addEventListener('click', saveEmployee);
        $('modifyButton')?.addEventListener('click', enableModifyMode);
        $('deleteButton')?.addEventListener('click', deleteEmployee);
        $('reportButton')?.addEventListener('click', printEmployee);

        // --- Credentials ---
        $('setUserID')?.addEventListener('click', saveUpdateUserCredentials);
        $('resetPassword')?.addEventListener('click', resetUserPassword);

        // --- Status → exit fields ---
        $('employeeStatus')?.addEventListener('change', syncExitFields);

        // --- Family details ---
        $('addFamilyBtn')?.addEventListener('click', addFamilyMember);

        $('familyContact')?.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 15);
        });

        $('familyTable')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-family]');
            if (!btn) return;
            removeFamilyMember(Number(btn.dataset.removeFamily));
        });

        // Enter key inside the family quick-add row
        ['relation', 'familyName', 'familyDOB', 'familyContact'].forEach((id) => {
            $(id)?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addFamilyMember(); }
            });
        });

        // --- Numeric-only guards ---
        $('aadharNumber')?.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12);
        });
        $('personalContactNo')?.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
        });

        // --- Search modal ---
        $('btnTriggerEmployeeSearch')?.addEventListener('click', () => {
            searchSavedEmployees($('searchSavedEmployeeInput')?.value || '');
        });

        $('searchSavedEmployeeInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchSavedEmployees(e.target.value || '');
            }
        });

        $('searchEmployeeTableBody')?.addEventListener('click', async (e) => {
            const row = e.target.closest('tr[data-code]');
            if (!row) return;

            const code = row.dataset.code;
            if (!code) return;

            bootstrap.Modal.getOrCreateInstance($('searchEmployeeModal'))?.hide();

            setVal('employeeCode', code);
            await loadEmployeeDetails(code);
        });

        // --- Keyboard shortcuts ---
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                openSearchModal();
            }
        });
    }

    /* ==========================================================
     * 18 · Bootstrap
     * ======================================================== */
    const hasGlobals = () => {
        try {
            return typeof supabaseClient !== 'undefined' && typeof CompanyID !== 'undefined';
        } catch { return false; }
    };

    async function waitForGlobals(timeout = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (hasGlobals()) return true;
            await sleep(100);
        }
        return false;
    }

    async function init() {
        // Date bounds
        const today = todayISO();
        const doj = $('dateOfJoining'); if (doj) doj.max = today;
        const dob = $('dateOfBirth'); if (dob) dob.max = today;

        setHidden('companyId', (typeof CompanyID !== 'undefined' ? CompanyID : ''));

        renderFamilyTable();
        toggleFields(true);
        if ($('employeeCode')) $('employeeCode').disabled = true;

        const ready = await waitForGlobals();
        if (!ready) {
            console.warn('[Employee] Supabase globals unavailable — running in offline UI mode.');
            return;
        }

        await Promise.allSettled([
            loadEmployeeList(),
            loadUserTypesSafe(),
        ]);

        loadBloodGroups();
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindEvents();
        init();
    });

    /* ==========================================================
     * 19 · Debug / external access
     * ======================================================== */
    window.EmployeeMaster = {
        get id() { return empID; },
        get code() { return currentCode; },
        load: loadEmployeeDetails,
        reset: resetEmployeeForm,
        reload: loadEmployeeList,
        search: openSearchModal,
    };

})();