const CompanyID = localStorage.getItem("CompanyID");

let filteredData = [];
let currentPage = 1;
const pageSize = 50;

document.addEventListener("DOMContentLoaded", async () => {
    if (!CompanyID) console.error("Missing CompanyID in localStorage");

    initializeFinancialYears();

    // Set current month as default
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    document.getElementById("invoiceMonth").value = currentMonth;

    // Event Listeners
    document.getElementById("searchBtn").addEventListener("click", loadTaxReport);
    document.getElementById("exportExcelBtn").addEventListener("click", exportToExcel);
    document.getElementById("exportPdfBtn").addEventListener("click", exportToPdf);

    await loadTaxReport();
});

// ==========================
// HELPERS
// ==========================
const toNumber = (value) => Number(value) || 0;

const showLoading = (show) => {
    document.getElementById("loadingSpinner").classList.toggle("d-none", !show);
};

const getFilters = () => ({
    invoiceMonth: document.getElementById("invoiceMonth").value,
    invoiceYear: document.getElementById("invoiceYear").value,
    financialYear: document.getElementById("financialYear").value
});

function initializeFinancialYears() {
    const list = document.getElementById("financialYearList");
    list.innerHTML = "";

    const currentYear = new Date().getFullYear();
    const fragment = document.createDocumentFragment();

    for (let year = currentYear - 10; year <= currentYear + 1; year++) {
        const option = document.createElement("option");
        option.value = `${year}-${year + 1}`;
        fragment.appendChild(option);
    }
    list.appendChild(fragment);
}

function updatePageTotals(pageRows = []) {
    const totals = pageRows.reduce((acc, row) => {
        acc.nonTaxable += toNumber(row.NonTaxableAmount);
        acc.taxable += toNumber(row.TaxableAmount);
        acc.sgst += toNumber(row.SGST);
        acc.cgst += toNumber(row.CGST);
        acc.igst += toNumber(row.IGST);
        acc.gst += toNumber(row.TotalGST);
        acc.invoice += toNumber(row.TotalInvoiceAmount);
        return acc;
    }, { nonTaxable: 0, taxable: 0, sgst: 0, cgst: 0, igst: 0, gst: 0, invoice: 0 });

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatAmount(value);
    };

    setText("totalNonTaxable", totals.nonTaxable);
    setText("totalTaxable", totals.taxable);
    setText("totalSGST", totals.sgst);
    setText("totalCGST", totals.cgst);
    setText("totalIGST", totals.igst);
    setText("totalGST", totals.gst);
    setText("totalInvoice", totals.invoice);
}

// ==========================
// DATA FETCHING & FILTERING
// ==========================
function applyFiltersToQuery(query, filters) {
    if (filters.invoiceMonth) {
        const [year, month] = filters.invoiceMonth.split("-").map(Number);
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        return query.gte("InvoiceDate", startDate).lte("InvoiceDate", endDate);
    }

    if (filters.invoiceYear) {
        return query.gte("InvoiceDate", `${filters.invoiceYear}-01-01`)
            .lte("InvoiceDate", `${filters.invoiceYear}-12-31`);
    }

    if (filters.financialYear) {
        const [startYear, endYear] = filters.financialYear.split("-");
        return query.gte("InvoiceDate", `${startYear}-04-01`)
            .lte("InvoiceDate", `${endYear}-03-31`);
    }
    return query;
}

