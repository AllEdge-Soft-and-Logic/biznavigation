// ✅ Enable all form inputs
function enableForm() {
    document.querySelectorAll('input, select, textarea, option').forEach(el => el.disabled = false);
}

// ✅ Disable all form inputs
function disableForm() {
    const exemptIds = ['reportType']; // list of allowed fields
    document.querySelectorAll('input, select, textarea').forEach(el => {
        if (!exemptIds.includes(el.id)) {
            el.disabled = true;
        }
    });
}
// ✅ Clear all input fields including selects, checkboxes, and textareas
function clearForm() {
    document.querySelectorAll("input, select, textarea").forEach(input => {
        if (input.type === "checkbox" || input.type === "radio") {
            input.checked = false;
        } else {
            input.value = "";
        }

        if (input.tagName === "SELECT") {
            input.selectedIndex = 0;
        }
    });
}

// ✅ Format currency to 2 decimal places or fallback to 0.00
function formatCurrency(input) {
    const value = parseFloat(input.value);
    input.value = isNaN(value) ? '0.00' : value.toFixed(2);
}
function formatAmount(value) {
    const number = parseFloat(value || 0);

    return number.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}
// ✅ Convert string to Proper Case (first letter uppercase for each word)
function toProperCase(str) {
    return str.toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// ✅ Format date string as dd-mm-yyyy
function formatDate(dateValue) {
    if (!dateValue) return "";

    const date = new Date(dateValue);

    if (isNaN(date.getTime())) return "";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
}
// ✅ Generate a temporary form ID using timestamp and random number
function generateTempFormID() {
    return `TEMP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// Reusable function to set TempFormID
function setTempFormID(elementId = 'tempFormID') {
    const el = document.getElementById(elementId);
    if (!el) return null;

    const tempFormID = generateTempFormID();
    el.value = tempFormID;
    return tempFormID;
}

window.addEventListener('DOMContentLoaded', () => {
    setTempFormID(); // default tempFormID
});


// ✅ Tab switching logic
function openTab(evt, tabName) {
    document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");
    document.querySelectorAll(".tablinks").forEach(link => link.classList.remove("active"));

    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");
}

// ✅ Capitalize first letter of each word safely
function capitalizeFirstLetter(text) {
    if (typeof text !== 'string') return '';
    return text.toLowerCase().split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// ✅ Load country suggestions based on partial input
async function CountryDetails(inputValue, datalistId, inputId) {
    if (!inputValue) return;

    try {
        const { data, error } = await supabaseClient
            .from('Country_Details')
            .select('CountryCode, CountryName, Region')
            .ilike('CountryName', `%${inputValue}%`)
            .order('CountryName');

        if (error) return console.error('Supabase query error:', error);

        const datalist = document.getElementById(datalistId);
        datalist.innerHTML = '';
        data.forEach(country => {
            const option = document.createElement('option');
            option.value = country.CountryName;
            datalist.appendChild(option);
        });
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

// ✅ Add protocol if missing in website field
document.addEventListener('DOMContentLoaded', () => {
    const websiteInput = document.getElementById('website');
    websiteInput?.addEventListener('blur', function () {
        const url = this.value.trim();
        if (url && !/^https?:\/\//i.test(url)) {
            this.value = 'https://' + url;
        }
    });
});

// ✅ Toggle edit mode and disable/enable delete buttons
let isEditMode = false;
function toggleEditMode(enable) {
    isEditMode = enable;
    document.querySelectorAll('.delete-row, .remove-row').forEach(btn => {
        btn.disabled = enable;
        btn.classList.toggle('disabled', enable);
    });
}

// ✅ Load suggestions from Supabase and populate datalist with mapping
const suggestionMaps = {}; // Global map for datalist values

async function loadSuggestions(
    datalistId,
    tableName,
    CompanyID,
    valueField = 'PartyCode',
    displayField = 'PartyName'
) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;

    const { data, error } = await supabaseClient
        .from(tableName)
        .select(`${valueField}, ${displayField}`)
        .eq('company_id', CompanyID)
        .order(displayField, { ascending: true });

    if (error) {
        console.error(`Error loading ${tableName}:`, error);
        return;
    }

    datalist.innerHTML = '';
    const map = {};

    data.forEach(item => {
        const option = document.createElement('option');
        option.value = item[displayField];
        datalist.appendChild(option);
        map[item[displayField]] = item[valueField];
    });

    suggestionMaps[datalistId] = map;

    // Attach mapping function
    attachPartyCodeFiller('partyNameReg', datalistId, 'partyCodes');
    attachPartyCodeFiller('serviceProvider', 'vendorSuggestions', 'serviceProviderCode');
    attachPartyCodeFiller('userID', 'userLoginSuggestions', 'userName');
    attachPartyCodeFiller('partyName', 'partySuggestions', 'partyCode');
    attachPartyCodeFiller('customerName', 'customerNameSuggestions', 'partyCode');
    attachPartyCodeFiller('consignorName', 'consignorNameSuggestions', 'consignorCode');
    attachPartyCodeFiller('serviceProviderName', 'serviceProviderSuggestions', 'serviceProviderCode');
    attachPartyCodeFiller('vendorName', 'vendorSuggestions', 'vendorCode');
    attachPartyCodeFiller('carrierName', 'carrierSuggestions', 'carrierCode');
}


// ✅ Auto-fill party code based on selected party name
function attachPartyCodeFiller(inputId, datalistId, codeFieldId) {
    const input = document.getElementById(inputId);
    const codeField = document.getElementById(codeFieldId);
    if (!input || !codeField) return;

    input.addEventListener('input', () => {
        const typedValue = input.value.trim();
        const map = suggestionMaps[datalistId] || {};
        const code = map[typedValue] || '';
        codeField.value = code;
    });
}


// ✅ Validate individual field with test function
function validateField(selector, testFn, message) {
    const $el = $(selector);
    const value = $el.val().trim();
    const $feedback = $el.next('.invalid-feedback');
    const isValid = testFn(value);

    if (!isValid) {
        $el.addClass('is-invalid');
        if (!$feedback.length) $el.after(`<div class="invalid-feedback">${message}</div>`);
    } else {
        $el.removeClass('is-invalid');
        $feedback.remove();
    }

    return isValid;
}

// ✅ Validate form based on multiple validation rules
function validateForm(rules) {
    return rules.map(rule =>
        validateField(rule.selector, rule.test, rule.message)
    ).every(Boolean);
}

// ✅ Disable buttons and optionally parent containers
function disableButtons(selector, disableParents = true) {
    const $buttons = $(selector);
    if ($buttons.length) {
        $buttons.each(function () {
            $(this).prop("disabled", true);
            if (disableParents) $(this).closest("form, fieldset").prop("disabled", true);
        });
        console.log(`Disabled buttons: "${selector}"`);
    } else {
        console.warn(`No buttons for selector: "${selector}"`);
    }
}

// ✅ Toggle button enable/disable with optional delay and parent toggle
function toggleButtons(selector, shouldEnable = true, toggleParents = true) {
    setTimeout(() => {
        const $buttons = $(selector);
        $buttons.each(function () {
            $(this).prop('disabled', !shouldEnable);
            if (toggleParents) $(this).closest("form, fieldset").prop('disabled', !shouldEnable);
        });
    }, 100);
}

// ✅ Force input to uppercase letters only (no numbers/symbols)
function enforceUppercaseOnly(inputElement) {
    if (!inputElement) return;

    inputElement.addEventListener('input', function () {
        const cursorPos = this.selectionStart;
        this.value = this.value.toUpperCase().replace(/[^A-Z]/g, '');
        this.setSelectionRange(cursorPos, cursorPos);
    });

    inputElement.addEventListener('paste', function (e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        document.execCommand('insertText', false, text.toUpperCase().replace(/[^A-Z]/g, ''));
    });
}

// ✅ Fetch ports from Supabase filtered by name
async function fetchPortList(term = '', limit = 20) {
    const { data, error } = await supabaseClient
        .from('PortsDetails')
        .select('PortName, PortCode, PortCountry')
        .ilike('PortName', `%${term}%`)
        .order('PortName')
        .limit(limit);

    if (error) {
        console.error('Error fetching ports:', error.message);
        return [];
    }

    return data;
}

// ✅ Populate datalist with port data
function populateDatalist(datalistId, ports) {
    const datalist = document.getElementById(datalistId);
    datalist.innerHTML = '';
    ports.forEach(port => {
        const option = document.createElement('option');
        option.value = `${port.PortName} (${port.PortCode}) - ${port.PortCountry}`;
        datalist.appendChild(option);
    });
}
//convertCurrency
// ✅ Convert currency using external API
// Note: This function uses a free API with limited requests. Consider using a paid service for production.
async function convertCurrency({ amount, from = 'INR', to = 'INR' }) {
    if (!amount || from === to) return amount;

    const apiKey = 'tg31lpk5smo4matn3tj4i8rrh58bn3sct63909f2og8aaertivioa8';
    const url = `https://anyapi.io/api/v1/exchange/convert?apiKey=${apiKey}&base=${from}&to=${to}&amount=${amount}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.converted) {
            return data.converted;
        } else {
            console.warn("Currency conversion failed:", data);
            return null;
        }
    } catch (error) {
        console.error("Error during currency conversion:", error);
        return null;
    }
}


