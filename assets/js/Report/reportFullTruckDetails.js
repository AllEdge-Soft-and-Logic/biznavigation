// State Management
const state = {
    currentPage: 1,
    pageSize: 100,
    companyId: localStorage.getItem('CompanyID'),
    sortColumn: null,
    sortOrder: 'asc'
};

document.addEventListener('DOMContentLoaded', async () => {
    injectStickyColumnCSS(); // Injects CSS to freeze Sr No and Docket No

    // Initialize date picker
    flatpickr("#dateRange", { mode: "range", dateFormat: "Y-m-d" });

    // Bind submit event to handle both 'Enter' key and button click
    document.getElementById('searchFilters').addEventListener('submit', async (e) => {
        e.preventDefault();
        state.currentPage = 1;

        // Auto-collapse filters after search
        const filterSection = document.getElementById("filterSection");
        if (filterSection.classList.contains('show')) {
            bootstrap.Collapse.getInstance(filterSection).hide();
        }

        await handleSearch();
    });

    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
    document.getElementById('exportPdfBtn').addEventListener('click', exportToPdf);

    // Initial Data Load in Parallel
    await Promise.all([
        loadReportSuggestions(),
        loadTable()
    ]);

    enableSortableHeaders();
});

// --- CSS Injection for Sticky Columns ---
function injectStickyColumnCSS() {
    const style = document.createElement('style');
    // Freezes the first two columns. Background colors are enforced to prevent transparency overlapping.
    style.innerHTML = `
        #bookingTable th:nth-child(1), #bookingTable td:nth-child(1) {
            position: sticky;
            left: 0;
            z-index: 3;
            background-color: var(--surface-color, #ffffff);
            border-right: 1px solid var(--border-color, #e2e8f0);
        }
        #bookingTable th:nth-child(2), #bookingTable td:nth-child(2) {
            position: sticky;
            left: 55px; /* Adjust this if Sr No column width changes */
            z-index: 3;
            background-color: var(--surface-color, #ffffff);
            border-right: 2px solid #cbd5e1; /* Slightly thicker border to show the freeze line */
            box-shadow: 2px 0 5px rgba(0,0,0,0.05);
        }
        #bookingTable thead th:nth-child(1), #bookingTable thead th:nth-child(2) {
            z-index: 4; /* Keeps frozen headers above frozen rows */
            background-color: #f1f5f9;
        }
        #bookingTable tbody tr:hover td:nth-child(1), #bookingTable tbody tr:hover td:nth-child(2) {
            background-color: #f8fafc; /* Match row hover color */
        }
    `;
    document.head.appendChild(style);
}

// --- Data Fetching & UI State ---

async function handleSearch() {
    setSearchButtonLoading(true);
    try {
        await loadTable(getFilters());
    } finally {
        setSearchButtonLoading(false);
    }
}

function setSearchButtonLoading(isLoading) {
    const btn = document.getElementById("searchBtn");
    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span> Processing...`;
    } else {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-search" aria-hidden="true"></i> Search`;
    }
}

function getFilters() {
    const dateRange = document.getElementById('dateRange').value;
    const [startDate, endDate] = dateRange ? dateRange.split(' to ') : [null, null];

    const getVal = (id) => document.getElementById(id).value.trim();

    return {
        docketNo: getVal('docketNo'),
        startDate: startDate?.trim() || null,
        endDate: endDate?.trim() || null,
        customerName: getVal('customerName'),
        movementType: getVal('movementType'),
        modeType: getVal('modeType'),
        originCity: getVal('originLocation'),
        destinationCity: getVal('destinationLocation'),
        routeDetails: getVal('routeDetails'),
        vendorName: getVal('vendorName'),
        bookedMonth: getVal('bookedMonth'),
        bookedYear: getVal('bookedYear'),
        financialYear: getVal('financialYear'),
        invoiceStatus: getVal('invoiceStatus'),
    };
}