async function loadTaxReport() {
    try {
        currentPage = 1;
        showLoading(true);

        const filters = getFilters();
        let allData = [];
        let hasMore = true;
        let from = 0;
        const batchSize = 1000;

        // Fetch in batches to prevent Supabase 1000-row limit truncation
        while (hasMore) {
            let query = supabaseClient
                .from("TaxReportView")
                .select("*")
                .eq("CompanyID", CompanyID)
                .order("InvoiceDate", { ascending: true });

            query = applyFiltersToQuery(query, filters);

            const { data, error } = await query.range(from, from + batchSize - 1);
            if (error) throw error;

            if (data && data.length > 0) {
                allData.push(...data);
                from += batchSize;
                if (data.length < batchSize) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        filteredData = allData || [];
        renderTable(filteredData);
        toggleExportButtons(filteredData.length > 0);

    } catch (err) {
        console.error("Load Tax Report Error:", err);
        alert("Failed to load tax report");
        filteredData = [];
        renderTable([]);
        toggleExportButtons(false);
    } finally {
        showLoading(false);
    }
}

function toggleExportButtons(isEnabled) {
    document.getElementById("exportExcelBtn").disabled = !isEnabled;
    document.getElementById("exportPdfBtn").disabled = !isEnabled;
}

// ==========================
// RENDER TABLE
// ==========================
function renderTable(data = []) {
    const tbody = document.getElementById("tableBody");
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const pageData = data.slice(startIndex, endIndex);
    const cumulativeData = data.slice(0, endIndex);

    if (!pageData.length) {
        tbody.innerHTML = `
            <tr id="emptyRow">
                <td colspan="13" class="text-center text-muted py-5">
                    <i class="bi bi-inbox fs-3 d-block mb-2 opacity-50"></i>
                    No records found
                </td>
            </tr>
        `;
        updatePageTotals([]);
        renderPagination(data.length);
        return;
    }

    tbody.innerHTML = pageData.map((row, index) => `
        <tr>
            <td class="text-center">${startIndex + index + 1}</td>
            <td class="text-center">${row.InvoiceNo || ""}</td>
            <td class="text-center">${formatDate(row.InvoiceDate)}</td>
            <td class="text-start">${row.CustomerName || ""}</td>
            <td class="text-start">${row.State || ""}</td>
            <td class="text-start">${row.GSTNo || ""}</td>
            <td class="text-end">${formatAmount(row.NonTaxableAmount)}</td>
            <td class="text-end">${formatAmount(row.TaxableAmount)}</td>
            <td class="text-end">${formatAmount(row.SGST)}</td>
            <td class="text-end">${formatAmount(row.CGST)}</td>
            <td class="text-end">${formatAmount(row.IGST)}</td>
            <td class="text-end">${formatAmount(row.TotalGST)}</td>
            <td class="text-end">${formatAmount(row.TotalInvoiceAmount)}</td>
        </tr>
    `).join("");

    updatePageTotals(cumulativeData);
    renderPagination(data.length);
}

// ==========================
// PAGINATION
// ==========================
function renderPagination(totalCount) {
    const totalPages = Math.ceil(totalCount / pageSize);
    const pagination = document.getElementById("paginationControls");
    pagination.innerHTML = "";

    if (totalPages <= 1) return;

    const createPageItem = (text, targetPage, isDisabled, isActive = false) => {
        const li = document.createElement("li");
        li.className = `page-item ${isDisabled ? "disabled" : ""} ${isActive ? "active" : ""}`;

        if (isDisabled && text === "...") {
            li.innerHTML = `<span class="page-link">...</span>`;
        } else {
            li.innerHTML = `<a class="page-link" href="#">${text}</a>`;
            if (!isDisabled) {
                li.addEventListener("click", (e) => {
                    e.preventDefault();
                    currentPage = targetPage;
                    renderTable(filteredData);
                });
            }
        }
        return li;
    };

    // Previous Button
    pagination.appendChild(createPageItem("Previous", currentPage - 1, currentPage === 1));

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    startPage = Math.max(1, endPage - maxVisiblePages + 1);

    if (startPage > 1) {
        pagination.appendChild(createPageItem(1, 1, false, currentPage === 1));
        if (startPage > 2) pagination.appendChild(createPageItem("...", null, true));
    }

    for (let i = startPage; i <= endPage; i++) {
        pagination.appendChild(createPageItem(i, i, false, i === currentPage));
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pagination.appendChild(createPageItem("...", null, true));
        pagination.appendChild(createPageItem(totalPages, totalPages, false, currentPage === totalPages));
    }

    // Next Button
    pagination.appendChild(createPageItem("Next", currentPage + 1, currentPage === totalPages));
}

// ==========================
// EXPORTS (Uses In-Memory Data)
// ==========================
function exportToExcel() {
    if (!filteredData.length) return alert("No data to export.");

    const headers = [
        "Sr No", "Invoice Date", "Invoice No", "Customer Name", "State", "GST No",
        "Non-Taxable Amount", "Taxable Amount", "SGST Amount", "CGST Amount",
        "IGST Amount", "Total GST Amount", "Total Invoice Amount"
    ];

    const excelData = [headers];

    filteredData.forEach((row, i) => {
        excelData.push([
            i + 1,
            formatDate(row.InvoiceDate),
            row.InvoiceNo || "",
            row.CustomerName || "",
            row.State || "",
            row.GSTNo || "",
            toNumber(row.NonTaxableAmount),
            toNumber(row.TaxableAmount),
            toNumber(row.SGST),
            toNumber(row.CGST),
            toNumber(row.IGST),
            toNumber(row.TotalGST),
            toNumber(row.TotalInvoiceAmount)
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(excelData);

    ws["!cols"] = [
        { wch: 8 }, { wch: 15 }, { wch: 18 }, { wch: 40 }, { wch: 18 }, { wch: 22 },
        { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 20 }
    ];

    // Force Invoice Date column (B) as text to prevent formatting bugs
    for (let row = 2; row <= filteredData.length + 1; row++) {
        const cell = ws[`B${row}`];
        if (cell) {
            cell.t = "s";
            cell.v = String(cell.v);
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GST Report");
    XLSX.writeFile(wb, "GSTReport.xlsx");
}

function exportToPdf() {
    if (!filteredData.length) return alert("No data to export.");

    const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const headers = [[
        "Sr No", "Invoice Date", "Invoice No", "Customer Name", "State", "GST No",
        "Non-Taxable Amount", "Taxable Amount", "SGST Amount", "CGST Amount",
        "IGST Amount", "Total GST Amount", "Total Invoice Amount"
    ]];

    const totals = { nonTaxable: 0, taxable: 0, sgst: 0, cgst: 0, igst: 0, gst: 0, invoice: 0 };

    const rows = filteredData.map((row, i) => {
        totals.nonTaxable += toNumber(row.NonTaxableAmount);
        totals.taxable += toNumber(row.TaxableAmount);
        totals.sgst += toNumber(row.SGST);
        totals.cgst += toNumber(row.CGST);
        totals.igst += toNumber(row.IGST);
        totals.gst += toNumber(row.TotalGST);
        totals.invoice += toNumber(row.TotalInvoiceAmount);

        return [
            i + 1,
            formatDate(row.InvoiceDate),
            row.InvoiceNo || "",
            row.CustomerName || "",
            row.State || "",
            row.GSTNo || "",
            formatAmount(row.NonTaxableAmount),
            formatAmount(row.TaxableAmount),
            formatAmount(row.SGST),
            formatAmount(row.CGST),
            formatAmount(row.IGST),
            formatAmount(row.TotalGST),
            formatAmount(row.TotalInvoiceAmount)
        ];
    });

    // Grand total row
    rows.push([
        "", "", "", "GRAND TOTAL", "", "",
        formatAmount(totals.nonTaxable), formatAmount(totals.taxable),
        formatAmount(totals.sgst), formatAmount(totals.cgst),
        formatAmount(totals.igst), formatAmount(totals.gst), formatAmount(totals.invoice)
    ]);

    doc.autoTable({
        head: headers,
        body: rows,
        startY: 18,
        margin: { left: 5, right: 5 },
        theme: "grid",
        styles: {
            fontSize: 6.5, cellPadding: 1.2, overflow: "linebreak",
            lineWidth: 0.2, lineColor: [0, 0, 0], textColor: [0, 0, 0]
        },
        headStyles: {
            fillColor: [0, 123, 255], textColor: [255, 255, 255],
            fontStyle: "bold", halign: "center"
        },
        columnStyles: {
            0: { halign: "center" },
            6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" },
            9: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "right" },
            12: { halign: "right" }
        },
        didParseCell: (data) => {
            if (data.section === "body" && data.row.index === rows.length - 1) {
                data.cell.styles.fillColor = [230, 230, 230];
                data.cell.styles.fontStyle = "bold";
            }
        },
        didDrawPage: (data) => {
            doc.setFontSize(12);
            doc.setFont(undefined, "bold");
            doc.text("GST Invoice Report", data.settings.margin.left, 10);
            doc.setFontSize(8);
            doc.setFont(undefined, "normal");
            doc.text(`Generated On : ${new Date().toLocaleString()}`, data.settings.margin.left, 15);
        }
    });

    doc.save("GST Invoice Report.pdf");
}