// ✅ Set a message for an empty table body
// This function will replace the content of a table body with a message when there are no rows
function setEmptyTableMessage(tableBodyId, message) {
    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center">${message}</td></tr>`;
    }
}
// ✅ Validate GST input with Supabase check
// This function checks the GST input against a regex pattern and queries Supabase for duplicates
async function validateGSTInput(
    gstInputElementID,
    feedbackElementID,
    tableName = 'company_profile',
    fieldName = 'gst_number') {

    const input = document.getElementById(gstInputElementID);
    const feedback = document.getElementById(feedbackElementID);
    const gstInput = input.value.trim().toUpperCase();
    input.value = gstInput; // Ensure uppercase in the input field

    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    if (!gstRegex.test(gstInput)) {
        showInvalidGST('Invalid GST format.');
        return false;
    }

    const { data, error } = await supabaseClient
        .from(tableName)
        .select('*')
        .eq(fieldName, gstInput);

    if (error) {
        console.error('Error checking GST:', error.message);
        showInvalidGST('Error validating GST.');
        return false;
    }

    // If duplicate exists and not editing the same record
    if (data.length > 0) {
        showInvalidGST('Duplicate GST Number found.');
        return false;
    }

    hideInvalidGST();
    return true;

    function showInvalidGST(msg) {
        feedback.textContent = msg;
        feedback.classList.remove('d-none');
        input.classList.add('is-invalid');
    }

    function hideInvalidGST() {
        feedback.classList.add('d-none');
        input.classList.remove('is-invalid');
    }
}
// ✅ Validate PAN input with regex and Supabase check
async function validatePANInput(
    panInputElementID,
    feedbackElementID,
    tableName = 'company_profile',
    fieldName = 'pan_number') {

    const input = document.getElementById(panInputElementID);
    const feedback = document.getElementById(feedbackElementID);
    const panInput = input.value.trim().toUpperCase();
    input.value = panInput; // Ensure uppercase in the input field

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    if (!panRegex.test(panInput)) {
        showInvalidPAN('Invalid PAN format.');
        return false;
    }

    const { data, error } = await supabaseClient
        .from(tableName)
        .select('*')
        .eq(fieldName, panInput);

    if (error) {
        console.error('Error checking PAN:', error.message);
        showInvalidPAN('Error validating PAN.');
        return false;
    }

    // If duplicate exists and not editing the same record
    if (data.length > 0) {
        showInvalidPAN('Duplicate PAN Number found.');
        return false;
    }

    hideInvalidPAN();
    return true;

    function showInvalidPAN(msg) {
        feedback.textContent = msg;
        feedback.classList.remove('d-none');
        input.classList.add('is-invalid');
    }

    function hideInvalidPAN() {
        feedback.classList.add('d-none');
        input.classList.remove('is-invalid');
    }
}

let bankMap = {}; // Global mapping: DisplayName -> BankID
let bankID = null; // Selected Bank ID
let bankIDs = null; // Selected Bank ID

