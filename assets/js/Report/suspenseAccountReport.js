document.addEventListener('DOMContentLoaded', async () => {
    // const CompanyID = localStorage.getItem('CompanyID'); 

    await Promise.all([
        loadCustomerOutstanding(),
        loadVendorOutstanding()
    ]);

    const excelBtn = document.getElementById('exportExcelBtn');
    const pdfBtn = document.getElementById('exportPdfBtn');

    if (excelBtn) excelBtn.addEventListener('click', exportToExcel);
    if (pdfBtn) pdfBtn.addEventListener('click', exportToPDF);

    // Tab Event Listeners: Update dropdown filter when switching tabs
    document.getElementById('customer-tab').addEventListener('click', () => {
        populatePartyFilter('Customer');
        resetAndApplyFilter('customerTableBody');
    });

    document.getElementById('vendor-tab').addEventListener('click', () => {
        populatePartyFilter('Vendor');
        resetAndApplyFilter('vendorTableBody');
    });

    // Dropdown Filter Event Listener
    document.getElementById('partyFilter').addEventListener('change', (e) => {
        const activeTabPane = document.querySelector('.tab-pane.active');
        if (activeTabPane) {
            resetAndApplyFilter(activeTabPane.querySelector('tbody').id, e.target.value);
        }
    });
});