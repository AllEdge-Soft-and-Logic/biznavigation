// Global State Variables
let allRequests = [];
let filteredRequests = [];
let currentPage = 1;
const pageSize = 50;
const CompanyID = localStorage.getItem('CompanyID');
let sortColumn = null;
let sortOrder = 'asc';
let toggleAttached = false;

document.addEventListener("DOMContentLoaded", async () => {
    // Initialize date picker
    flatpickr("#dateRange", { mode: "range", dateFormat: "Y-m-d" });

    // Show loading spinner
    const spinner = document.getElementById("loadingSpinner");
    if (spinner) spinner.classList.remove("hidden");

    // Fetch initial data
    allRequests = await fetchRequests();
    filteredRequests = [...allRequests]; // Copy for filtering

    if (spinner) spinner.classList.add("hidden");

    // Attach row toggle functionality
    attachToggle();

    // Enable export buttons if data exists
    const excelBtn = document.getElementById('exportExcelBtn');
    const pdfBtn = document.getElementById('exportPdfBtn');

    if (allRequests.length > 0) {
        excelBtn.disabled = false;
        pdfBtn.disabled = false;
    }

    excelBtn.addEventListener('click', exportToExcel);
    pdfBtn.addEventListener('click', exportToPdf);
    document.getElementById("searchBtn").addEventListener("click", applyFilters);

    populateFilters(allRequests);
    renderTable(filteredRequests);
});

// Fetch Pickup Requests from Supabase (JavaScript Workaround for missing Foreign Keys)
async function fetchRequests() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const formatDate = (date) => date.toISOString().split('T')[0];
    const startDate = formatDate(firstDay);
    const endDate = formatDate(lastDay);

    // 1. Fetch main requests and ONLY the international bookings (since we know that FK works)
    const { data: requests, error } = await supabaseClient
        .from("pickup_requests")
        .select(`
            id, pickup_request_no, pickup_request_date, party_code, customer_name,
            scheduled_date, request_movement_type, assigned_to_person, origin_pin_code,
            origin_city, origin_address, notes, status, created_by, canceled_notes,
            international_booking (
                DocketNo, BookedDate, MovementType, TransitType, Origin, Destination
            )
        `)
        .eq("company_id", CompanyID)
        .gte("pickup_request_date", startDate)
        .lte("pickup_request_date", endDate)
        .order("pickup_request_date", { ascending: true });

    if (error) {
        console.error("FETCH ERROR:", error);
        return [];
    }

    if (!requests || requests.length === 0) return [];

    // Extract all request numbers to fetch their associated details
    const requestNos = requests.map(r => r.pickup_request_no).filter(Boolean);

    // 2. Fetch the other tables separately
    const [fullLoadRes, domesticRes, customsRes] = await Promise.all([
        supabaseClient.from("FullLoadBookingDetails").select("*").in("pickup_request_no", requestNos),
        supabaseClient.from("DomesticBookingDetails").select("*").in("pickup_request_no", requestNos),
        supabaseClient.from("CustomsClearance_Details").select("*").in("pickup_request_no", requestNos)
    ]);

    // 3. Attach the fetched details back to the main requests
    requests.forEach(req => {
        const reqNo = req.pickup_request_no;

        req.FullLoadBookingDetails = (fullLoadRes.data || []).filter(b => b.pickup_request_no === reqNo);
        req.DomesticBookingDetails = (domesticRes.data || []).filter(b => b.pickup_request_no === reqNo);
        req.CustomsClearance_Details = (customsRes.data || []).filter(b => b.pickup_request_no === reqNo);
    });

    return requests;
}

// Helper to extract nested booking data based on Movement Type
function getAssociatedBookings(row) {
    let rawData = [];
    let bookings = [];
    const type = row.request_movement_type;

    if (type === 'International') {
        rawData = Array.isArray(row.international_booking) ? row.international_booking : (row.international_booking ? [row.international_booking] : []);
        bookings = rawData.map(b => ({
            no: b.DocketNo,
            date: b.BookedDate,
            type: b.MovementType,
            transit: b.TransitType,
            origin: b.Origin,
            dest: b.Destination
        }));
    }
    else if (type === 'Domestic') {
        rawData = Array.isArray(row.DomesticBookingDetails) ? row.DomesticBookingDetails : (row.DomesticBookingDetails ? [row.DomesticBookingDetails] : []);
        // Note: adjust 'b.docket_no' etc to match your exact Domestic table column names
        bookings = rawData.map(b => ({
            no: b.DocketNo,
            date: b.BookingDate,
            type: b.ModeType,
            transit: b.TransitType,
            origin: b.OriginCity,
            dest: b.DestinationCity
        }));
    }
    else if (type === 'Customs Clearance') {
        rawData = Array.isArray(row.CustomsClearance_Details) ? row.CustomsClearance_Details : (row.CustomsClearance_Details ? [row.CustomsClearance_Details] : []);
        bookings = rawData.map(b => ({
            no: b.JobID,
            date: b.JobDate,
            type: b.MovementType,
            transit: b.TransitType,
            origin: b.Origin,
            dest: b.Destination
        }));
    }
    else if (type === 'Full Truck Load') {
        rawData = Array.isArray(row.FullLoadBookingDetails) ? row.FullLoadBookingDetails : (row.FullLoadBookingDetails ? [row.FullLoadBookingDetails] : []);
        bookings = rawData.map(b => ({
            no: b.lr_number,
            date: b.pickup_date,
            type: b.movement_type,
            transit: b.transit_type,
            origin: b.origin_city,
            dest: b.destination_city
        }));
    }

    return bookings;
}