function applyFilters(query, filters) {
    const textFilters = {
        docketNo: 'LRNumber', customerName: 'CustomerName', movementType: 'MovementType',
        modeType: 'ModeType', vendorName: 'VendorName', routeDetails: 'RouteDetails',
        originCity: 'OriginCity', destinationCity: 'DestinationCity', invoiceStatus: 'InvoiceStatus'
    };

    // Apply text filters
    Object.entries(textFilters).forEach(([key, column]) => {
        if (filters[key]) query = query.ilike(column, `%${filters[key]}%`);
    });

    // Date range
    if (filters.startDate) query = query.gte('PickupDate', filters.startDate);
    if (filters.endDate) query = query.lte('PickupDate', filters.endDate);

    // Specific Month Filter
    if (filters.bookedMonth) {
        let [year, month] = filters.bookedMonth.split('-').map(Number);
        if (!isNaN(year) && !isNaN(month)) {
            const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const end = new Date(year, month, 0).toISOString().split('T')[0];
            query = query.gte('PickupDate', start).lte('PickupDate', end);
        }
    }
    // Specific Year Filter
    else if (filters.bookedYear) {
        const year = parseInt(filters.bookedYear);
        if (!isNaN(year)) query = query.gte('PickupDate', `${year}-01-01`).lte('PickupDate', `${year}-12-31`);
    }

    // Financial Year Filter
    if (filters.financialYear) {
        const [startYear, endYear] = filters.financialYear.split('-').map(Number);
        if (!isNaN(startYear) && !isNaN(endYear)) {
            query = query.gte('PickupDate', `${startYear}-04-01`).lte('PickupDate', `${endYear}-03-31`);
        }
    }

    return query;
}

// --- Datalist Populations (Optimized Single Loop) ---

async function loadReportSuggestions() {
    const { data, error } = await supabaseClient
        .from('FullLoadMovementDetailsView')
        .select('LRNumber, CustomerName, MovementType, OriginCity, DestinationCity, ModeType, InvoiceStatus, PickupDate, VendorName')
        .eq('company_id', state.companyId)
        .order('LRNumber', { ascending: false })
        .limit(1000);

    if (error) return console.error('Error fetching suggestions:', error);

    // PERFORMANCE OPTIMIZATION: Loop through data only ONCE instead of 8 times
    const sets = {
        LRNumber: new Set(), CustomerName: new Set(), MovementType: new Set(),
        ModeType: new Set(), OriginCity: new Set(), DestinationCity: new Set(),
        VendorName: new Set(), InvoiceStatus: new Set(), FinancialYears: new Set()
    };

    data.forEach(item => {
        if (item.LRNumber) sets.LRNumber.add(item.LRNumber);
        if (item.CustomerName) sets.CustomerName.add(item.CustomerName);
        if (item.MovementType) sets.MovementType.add(item.MovementType);
        if (item.ModeType) sets.ModeType.add(item.ModeType);
        if (item.OriginCity) sets.OriginCity.add(item.OriginCity);
        if (item.DestinationCity) sets.DestinationCity.add(item.DestinationCity);
        if (item.VendorName) sets.VendorName.add(item.VendorName);
        if (item.InvoiceStatus) sets.InvoiceStatus.add(item.InvoiceStatus);
        if (item.PickupDate) {
            const year = new Date(item.PickupDate).getFullYear();
            sets.FinancialYears.add(`${year}-${year + 1}`);
        }
    });

    populateDatalist([...sets.LRNumber], 'docketNoList');
    populateDatalist([...sets.CustomerName], 'customerNameList');
    populateDatalist([...sets.MovementType], 'movementTypeList');
    populateDatalist([...sets.ModeType], 'modeTypeList');
    populateDatalist([...sets.OriginCity], 'originLocationList');
    populateDatalist([...sets.DestinationCity], 'destinationLocationList');
    populateDatalist([...sets.VendorName], 'vendorNameList');
    populateDatalist([...sets.InvoiceStatus], 'invoiceStatusList');
    populateDatalist([...sets.FinancialYears], 'financialYearList');
}

function populateDatalist(valuesArray, datalistId) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;

    const fragment = document.createDocumentFragment();
    valuesArray.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        fragment.appendChild(option);
    });
    datalist.replaceChildren(fragment);
}