// Load bank suggestions from Supabase
async function loadBankNameSuggestions() {
    const datalist = document.getElementById('bankNameSuggestions');
    if (!datalist) {
        // console.warn('Datalist element not found.');
        return;
    }

    datalist.innerHTML = '';
    bankMap = {}; // Clear previous suggestions

    try {
        const { data, error } = await supabaseClient
            .from('CompanyBankDetails')
            .select('id, BankName, AccountNo')
            .eq('CompanyID', CompanyID);

        if (error) {
            // console.error('Error loading bank data:', error.message);
            return;
        }

        data.forEach(bank => {
            const lastFour = bank.AccountNo.slice(-4);
            const displayName = `${bank.BankName} - ${lastFour}`;
            bankMap[displayName] = bank.id;

            const option = document.createElement('option');
            option.value = displayName;
            datalist.appendChild(option);
        });

    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

// Function to handle bank selection
function handleBankSelection() {
    const bankInput = document.getElementById('inputBankName');
    const bankIDInput = document.getElementById('bankIDs');

    if (!bankInput || !bankIDInput) {
        // console.warn('Required elements not found');
        return;
    }

    // Input event - fires when user types or selects from datalist
    bankInput.addEventListener('input', function () {
        const selectedBankName = this.value.trim();
        // console.log('Selected Bank Name:', selectedBankName, bankMap);

        // Set the bank ID
        if (bankMap[selectedBankName] !== undefined) {
            bankIDInput.value = bankMap[selectedBankName];
            // console.log('Bank ID set to:', bankMap[selectedBankName]);
        } else {
            bankIDInput.value = '';
            // console.log('No matching bank ID found');
        }
    });

    // Change event - fires when input loses focus
    bankInput.addEventListener('change', function () {
        const selectedBankName = this.value.trim();

        if (bankMap[selectedBankName] !== undefined) {
            bankIDInput.value = bankMap[selectedBankName];
            // console.log('Bank ID confirmed:', bankMap[selectedBankName]);
        }
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    loadBankNameSuggestions();
    setTimeout(handleBankSelection, 300);
});


// Load the default bank and set the input values
async function loadDefaultBank() {
    try {
        const { data, error } = await supabaseClient
            .from('CompanyBankDetails')
            .select('id, BankName, AccountNo')
            .eq('CompanyID', CompanyID)
            .eq('DefaultBank', 'Yes');

        if (error) throw error;

        if (data.length === 0) {
            console.warn('No default bank found.');
            return null;
        }

        const { id, BankName, AccountNo } = data[0]; // Pick first
        const lastFourDigits = AccountNo.slice(-4);
        const displayName = `${BankName} - ${lastFourDigits}`;

        const bankNameInput = document.getElementById('bankName');
        const bankIDInput = document.getElementById('bankIDs');
        const hiddenInput = getOrCreateHiddenBankInput();

        if (!bankNameInput)
            // console.warn('Element with ID "bankName" not found.')
            ;
        if (!bankIDInput)
            // console.warn('Element with ID "bankIDs" not found.')
            ;

        if (bankNameInput) bankNameInput.value = displayName;
        if (hiddenInput) {
            hiddenInput.value = displayName;
            hiddenInput.setAttribute('data-bank-id', id);
        }
        if (bankIDInput) bankIDInput.value = id;

        bankID = id; // ✅ Store in global variable
        bankIDs = id;

        return id;
    } catch (err) {
        // console.error('Error loading default bank:', err.message);
        return null;
    }
}

async function loadAllBanks() {
    const datalist = document.getElementById('bankNameSuggestions');

    datalist.innerHTML = '';
    bankMap = {};

    const { data, error } = await supabaseClient
        .from('CompanyBankDetails')
        .select('id, BankName, AccountNo')
        .eq('CompanyID', CompanyID);

    if (error) return;

    data.forEach(bank => {
        const displayName = `${bank.BankName} - ${bank.AccountNo.slice(-4)}`;

        bankMap[displayName] = bank.id;

        const option = document.createElement('option');
        option.value = displayName;
        datalist.appendChild(option);
    });
}

// Create hidden input if not present
function getOrCreateHiddenBankInput() {
    let hiddenInput = document.getElementById('inputBankName');
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = 'inputBankName';
        document.body.appendChild(hiddenInput);
    }
    return hiddenInput;
}

async function unlockShipmentRecord(shipId) {
    try {
        const { error } = await supabaseClient
            .from('international_booking')
            .update({
                IsLocked: false,
                LockedBy: null,
                LockedAt: null
            })
            .eq('id', shipId);

        if (error) {
            // console.error('Error unlocking shipment:', error.message);
        } else {
            console.log(`Shipment ${shipId} unlocked successfully.`);
        }
    } catch (err) {
        console.error('Error unlocking shipment:', err.message);
    }
}

async function unlockShipmentRecord_cc(shipId) {
    try {
        const { error } = await supabaseClient
            .from('CustomsClearance_Details')
            .update({
                IsLocked: false,
                LockedBy: null,
                LockedAt: null
            })
            .eq('id', shipId);

        if (error) {
            // console.error('Error unlocking shipment:', error.message);
        } else {
            console.log(`Shipment ${shipId} unlocked successfully.`);
        }
    } catch (err) {
        console.error('Error unlocking shipment:', err.message);
    }
}

async function unlockShipmentRecord_ftl(shipId) {
    try {
        const { error } = await supabaseClient
            .from('FullLoadBookingDetails')
            .update({
                IsLocked: false,
                LockedBy: null,
                LockedAt: null
            })
            .eq('id', shipId);

        if (error) {
            // console.error('Error unlocking shipment:', error.message);
        } else {
            console.log(`Shipment ${shipId} unlocked successfully.`);
        }
    } catch (err) {
        console.error('Error unlocking shipment:', err.message);
    }
}


async function autoUnlockRecords(tableName = 'international_booking') {
    if (lockedBookingIds.length === 0) return;

    try {
        const { error } = await supabaseClient
            .from(tableName)
            .update({
                IsLocked: false,
                LockedBy: null,
                LockedAt: null
            })
            .in('id', lockedBookingIds);

        if (error) throw error;

        console.log('Records unlocked automatically.');

        // Clear the locked IDs and timer
        lockedBookingIds = [];
        if (autoUnlockTimer) {
            clearTimeout(autoUnlockTimer);
            autoUnlockTimer = null;
        }

    } catch (err) {
        console.error('Error auto-unlocking records:', err.message);
    }
}

let autoUnlockTimer = null;

function startAutoUnlockTimer() {
    // Auto-unlock after 10 minutes (600,000 ms)
    autoUnlockTimer = setTimeout(() => {
        autoUnlockRecords();
    }, 600000);
}

function resetAutoUnlockTimer() {
    if (autoUnlockTimer) {
        clearTimeout(autoUnlockTimer);
    }
    startAutoUnlockTimer();
}

async function getPartyDetailsByCode(partyCode) {
    try {
        // console.log('Fetching party details for code:', partyCode);
        const { data, error } = await supabaseClient
            .from('PartyDetails')
            .select('*')
            .eq('PartyCode', partyCode)
            .eq('company_id', CompanyID)
            .single(); // Expecting one record per party code

        if (error) throw error;

        return data || null;
    } catch (err) {
        console.error('Error fetching party details:', err.message);
        return null;
    }
}

async function getBankNameByCode(bankID) {
    try {
        const { data, error } = await supabaseClient
            .from('CompanyBankDetails')
            .select('id, BankName, AccountNo')
            .eq('CompanyID', CompanyID)
            .eq('id', bankID)
            .single();

        if (error) throw error;

        if (!data) {
            console.warn('No default bank found.');
            return null;
        }

        const { id, BankName, AccountNo } = data;
        const lastFourDigits = AccountNo.slice(-4);
        const displayName = `${BankName} - ${lastFourDigits}`;

        const bankNameInput = document.getElementById('bankName');
        const bankIDInput = document.getElementById('bankIDs');
        const hiddenInput = getOrCreateHiddenBankInput();

        if (bankNameInput) bankNameInput.value = displayName;
        hiddenInput.value = displayName;
        hiddenInput.setAttribute('data-bank-id', id);
        bankIDInput.value = id;

        return id;
    } catch (err) {
        console.error('Error loading default bank:', err.message);
        return null;
    }
}

async function loadInvoiceNoSuggestions() {
    const datalist = document.getElementById('invoiceNoSuggestions');
    if (!datalist) {
        // console.warn('Datalist element with ID "invoiceNoSuggestions" not found.');
        return;
    }

    datalist.innerHTML = ''; // Clear previous options

    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const { data, error } = await supabaseClient
                .from('InvoiceDetails')
                .select('InvoiceNo')
                .eq('company_id', CompanyID)
                .order('InvoiceNo', { ascending: false }) // ✅ Order ASC
                .range(from, from + batchSize - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                data.forEach(invoice => {
                    const option = document.createElement('option');
                    option.value = invoice.InvoiceNo;
                    datalist.appendChild(option);
                });

                from += batchSize;
                hasMore = data.length === batchSize; // Continue if full batch fetched
            } else {
                hasMore = false;
            }
        }
    } catch (err) {
        // console.error('Error loading invoice suggestions:', err.message);
    }
}

function fitMultilineText(el, maxFontSize = 18, minFontSize = 8) {
    const element = typeof el === 'string' ? document.querySelector(el) : el;
    if (!element) return;

    let fontSize = maxFontSize;
    element.style.fontSize = fontSize + 'px';

    while ((element.scrollHeight > element.offsetHeight || element.scrollWidth > element.offsetWidth) && fontSize > minFontSize) {
        fontSize--;
        element.style.fontSize = fontSize + 'px';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadDefaultBank();
    loadInvoiceNoSuggestions();
});

function numberToWordsIndian(amount) {
    const ones = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
        "Sixteen", "Seventeen", "Eighteen", "Nineteen"
    ];

    const tens = [
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
    ];

    function convertToWords(num) {
        let str = "";

        if (num > 9999999) {
            str += convertToWords(Math.floor(num / 10000000)) + " Crore ";
            num %= 10000000;
        }
        if (num > 99999) {
            str += convertToWords(Math.floor(num / 100000)) + " Lakh ";
            num %= 100000;
        }
        if (num > 999) {
            str += convertToWords(Math.floor(num / 1000)) + " Thousand ";
            num %= 1000;
        }
        if (num > 99) {
            str += convertToWords(Math.floor(num / 100)) + " Hundred ";
            num %= 100;
        }
        if (num > 0) {
            if (str !== "") str += "and ";
            if (num < 20) str += ones[num];
            else {
                str += tens[Math.floor(num / 10)];
                if (num % 10 > 0) str += " " + ones[num % 10];
            }
        }

        return str.trim();
    }

    // Split rupees and paise
    let [rupeesStr, paiseStr] = amount.toFixed(2).split(".");
    let rupees = parseInt(rupeesStr, 10);
    let paise = parseInt(paiseStr, 10);

    let result = "";
    if (rupees > 0) result += "Rupees " + convertToWords(rupees);
    if (paise > 0) result += " and Paise " + convertToWords(paise);
    result += " Only";

    return result;
}