// Render Main Table
function renderTable(requests = []) {
    const tbody = document.querySelector("#requestTable tbody");

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedRequests = requests.slice(startIndex, endIndex);

    let html = "";

    paginatedRequests.forEach((p, index) => {
        const rowId = `row-${p.id}`;
        const reqDate = p.pickup_request_date ? new Date(p.pickup_request_date).toLocaleDateString('en-GB') : "-";

        // Status Badge formatting
        let statusBadge = 'bg-secondary';
        if (p.status === 'Completed') statusBadge = 'bg-success';
        if (p.status === 'Canceled') statusBadge = 'bg-danger';
        if (p.status === 'Pending') statusBadge = 'bg-warning text-dark';

        // Main Row
        html += `
            <tr>
                <td>
                    <button class="btn btn-sm btn-link toggle-btn" data-target="${rowId}">
                        <i class="bi bi-plus-circle"></i>
                    </button>
                    ${startIndex + index + 1}
                </td>
                <td>${p.pickup_request_no || "-"}</td>
                <td>${reqDate}</td>
                <td title="${p.customer_name || ''}">${p.customer_name || "-"}</td>
                <td>${p.request_movement_type || "-"}</td>
                <td>${p.assigned_to_person || "-"}</td>
                <td title="${p.notes || ''}">${p.notes ? (p.notes.length > 20 ? p.notes.substring(0, 20) + '...' : p.notes) : "-"}</td>
                <td><span class="badge ${statusBadge}">${p.status || "-"}</span></td>
                <td>${p.created_by || "-"}</td>
                <td title="${p.canceled_notes || ''}">${p.canceled_notes ? (p.canceled_notes.length > 20 ? p.canceled_notes.substring(0, 20) + '...' : p.canceled_notes) : "-"}</td>
            </tr>
        `;

        // Associated Shipments (Collapsible Nested Table)
        const bookings = getAssociatedBookings(p); // <-- Uses helper function

        html += `
        <tr id="${rowId}" style="display:none">
            <td colspan="10">
                <div class="p-2 bg-light border rounded">
                    <h6 class="mb-2 text-primary small fw-bold"><i class="bi bi-box-seam"></i> Associated Shipments / Dockets (${p.request_movement_type || "N/A"})</h6>
                    <table class="table table-sm table-bordered mb-0 bg-white">
                        <thead class="table-light">
                            <tr>
                                <th>Ref / Docket No</th>
                                <th>Booked Date</th>
                                <th>Movement Type</th>
                                <th>Transit Type</th>
                                <th>Origin</th>
                                <th>Destination</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${bookings.length > 0 ? bookings.map(b => `
                                <tr>
                                    <td><strong>${b.no || "-"}</strong></td>
                                    <td>${b.date ? new Date(b.date).toLocaleDateString('en-GB') : "-"}</td>
                                    <td>${b.type || "-"}</td>
                                    <td>${b.transit || "-"}</td>
                                    <td>${b.origin || "-"}</td>
                                    <td>${b.dest || "-"}</td>
                                </tr>
                            `).join("") : `
                                <tr>
                                    <td colspan="6" class="text-center text-muted">No associated shipments found</td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </td>
        </tr>
    `;
    });

    tbody.innerHTML = html.length > 0 ? html : `<tr><td colspan="10" class="text-center text-muted py-4">No records found matching your filters.</td></tr>`;

    renderPagination(requests.length, () => renderTable(requests));
}

// Populate Datalists for Autocomplete
function populateFilters(requests) {
    const customers = new Set();
    const requestNos = new Set();
    const shipmentNos = new Set();

    requests.forEach(p => {
        if (p.customer_name) customers.add(p.customer_name);
        if (p.pickup_request_no) requestNos.add(p.pickup_request_no);

        const bookings = Array.isArray(p.international_booking) ? p.international_booking : (p.international_booking ? [p.international_booking] : []);
        bookings.forEach(b => {
            if (b.DocketNo) shipmentNos.add(b.DocketNo);
        });
    });

    document.getElementById("customerNameList").innerHTML = [...customers].map(v => `<option value="${v}">`).join("");
    document.getElementById("RequestNoList").innerHTML = [...requestNos].map(v => `<option value="${v}">`).join("");
    document.getElementById("shipmentNoList").innerHTML = [...shipmentNos].map(v => `<option value="${v}">`).join("");
}

// Get Data from Filter Fields
function getFilters() {
    let dateRangeStr = document.getElementById('dateRange').value;
    let dateRange = dateRangeStr ? dateRangeStr.split(' to ') : [];

    return {
        customerName: document.getElementById('customerName').value.trim(),
        requestNo: document.getElementById('RequestNo').value.trim(),
        shipmentNo: document.getElementById('shipmentNo').value.trim(),
        startDate: dateRange[0]?.trim() || null,
        endDate: dateRange[1]?.trim() || null,
        paymentMonth: document.getElementById('paymentMonth').value.trim(), // Request Month
        paymentYear: document.getElementById('paymentYear').value.trim(),   // Request Year
        financialYear: document.getElementById('financialYear').value.trim(),
    };
}

// Apply Filters to Data
function applyFilters() {
    const filters = getFilters();
    let filtered = [...allRequests];

    if (filters.customerName) {
        const search = filters.customerName.toLowerCase();
        filtered = filtered.filter(p => (p.customer_name || "").toLowerCase().includes(search));
    }

    if (filters.requestNo) {
        const search = filters.requestNo.toLowerCase();
        filtered = filtered.filter(p => (p.pickup_request_no || "").toLowerCase().includes(search));
    }

    if (filters.shipmentNo) {
        const search = filters.shipmentNo.toLowerCase();
        filtered = filtered.filter(p => {
            const bookings = Array.isArray(p.international_booking) ? p.international_booking : (p.international_booking ? [p.international_booking] : []);
            return bookings.some(b => (b.DocketNo || "").toLowerCase().includes(search));
        });
    }

    if (filters.startDate) {
        const start = new Date(filters.startDate);
        filtered = filtered.filter(p => p.pickup_request_date && new Date(p.pickup_request_date) >= start);
    }

    if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter(p => p.pickup_request_date && new Date(p.pickup_request_date) <= end);
    }

    if (filters.paymentMonth) {
        const [year, month] = filters.paymentMonth.split('-').map(Number);
        filtered = filtered.filter(p => {
            if (!p.pickup_request_date) return false;
            const d = new Date(p.pickup_request_date);
            return d.getFullYear() === year && (d.getMonth() + 1) === month;
        });
    }

    if (filters.paymentYear) {
        const year = Number(filters.paymentYear);
        filtered = filtered.filter(p => {
            if (!p.pickup_request_date) return false;
            return new Date(p.pickup_request_date).getFullYear() === year;
        });
    }

    if (filters.financialYear) {
        const [startFY] = filters.financialYear.split("-").map(Number);
        filtered = filtered.filter(p => {
            if (!p.pickup_request_date) return false;
            const d = new Date(p.pickup_request_date);
            const fy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
            return fy === startFY;
        });
    }

    filteredRequests = filtered; // Update filtered state
    currentPage = 1;
    renderTable(filteredRequests);
}

// Toggle Row Details (+ / - buttons)
function attachToggle() {
    if (toggleAttached) return;
    toggleAttached = true;

    document.querySelector("#requestTable tbody").addEventListener("click", function (e) {
        const btn = e.target.closest(".toggle-btn");
        if (!btn) return;

        const targetId = btn.dataset.target;
        const targetRow = document.getElementById(targetId);
        const icon = btn.querySelector("i");

        // Close all other rows
        document.querySelectorAll("tr[id^='row-']").forEach(row => {
            if (row.id !== targetId) row.style.display = "none";
        });

        // Reset all icons to plus
        document.querySelectorAll(".toggle-btn i").forEach(i => {
            i.classList.remove("bi-dash-circle");
            i.classList.add("bi-plus-circle");
        });

        const isOpen = targetRow.style.display === "table-row";

        if (isOpen) {
            targetRow.style.display = "none";
        } else {
            targetRow.style.display = "table-row";
            icon.classList.remove("bi-plus-circle");
            icon.classList.add("bi-dash-circle");
        }
    });
}

// Pagination Logic
function renderPagination(totalCount, loadTableFn) {
    const totalPages = Math.ceil(totalCount / pageSize);
    const pagination = document.getElementById('paginationControls');
    pagination.innerHTML = '';

    if (totalPages <= 1) return; // Hide if only 1 page

    const maxVisiblePages = 5;

    // Previous Button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#">Previous</a>`;
    prevLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) {
            currentPage--;
            loadTableFn();
        }
    });
    pagination.appendChild(prevLi);

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    startPage = Math.max(1, endPage - maxVisiblePages + 1);

    if (startPage > 1) {
        addPageButton(1);
        if (startPage > 2) addDots();
    }

    for (let i = startPage; i <= endPage; i++) {
        addPageButton(i);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) addDots();
        addPageButton(totalPages);
    }

    // Next Button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#">Next</a>`;
    nextLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) {
            currentPage++;
            loadTableFn();
        }
    });
    pagination.appendChild(nextLi);

    function addPageButton(page) {
        const li = document.createElement('li');
        li.className = `page-item ${page === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#">${page}</a>`;
        li.addEventListener('click', (e) => {
            e.preventDefault();
            currentPage = page;
            loadTableFn();
        });
        pagination.appendChild(li);
    }

    function addDots() {
        const li = document.createElement('li');
        li.className = 'page-item disabled';
        li.innerHTML = `<span class="page-link">...</span>`;
        pagination.appendChild(li);
    }
}

