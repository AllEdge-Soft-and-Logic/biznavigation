// rep_PaymentDetails.js

let allPayments = [];
let filteredPayments = []; // Store filtered data for exports and pagination
let currentPage = 1;
const pageSize = 50;
const CompanyID = localStorage.getItem('CompanyID') || ""; // Fallback if null
let sortColumn = null;
let sortOrder = 'asc';
let toggleAttached = false;


document.addEventListener("DOMContentLoaded", async () => {
    // Initialize Date Picker
    flatpickr("#dateRange", { mode: "range", dateFormat: "Y-m-d" });

    // Show spinner while fetching
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.remove('hidden');

    allPayments = await fetchPayments();

    // Pre-process data once
    allPayments.forEach(p => {
        p._partyName = (p.PartyDetails?.PartyName || "").toLowerCase();
        p._paymentId = (p.PaymentID || "").toLowerCase();
        p._receiptDate = p.ReceiptOn ? new Date(p.ReceiptOn) : null;
    });

    filteredPayments = [...allPayments]; // Initialize filtered data

    if (spinner) spinner.classList.add('hidden');

    // Enable export buttons now that data is loaded
    document.getElementById('exportExcelBtn').removeAttribute('disabled');
    document.getElementById('exportPdfBtn').removeAttribute('disabled');

    // Attach Event Listeners
    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
    document.getElementById('exportPdfBtn').addEventListener('click', exportToPdf);
    document.getElementById("searchBtn").addEventListener("click", applyFilters);

    attachToggle();
    populateFilters(allPayments);
    renderTable();
});

async function fetchPayments() {
    if (!CompanyID) {
        console.error("No CompanyID found in localStorage");
        return [];
    }

    const { data, error } = await supabaseClient
        .from("PaymentDetails")
        .select(`
            id,
            PaymentID,
            ReceiptOn,
            PartyCode,
            TransactionType,
            SuspenseAmount,
            ReferenceNo,
            PaymentAmount,
            DeductionAmount,
            PartyDetails (
                PartyName
            ),
            PaymentLineItems!PaymentLineItems_PaymentID_fkey (
                InvoiceNo,
                PaymentAmount,
                OtherDeductionAmount,
                TDSDeductionAmount,
                Narration
            )
        `)
        .eq("company_id", CompanyID)
        .order("ReceiptOn", { ascending: false });

    if (error) {
        console.error("FETCH ERROR:", error);
        return [];
    }
    return data || [];
}