// --- Table & Rendering ---

async function loadTable(filters = {}) {
    const spinner = document.getElementById('loadingSpinner');
    const tbody = document.getElementById('tableBody');

    spinner.style.display = 'block';
    tbody.style.opacity = '0.5';

    let query = supabaseClient
        .from('FullLoadMovementDetailsView')
        .select('*', { count: 'exact' })
        .eq('company_id', state.companyId);

    query = applyFilters(query, filters);

    if (state.sortColumn) {
        query = query.order(state.sortColumn, { ascending: state.sortOrder === 'asc' });
    } else {
        query = query.order('LRNumber', { ascending: false });
    }

    const { data, error, count } = await query.range(
        (state.currentPage - 1) * state.pageSize,
        state.currentPage * state.pageSize - 1
    );

    spinner.style.display = 'none';
    tbody.style.opacity = '1';

    if (error) return console.error('Error loading table:', error);

    renderTable(data);
    renderPagination(count);
    updateHeaderSortIndicators();
}

function renderTable(data) {
    const tbody = document.getElementById('tableBody');

    if (!data || data.length === 0) {
        tbody.innerHTML = `
        <tr id="emptyRow">
            <td colspan="37" class="text-center text-muted" style="position: static;">
                <i class="bi bi-inbox fs-3 d-block mb-2 opacity-50"></i> No records found
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = data.map((row, idx) => {
        const sale = row.GrandTotalSale || 0;
        const buy = row.GrandTotalBuy || 0;
        const marginAmt = (sale && buy) ? (sale - buy).toFixed(2) : '0';
        const marginPct = sale ? (((sale - buy) / sale) * 100).toFixed(2) + '%' : '0%';

        return `
        <tr>
            <td>${(state.currentPage - 1) * state.pageSize + idx + 1}</td>
            <td class="fw-bold">${row.LRNumber || ''}</td>
            <td>${formatDate(row.PickupDate || '')}</td>
            <td>${row.CustomerName || ''}</td>
            <td>${row.MovementType || ''}</td>
            <td>${row.ModeType || ''}</td>
            <td>${row.RouteDetails || ''}</td>
            <td>${row.OriginPincode || ''}</td>
            <td>${row.OriginCity || ''}</td>
            <td>${row.DestinationPincode || ''}</td>
            <td>${row.DestinationCity || ''}</td>
            <td>${formatDate(row.RequestedDate || '')}</td>
            <td>${row.ReferenceNo || ''}</td>
            <td>${row.VehicleType || ''}</td>
            <td>${row.VendorName || ''}</td>
            <td>${row.VehicleNumber || ''}</td>
            <td>${row.ContainerNumber || ''}</td>
            <td class="text-end">${row.Quantity || '0'}</td>
            <td class="text-end">${row.ChargeableWeight || '0'}</td>
            <td>${formatDate(row.CompletionDate || '')}</td>
            <td>${row.ShipmentStatus || ''}</td>
            <td>${row.DescriptionofGoods || ''}</td>
            <td>${row.WayBillNo || ''}</td>
            <td>${row.Information || ''}</td>
            <td class="text-end">${row.FreightAmountSale || '0'}</td>
            <td class="text-end">${row.OtherAmountSale || '0'}</td>
            <td class="text-end">${row.SGSTAmountSale || '0'}</td>
            <td class="text-end">${row.CGSTAmountSale || '0'}</td>
            <td class="text-end">${row.IGSTAmountSale || '0'}</td>
            <td class="text-end">${row.TotalGSTAmountSale || '0'}</td>
            <td class="text-end fw-semibold text-success">${sale}</td>
            <td>${row.InvoiceNumber || ''}</td>
            <td>${row.InvoiceStatus || ''}</td>
            <td class="text-end fw-semibold text-danger">${buy}</td>
            <td class="text-end fw-semibold text-primary">${marginAmt}</td>
            <td class="text-end fw-semibold text-primary">${marginPct}</td>
            <td>${row.BillStatus || ''}</td>
        </tr>
    `}).join('');
}

// --- Sorting & Pagination ---

function enableSortableHeaders() {
    document.querySelectorAll('#bookingTable thead th[data-key]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-key');
            if (state.sortColumn === key) {
                state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortColumn = key;
                state.sortOrder = 'asc';
            }
            state.currentPage = 1;
            loadTable(getFilters());
        });
    });
}

function updateHeaderSortIndicators() {
    document.querySelectorAll('#bookingTable thead th[data-key]').forEach(th => {
        const key = th.dataset.key;
        const title = th.dataset.title || th.textContent.replace(/[▲▼]/g, '').trim();
        th.dataset.title = title;

        if (key === state.sortColumn) {
            th.innerHTML = `${title} <i class="bi bi-arrow-${state.sortOrder === 'asc' ? 'up' : 'down'} ms-1"></i>`;
        } else {
            th.textContent = title;
        }
    });
}

function renderPagination(totalCount) {
    const totalPages = Math.ceil(totalCount / state.pageSize);
    const pagination = document.getElementById('paginationControls');
    pagination.innerHTML = '';

    if (totalPages <= 1) return;

    const fragment = document.createDocumentFragment();

    const createItem = (text, disabled, active, onClick) => {
        const li = document.createElement('li');
        li.className = `page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
        const element = disabled && text === '...' ? 'span' : 'a';
        li.innerHTML = `<${element} class="page-link" href="#">${text}</${element}>`;

        if (!disabled && onClick) {
            li.addEventListener('click', (e) => {
                e.preventDefault();
                onClick();
            });
        }
        fragment.appendChild(li);
    };

    createItem('Previous', state.currentPage === 1, false, () => {
        state.currentPage--;
        loadTable(getFilters());
    });

    let startPage = Math.max(1, state.currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    startPage = Math.max(1, endPage - 4);

    if (startPage > 1) {
        createItem(1, false, false, () => { state.currentPage = 1; loadTable(getFilters()); });
        if (startPage > 2) createItem('...', true);
    }

    for (let i = startPage; i <= endPage; i++) {
        createItem(i, false, i === state.currentPage, () => {
            state.currentPage = i;
            loadTable(getFilters());
        });
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) createItem('...', true);
        createItem(totalPages, false, false, () => { state.currentPage = totalPages; loadTable(getFilters()); });
    }

    createItem('Next', state.currentPage === totalPages, false, () => {
        state.currentPage++;
        loadTable(getFilters());
    });

    pagination.appendChild(fragment);
}