// EXPORT FUNCTIONS (Using dynamic associated shipments)
async function exportToExcel() {
    if (filteredRequests.length === 0) return alert('No data to export.');

    let tableHtml = `<table>
        <thead>
            <tr>
                <th>Sr No</th>
                <th>Request No</th>
                <th>Request Date</th>
                <th>Customer Name</th>
                <th>Movement Type</th>
                <th>Assigned To</th>
                <th>Scheduled Date</th>
                <th>Origin Pin Code</th>
                <th>Origin City</th>
                <th>Notes</th>
                <th>Status</th>
                <th>Created By</th>
                <th>Canceled Notes</th>
                <th>Associated Dockets/Refs</th>
            </tr>
        </thead>
        <tbody>`;

    filteredRequests.forEach((row, i) => {
        const reqDate = row.pickup_request_date ? new Date(row.pickup_request_date).toLocaleDateString('en-GB') : '';
        const schedDate = row.scheduled_date ? new Date(row.scheduled_date).toLocaleDateString('en-GB') : '';

        // Flatten associated dockets into a comma-separated string
        const bookings = getAssociatedBookings(row);
        const dockets = bookings.map(b => b.no).filter(Boolean).join(', ');

        tableHtml += `<tr>
            <td>${i + 1}</td>
            <td>${row.pickup_request_no || ''}</td>
            <td>${reqDate}</td>
            <td>${row.customer_name || ''}</td>
            <td>${row.request_movement_type || ''}</td>
            <td>${row.assigned_to_person || ''}</td>
            <td>${schedDate}</td>
            <td>${row.origin_pin_code || ''}</td>
            <td>${row.origin_city || ''}</td>
            <td>${row.notes || ''}</td>
            <td>${row.status || ''}</td>
            <td>${row.created_by || ''}</td>
            <td>${row.canceled_notes || ''}</td>
            <td>${dockets}</td>
        </tr>`;
    });

    tableHtml += `</tbody></table>`;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = tableHtml;
    const wb = XLSX.utils.table_to_book(tempDiv.querySelector('table'), { sheet: "PickupRequests" });
    XLSX.writeFile(wb, 'Pickup_Requests_Report.xlsx');
}