// ✅ Function to update delivery address based on consignee details
async function consigneeDetails(query, typeOfValue, datalistId) {
    // console.log('Fetching consignee...' + CompanyID);

    const datalist = document.getElementById(datalistId);

    if (!query.trim()) {
        datalist.innerHTML = ''; // Clear suggestions if input is empty
        return;
    }

    try {
        const { data: consignee, error } = await supabaseClient
            .from('Consignee_Details')
            .select('ConsigneeName, ConsigneeAddress')
            .eq('Company_ID', CompanyID)
            .ilike('ConsigneeName', `%${query}%`);

        if (error) {
            console.error('Error fetching consignee details:', error);
            return;
        }

        let suggestions = consignee.map(row =>
            `<option value="${row.ConsigneeName}" data-address="${row.ConsigneeAddress}">${row.ConsigneeName}</option>`
        ).join('');

        // If no consignee is found, always add "Add New Consignee"
        if (consignee.length === 0) {
            suggestions += `<option value="Add New Consignee">Add New Consignee</option>`;
        }

        datalist.innerHTML = suggestions;
    } catch (error) {
        console.error('Error loading consignee details:', error);
    }
}

function updateDeliveryAddress() {
    const consigneeNameInput = document.getElementById('consigneeName');
    const deliveryAddressInput = document.getElementById('deliveryAddress');
    const selectedConsignee = consigneeNameInput.value;

    if (selectedConsignee === "Add New Consignee" || selectedConsignee === "Add New Consignor") {
        const modal = new bootstrap.Modal(document.getElementById('addConsigneeModal'));
        modal.show();
    }


    // Find matching option in datalist
    const options = document.getElementById('consigneeNameSuggestions').children;
    for (let option of options) {
        if (option.value === selectedConsignee) {
            deliveryAddressInput.value = option.getAttribute('data-address') || '';
            return;
        }
    }
}

function showModal() {
    document.getElementById('addConsigneeModal').style.display = 'block';
}

function hideModal() {
    const modalElement = document.getElementById('addConsigneeModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    if (modalInstance) {
        modalInstance.hide();
    }
}

async function addNewConsignee(event) {
    event.preventDefault(); // Prevent default form submission

    const newConsignee = {
        ConsigneeName: document.getElementById('newConsigneeName').value.trim(),
        ConsigneeAddress: document.getElementById('newConsigneeAddress').value.trim(),
        ContactPerson: document.getElementById('newContactPerson').value.trim(),
        ContactNumber: document.getElementById('newContactNumber').value.trim(),
        EmailID: document.getElementById('newEmailID').value.trim(),
        Company_ID: CompanyID,
        created_by: UserLoginID // Ensure `userID` is defined
    };

    // Ensure required fields are filled
    if (!newConsignee.ConsigneeName || !newConsignee.ConsigneeAddress || !newConsignee.ContactPerson ||
        !newConsignee.ContactNumber || !newConsignee.EmailID) {
        alert('Please fill in all required fields.');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('Consignee_Details')
            .insert([newConsignee]);

        if (error) {
            console.error('Error adding consignee:', error);
            alert('Failed to add consignee.');
            return;
        }

        alert('Consignee added successfully!');
        hideModal();

        // Update main form input fields after adding new consignee
        document.getElementById('consigneeName').value = newConsignee.ConsigneeName;
        document.getElementById('deliveryAddress').value = newConsignee.ConsigneeAddress;

        // Refresh consignee list
        consigneeDetails(newConsignee.ConsigneeName, 'ConsigneeName', 'consigneeNameSuggestions');
    } catch (error) {
        console.error('Error inserting consignee:', error);
    }
}

// Clearance Port Suggestions
const clearancePortInput = document.getElementById('clearancePort');
const clearanceCountryInput = document.getElementById('clearanceCountry') || null;
const datalistElement = document.getElementById('clearancePortSuggestions');

let currentSuggestions = [];

let selectedPortData = null;

async function updateSuggestionsAndCountry() {
    const query = clearancePortInput.value.trim();
    datalistElement.innerHTML = '';

    if (!query) return;

    const suggestions = await fetchPortSuggestions(query, 10);

    suggestions.forEach(({ label }) => {
        const option = document.createElement('option');
        option.value = label;
        datalistElement.appendChild(option);
    });

    const matched = suggestions.find(
        s => s.label.toLowerCase() === query.toLowerCase()
    );

    if (matched) {
        selectedPortData = matched.portDetails;

        // Optional UI update if field exists
        const clearanceCountryInput = document.getElementById('clearanceCountry');
        if (clearanceCountryInput) {
            clearanceCountryInput.value = selectedPortData.PortCountry;
        }
    }
}

/**
 * Fetch port suggestions from Supabase based on user input
 * @param {string} userInput - The search text typed by the user
 * @param {number} limit - Maximum number of suggestions to return (optional, default 10)
 * @returns {Promise<Array>} - Resolves to an array of suggestion objects
 */