// --- Export Functionality ---

async function fetchAllFilteredData(filters = {}) {
    let allData = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
        let query = supabaseClient
            .from('FullLoadMovementDetailsView')
            .select('*')
            .eq('company_id', state.companyId);

        query = applyFilters(query, filters);
        query = state.sortColumn
            ? query.order(state.sortColumn, { ascending: state.sortOrder === 'asc' })
            : query.order('LRNumber', { ascending: false });

        const { data, error } = await query.range(from, from + batchSize - 1);

        if (error) {
            console.error('Error fetching data for export:', error);
            break;
        }

        if (data.length > 0) {
            allData = allData.concat(data);
            from += batchSize;
        } else {
            hasMore = false;
        }
    }
    return allData;
}

async function exportToExcel() {
    const filters = getFilters();
    const allData = await fetchAllFilteredData(filters);

    if (allData.length > 20000) {
        alert("Too much data. Please apply filters to reduce the result set.");
        return;
    }
    if (!allData || allData.length === 0) {
        alert("No data available to export.");
        return;
    }

    const excelData = allData.map((row, idx) => {
        const sale = row.GrandTotalSale || 0;
        const buy = row.GrandTotalBuy || 0;
        const marginAmt = (sale && buy) ? (sale - buy) : 0;
        const marginPct = sale ? parseFloat((((sale - buy) / sale) * 100).toFixed(2)) : 0;

        return {
            "Sr No": idx + 1,
            "Docket No": row.LRNumber || "",
            "Booking Date": row.PickupDate || "",
            "Customer Name": row.CustomerName || "",
            "Movement Type": row.MovementType || "",
            "Mode Type": row.ModeType || "",
            "Route Details": row.RouteDetails || "",
            "Origin Pincode": row.OriginPincode || "",
            "Origin City": row.OriginCity || "",
            "Destination Pincode": row.DestinationPincode || "",
            "Destination City": row.DestinationCity || "",
            "Requested Date": row.RequestedDate || "",
            "Reference No": row.ReferenceNo || "",
            "Vehicle Type": row.VehicleType || "",
            "Vendor Name": row.VendorName || "",
            "Vehicle Number": row.VehicleNumber || "",
            "Container Number": row.ContainerNumber || "",
            "Quantity": row.Quantity || 0,
            "Cargo Weight": row.ChargeableWeight || 0,
            "Completion Date": row.CompletionDate || "",
            "Status": row.ShipmentStatus || "",
            "Description of Goods": row.DescriptionofGoods || "",
            "Way Bill No": row.WayBillNo || "",
            "Information": row.Information || "",
            "Total Amount": row.FreightAmountSale || 0,
            "Other Charges": row.OtherAmountSale || 0,
            "SGST Amt": row.SGSTAmountSale || 0,
            "CGST Amt": row.CGSTAmountSale || 0,
            "IGST Amt": row.IGSTAmountSale || 0,
            "Total GST": row.TotalGSTAmountSale || 0,
            "Grand Total": sale,
            "Invoice Number": row.InvoiceNumber || "",
            "Invoice Status": row.InvoiceStatus || "",
            "Buy Total": buy,
            "Total Margin": marginAmt,
            "Margin %": marginPct,
            "Bill Status": row.BillStatus || ""
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Full Truck Report");
    XLSX.writeFile(workbook, "ReportFullTruckDetails.xlsx");
}

async function exportToPdf() {
    const filters = getFilters();
    const allData = await fetchAllFilteredData(filters);

    if (allData.length > 20000) return alert("Too much data. Please apply filters.");
    if (!allData.length) return alert("No data available to export.");

    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const headers = [
        'Sr No', 'Docket No', 'Date', 'Customer', 'Movement', 'Mode', 'Route',
        'Origin', 'Dest', 'Ref No', 'Vehicle', 'Vendor', 'Qty', 'Weight',
        'Status', 'Total Amt', 'Grand Total', 'Buy Total', 'Inv No', 'Status', 'Margin', 'Margin %'
    ];

    const formatNumber = (value) => typeof value === 'number' ? value.toFixed(2) : value || '0.00';

    const rows = allData.map((row, i) => {
        const sale = row.GrandTotalSale || 0;
        const buy = row.GrandTotalBuy || 0;
        const marginAmt = (sale && buy) ? (sale - buy) : 0;
        const marginPct = sale ? (((sale - buy) / sale) * 100).toFixed(2) : '0.00';

        return [
            i + 1,
            row.LRNumber || '',
            formatDate(row.PickupDate),
            row.CustomerName || '',
            row.MovementType || '',
            row.ModeType || '',
            row.RouteDetails || '',
            row.OriginCity || '',
            row.DestinationCity || '',
            row.ReferenceNo || '',
            row.VehicleType || '',
            row.VendorName || '',
            row.Quantity || 0,
            row.ChargeableWeight || 0,
            row.ShipmentStatus || '',
            formatNumber(row.FreightAmountSale),
            formatNumber(sale),
            formatNumber(buy),
            row.InvoiceNumber || '',
            row.InvoiceStatus || '',
            formatNumber(marginAmt),
            marginPct + '%'
        ];
    });

    doc.autoTable({
        head: [headers],
        body: rows,
        startY: 20,
        margin: { left: 5, right: 5 },
        styles: { fontSize: 5, overflow: 'linebreak', cellPadding: 1 },
        headStyles: { fillColor: [37, 99, 235] },
        didDrawPage: function (data) {
            doc.setFontSize(10);
            doc.text("Full Truck Movement Report", data.settings.margin.left, 10);
        },
        pageBreak: 'auto'
    });

    doc.save('ReportFullTruckDetails.pdf');
}