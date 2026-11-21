(() => {
    'use strict';

    // Tab configuration mapped to exact Supabase table names and columns
    const TAB_CONFIG = {
        party: {
            table: 'PartyDetails',
            title: 'Party Master Report',
            tbodyId: 'partyTableBody',
            tableId: 'partyTable',
            orderBy: 'PartyName',
            columns: [
                { key: 'SlNo', label: 'Sl No' },
                { key: 'PartyCode', label: 'Party Code' },
                { key: 'PartyName', label: 'Party Name' },
                { key: 'PartyType', label: 'Party Type' },
                { key: 'ContactPerson', label: 'Contact Person' },
                { key: 'ContactNumber', label: 'Contact Number' },
                { key: 'EmailID', label: 'Email ID' },
                { key: 'Address', label: 'Address' },
                { key: 'City', label: 'City' },
                { key: 'PinCode', label: 'Pin Code' },
                { key: 'State', label: 'State' },
                { key: 'Country', label: 'Country' },
                { key: 'PanNumber', label: 'Pan Number' },
                { key: 'GSTNumber', label: 'GST Number' },
                { key: 'CurrentStatus', label: 'Status' },
                { key: 'DeactiveDate', label: 'Deactive Date', isDate: true },
                { key: 'RCM', label: 'RCM' }
            ]
        },
        courier: {
            table: 'CourierRegistration',
            title: 'Courier Master Report',
            tbodyId: 'courierTableBody',
            tableId: 'courierTable',
            orderBy: 'CourierName',
            columns: [
                { key: 'SlNo', label: 'Sl No' },
                { key: 'CourierCode', label: 'Courier Code' },
                { key: 'CourierName', label: 'Courier Name' },
                { key: 'ContactPerson', label: 'Contact Person' },
                { key: 'ContactNumber', label: 'Contact Number' },
                { key: 'EmailID', label: 'Email ID' },
                { key: 'Status', label: 'Status' },
                { key: 'De_ActiveDate', label: 'Deactive Date', isDate: true }
            ]
        },
        employee: {
            table: 'EmployeeMaster',
            title: 'Employee Master Report',
            tbodyId: 'employeeTableBody',
            tableId: 'employeeTable',
            orderBy: 'EmployeeName',
            columns: [
                { key: 'SlNo', label: 'Sl No' },
                { key: 'EmployeeCode', label: 'Employee Code' },
                { key: 'EmployeeName', label: 'Employee Name' },
                { key: 'EmployeeType', label: 'Employee Type' },
                { key: 'Designation', label: 'Designation' }, // Not in current schema
                { key: 'DateofJoining', label: 'Date of Joining', isDate: true },
                { key: 'Gender', label: 'Gender' },
                { key: 'MaritalStatus', label: 'Marital Status' },
                { key: 'DateofBirth', label: 'Date of Birth', isDate: true },
                { key: 'BloodGroup', label: 'Blood Group' },
                { key: 'PanNumber', label: 'PAN Number' }, // Mapped from SQL PanNumber
                { key: 'PassportNumber', label: 'Passport Number' },
                { key: 'AadharNumber', label: 'Aadhar Number' },
                { key: 'UANNumber', label: 'UAN Number' },
                { key: 'ESICNumber', label: 'ESIC Number' },
                { key: 'PersonalContactNo', label: 'Personal Contact No' },
                { key: 'PersonalEmailID', label: 'Personal Email ID' },
                { key: 'PermanentAddress', label: 'Permanent Address' },
                { key: 'CurrentAddress', label: 'Current Address' },
                { key: 'EmployeeStatus', label: 'Status' }
            ]
        },
        vehicle: {
            table: 'VehiclesMaster',
            title: 'Vehicle Master Report',
            tbodyId: 'vehicleTableBody',
            tableId: 'vehicleTable',
            orderBy: 'registration_number',
            columns: [
                { key: 'SlNo', label: 'Sl No' },
                { key: 'vehicle_id', label: 'Vehicle ID' },
                { key: 'registration_number', label: 'Registration Number' },
                { key: 'vehicle_type', label: 'Vehicle Type' },
                { key: 'model', label: 'Vehicle Model' }, // Mapped from SQL model
                { key: 'make_year', label: 'Vehicle Year' }, // Mapped from SQL make_year
                { key: 'vin', label: 'Vehicle VIN' },
                { key: 'fuel_type', label: 'Fuel Type' },
                { key: 'chassis_number', label: 'Chassis Number' },
                { key: 'engine_number', label: 'Engine Number' },
                { key: 'vehicle_insurance_no', label: 'Vehicle Insurance Number' }, // Not in current schema
                { key: 'vehicle_fitness_no', label: 'Vehicle Fitness Number' },     // Not in current schema
                { key: 'vehicle_puc_no', label: 'Vehicle PUC Number' },             // Not in current schema
                { key: 'owner_name', label: 'Owner Name' },
                { key: 'vehicle_sub_type', label: 'Vehicle Sub Type' },
                { key: 'status', label: 'Status' }
            ]
        },
        driver: {
            table: 'DriverMaster',
            title: 'Driver Master Report',
            tbodyId: 'driverTableBody',
            tableId: 'driverTable',
            orderBy: 'driver_name',
            filterNotDeleted: true,
            columns: [
                { key: 'SlNo', label: 'Sl No' },
                { key: 'employee_id', label: 'Employee ID' },
                { key: 'driver_code', label: 'Driver Code' },
                { key: 'driver_name', label: 'Driver Name' },
                { key: 'driver_type', label: 'Driver Type' },
                { key: 'phone_number', label: 'Driver Phone' },
                { key: 'alternate_phone', label: 'Alternate Phone' },
                { key: 'address', label: 'Driver Address' },
                { key: 'driver_email', label: 'Driver Email' }, // Not in current schema
                { key: 'license_number', label: 'Driver License Number' },
                { key: 'license_expiry_date', label: 'License Expiry Date', isDate: true },
                { key: 'badge_number', label: 'Badge Number' },
                { key: 'aadhar_number', label: 'Aadhar Number' },
                { key: 'pan_number', label: 'PAN Number' },
                { key: 'status', label: 'Status' }
            ]
        }
    };

    // State
    let activeTab = 'party';
    const dataCache = {};
    const sortState = {}; // { [tab]: { key, asc } }

    // Helpers
    const getSupabase = async () => (typeof supabaseClient !== 'undefined' ? await supabaseClient : null);
    const getCompanyId = () => (typeof CompanyID !== 'undefined' && CompanyID ? CompanyID : null);

    const escapeHtml = (val) => {
        if (val === null || val === undefined || val === '') return '-';
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };

    const formatDate = (val) => {
        if (!val) return '-';
        const d = new Date(val);
        if (Number.isNaN(d.getTime())) return String(val);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}-${mm}-${d.getFullYear()}`;
    };

    const toggleSpinner = (show) => {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.style.display = show ? 'block' : 'none';
    };

    // Fetch data for a tab (cached after first load)
    async function loadTabData(tabKey, forceRefresh = false) {
        const cfg = TAB_CONFIG[tabKey];
        if (!cfg) return;

        if (!forceRefresh && dataCache[tabKey]) {
            renderTable(tabKey, dataCache[tabKey]);
            return;
        }

        const sb = await getSupabase();
        if (!sb) {
            console.error('Supabase client not initialized.');
            return;
        }

        toggleSpinner(true);
        try {
            const companyId = getCompanyId();
            let query = sb.from(cfg.table).select('*');

            if (companyId) {
                query = query.eq('company_id', companyId);
            }
            if (cfg.filterNotDeleted) {
                query = query.eq('is_deleted', false);
            }
            if (cfg.orderBy) {
                query = query.order(cfg.orderBy, { ascending: true });
            }

            const { data, error } = await query;
            if (error) throw error;

            dataCache[tabKey] = data || [];
            renderTable(tabKey, dataCache[tabKey]);
        } catch (err) {
            console.error(`Error loading ${cfg.table}:`, err);
            renderEmpty(tabKey, `Failed to load data: ${err.message || 'Unknown error'}`);
        } finally {
            toggleSpinner(false);
        }
    }

    // Render rows into the active tab's tbody
    function renderTable(tabKey, rows) {
        const cfg = TAB_CONFIG[tabKey];
        const tbody = document.getElementById(cfg.tbodyId);
        if (!tbody) return;

        if (!rows || rows.length === 0) {
            renderEmpty(tabKey, 'No data found');
            return;
        }

        const html = rows.map((row, idx) => {
            const cells = cfg.columns.map((col) => {
                if (col.key === 'SlNo') {
                    return `<td>${idx + 1}</td>`;
                }
                const raw = row[col.key];
                const display = col.isDate ? formatDate(raw) : escapeHtml(raw);
                return `<td>${display}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        tbody.innerHTML = html;
    }

    function renderEmpty(tabKey, message) {
        const cfg = TAB_CONFIG[tabKey];
        const tbody = document.getElementById(cfg.tbodyId);
        if (!tbody) return;
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="${cfg.columns.length}">
                    <i class="bi bi-inbox fs-3 d-block mb-2 opacity-50" aria-hidden="true"></i>
                    ${escapeHtml(message)}
                </td>
            </tr>`;
    }

    // Column sorting
    function bindSorting() {
        document.querySelectorAll('.data-table thead th').forEach((th) => {
            th.addEventListener('click', () => {
                const table = th.closest('table');
                const tabKey = table?.dataset.tab;
                const colKey = th.dataset.key;
                if (!tabKey || !colKey || colKey === 'SlNo' || !dataCache[tabKey]?.length) return;

                // Resolve HTML key aliases to SQL keys
                const aliasMap = {
                    PANNumber: 'PanNumber',
                    vehicle_model: 'model',
                    vehicle_year: 'make_year'
                };
                const sortKey = aliasMap[colKey] || colKey;

                const prev = sortState[tabKey];
                const asc = prev && prev.key === sortKey ? !prev.asc : true;
                sortState[tabKey] = { key: sortKey, asc };

                const sorted = [...dataCache[tabKey]].sort((a, b) => {
                    const valA = (a[sortKey] ?? '').toString().toLowerCase();
                    const valB = (b[sortKey] ?? '').toString().toLowerCase();
                    return asc ? valA.localeCompare(valB, undefined, { numeric: true })
                        : valB.localeCompare(valA, undefined, { numeric: true });
                });

                dataCache[tabKey] = sorted;
                renderTable(tabKey, sorted);
            });
        });
    }

    // Export active tab to Excel
    function exportToExcel() {
        const cfg = TAB_CONFIG[activeTab];
        const rows = dataCache[activeTab] || [];
        if (!rows.length) {
            alert('No data available to export.');
            return;
        }

        const sheetData = rows.map((row, idx) => {
            const obj = {};
            cfg.columns.forEach((col) => {
                if (col.key === 'SlNo') {
                    obj[col.label] = idx + 1;
                } else {
                    const val = row[col.key];
                    obj[col.label] = col.isDate ? formatDate(val) : (val ?? '');
                }
            });
            return obj;
        });

        const ws = XLSX.utils.json_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, activeTab.toUpperCase());
        XLSX.writeFile(wb, `${cfg.title.replace(/\s+/g, '_')}.xlsx`);
    }

    // Export active tab to PDF
    function exportToPdf() {
        const cfg = TAB_CONFIG[activeTab];
        const rows = dataCache[activeTab] || [];
        if (!rows.length) {
            alert('No data available to export.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

        doc.setFontSize(13);
        doc.text(cfg.title, 40, 36);

        const head = [cfg.columns.map((c) => c.label)];
        const body = rows.map((row, idx) =>
            cfg.columns.map((col) => {
                if (col.key === 'SlNo') return idx + 1;
                const val = row[col.key];
                return col.isDate ? formatDate(val) : (val ?? '-');
            })
        );

        doc.autoTable({
            head,
            body,
            startY: 50,
            styles: { fontSize: 7, cellPadding: 3 },
            headStyles: { fillColor: [111, 141, 56] }
        });

        doc.save(`${cfg.title.replace(/\s+/g, '_')}.pdf`);
    }

    // Init
    document.addEventListener('DOMContentLoaded', () => {
        // Tab switch listener
        document.querySelectorAll('#reportTabs button[data-bs-toggle="tab"]').forEach((btn) => {
            btn.addEventListener('shown.bs.tab', (e) => {
                activeTab = e.target.dataset.tabType;
                loadTabData(activeTab);
            });
        });

        // Export buttons
        document.getElementById('exportExcelBtn')?.addEventListener('click', exportToExcel);
        document.getElementById('exportPdfBtn')?.addEventListener('click', exportToPdf);

        bindSorting();
        loadTabData(activeTab);
    });
})();