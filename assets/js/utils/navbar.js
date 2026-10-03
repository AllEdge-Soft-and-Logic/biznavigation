const Navbar = (() => {
    // ==========================
    // MENU CONFIG
    // ==========================
    const MENU = [
        {
            title: "Master",
            icon: "bi-folder2-open",
            children: [
                { label: "Company", icon: "bi-buildings", href: "/pages/master/companyProfile.html" },
                { label: "Party", icon: "bi-people-fill", href: "/pages/master/PartyRegistration.html" },
                { label: "Courier", icon: "bi-box-seam", href: "/pages/master/CourierRegistration.html" },
                { label: "Employee", icon: "bi-person-badge-fill", href: "/pages/master/EmployeeMaster.html" },
                { label: "Vehicle Master", icon: "bi-truck", href: "/pages/master/VehicleMaster.html" },
                { label: "User Rules", icon: "bi-shield-lock", href: "/pages/master/UserAccessRules.html" }
            ]
        },
        {
            title: "Operations",
            icon: "bi-gear",
            children: [
                { label: "Enquiry", icon: "bi-search", href: "/pages/Functions/Enquiry.html" },
                { label: "Quotation", icon: "bi-file-earmark-text", href: "/pages/Functions/Quotation.html" },
                { label: "International", icon: "bi-globe-central-south-asia", href: "/pages/Functions/InternationalBooking.html" },
                { label: "Domestic", icon: "bi-truck", href: "/pages/Functions/DomesticBooking.html" },
                { label: "Customs Clearance", icon: "bi-box-seam", href: "/pages/Functions/CustomsClearance.html" },
                { label: "Full Truck Load", icon: "bi-truck-front", href: "/pages/Functions/fulltruckload.html" },
                { label: "Dedicated Vehicle Trips", icon: "bi-truck-flatbed", href: "/pages/Functions/dedicatedvehicletrips.html" }
            ]
        },
        {
            title: "Accounts",
            icon: "bi-cash-stack",
            children: [
                { label: "Customer Invoice", icon: "bi-receipt", href: "/pages/Accounting/CustomerInvoice.html" },
                { label: "Vendor Billing", icon: "bi-file-earmark-spreadsheet", href: "/pages/Accounting/VendorBilling.html" },
                { label: "Payments Credit", icon: "bi-arrow-down-square", href: "/pages/Accounting/PaymentDetails_Credit.html?type=Credit" },
                { label: "Payment Debit", icon: "bi-arrow-up-square", href: "/pages/Accounting/PaymentDetails_Debit.html?type=Debit" },
                { label: "Credit Debit Note", icon: "bi-file-earmark-diff", href: "/pages/Accounting/CreditDebitNote.html" },
                { label: "Accounting Voucher", icon: "bi-cash-coin", href: "/pages/Accounting/AccountingVoucher.html" },
                { label: "Tax Details", icon: "bi-calculator", href: "/pages/Accounting/TaxDetails.html" }
            ]
        },
        {
            title: "Reports",
            icon: "bi-file-bar-graph",
            children: [
                { label: "International Report", icon: "bi-globe", href: "/pages/Reports/reportInternationalShipmentDetails.html" },
                { label: "Domestic Report", icon: "bi-truck", href: "/pages/Reports/reportDomesticDetails.html" },
                { label: "Customs Clearance", icon: "bi-box-seam", href: "/pages/Reports/reportCustomsClearance.html" },
                { label: "Full Truck Load", icon: "bi-truck-front", href: "/pages/Reports/reportFulltruckDetails.html" },
                { label: "Customer Invoice", icon: "bi-receipt-cutoff", href: "/pages/Reports/reportCustomerInvoiceDetails.html" },
                { label: "Payment Details", icon: "bi-wallet2", href: "/pages/Reports/PaymentDetails.html" },
                { label: "Vendor Billing", icon: "bi-file-bar-graph", href: "/pages/Reports/reportVendorBillingDetails.html" },
                { label: "Payment Receivable", icon: "bi-cash-coin", href: "#" },
                { label: "Outstanding Details", icon: "bi-currency-rupee", href: "/pages/Reports/outstandingDetails.html" },
                { label: "Tax Details", icon: "bi-percent", href: "/pages/Reports/reportGSTDetails.html" },
                { label: "Accounting Ledger", icon: "bi-journal-bookmark", href: "/pages/Reports/accountingLedger.html" },
                { label: "Bank Account Ledger", icon: "bi-wallet2", href: "/pages/Reports/bankAccountLedger.html" }
            ]
        },
        {
            title: "Tools",
            icon: "bi-tools",
            children: [
                { label: "Settings", icon: "bi-gear-fill", href: "/pages/Tools/setting.html" },
                { label: "Error Log", icon: "bi-bug", href: "#" },
                { label: "Docket Master", icon: "bi-file-earmark-richtext", href: "#" },
                { label: "Reset Database", icon: "bi-database-x", href: "#" },
                { label: "Route Master", icon: "bi-sign-turn-right", href: "/pages/Tools/routemaster.html" },
                { label: "Application Settings", icon: "bi-sliders", href: "/pages/Tools/ApplicationSettings.html" }
            ]
        }
    ];

    // ==========================
    // INIT
    // ==========================
    async function init() {
        try {
            const userLoginID = localStorage.getItem("UserLoginID");

            if (!userLoginID) {
                location.replace("/index.html");
                return;
            }

            setDynamicPageTitle();

            // Core UI Build
            renderSidebar();
            createTopNavbar();
            createFooter();

            // Interaction Setup
            setupMobileSidebarActions();
            mobileToggle();
            setupMenuToggle();
            setActiveMenu();
            setupSidebarHoverExpand();
            createCollapseButton();
            setupPageAnimation();
            setupGlobalClickDelegation();

            // Permissions
            await applyPermissions(userLoginID);

        } catch (error) {
            console.error("Initialization Error:", error);
        }
    }

    function setDynamicPageTitle() {
        if (window.location.pathname.includes("PaymentDetails.html")) {
            const type = new URLSearchParams(window.location.search).get("type");
            if (type) document.title = `Payment Details - ${type}`;
        }
    }

    function setupSidebarHoverExpand() {
        const sidebar = document.getElementById("sidebarMenu");
        if (!sidebar) return;

        sidebar.addEventListener("mouseenter", () => {
            if (sidebar.classList.contains("collapsed")) sidebar.classList.add("hover-expanded");
        });

        sidebar.addEventListener("mouseleave", () => {
            sidebar.classList.remove("hover-expanded");
        });
    }

    // ==========================
    // SIDEBAR RENDER
    // ==========================
    function renderSidebar() {
        const userName = localStorage.getItem("UserName") ?? "User";
        const sidebarContainer = document.getElementById("sidebar");

        if (!sidebarContainer) return;

        sidebarContainer.innerHTML = `
        <nav class="sidebar" id="sidebarMenu" aria-label="Main Navigation">
            <div class="logo">
                <a href="/pages/Tools/home.html" class="logo-box" data-transition="true" aria-label="Go to Dashboard">
                    <img src="../../assets/img/applogo.png" alt="" class="logo-img" aria-hidden="true" />
                    <span class="logo-text">BizNavigation</span>
                </a>
            </div>

            <ul class="menu" role="menu">
                ${MENU.map(section => `
                    <li class="menu-group" role="none">
                        <div class="menu-title" role="menuitem" aria-haspopup="true" aria-expanded="false" tabindex="0">
                            <i class="bi ${section.icon}" aria-hidden="true"></i>
                            <span>${section.title}</span>
                            <i class="bi bi-chevron-down arrow" aria-hidden="true"></i>
                        </div>
                        <ul class="submenu" role="menu">
                            ${section.children.map(item => `
                                <li class="menu-item" data-href="${item.href}" data-label="${item.label}" role="none">
                                    <a role="menuitem" tabindex="-1">
                                        <i class="bi ${item.icon}" aria-hidden="true"></i>
                                        <span>${item.label}</span>
                                    </a>
                                </li>
                            `).join("")}
                        </ul>
                    </li>
                `).join("")}
            </ul>

            <div class="sidebar-user-panel d-md-none">
                <div class="user-box">
                    <div class="avatar" aria-hidden="true">${userName.charAt(0).toUpperCase()}</div>
                    <span class="username">${userName}</span>
                </div>
                <div class="sidebar-actions">
                    <button id="mobileThemeToggle" class="theme-btn" title="Toggle Theme" aria-label="Toggle Theme"><i class="bi bi-moon"></i></button>
                    <button id="mobileLogoutBtn" class="logout-btn" title="Logout" aria-label="Logout"><i class="bi bi-power"></i></button>
                </div>
            </div>
        </nav>`;
    }

    // ==========================
    // MENU TOGGLE
    // ==========================
    function setupMenuToggle() {
        const menuGroups = document.querySelectorAll(".menu-group");

        document.querySelectorAll(".menu-title").forEach(el => {
            // Support keyboard navigation (Enter/Space)
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    el.click();
                }
            });

            el.addEventListener('click', () => {
                const parent = el.parentElement;
                const isOpen = parent.classList.contains("open");

                // Close all other menus
                menuGroups.forEach(group => {
                    group.classList.remove("open");
                    group.querySelector('.menu-title').setAttribute('aria-expanded', 'false');
                });

                // Toggle current menu
                if (!isOpen) {
                    parent.classList.add("open");
                    el.setAttribute('aria-expanded', 'true');
                }
            });
        });
    }

    // ==========================
    // ACTIVE MENU
    // ==========================
    function setActiveMenu() {
        const currentPath = window.location.pathname.toLowerCase();

        document.querySelectorAll(".menu-item").forEach(item => {
            const menuPath = item.dataset.href?.toLowerCase();

            if (currentPath === menuPath) {
                item.classList.add("active");
                const parentGroup = item.closest(".menu-group");

                if (parentGroup) {
                    parentGroup.classList.add("open");
                    parentGroup.querySelector('.menu-title')?.setAttribute('aria-expanded', 'true');
                }

                const breadcrumb = document.getElementById("breadcrumb");
                if (breadcrumb) {
                    breadcrumb.innerHTML = `<div class="breadcrumb-box">Home / <span class="text-primary">${item.dataset.label}</span></div>`;
                }
            }
        });
    }

    // ==========================
    // PERMISSIONS
    // ==========================
    async function applyPermissions(userLoginID) {
        const cacheKey = `permissions_${userLoginID}`;
        let permissions = null;

        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) permissions = JSON.parse(cached);
        } catch (e) {
            console.warn("Error reading permissions from cache", e);
        }

        if (!permissions) {
            permissions = await fetchPermissions(userLoginID);
            if (permissions) {
                localStorage.setItem(cacheKey, JSON.stringify(permissions));
            }
        }

        if (permissions) {
            document.querySelectorAll(".menu-item").forEach(item => {
                const id = generateFormID(item.dataset.href);
                if (!permissions[id]?.CanRead) {
                    item.style.display = "none";
                }
            });
        }
    }

    // ==========================
    // MOBILE TOGGLE
    // ==========================
    function mobileToggle() {
        const navbarLeft = document.querySelector(".navbar-left");
        const sidebar = document.getElementById("sidebarMenu");

        if (!navbarLeft || !sidebar) return;

        const btn = document.createElement("button");
        btn.id = "toggleSidebar";
        btn.className = "btn btn-sm btn-primary d-md-none me-3";
        btn.setAttribute("aria-label", "Toggle sidebar");
        btn.setAttribute("aria-expanded", "false");

        let isOpen = false;
        const updateState = () => {
            btn.innerHTML = isOpen ? '<i class="bi bi-x-lg"></i>' : '<i class="bi bi-list"></i>';
            btn.setAttribute("aria-expanded", String(isOpen));
            sidebar.classList.toggle("show", isOpen);
        };

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            isOpen = !isOpen;
            updateState();
        });

        document.addEventListener("click", (e) => {
            if (isOpen && !sidebar.contains(e.target) && !btn.contains(e.target)) {
                isOpen = false;
                updateState();
            }
        });

        updateState();
        navbarLeft.prepend(btn);
    }

    function setupMobileSidebarActions() {
        document.getElementById("mobileThemeToggle")?.addEventListener("click", () => {
            document.getElementById("themeToggle")?.click();
        });

        document.getElementById("mobileLogoutBtn")?.addEventListener("click", () => {
            document.getElementById("logoutBtn")?.click();
        });
    }

    // ==========================
    // PAGE ANIMATION & TRANSITION
    // ==========================
    function setupPageAnimation() {
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.25s ease-in-out';
        requestAnimationFrame(() => document.body.style.opacity = '1');
    }

    function setupGlobalClickDelegation() {
        document.addEventListener("click", function (event) {
            const menuItem = event.target.closest(".menu-item");
            const transitionLink = event.target.closest("a[data-transition='true']");

            let href = menuItem?.dataset.href || transitionLink?.href;

            if (href && href !== "#" && !href.startsWith("javascript:")) {
                event.preventDefault();
                navigateWithAnimation(href);
            }
        });
    }

    function navigateWithAnimation(href) {
        document.getElementById("sidebarMenu")?.classList.remove("show");
        document.body.classList.remove("page-enter");
        document.body.style.opacity = '0'; // Smooth fade out

        setTimeout(() => window.location.href = href, 250);
    }

    // ==========================
    // COLLAPSE BUTTON
    // ==========================
    function createCollapseButton() {
        const sidebar = document.getElementById("sidebarMenu");
        if (!sidebar) return;

        const btn = document.createElement("button");
        btn.innerHTML = '<i class="bi bi-chevron-left"></i>';
        btn.className = "collapse-btn shadow-sm";
        btn.setAttribute("aria-label", "Collapse sidebar");
        sidebar.appendChild(btn);

        btn.onclick = () => {
            const isCollapsed = sidebar.classList.toggle("collapsed");
            document.body.classList.toggle("sidebar-collapsed", isCollapsed);
            btn.innerHTML = isCollapsed ? '<i class="bi bi-chevron-right"></i>' : '<i class="bi bi-chevron-left"></i>';
            btn.setAttribute("aria-expanded", String(!isCollapsed));
        };
    }

    // ==========================
    // HELPERS
    // ==========================
    function generateFormID(href) {
        if (!href) return "";
        if (href.includes("PaymentDetails")) {
            const type = new URL(href, location.origin).searchParams.get("type") || "";
            return `PaymentDetails${type}`;
        }
        return href.split("/").pop().replace(".html", "");
    }

    async function fetchPermissions(userLoginID) {
        try {
            // Added try-catch for network/API safety
            const { data, error } = await supabaseClient
                .from("UserAccessRules")
                .select("*")
                .eq("UserLoginID", userLoginID);

            if (error) throw error;
            return Object.fromEntries(data.map(r => [r.FormID, r]));
        } catch (err) {
            console.error("Failed to fetch permissions:", err);
            return null; // Return null to prevent caching bad states
        }
    }

    // ==========================
    // UI BUILDERS
    // ==========================
    function createTopNavbar() {
        const container = document.querySelector(".main-content");
        if (!container) return;

        const userName = localStorage.getItem("UserName") ?? "User";
        const pageTitle = document.title || "Dashboard";

        const navbar = document.createElement("header");
        navbar.className = "top-navbar d-flex align-items-center justify-content-between shadow-sm p-3";
        navbar.innerHTML = `
            <div class="navbar-left d-flex align-items-center">
                <!-- Added responsive font sizing and truncation so it doesn't break on mobile -->
                <h5 class="mb-0 fw-semibold text-truncate d-none d-md-block" style="max-width: 300px;">Intelligent Logistics Solutions</h5>
                <h6 class="mb-0 fw-semibold text-truncate d-block d-md-none ms-2" style="max-width: 200px;">Intelligent Logistics</h6>
            </div>
            
            <!-- Changed 'd-flex' to 'd-none d-md-flex' to hide this entire section on mobile -->
            <!-- Mobile users will use the theme/logout buttons already built into your sidebar -->
            <div class="navbar-right d-none d-md-flex align-items-center gap-3">
                <button id="themeToggle" class="theme-btn btn btn-light rounded-circle shadow-sm" aria-label="Toggle Dark Mode">
                    <i class="bi bi-moon-fill"></i>
                </button>
                
                <div class="user-profile-badge d-flex align-items-center bg-light rounded-pill px-3 py-1 shadow-sm border">
                    <div class="avatar bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-2" style="width: 32px; height: 32px; font-weight: 600;">
                        ${userName.charAt(0).toUpperCase()}
                    </div>
                    <span class="username fw-medium text-dark me-3">${userName}</span>
                    <button id="logoutBtn" class="logout-btn btn btn-sm btn-outline-danger rounded-pill" aria-label="Logout" title="Logout">
                        <i class="bi bi-power"></i>
                    </button>
                </div>
            </div>
        `;

        container.prepend(navbar);
        setupThemeToggle();

        navbar.querySelector("#logoutBtn")?.addEventListener("click", async () => {
            try {
                const userRaw = localStorage.getItem("user");
                if (userRaw) {
                    const user = JSON.parse(userRaw);
                    if (user?.id && typeof logoutOtherSessions === "function") {
                        await logoutOtherSessions(user.id);
                    }
                }
            } catch (e) {
                console.error("Logout session error:", e);
            } finally {
                if (typeof logoutUser === "function") logoutUser();
                else window.location.replace("/index.html");
                localStorage.clear();
            }
        });
    }

    function createFooter() {
        const container = document.querySelector(".main-content");
        if (!container) return;

        const footer = document.createElement("footer");
        footer.className = "bg-dark text-white mt-auto rounded-top-3 shadow-lg";
        footer.innerHTML = `
            <div class="container py-3">
                <div class="d-flex flex-column flex-md-row justify-content-between align-items-center text-center">
                    <p class="mb-2 mb-md-0 fs-6 text-white-50">&copy; ${new Date().getFullYear()} BizNavigation. All Rights Reserved.</p>
                    <ul class="list-inline mb-2 mb-md-0 fs-6">
                        <li class="list-inline-item"><a href="#" class="text-white-50 text-decoration-none hover-white">Privacy</a></li>
                        <li class="list-inline-item text-white-50">•</li>
                        <li class="list-inline-item"><a href="#" class="text-white-50 text-decoration-none hover-white">Terms</a></li>
                        <li class="list-inline-item text-white-50">•</li>
                        <li class="list-inline-item"><a href="#" class="text-white-50 text-decoration-none hover-white">Support</a></li>
                    </ul>
                </div>
            </div>
        `;
        container.appendChild(footer);
    }

    function setupThemeToggle() {
        const btn = document.getElementById("themeToggle");
        if (!btn) return;

        const updateIcon = (isDark) => {
            btn.innerHTML = isDark ? '<i class="bi bi-sun-fill text-warning"></i>' : '<i class="bi bi-moon-fill"></i>';
        };

        const isDarkTheme = localStorage.getItem("theme") === "dark";
        if (isDarkTheme) {
            document.body.classList.add("dark-mode");
            updateIcon(true);
        } else {
            updateIcon(false);
        }

        btn.onclick = () => {
            const isDark = document.body.classList.toggle("dark-mode");
            localStorage.setItem("theme", isDark ? "dark" : "light");
            updateIcon(isDark);
        };
    }

    return { init };

})();

document.addEventListener("DOMContentLoaded", Navbar.init);