async function exportToPdf() {
    if (filteredRequests.length === 0) return alert('No data to export.');

    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const headers = [
        'Sr No', 'Request No', 'Request Date', 'Customer Name', 'Movement Type',
        'Assigned To', 'Origin City', 'Status', 'Associated Dockets/Refs'
    ];

    const rows = filteredRequests.map((row, i) => {
        const reqDate = row.pickup_request_date ? new Date(row.pickup_request_date).toLocaleDateString('en-GB') : '';

        const bookings = getAssociatedBookings(row);
        const dockets = bookings.map(b => b.no).filter(Boolean).join(', ');

        return [
            i + 1,
            row.pickup_request_no || '',
            reqDate,
            row.customer_name || '',
            row.request_movement_type || '',
            row.assigned_to_person || '',
            row.origin_city || '',
            row.status || '',
            dockets
        ];
    });

    doc.autoTable({
        head: [headers],
        body: rows,
        startY: 20,
        margin: { left: 10, right: 10 },
        styles: { fontSize: 8, overflow: 'linebreak', cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] },
        didDrawPage: function (data) {
            doc.setFontSize(12);
            doc.setTextColor(40);
            doc.text("Pickup Requests Report", data.settings.margin.left, 12);
        },
        pageBreak: 'auto'
    });

    doc.save('Pickup_Requests_Report.pdf');
}
