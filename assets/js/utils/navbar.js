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
                { label: "Driver Master", icon: "bi-person-badge", href: "/pages/master/DriverMaster.html" },
                { label: "User Rules", icon: "bi-shield-lock", href: "/pages/master/UserAccessRules.html" }
            ]
        },
        {
            title: "Operations",
            icon: "bi-gear",
            children: [
                { label: "Enquiry", icon: "bi-search", href: "/pages/Functions/Enquiry.html" },
                { label: "Quotation", icon: "bi-file-earmark-text", href: "/pages/Functions/Quotation.html" },
                { label: "Pickup Request", icon: "bi-file-earmark-text", href: "/pages/Functions/Pickup.html" },
                { label: "International", icon: "bi-globe-central-south-asia", href: "/pages/Functions/InternationalBooking.html" },
                { label: "Domestic", icon: "bi-truck", href: "/pages/Functions/DomesticBooking.html" },
                { label: "Customs Clearance", icon: "bi-box-seam", href: "/pages/Functions/CustomsClearance.html" },
                { label: "Full Truck Load", icon: "bi-truck-front", href: "/pages/Functions/FullTruckLoad.html" },
                { label: "Dedicated Vehicle Trips", icon: "bi-truck-flatbed", href: "/pages/Functions/dedicatedVehicleTrips.html" }
            ]
        },
        {
            title: "Accounts",
            icon: "bi-cash-stack",
            children: [
                { label: "Customer Invoice", icon: "bi-receipt", href: "/pages/Accounting/CustomerInvoice.html" },
                { label: "Vendor Billing", icon: "bi-file-earmark-spreadsheet", href: "/pages/Accounting/VendorBilling.html" },
                { label: "Payments Credit", icon: "bi-arrow-down-square", href: "/pages/Accounting/PaymentDetails_Credit.html" },
                { label: "Payment Debit", icon: "bi-arrow-up-square", href: "/pages/Accounting/PaymentDetails_Debit.html" },
                { label: "Credit Debit Note", icon: "bi-file-earmark-diff", href: "/pages/Accounting/CreditDebitNote.html" },
                { label: "Accounting Voucher", icon: "bi-cash-coin", href: "/pages/Accounting/AccountingVoucher.html" },
                { label: "Tax Details", icon: "bi-calculator", href: "/pages/Accounting/TaxDetails.html" }
            ]
        },
        {
            title: "Reports",
            icon: "bi-file-bar-graph",
            children: [
                { label: "Pickup Request", icon: "bi-globe", href: "/pages/Reports/PickupRequest.html" },
                { label: "International", icon: "bi-globe", href: "/pages/Reports/reportInternationalShipmentDetails.html" },
                { label: "Domestic", icon: "bi-truck", href: "/pages/Reports/reportDomesticDetails.html" },
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

    const PERMISSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

    // ==========================
    // INIT
    // ==========================
    async function init() {
        try {
            const userLoginID = localStorage.getItem("UserLoginID");

            if (!userLoginID) {
                (window.top || window).location.replace("/index.html");
                return;
            }

            // Embedded Child Page Mode: Hide duplicate sidebar/navbar & sync theme
            if (window.self !== window.top) {
                setupEmbeddedPageMode();
                return;
            }

            setDynamicPageTitle();

            // Core Shell UI Build (Renders once and stays persistent)
            renderSidebar();
            createTopNavbar();
            createFooter();

            // Interaction Setup
            setupMobileSidebarActions();
            mobileToggle();
            setupMenuToggle();
            setupMenuSearch();
            setActiveMenu();
            setupSidebarHoverExpand();
            createCollapseButton();
            setupNetworkIndicator();
            setupPageAnimation();
            setupGlobalClickDelegation();

            // Permissions
            await applyPermissions(userLoginID);

        } catch (error) {
            console.error("Navbar Initialization Error:", error);
        }
    }

    // ==========================
    // EMBEDDED CHILD PAGE MODE
    // ==========================
    function setupEmbeddedPageMode() {
        const sidebarEl = document.getElementById("sidebar");
        if (sidebarEl) sidebarEl.style.display = "none";

        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            mainContent.style.marginLeft = "0";
            mainContent.style.width = "100%";
        }

        const applyChildTheme = (isDark) => {
            document.body.classList.toggle("dark-mode", isDark);
            document.documentElement.setAttribute("data-bs-theme", isDark ? "dark" : "light");
        };

        const stored = localStorage.getItem("biznav_theme") || localStorage.getItem("theme");
        applyChildTheme(stored === "dark");

        window.addEventListener("message", (event) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type === "BIZNAV_THEME_CHANGE") {
                applyChildTheme(event.data.theme === "dark");
            }
        });
    }

    function escapeHTML(str = "") {
        return String(str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[ch]));
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
        const userName = escapeHTML(localStorage.getItem("UserName") ?? "User");
        const sidebarContainer = document.getElementById("sidebar");

        if (!sidebarContainer) return;

        sidebarContainer.innerHTML = `
        <nav class="sidebar" id="sidebarMenu" aria-label="Main Navigation">
            <div class="logo">
                <a href="/pages/Tools/home.html" class="logo-box" data-transition="true" aria-label="Go to Dashboard">
                    <img src="/assets/img/applogo.png" alt="" class="logo-img" aria-hidden="true"
                        onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNiIgaGVpZ2h0PSIzNiI+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjM2IiByeD0iOCIgZmlsbD0iIzAyODRjNyIvPjwvc3ZnPg=='" />
                    <span class="logo-text">BizNavigation</span>
                </a>
            </div>

            <div class="sidebar-search px-3 pb-2">
                <div class="input-group input-group-sm">
                    <span class="input-group-text bg-transparent border-end-0 text-secondary">
                        <i class="bi bi-search" aria-hidden="true"></i>
                    </span>
                    <input type="search" id="menuSearchInput" class="form-control border-start-0 shadow-none"
                        placeholder="Quick jump (Ctrl+K)" aria-label="Search navigation menu" autocomplete="off" />
                </div>
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
                            ${section.children.map(item => {
            const isPlaceholder = item.href === "#";
            return `
                                <li class="menu-item ${isPlaceholder ? "opacity-50" : ""}"
                                    data-href="${item.href}" data-label="${item.label}" role="none">
                                    <a href="${item.href}" role="menuitem" ${isPlaceholder ? 'aria-disabled="true" title="Coming soon"' : ""}>
                                        <i class="bi ${item.icon}" aria-hidden="true"></i>
                                        <span>${item.label}</span>
                                    </a>
                                </li>`;
        }).join("")}
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
    // QUICK MENU SEARCH (Ctrl+K)
    // ==========================
    function setupMenuSearch() {
        const input = document.getElementById("menuSearchInput");
        if (!input) return;

        document.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                const sidebar = document.getElementById("sidebarMenu");
                if (sidebar?.classList.contains("collapsed")) {
                    sidebar.classList.remove("collapsed");
                    document.body.classList.remove("sidebar-collapsed");
                }
                input.focus();
                input.select();
            }
        });

        input.addEventListener("input", () => {
            const query = input.value.trim().toLowerCase();

            document.querySelectorAll(".menu-group").forEach(group => {
                let visibleCount = 0;

                group.querySelectorAll(".menu-item").forEach(item => {
                    if (item.dataset.permitted === "false") {
                        item.style.display = "none";
                        return;
                    }
                    const matches = !query || item.dataset.label.toLowerCase().includes(query);
                    item.style.display = matches ? "" : "none";
                    if (matches) visibleCount++;
                });

                group.style.display = visibleCount > 0 ? "" : "none";
                if (query && visibleCount > 0) {
                    group.classList.add("open");
                    group.querySelector(".menu-title")?.setAttribute("aria-expanded", "true");
                } else if (!query) {
                    const hasActive = !!group.querySelector(".menu-item.active");
                    group.classList.toggle("open", hasActive);
                    group.querySelector(".menu-title")?.setAttribute("aria-expanded", String(hasActive));
                }
            });
        });
    }

    // ==========================
    // MENU TOGGLE
    // ==========================
    function setupMenuToggle() {
        const menuGroups = document.querySelectorAll(".menu-group");

        document.querySelectorAll(".menu-title").forEach(el => {
            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    el.click();
                }
            });

            el.addEventListener("click", () => {
                const parent = el.parentElement;
                const isOpen = parent.classList.contains("open");

                menuGroups.forEach(group => {
                    group.classList.remove("open");
                    group.querySelector(".menu-title")?.setAttribute("aria-expanded", "false");
                });

                if (!isOpen) {
                    parent.classList.add("open");
                    el.setAttribute("aria-expanded", "true");
                }
            });
        });
    }

    // ==========================
    // ACTIVE MENU & BREADCRUMB
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
                    parentGroup.querySelector(".menu-title")?.setAttribute("aria-expanded", "true");
                }

                const breadcrumb = document.getElementById("breadcrumb");
                if (breadcrumb) {
                    breadcrumb.innerHTML = `<div class="breadcrumb-box">Home / <span class="text-primary">${escapeHTML(item.dataset.label)}</span></div>`;
                }
            }
        });
    }

    function updateActiveMenuUI(href, label) {
        document.querySelectorAll(".menu-item").forEach(item => {
            const isMatch = item.dataset.href?.toLowerCase() === href.toLowerCase();
            item.classList.toggle("active", isMatch);

            if (isMatch) {
                const parentGroup = item.closest(".menu-group");
                if (parentGroup) {
                    parentGroup.classList.add("open");
                    parentGroup.querySelector(".menu-title")?.setAttribute("aria-expanded", "true");
                }
            }
        });

        const breadcrumb = document.getElementById("breadcrumb");
        if (breadcrumb && label) {
            breadcrumb.innerHTML = `<div class="breadcrumb-box">Home / <span class="text-primary">${escapeHTML(label)}</span></div>`;
        }
    }

    // ==========================
    // PERMISSIONS (Empty-Group Hide + Background Refresh)
    // ==========================
    function renderPermissions(permissions) {
        if (!permissions) return;

        document.querySelectorAll(".menu-group").forEach(group => {
            let visibleItems = 0;

            group.querySelectorAll(".menu-item").forEach(item => {
                const id = generateFormID(item.dataset.href);
                const allowed = Boolean(permissions[id]?.CanRead);
                item.dataset.permitted = String(allowed);
                item.style.display = allowed ? "" : "none";
                if (allowed) visibleItems++;
            });

            group.style.display = visibleItems > 0 ? "" : "none";
        });
    }

    async function applyPermissions(userLoginID) {
        const cacheKey = `permissions_${userLoginID}`;
        const cacheTimeKey = `permissions_ts_${userLoginID}`;
        let permissions = null;

        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) permissions = JSON.parse(cached);
        } catch (e) {
            console.warn("Error reading permissions from cache", e);
        }

        if (permissions) {
            renderPermissions(permissions);
        }

        const lastFetched = Number(localStorage.getItem(cacheTimeKey) || 0);
        const isStale = !permissions || (Date.now() - lastFetched > PERMISSION_TTL_MS);

        if (isStale && navigator.onLine) {
            const fresh = await fetchPermissions(userLoginID);
            if (fresh) {
                localStorage.setItem(cacheKey, JSON.stringify(fresh));
                localStorage.setItem(cacheTimeKey, String(Date.now()));
                renderPermissions(fresh);
            }
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
    // PAGE ANIMATION & PERSISTENT SHELL NAVIGATION
    // ==========================
    function setupPageAnimation() {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        document.body.style.opacity = "0";
        document.body.style.transition = "opacity 0.25s ease-in-out";
        requestAnimationFrame(() => (document.body.style.opacity = "1"));
    }

    function setupGlobalClickDelegation() {
        document.addEventListener("click", function (event) {
            // Allow native open-in-new-tab (Ctrl/Cmd/Shift/Middle-click)
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;

            const menuItem = event.target.closest(".menu-item");
            const transitionLink = event.target.closest("a[data-transition='true']");

            const href = menuItem?.dataset.href || transitionLink?.getAttribute("href");

            if (!href || href === "#" || href.startsWith("javascript:")) {
                if (menuItem) event.preventDefault();
                return;
            }

            event.preventDefault();
            navigateWithAnimation(href);
        });
    }

    function navigateWithAnimation(href) {
        document.getElementById("sidebarMenu")?.classList.remove("show");

        // Clicking Logo / Dashboard returns to dashboard view without reload
        if (href.toLowerCase().includes("home.html")) {
            const frame = document.getElementById("biznavWorkspaceFrame");
            const pageContent = document.querySelector(".page-content");
            if (frame) frame.classList.add("d-none");
            if (pageContent) pageContent.classList.remove("d-none");
            document.title = "BizNavigation - Dashboard";
            updateActiveMenuUI(href, "Dashboard");
            return;
        }

        const mainContent = document.querySelector(".main-content");
        const pageContent = document.querySelector(".page-content");
        if (!mainContent) {
            window.location.href = href;
            return;
        }

        // Hide initial dashboard content
        if (pageContent) pageContent.classList.add("d-none");

        // Create persistent workspace iframe once
        let frame = document.getElementById("biznavWorkspaceFrame");
        let loader = document.getElementById("biznavFrameLoader");

        if (!frame) {
            loader = document.createElement("div");
            loader.id = "biznavFrameLoader";
            loader.className = "progress rounded-0";
            loader.style.cssText = "height: 3px; display: none;";
            loader.innerHTML = '<div class="progress-bar progress-bar-striped progress-bar-animated w-100"></div>';

            frame = document.createElement("iframe");
            frame.id = "biznavWorkspaceFrame";
            frame.title = "BizNavigation Workspace";
            frame.style.cssText = "width: 100%; flex: 1; border: 0; min-height: calc(100vh - 120px); background: transparent;";

            frame.addEventListener("load", () => {
                if (loader) loader.style.display = "none";
                try {
                    if (frame.contentDocument?.title) {
                        document.title = frame.contentDocument.title;
                    }
                } catch (_) { /* same-origin safe */ }
            });

            const footer = mainContent.querySelector("footer");
            if (footer) {
                mainContent.insertBefore(loader, footer);
                mainContent.insertBefore(frame, footer);
            } else {
                mainContent.appendChild(loader);
                mainContent.appendChild(frame);
            }
        }

        frame.classList.remove("d-none");
        if (loader) loader.style.display = "flex";
        frame.src = href;

        const clickedItem = document.querySelector(`.menu-item[data-href="${href}"]`);
        updateActiveMenuUI(href, clickedItem?.dataset.label || "");
    }

    // ==========================
    // COLLAPSE BUTTON (Persisted)
    // ==========================
    function createCollapseButton() {
        const sidebar = document.getElementById("sidebarMenu");
        if (!sidebar) return;

        const btn = document.createElement("button");
        btn.className = "collapse-btn shadow-sm";
        btn.setAttribute("aria-label", "Collapse sidebar");
        sidebar.appendChild(btn);

        const applyCollapse = (collapsed) => {
            sidebar.classList.toggle("collapsed", collapsed);
            document.body.classList.toggle("sidebar-collapsed", collapsed);
            btn.innerHTML = collapsed ? '<i class="bi bi-chevron-right"></i>' : '<i class="bi bi-chevron-left"></i>';
            btn.setAttribute("aria-expanded", String(!collapsed));
        };

        const savedCollapsed = localStorage.getItem("biznav_sidebar_collapsed") === "true";
        applyCollapse(savedCollapsed);

        btn.onclick = () => {
            const next = !sidebar.classList.contains("collapsed");
            localStorage.setItem("biznav_sidebar_collapsed", String(next));
            applyCollapse(next);
        };
    }

    // ==========================
    // LIVE NETWORK INDICATOR
    // ==========================
    function setupNetworkIndicator() {
        const pill = document.getElementById("navNetworkStatus");
        if (!pill) return;

        const sync = () => {
            const online = navigator.onLine;
            pill.className = `badge rounded-pill d-none d-lg-inline-flex align-items-center gap-1 ${online ? "text-bg-success bg-opacity-75" : "text-bg-warning"}`;
            pill.innerHTML = online
                ? '<i class="bi bi-wifi" aria-hidden="true"></i> Online'
                : '<i class="bi bi-wifi-off" aria-hidden="true"></i> Offline';
        };

        sync();
        window.addEventListener("online", sync);
        window.addEventListener("offline", sync);
    }

    // ==========================
    // HELPERS
    // ==========================
    function generateFormID(href) {
        if (!href || href === "#") return "";
        if (href.includes("PaymentDetails")) {
            const type = new URL(href, location.origin).searchParams.get("type") || "";
            return `PaymentDetails${type}`;
        }
        return href.split("/").pop().replace(".html", "");
    }

    async function fetchPermissions(userLoginID) {
        try {
            const { data, error } = await supabaseClient
                .from("UserAccessRules")
                .select("*")
                .eq("UserLoginID", userLoginID);

            if (error) throw error;
            return Object.fromEntries(data.map(r => [r.FormID, r]));
        } catch (err) {
            console.error("Failed to fetch permissions:", err);
            return null;
        }
    }

    // ==========================
    // UI BUILDERS
    // ==========================
    function createTopNavbar() {
        const container = document.querySelector(".main-content");
        if (!container) return;

        const userName = escapeHTML(localStorage.getItem("UserName") ?? "User");

        const navbar = document.createElement("header");
        navbar.className = "top-navbar d-flex align-items-center justify-content-between shadow-sm p-3";
        navbar.innerHTML = `
            <div class="navbar-left d-flex align-items-center">
                <h5 class="mb-0 fw-semibold text-truncate d-none d-md-block" style="max-width: 300px;">Intelligent Logistics Solutions</h5>
                <h6 class="mb-0 fw-semibold text-truncate d-block d-md-none ms-2" style="max-width: 200px;">Intelligent Logistics</h6>
            </div>

            <div class="navbar-right d-none d-md-flex align-items-center gap-3">
                <span id="navNetworkStatus" class="badge rounded-pill" role="status" aria-live="polite"></span>

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
                const savedTheme = localStorage.getItem("biznav_theme");
                const savedSidebar = localStorage.getItem("biznav_sidebar_collapsed");
                localStorage.clear();
                if (savedTheme) localStorage.setItem("biznav_theme", savedTheme);
                if (savedSidebar) localStorage.setItem("biznav_sidebar_collapsed", savedSidebar);

                if (typeof logoutUser === "function") logoutUser();
                else window.location.replace("/index.html");
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
        const mobileBtn = document.getElementById("mobileThemeToggle");
        if (!btn) return;

        const applyTheme = (isDark) => {
            document.body.classList.toggle("dark-mode", isDark);
            document.documentElement.setAttribute("data-bs-theme", isDark ? "dark" : "light");
            localStorage.setItem("biznav_theme", isDark ? "dark" : "light");
            localStorage.setItem("theme", isDark ? "dark" : "light");

            const iconHtml = isDark
                ? '<i class="bi bi-sun-fill text-warning"></i>'
                : '<i class="bi bi-moon-fill"></i>';
            btn.innerHTML = iconHtml;
            if (mobileBtn) mobileBtn.innerHTML = iconHtml;

            // Live-sync theme to active workspace page
            const frame = document.getElementById("biznavWorkspaceFrame");
            frame?.contentWindow?.postMessage(
                { type: "BIZNAV_THEME_CHANGE", theme: isDark ? "dark" : "light" },
                window.location.origin
            );
        };

        const stored = localStorage.getItem("biznav_theme") || localStorage.getItem("theme");
        applyTheme(stored === "dark");

        btn.onclick = () => {
            applyTheme(!document.body.classList.contains("dark-mode"));
        };
    }

    return { init };

})();

document.addEventListener("DOMContentLoaded", Navbar.init);