async function fetchPortSuggestions(userInput, limit = 10) {
    if (!userInput || userInput.trim() === '') {
        // Return empty array if input is empty or just spaces
        return [];
    }

    try {
        const { data, error } = await supabaseClient
            .from('PortsDetails')
            .select('PortCode, PortName, PortCountry, PortType')
            .ilike('PortName', `%${userInput}%`)
            .limit(limit);

        if (error) {
            console.error('Error fetching port suggestions:', error);
            return [];
        }

        // Map to suggestion objects for UI consumption
        return data.map(port => ({
            label: `${port.PortName} (${port.PortCode}) - ${port.PortCountry}`,
            value: port.PortCode,
            portDetails: port, // full port object if needed
        }));
    } catch (err) {
        console.error('Unexpected error:', err);
        return [];
    }
}
// clearance Port Input Event Listener end
async function getPincodeDetails(pincode) {
    if (!pincode || typeof pincode !== 'string') {
        throw new Error('Invalid pincode');
    }

    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    if (!response.ok) {
        throw new Error(`Network error: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0 || data[0].Status !== "Success") {
        throw new Error('No data found for the given pincode');
    }

    // Extract the relevant fields from the first PostOffice entry
    const firstPostOffice = data[0].PostOffice && data[0].PostOffice[0];
    if (!firstPostOffice) {
        throw new Error('No PostOffice data available for the given pincode');
    }

    // Return object with Name, District, State, Country
    return {
        Name: firstPostOffice.Name || '',
        District: firstPostOffice.District || '',
        State: firstPostOffice.State || '',
        Country: firstPostOffice.Country || ''
    };
}
async function getPartyDetailsByCode(paryCode) {
    if (!paryCode || typeof paryCode !== 'string') {
        throw new Error('Invalid paryCode');
    }
    try {
        const { data, error } = await supabaseClient
            .from('PartyDetails')
            .select('*')
            .eq('PartyCode', paryCode)
            .eq('company_id', CompanyID)
            .limit(1);

        if (error) throw error;
        if (data.length === 0) throw new Error('No data found for the given paryCode');

        return data[0];  // Return entire row object

    } catch (error) {
        console.error('Error fetching PartyDetails:', error.message);
        return null;
    }
}

function getGSTValue(label, str) {
    const regex = new RegExp(label + "\\s*(\\d+)%", "i");
    const match = str.match(regex);
    return match ? parseFloat(match[1]) : 0;
}

// ✅ Show toast notification with message
function showToast(message) {
    const toastElement = document.getElementById("errorToast");
    document.getElementById("errorToastMessage").textContent = message;

    const toast = new bootstrap.Toast(toastElement);
    toast.show();
}

async function getCompanyProfile(companyId) {
    try {
        const { data, error } = await supabaseClient
            .from('company_profile')
            .select('*')
            .eq('company_id', companyId)
            .single();

        if (error) throw error;
        if (data) return data;
    } catch (error) {
        console.error('Error fetching company profile:', error.message);
        return null;
    }
}
async function getPartyProfile(partyCode) {
    try {
        const { data, error } = await supabaseClient
            .from('PartyDetails')
            .select('*')
            .eq('PartyCode', partyCode)
            .single();

        if (error) throw error;
        if (data) return data;
    } catch (error) {
        console.error('Error fetching Party profile:', error.message);
        return null;
    }
}

/**
 * Auto-insert new value from input into dropdown_list table
 * if it doesn't already exist in the datalist.
 *
 * @param {HTMLInputElement} inputEl
 * @param {string} datalistId
 * @param {string} valueType        // e.g. 'Department', 'Designation'
 */
async function handleDatalistInsert(inputEl, datalistId, valueType) {
    const value = inputEl.value.trim();
    if (!value) return;

    const datalist = document.getElementById(datalistId);
    if (!datalist) {
        console.warn(`Datalist not found: ${datalistId}`);
        return;
    }

    // Check existing option (case-insensitive)
    const exists = Array.from(datalist.options)
        .some(opt => opt.value.toLowerCase() === value.toLowerCase());

    if (exists) return;

    // Insert into DB
    const { error } = await supabaseClient
        .from('dropdown_list')
        .insert([{
            description: value,
            type_of_value: valueType,
            company_id: CompanyID,
            created_by: UserLoginID,
            created_at: new Date().toISOString()
        }]);

    if (error) {
        console.error(`Insert ${valueType} Error:`, error);
        showToast?.('error', `Failed to save ${valueType}`) || alert(`Failed to save ${valueType}`);
        return;
    }

    // Add to datalist immediately
    const option = document.createElement('option');
    option.value = value;
    datalist.appendChild(option);
}

/**
 * Load values from dropdown_list table into a datalist
 *
 * @param {string} datalistId       // e.g. 'departmentList'
 * @param {string} valueType        // e.g. 'Department'
 */
async function loadDatalist(datalistId, valueType) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) {
        console.warn(`Datalist not found: ${datalistId}`);
        return;
    }


    // console.log(`Loading datalist for: ${valueType}`);
    datalist.innerHTML = '';

    const { data, error } = await supabaseClient
        .from('dropdown_list')
        .select('description')
        .eq('type_of_value', valueType)
        .in('company_id', ['All', CompanyID])
        .order('description', { ascending: true });


    if (error) {
        console.error(`Error loading ${valueType}:`, error);
        return;
    }

    if (!data || data.length === 0) {
        // console.warn(`No values found for ${valueType}`);
        return;
    }

    data.forEach(({ description }) => {
        const option = document.createElement('option');
        option.value = description; // ✅ REQUIRED for datalist
        datalist.appendChild(option);
    });
}

function showSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.remove('d-none');
}
function hideSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.add('d-none');
}

function safeRect(doc, x, y, w, h) {
    if ([x, y, w, h].every(v => Number.isFinite(v))) {
        doc.rect(x, y, w, h);
    }
}
// Load image safely
async function loadImage(url) {
    return new Promise((resolve) => {

        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = () => {

            const canvas = document.createElement("canvas");

            const scale = Math.min(1, 500 / img.width);

            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            resolve(canvas);   // <-- Return canvas

        };

        img.onerror = () => resolve(null);

        img.src = url;
    });
}
function safeNumber(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : Number(n.toFixed(2));
}

async function getInvoiceBankDetails(invoiceNo) {
    try {
        const invNo = invoiceNo.trim();
        const { data: invoice, error: invError } = await supabaseClient
            .from('InvoiceDetails')
            .select('BankID')
            .eq('InvoiceNo', invNo)
            .eq('company_id', CompanyID)
            .limit(1)

        const { data, error } = await supabaseClient
            .from('CompanyBankDetails')
            .select('*')
            .eq('CompanyID', CompanyID)
            .eq('id', invoice?.[0]?.BankID)
            .limit(1)
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Error fetching invoice bank details:', err.message);
        return null;
    };
}

async function loadUserTypes() {
    try {
        const { data, error } = await supabaseClient
            .from('Roles')
            .select('id, Types')
            .gt('id', 1) // Exclude Superuser
            .order('Types', { ascending: true });

        if (error) throw error;
        console.log('User types data:', data);
        const select = document.getElementById('userType');
        select.innerHTML = '<option value="">Select User Type</option>';

        data.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;   // stored value
            option.textContent = type.Types; // display
            select.appendChild(option);
        });

        console.log(`Loaded ${data.length} user types`);

    } catch (err) {
        console.error('Failed to load user types:', err);
        alert('Unable to load User Types');
    }
}

async function getUserWorkingBranch(empID) {
    try {
        const { data, error } = await supabaseClient
            .from('EmployeeWorkingDetails')
            .select('WorkLocation')
            .eq('EM_ID', empID)
            .order('EffectiveDate', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return data?.WorkLocation || WorkingBranch;
    } catch (err) {
        console.error('Error fetching user working branch:', err.message);
        return null;
    }
}

function createLoader() {
    if (document.getElementById('loadingOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'position-fixed top-0 start-0 w-100 h-100 d-none d-flex align-items-center justify-content-center';
    overlay.style.cssText = 'background: rgba(255,255,255,0.6); z-index:1055;';

    const spinner = document.createElement('div');
    spinner.className = 'spinner-border text-primary';
    spinner.setAttribute('role', 'status');

    const hiddenText = document.createElement('span');
    hiddenText.className = 'visually-hidden';
    hiddenText.textContent = 'Loading...';

    spinner.appendChild(hiddenText);
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);
}

function showLoader() {
    createLoader();
    document.getElementById('loadingOverlay')?.classList.remove('d-none');
}

function hideLoader() {
    document.getElementById('loadingOverlay')?.classList.add('d-none');
}
/*************************************************
 * Helpers
 *************************************************/
function capitalize(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function canModify() {
    const USER_TYPE = Number(UserType)
    return USER_TYPE === 1 || USER_TYPE === 2;
}

function createCell(text) {
    const td = document.createElement('td');
    td.textContent = text ?? '';
    return td;
}

// Escape quotes to safely inject into HTML
function escapeQuotes(str) {
    return str.replace(/'/g, "\\'");
}

function initDatalistValidation() {

    const inputs = document.querySelectorAll('input[data-force-list="true"]');

    inputs.forEach(input => {

        const listId = input.dataset.listId;
        const list = document.getElementById(listId);
        if (!list) return;

        function validateValue() {

            const value = input.value.trim().toLowerCase();

            if (!value) return;

            const exists = Array.from(list.options)
                .some(opt => opt.value.toLowerCase() === value);

            if (!exists) {
                input.classList.add('is-invalid');
                input.classList.remove('is-valid');
            } else {
                input.classList.remove('is-invalid');
                input.classList.add('is-valid');
            }
        }

        input.addEventListener('blur', validateValue);
        input.addEventListener('input', () => {
            input.classList.remove('is-invalid');
        });
    });
}

async function paymentDetails(invoiceNumber) {
    try {
        const { data, error } = await supabaseClient
            .from("PaymentLineItems")
            .select("*")
            .eq("InvoiceNo", invoiceNumber);

        if (error) throw error;

        let totalPayment = 0;
        let totalOtherDeduction = 0;
        let totalTDS = 0;

        data.forEach(row => {
            totalPayment += Number(row.PaymentAmount) || 0;
            totalOtherDeduction += Number(row.OtherDeductionAmount) || 0;
            totalTDS += Number(row.TDSDeductionAmount) || 0;
        });

        return {
            rows: data,
            totalPayment,
            totalOtherDeduction,
            totalTDS,
            totalReceived:
                totalPayment + totalOtherDeduction + totalTDS
        };

    } catch (err) {
        console.error("Payment details load failed:", err);
        return {
            rows: [],
            totalPayment: 0,
            totalOtherDeduction: 0,
            totalTDS: 0,
            totalReceived: 0
        };
    }
}

async function advancedPaymentDetails(invoiceNumber, invoiceDate) {

    try {
        const { data, error } = await supabaseClient
            .from("PaymentDetails") // ✅ MAIN TABLE
            .select(`
                PaymentID,
                ReceiptOn,
                PaymentLineItems!inner (
                    InvoiceNo,
                    PaymentAmount,
                    OtherDeductionAmount,
                    TDSDeductionAmount
                )
            `)
            .lte("ReceiptOn", invoiceDate) // ✅ filter on parent
            .eq("PaymentLineItems.InvoiceNo", invoiceNumber); // ✅ filter on child

        if (error) throw error;

        let totalPayment = 0;
        let totalOtherDeduction = 0;
        let totalTDS = 0;
        let rows = [];

        data.forEach(payment => {
            const items = payment.PaymentLineItems || [];

            items.forEach(row => {
                totalPayment += Number(row.PaymentAmount) || 0;
                totalOtherDeduction += Number(row.OtherDeductionAmount) || 0;
                totalTDS += Number(row.TDSDeductionAmount) || 0;

                // Optional: flatten rows
                rows.push({
                    ...row,
                    ReceiptOn: payment.ReceiptOn
                });
            });
        });

        return {
            rows,
            totalPayment,
            totalOtherDeduction,
            totalTDS,
            totalReceived:
                totalPayment + totalOtherDeduction + totalTDS
        };

    } catch (err) {
        console.error("Payment details load failed:", err);
        return {
            rows: [],
            totalPayment: 0,
            totalOtherDeduction: 0,
            totalTDS: 0,
            totalReceived: 0
        };
    }
}

// Validate container number based on ISO 6346 standard
function validateContainerNumber(containerNumber) {
    // Ensure input is uppercase
    containerNumber = containerNumber.toUpperCase().trim();

    // Basic format check
    const regex = /^[A-Z]{3}[UJZ]\d{6}\d$/;
    if (!regex.test(containerNumber)) {
        return { valid: false, error: "Invalid Container Number" };
    }

    const charMap = {
        A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18,
        I: 19, J: 20, K: 21, L: 23, M: 24, N: 25, O: 26, P: 27,
        Q: 28, R: 29, S: 30, T: 31, U: 32, V: 34, W: 35, X: 36,
        Y: 37, Z: 38
    };

    const base = 2;
    let sum = 0;

    for (let i = 0; i < 10; i++) {
        const char = containerNumber[i];
        let value;

        if (i < 4) {
            value = charMap[char];
            if (!value) return { valid: false, error: `Invalid character '${char}' in prefix` };
        } else {
            value = parseInt(char, 10);
        }

        sum += value * (1 << i);   // faster (2^i)
    }

    const expectedCheckDigit = sum % 11 % 10;
    const actualCheckDigit = parseInt(containerNumber[10], 10);

    return {
        valid: expectedCheckDigit === actualCheckDigit,
        containerNumber,
        parts: {
            ownerPrefix: containerNumber.slice(0, 3),
            category: containerNumber[3],
            serial: containerNumber.slice(4, 10),
            checkDigit: actualCheckDigit
        },
        calculatedCheckDigit: expectedCheckDigit
    };
}

async function getRoutesDatalist() {
    try {
        const { data, error } = await supabaseClient
            .from('route_master')
            .select('*')
            .eq('company_id', CompanyID)
            .order('route_description', { ascending: true });

        if (error) throw error;

        return data || [];
    } catch (err) {
        console.error("Routes datalist load failed:", err);
        return [];
    }
}

async function loadRouteSuggestions() {

    const routes = await getRoutesDatalist();

    const datalist = document.getElementById("routeSuggestions");
    datalist.innerHTML = "";

    routes.forEach(route => {
        const option = document.createElement("option");
        option.value = route.route_description;
        option.dataset.routeId = route.id; // optional if you need route id later
        datalist.appendChild(option);
    });
}

function safeAmount(val) {
    return (parseFloat(val) || 0);
}

function round2(v) {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

function checkPageBreak(doc, y, height, PAGE) {
    if (y + height > PAGE.h - 10) {
        doc.addPage();
        return PAGE.x;
    }
    return y;
}

// Load courier suggestions for autocomplete 
async function loadCourierSuggestions() {
    const datalist = document.getElementById('courierSuggestions');
    if (!datalist) return;

    try {
        const { data, error } = await supabaseClient
            .from('CourierRegistration')
            .select('CourierCode, CourierName')
            .eq('company_id', CompanyID)
            .order('CourierName', { ascending: true });

        if (error) throw error;

        datalist.innerHTML = '';

        // ✅ If no data
        if (!data || data.length === 0) {
            const option = document.createElement('option');
            option.value = 'No data found';
            option.disabled = true; // won't be selectable
            datalist.appendChild(option);
            return;
        }

        // ✅ Normal data
        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.CourierName;
            option.dataset.code = item.CourierCode;
            datalist.appendChild(option);
        });

    } catch (err) {
        console.error('Error loading courier list:', err);

        // ✅ Error fallback
        datalist.innerHTML = '';
        const option = document.createElement('option');
        option.value = 'Error loading data';
        option.disabled = true;
        datalist.appendChild(option);
    }
}


// Fuel Surcharge Logic 
// when user selects a party code, load fuel surcharge data for that party and populate the table
// Also provide a function to fetch applicable fuel surcharge based on movement type, mode and booking date (for invoice calculation)
// Data structure in fuelSurchargeList: [{effectiveDate, movementType, modeType, percentage, Description, fuelType}]
// Table columns: Sr. No., Effective Date, Movement Type, Mode, Fuel Surcharge %, Description, Fuel Type, Actions
// if no data, show "No data" row spanning all columns

function mapFSC(row) {
    return {
        id: row.id,
        partyId: row.PartyID,
        effectiveDate: row.EffectiveDate,
        mode: row.Mode,
        movementType: row.MovementType,
        fuelSurcharge: Number(row.FuelSurcharge),
        description: row.Description,
        fscType: row.FSCType
    };
}

async function getFSCCharges({
    partyCode,
    carrierCode,
    movementType,
    modeType,
    bookingDate
}) {
    try {

        const isFSCApplicableToParty = await fscApplicabletoParty(partyCode); // Check if FSC is applicable to the party

        if (!isFSCApplicableToParty) {
            return null;
        }

        const mt = movementType;
        const md = modeType;

        const orCondition = `
            and(MovementType.eq.${mt},Mode.eq.${md}),
            and(MovementType.eq.All,Mode.eq.${md}),
            and(MovementType.eq.${mt},Mode.eq.All),
            and(MovementType.eq.All,Mode.eq.All)
        `.replace(/\s+/g, '');


        const baseQuery = (query) =>
            query
                .or(orCondition) // ✅ FIXED (no extra brackets)
                .eq('FSCType', 'Sell')
                .lte('EffectiveDate', bookingDate)
                .order('EffectiveDate', { ascending: false })
                .limit(1);

        // 🔸 1. Party-wise
        if (partyCode) {
            const { data, error } = await baseQuery(
                supabaseClient
                    .from('FuelSurcharge')
                    .select('*')
                    .eq('PartyID', partyCode)
            );

            if (error) throw error;
            if (data?.length) return mapFSC(data[0]);
        }

        // 🔸 2. Carrier-wise
        if (carrierCode) {
            const { data, error } = await baseQuery(
                supabaseClient
                    .from('FuelSurcharge')
                    .select('*')
                    .eq('PartyID', carrierCode)
            );

            if (error) throw error;
            if (data?.length) return mapFSC(data[0]);
        }

        // 🔸 3. Global fallback
        const { data: defaultData, error: defaultError } = await baseQuery(
            supabaseClient
                .from('FuelSurcharge')
                .select('*')
                .eq('PartyID', 'All')
        );

        if (defaultError) throw defaultError;
        if (defaultData?.length) return mapFSC(defaultData[0]);

        return null;

    } catch (err) {
        console.error("Error fetching fuel surcharge:", err);
        return null;
    }
}
async function isFSCApplicable(chargesType) {
    const { data, error } = await supabaseClient
        .from('dropdown_list')
        .select('condition, hsn_code')
        .eq('description', chargesType)
        .maybeSingle();

    if (error || !data) {
        return {
            isApplicable: false,
            hsn_code: null
        };
    }

    return {
        isApplicable: data.condition === 'fsc',
        hsn_code: data.hsn_code || null
    };
}

async function getFSCHSNFromDropdown() {
    const { data } = await supabaseClient
        .from('dropdown_list')
        .select('hsn_code')
        .eq('description', 'Fuel Surcharge')
        .maybeSingle();

    return data?.hsn_code || "";
}

async function fscApplicabletoParty(partyCode) {
    const { data, error } = await supabaseClient
        .from('FixedCharges')
        .select('ChargesType')
        .eq('PartyCode', partyCode)
        .eq('ChargesType', 'Fuel Surcharge')
        .maybeSingle();

    if (error || !data) {
        return false;
    }

    return true;
}

async function loadFOVModal() {

    if (chargesTypeInput.value !== 'FOV Charges') return;

    const invoiceValue =
        parseFloat(document.getElementById('invoiceValue').value) || 0;

    const fovPercentageInput =
        document.getElementById('fovPercentage');

    const fovAmountInput =
        document.getElementById('fovAmount');

    // Default percentage
    fovPercentageInput.value = 0.2;

    // Initial calculation
    calculateFOVAmount();

    // Recalculate when percentage changes
    fovPercentageInput.oninput = calculateFOVAmount;

    function calculateFOVAmount() {

        const fovPercentage =
            parseFloat(fovPercentageInput.value) || 0;

        const fovAmount =
            invoiceValue * (fovPercentage / 100);

        fovAmountInput.value = fovAmount.toFixed(2);
    }

    const modalElement =
        document.getElementById('addFOVChargesModal');

    const modal =
        bootstrap.Modal.getOrCreateInstance(modalElement);

    modal.show();
}

function addFOVCharges(event) {

    event.preventDefault();

    const fovPercentage =
        parseFloat(document.getElementById('fovPercentage').value) || 0;

    const fovAmount =
        parseFloat(document.getElementById('fovAmount').value) || 0;

    // Set values
    document.getElementById('freightAmount').value =
        fovAmount.toFixed(2);

    document.getElementById('remarksDetails').value =
        `FOV Charges ${fovPercentage}%`;

    // Close modal
    const modalElement =
        document.getElementById('addFOVChargesModal');

    const modal =
        bootstrap.Modal.getInstance(modalElement);

    modal.hide();
}

// ===============================
// Reusable Fuel Surcharge Modal
// ===============================


function getFSCTotal(tableId = 'freightTable') {

    let total = 0;

    // Get all rows
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);

    rows.forEach(row => {

        const cells = row.querySelectorAll('td');

        // Basic Amount = 5
        // FSC = 13
        const basicAmountCell = cells[4];
        const fscCell = cells[13];

        if (!basicAmountCell || !fscCell) return;

        const fscValue = fscCell.textContent.trim().toLowerCase();

        // Only FSC = Yes
        if (fscValue === 'yes') {

            const amount = parseFloat(
                basicAmountCell.textContent
                    .replace(/,/g, '')
                    .replace(/[^\d.-]/g, '')
            ) || 0;

            total += amount;
        }
    });

    return total;
}

// =========================
// Calculate FSC Amount
// =========================
function calculateFSCAmount() {

    const totalAmount =
        parseFloat(document.getElementById('totalAmount').value) || 0;

    const percentage =
        parseFloat(document.getElementById('fuelSurchargePercentage').value) || 0;

    const surchargeAmount = (totalAmount * percentage) / 100;

    document.getElementById('fuelSurchargeAmount').value =
        surchargeAmount.toFixed(2);
}

// =========================
// Load FSC Modal
// =========================
async function loadFSCModal() {

    if (chargesTypeInput.value !== 'Fuel Surcharge') return;

    // Get FSC Eligible Total
    const invoiceValue = getFSCTotal();

    // Set Total Amount
    document.getElementById('totalAmount').value = invoiceValue.toFixed(2);

    // Default FSC Percentage
    document.getElementById('fuelSurchargePercentage').value = 35;

    // Initial Calculation
    calculateFSCAmount();

    // Recalculate on Percentage Change
    document.getElementById('fuelSurchargePercentage').oninput = calculateFSCAmount;

    // Show Modal
    const modalElement = document.getElementById('addFuelSurchargeModal');

    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

    modal.show();
}

function addFuelSurcharge(event) {

    event.preventDefault();

    const fscPercentage =
        parseFloat(document.getElementById('fuelSurchargePercentage').value) || 0;

    const fscAmount =
        parseFloat(document.getElementById('fuelSurchargeAmount').value) || 0;

    // Set values
    document.getElementById('freightAmount').value =
        fscAmount.toFixed(2);

    document.getElementById('remarksDetails').value =
        `Fuel Surcharge ${fscPercentage}%`;
    fscPercentManual = fscPercentage;
    // Close modal
    const modalElement =
        document.getElementById('addFuelSurchargeModal');

    const modal =
        bootstrap.Modal.getInstance(modalElement);

    modal.hide();
}

// ==========================================
// GET TERMS & CONDITIONS FOR PDF
// ==========================================
async function getTermsAndConditions(companyID) {

    try {
        // console.log("companyID", companyID);
        const { data, error } = await supabaseClient
            .from("CompanyTandCs")
            .select("Description")
            .eq("CompanyID", companyID)
            .order("id", {
                ascending: true
            });

        if (error) throw error;
        // console.log("Terms & Conditions data:", data);
        return data || [];

    } catch (err) {

        console.error(
            "Error fetching Terms & Conditions:",
            err
        );

        return [];

    }

}

function escapeHtml(str = "") {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
// ================
// Tabbing Date
// ================
function enableCustomTab(selector) {
    document.querySelectorAll(selector).forEach(el => {
        el.addEventListener("keydown", function (e) {
            if (e.key === "Tab") {
                e.preventDefault();

                const fields = Array.from(
                    document.querySelectorAll(
                        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
                    )
                ).filter(x => x.offsetParent !== null);

                const index = fields.indexOf(this);

                if (index > -1 && fields[index + 1]) {
                    fields[index + 1].focus();
                }
            }
        });
    });
}

// Usage
enableCustomTab('input[type="date"]');



// Load Account Master Suggestions
const accountMaps = {};

async function loadAccountSuggestions(datalistId, inputId, hiddenCodeId, companyId, accountTypes = []) {
    try {
        let query = supabaseClient
            .from("AccountMasterView")
            .select("AccountCode, AccountName, AccountType")
            .eq("company_id", companyId)
            .order("AccountName");

        if (accountTypes.length) {
            query = query.in("AccountType", accountTypes);
        }

        const { data, error } = await query;

        if (error) throw error;

        const datalist = document.getElementById(datalistId);
        const input = document.getElementById(inputId);
        const hiddenCode = document.getElementById(hiddenCodeId);

        datalist.innerHTML = "";
        accountMaps[datalistId] = {};

        data.forEach(item => {
            accountMaps[datalistId][item.AccountName] = item;

            const option = document.createElement("option");
            option.value = item.AccountName;
            datalist.appendChild(option);
        });

        // Remove previous handler if any
        input.oninput = function () {

            const selected = accountMaps[datalistId][this.value];

            if (selected) {
                hiddenCode.value = selected.AccountCode;
            } else {
                hiddenCode.value = "";
            }
        };

    } catch (err) {
        console.error("Error loading accounts:", err);
    }
}
// ======Load Only Vendors
// await loadAccountSuggestions('partySuggestionsList',CompanyID, ['Vendor']);

// ======Load Only Customers
// await loadAccountSuggestions('customerSuggestionsList', CompanyID, ['Customer']);

// ======Load Only Vendors + Courier
// await loadAccountSuggestions('partySuggestionsList', CompanyID, ['Vendor', 'Courier']);

// ======Load Only Employees
// await loadAccountSuggestions('employeeSuggestionsList', CompanyID, ['Employee']);

// ======Load Only Banks
// await loadAccountSuggestions('bankSuggestionsList', CompanyID, ['Bank']);

// ======Load Only Everything
// await loadAccountSuggestions('accountSuggestionsList', CompanyID);

async function loadBankAccounts(companyID, AccountType) {

    const ddl = document.getElementById("bankAccount");

    ddl.innerHTML = '<option value="">Loading...</option>';

    const { data, error } = await supabaseClient
        .from("AccountMasterView")
        .select("AccountCode, AccountName")
        .eq("company_id", companyID)
        .eq("AccountType", AccountType)
        .order("AccountName");

    if (error) {
        console.error(error);
        ddl.innerHTML = '<option value="">Error</option>';
        return;
    }

    ddl.innerHTML = '<option value="">Select Bank</option>';

    data.forEach(bank => {

        ddl.innerHTML += `
            <option value="${bank.AccountCode}">
                ${bank.AccountName}
            </option>`;
    });
}
const loadPdfLibs = () => {
    return new Promise((resolve) => {
        if (typeof jspdf !== 'undefined' && typeof jspdf.plugins !== 'undefined') {
            resolve();
            return;
        }
        const scripts = [
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js'
        ];
        let loaded = 0;
        scripts.forEach(src => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                loaded++;
                if (loaded === scripts.length) resolve();
            };
            document.head.appendChild(script);
        });
    });
};

async function loadExportLibraries() {
    if (!window.XLSX) {
        await import(
            "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
        );
    }
}

function formatExcelAmount(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

async function loadBranches(companyID, selectedBranch = "") {
    const branchSelect = document.getElementById("branch");

    if (!branchSelect) return;

    // Loading option
    branchSelect.innerHTML = `<option value="">Loading...</option>`;

    try {
        const { data, error } = await supabaseClient
            .from("CompanyBranchDetails")
            .select("BranchCode, Address, City, State")
            .eq("CompanyID", companyID)
            .eq("Status", "Active")
            .order("BranchCode", { ascending: true });

        if (error) throw error;

        branchSelect.innerHTML = `<option value="">Select Branch</option>`;

        if (!data || data.length === 0) {
            branchSelect.innerHTML = `<option value="">No Branch Found</option>`;
            return;
        }

        data.forEach(branch => {
            const option = document.createElement("option");
            option.value = branch.BranchCode;
            option.textContent = `${branch.BranchCode} - ${branch.City || ""}`;

            if (branch.BranchCode === selectedBranch) {
                option.selected = true;
            }

            branchSelect.appendChild(option);
        });

    } catch (err) {
        console.error("Error loading branches:", err);
        branchSelect.innerHTML = `<option value="">Error Loading Branches</option>`;
    }
}
async function loadCostCenters(companyID, selectedCostCenter = "") {
    const costCenterSelect = document.getElementById("costCenter");

    if (!costCenterSelect) return;

    // Loading
    costCenterSelect.innerHTML = `<option value="">Loading...</option>`;

    try {
        const { data, error } = await supabaseClient
            .from("CostCenter")
            .select("CostCenterCode, CostCenterName, CostCenterType")
            .eq("company_id", companyID)
            .eq("Status", true)
            .order("CostCenterName", { ascending: true });

        if (error) throw error;

        costCenterSelect.innerHTML = `<option value="">Select Cost Center</option>`;

        if (!data || data.length === 0) {
            costCenterSelect.innerHTML = `<option value="">No Cost Center Found</option>`;
            return;
        }

        data.forEach(cc => {
            const option = document.createElement("option");
            option.value = cc.CostCenterCode;
            option.textContent = `${cc.CostCenterCode} - ${cc.CostCenterName}`;

            // Store additional information if needed
            option.dataset.type = cc.CostCenterType;

            if (cc.CostCenterCode === selectedCostCenter) {
                option.selected = true;
            }

            costCenterSelect.appendChild(option);
        });

    } catch (err) {
        console.error("Error loading cost centers:", err);
        costCenterSelect.innerHTML = `<option value="">Error Loading Cost Centers</option>`;
    }
}

/*==========================================================
    SUCCESS MESSAGE
==========================================================*/

function showSuccess(message) {

    alert(message);

}
/*==========================================================
    ERROR MESSAGE
==========================================================*/

function showError(error) {

    console.error(error);

    const message =
        typeof error === "string"
            ? error
            : error?.message || "Unexpected error occurred.";

    alert(message);

}

function showAlert(message, type = "success", duration = 3000) {

    const container = document.getElementById("alertContainer");
    if (!container) {
        console.error("alertContainer not found.");
        return;
    }

    const icons = {
        success: "bi-check-circle-fill",
        danger: "bi-x-circle-fill",
        warning: "bi-exclamation-triangle-fill",
        info: "bi-info-circle-fill"
    };

    const alert = document.createElement("div");
    alert.className = `alert alert-${type} alert-dismissible fade show shadow`;
    alert.role = "alert";

    alert.innerHTML = `
        <i class="bi ${icons[type] || icons.info} me-2"></i>
        ${message}
        <button type="button"
                class="btn-close"
                data-bs-dismiss="alert"
                aria-label="Close"></button>
    `;

    container.appendChild(alert);

    if (duration > 0) {
        setTimeout(() => {
            alert.classList.remove("show");
            setTimeout(() => alert.remove(), 300);
        }, duration);
    }
}

// Turn ON loading state
function startButtonLoading(button) {
    if (!button) return;

    // Save original text only if we haven't saved it yet
    if (!button.dataset.originalText) {
        button.dataset.originalText = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...`;
}

// Turn OFF loading state (Revert back to normal)
function stopButtonLoading(button) {
    if (!button) return;

    button.disabled = false;
    if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
    }
}

// ==========================================
// QR CODE GENERATOR UTILITY (With API Fallback)
// ==========================================
async function generateQRCodeBase64(text) {
    if (!text) return null;

    // 1. If the library loaded successfully from HTML, use it natively (Fastest)
    if (typeof QRCode !== 'undefined') {
        try {
            return await QRCode.toDataURL(String(text), {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                margin: 1,
                width: 150
            });
        } catch (err) {
            console.warn("Local QR generation failed, falling back to API...", err);
        }
    }

    // 2. FALLBACK: If the script was blocked by a firewall, use an external API
    try {
        const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}`;

        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error("QR API request failed");

        const blob = await response.blob();

        // Convert the API image blob to the Base64 string jsPDF needs
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

    } catch (err) {
        console.error("Fatal Error generating QR code Base64:", err);
        return null;
    }
}


// Run this when user successfully logs in
// async function checkUpdateOnLogin() {
//     if ('serviceWorker' in navigator) {
//         try {
//             const registration = await navigator.serviceWorker.getRegistration();
//             if (registration) {
//                 // Force check server for a new sw.js version
//                 await registration.update();
//             }
//         } catch (err) {
//             console.error('Update check failed on login:', err);
//         }
//     }
// }