function renderTable() {
    const tbody = document.querySelector("#paymentTable tbody");

    if (filteredPayments.length === 0) {
        tbody.innerHTML = `<tr class="table-empty"><td colspan="8">No payments found matching the criteria.</td></tr>`;
        document.getElementById('paginationControls').innerHTML = '';
        return;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedPayments = filteredPayments.slice(startIndex, endIndex);

    let html = "";

    paginatedPayments.forEach((p, index) => {
        const rowId = `row-${p.id || index}`;
        const credit = p.TransactionType === "Credit" ? Number(p.PaymentAmount || 0) : 0;
        const debit = p.TransactionType === "Debit" ? Number(p.PaymentAmount || 0) : 0;
        const partyName = p.PartyDetails?.PartyName || "-";

        // FIX: Ensure narrationSummary is always a string, even if the database value is null
        const rawNarration = p.PaymentLineItems?.length ? p.PaymentLineItems[0].Narration : null;
        const narrationSummary = rawNarration || "-";

        html += `
            <tr>
                <td>
                    <button class="btn btn-sm btn-link toggle-btn text-primary p-0 me-1" data-target="${rowId}">
                        <i class="bi bi-plus-circle"></i>
                    </button>
                    ${startIndex + index + 1}
                </td>
                <td>${p.PaymentID || "-"}</td>
                <td>${formatDate(p.ReceiptOn)}</td>
                <td>${partyName}</td>
                <td title="${narrationSummary}">${narrationSummary.length > 20 ? narrationSummary.substring(0, 20) + '...' : narrationSummary}</td>
                <td class="text-end text-success fw-medium">${formatAmount(credit)}</td>
                <td class="text-end text-danger fw-medium">${formatAmount(debit)}</td>
            </tr>

            <tr id="${rowId}" style="display:none">
                <td colspan="7" class="p-0 border-0">
                    <div class="p-3 bg-light border-bottom">
                        <h6 class="text-muted mb-2" style="font-size: 0.75rem; text-transform: uppercase;">Line Items</h6>
                        <table class="table table-sm table-bordered bg-white mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Invoice No</th>
                                    <th>Narration</th>
                                    <th class="text-end">Amount</th>
                                    <th class="text-end">Other Ded.</th>
                                    <th class="text-end">TDS</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${p.PaymentLineItems?.length > 0
                ? p.PaymentLineItems.map(item => `
                                        <tr>
                                            <td>${item.InvoiceNo || "-"}</td>
                                            <td>${item.Narration || "-"}</td>
                                            <td class="text-end">${formatAmount(item.PaymentAmount)}</td>
                                            <td class="text-end">${formatAmount(item.OtherDeductionAmount)}</td>
                                            <td class="text-end">${formatAmount(item.TDSDeductionAmount)}</td>
                                        </tr>
                                    `).join("")
                : `<tr><td colspan="5" class="text-center text-muted py-2">No Invoice Details Attached</td></tr>`
            }
                            </tbody>
                        </table>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    renderPagination(filteredPayments.length);
}

function attachToggle() {
    if (toggleAttached) return;
    toggleAttached = true;

    document.querySelector("#paymentTable tbody").addEventListener("click", function (e) {
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

        // Toggle target row
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

function getFilters() {
    const dateRangeVal = document.getElementById('dateRange').value;
    const dateRange = dateRangeVal ? dateRangeVal.split(' to ') : [];

    return {
        paymentNo: document.getElementById('paymentNo').value.trim().toLowerCase(),
        invoiceNo: document.getElementById('invoiceNo').value.trim().toLowerCase(),
        startDate: dateRange[0] ? new Date(dateRange[0]) : null,
        endDate: dateRange[1] ? new Date(dateRange[1]) : null,
        customerName: document.getElementById('customerName').value.trim().toLowerCase(),
        paymentMonth: document.getElementById('paymentMonth').value.trim(),
        paymentYear: document.getElementById('paymentYear').value.trim(),
        financialYear: document.getElementById('financialYear').value.trim(),
    };
}

function applyFilters() {
    const filters = getFilters();

    // Adjust end date to include the full day
    if (filters.endDate) filters.endDate.setHours(23, 59, 59, 999);

    let fyStartYear = null;
    if (filters.financialYear) {
        fyStartYear = parseInt(filters.financialYear.split("-")[0]);
    }

    filteredPayments = allPayments.filter(p => {
        // 1. Customer Name Match
        if (filters.customerName && !p._partyName.includes(filters.customerName)) return false;

        // 2. Payment No Match
        if (filters.paymentNo && !p._paymentId.includes(filters.paymentNo)) return false;

        // 3. Invoice No Match
        if (filters.invoiceNo) {
            const hasInvoice = p.PaymentLineItems?.some(item =>
                (item.InvoiceNo || "").toLowerCase().includes(filters.invoiceNo)
            );
            if (!hasInvoice) return false;
        }

        // 4. Date Range Match
        if (filters.startDate && (!p._receiptDate || p._receiptDate < filters.startDate)) return false;
        if (filters.endDate && (!p._receiptDate || p._receiptDate > filters.endDate)) return false;

        // 5. Payment Month Match
        if (filters.paymentMonth && p._receiptDate) {
            const [y, m] = filters.paymentMonth.split('-').map(Number);
            if (p._receiptDate.getFullYear() !== y || p._receiptDate.getMonth() + 1 !== m) return false;
        }

        // 6. Payment Year Match
        if (filters.paymentYear && p._receiptDate) {
            if (p._receiptDate.getFullYear() !== Number(filters.paymentYear)) return false;
        }

        // 7. Financial Year Match
        if (fyStartYear && p._receiptDate) {
            const fy = p._receiptDate.getMonth() >= 3 ? p._receiptDate.getFullYear() : p._receiptDate.getFullYear() - 1;
            if (fy !== fyStartYear) return false;
        }

        return true;
    });

    currentPage = 1;
    renderTable();
}

function populateFilters(payments) {
    const customers = new Set();
    const paymentNos = new Set();
    const invoices = new Set();

    payments.forEach(p => {
        if (p.PartyDetails?.PartyName) customers.add(p.PartyDetails.PartyName);
        if (p.PaymentID) paymentNos.add(p.PaymentID);
        p.PaymentLineItems?.forEach(item => {
            if (item.InvoiceNo) invoices.add(item.InvoiceNo);
        });
    });

    document.getElementById("customerNameList").innerHTML = [...customers].map(v => `<option value="${v}">`).join("");
    document.getElementById("paymentNoList").innerHTML = [...paymentNos].map(v => `<option value="${v}">`).join("");
    document.getElementById("invoiceNoList").innerHTML = [...invoices].map(v => `<option value="${v}">`).join("");
}

function renderPagination(totalCount) {
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const pagination = document.getElementById('paginationControls');
    pagination.innerHTML = '';

    const createBtn = (label, pageNum, disabled = false, active = false) => {
        const li = document.createElement('li');
        li.className = `page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#">${label}</a>`;
        if (!disabled && !active) {
            li.addEventListener('click', (e) => {
                e.preventDefault();
                currentPage = pageNum;
                renderTable();
            });
        }
        return li;
    };

    pagination.appendChild(createBtn('Previous', currentPage - 1, currentPage === 1));

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    startPage = Math.max(1, endPage - 4);

    if (startPage > 1) {
        pagination.appendChild(createBtn(1, 1));
        if (startPage > 2) pagination.appendChild(createBtn('...', null, true));
    }

    for (let i = startPage; i <= endPage; i++) {
        pagination.appendChild(createBtn(i, i, false, i === currentPage));
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pagination.appendChild(createBtn('...', null, true));
        pagination.appendChild(createBtn(totalPages, totalPages));
    }

    pagination.appendChild(createBtn('Next', currentPage + 1, currentPage === totalPages));
}

// ---------------- EXPORT FUNCTIONS ----------------

function exportToExcel() {
    if (!filteredPayments || filteredPayments.length === 0) return alert('No data to export.');

    // Prepare Array for SheetJS
    const exportData = filteredPayments.map((p, i) => {
        const credit = p.TransactionType === "Credit" ? Number(p.PaymentAmount || 0) : 0;
        const debit = p.TransactionType === "Debit" ? Number(p.PaymentAmount || 0) : 0;

        return {
            "Sr No": i + 1,
            "Payment No": p.PaymentID || "-",
            "Payment Date": formatDate(p.ReceiptOn),
            "Customer Name": p.PartyDetails?.PartyName || "-",
            "Reference No": p.ReferenceNo || "-",
            "Credit Amount": credit,
            "Debit Amount": debit
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Payments");

    XLSX.writeFile(workbook, 'Payment_Report.xlsx');
}

function exportToPdf() {
    if (!filteredPayments || filteredPayments.length === 0) return alert('No data to export.');
    if (!window.jspdf || !window.jspdf.jsPDF) return alert("PDF Library not loaded yet.");

    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const headers = [['Sr No', 'Payment No', 'Payment Date', 'Customer Name', 'Credit', 'Debit']];

    const rows = filteredPayments.map((p, i) => {
        const credit = p.TransactionType === "Credit" ? Number(p.PaymentAmount || 0) : 0;
        const debit = p.TransactionType === "Debit" ? Number(p.PaymentAmount || 0) : 0;

        return [
            i + 1,
            p.PaymentID || "-",
            formatDate(p.ReceiptOn),
            p.PartyDetails?.PartyName || "-",
            formatAmount(credit),
            formatAmount(debit)
        ];
    });

    doc.autoTable({
        head: headers,
        body: rows,
        startY: 20,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] }, // Matches var(--primary-color)
        didDrawPage: function (data) {
            doc.setFontSize(14);
            doc.text("Payment Details Report", 14, 15);
            doc.setFontSize(9);
            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 150, 15);
        },
    });

    doc.save('Payment_Report.pdf');
}