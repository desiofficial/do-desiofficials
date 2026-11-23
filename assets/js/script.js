/* ==========================================
   DO — DESI OFFICIALS
   INTERACTIVE EXPERIENCE ENGINE
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {


    /* ======================================
       1. LOADING EXPERIENCE
    ====================================== */

    const loader = document.getElementById("loader");

    window.addEventListener("load", () => {

        setTimeout(() => {

            if (loader) {

                loader.style.transition = "opacity 0.8s ease";
                loader.style.opacity = "0";

                setTimeout(() => {
                    loader.style.display = "none";
                }, 800);

            }

        }, 1000);

    });


    /* ======================================
       2. NAVIGATION DRAWER
    ====================================== */

    const menuOpen = document.getElementById("menuOpen");
    const menuClose = document.getElementById("menuClose");

    const drawer = document.getElementById("navigationDrawer");
    const overlay = document.getElementById("drawerOverlay");

    function openDrawer() {

        drawer.classList.add("open");
        overlay.classList.add("show");

        document.body.style.overflow = "hidden";

    }

    function closeDrawer() {

        drawer.classList.remove("open");
        overlay.classList.remove("show");

        document.body.style.overflow = "";

    }

    if (menuOpen) {
        menuOpen.addEventListener("click", openDrawer);
    }

    if (menuClose) {
        menuClose.addEventListener("click", closeDrawer);
    }

    if (overlay) {
        overlay.addEventListener("click", closeDrawer);
    }

    document.querySelectorAll(".navigation-drawer a").forEach(link => {

        link.addEventListener("click", closeDrawer);

    });

    document.addEventListener("keydown", event => {

        if (event.key === "Escape") {
            closeDrawer();
        }

    });


    /* ======================================
       3. SCROLL REVEAL ANIMATIONS
    ====================================== */

    const revealElements = document.querySelectorAll(
        ".section-heading, " +
        ".experience-card, " +
        ".product-card, " +
        ".membership-card, " +
        ".archive-content, " +
        ".unique-content, " +
        ".unique-visual, " +
        ".about-section, " +
        ".account-section, " +
        ".contact-section"
    );

    const revealStyle = document.createElement("style");

    revealStyle.textContent = `

        .reveal-element {

            opacity: 0;
            transform: translateY(35px);

            transition:
                opacity 0.8s ease,
                transform 0.8s ease;

        }

        .reveal-element.visible {

            opacity: 1;
            transform: translateY(0);

        }

    `;

    document.head.appendChild(revealStyle);


    const revealObserver = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.target.classList.add("visible");

                revealObserver.unobserve(entry.target);

            }

        });

    }, {

        threshold: 0.12

    });


    revealElements.forEach(element => {

        element.classList.add("reveal-element");

        revealObserver.observe(element);

    });


    /* ======================================
       4. ACTIVE NAVIGATION
    ====================================== */

    const sections = document.querySelectorAll("main section[id]");

    const navigationLinks = document.querySelectorAll(
        ".desktop-navigation a"
    );

    const navigationObserver = new IntersectionObserver(entries => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                navigationLinks.forEach(link => {

                    link.classList.remove("active");

                    if (
                        link.getAttribute("href") ===
                        "#" + entry.target.id
                    ) {

                        link.classList.add("active");

                    }

                });

            }

        });

    }, {

        threshold: 0.35

    });


    sections.forEach(section => {

        navigationObserver.observe(section);

    });


    /* ======================================
       5. HEADER SCROLL EFFECT
    ====================================== */

    const header = document.querySelector(".header");

    window.addEventListener("scroll", () => {

        if (!header) return;

        if (window.scrollY > 50) {

            header.style.background = "rgba(0,0,0,0.92)";

            header.style.backdropFilter = "blur(20px)";

        } else {

            header.style.background = "rgba(0,0,0,0.55)";

        }

    });


    /* ======================================
       6. PRODUCT HOVER EFFECTS
    ====================================== */

    const productCards = document.querySelectorAll(".product-card");

    productCards.forEach(card => {

        const image = card.querySelector(".product-image img");

        if (!image) return;

        card.addEventListener("mouseenter", () => {

            image.style.filter = "brightness(1.12)";

        });

        card.addEventListener("mouseleave", () => {

            image.style.filter = "brightness(1)";

        });

    });


    /* ======================================
       7. INTERACTIVE BUTTON EFFECTS
    ====================================== */

    document.querySelectorAll(".primary-button").forEach(button => {

        button.addEventListener("pointerdown", () => {

            button.style.transform = "scale(0.96)";

        });

        button.addEventListener("pointerup", () => {

            button.style.transform = "";

        });

        button.addEventListener("pointerleave", () => {

            button.style.transform = "";

        });

    });


    /* ======================================
       8. ORBIT ANIMATION CONTROL
    ====================================== */

    const orbitElements = document.querySelectorAll(".orbit");

    orbitElements.forEach((orbit, index) => {

        orbit.addEventListener("mouseenter", () => {

            orbit.style.animationPlayState = "paused";

        });

        orbit.addEventListener("mouseleave", () => {

            orbit.style.animationPlayState = "running";

        });

    });


    /* ======================================
       9. FOOTER YEAR
    ====================================== */

    const footerYear = document.querySelector(".footer-bottom");

    if (footerYear) {

        footerYear.innerHTML = `

            <span>© ${new Date().getFullYear()} DESI OFFICIALS.</span>

            <span>DESIGNED TO BE DISTINCT.</span>

        `;

    }


    /* ======================================
       10. IMAGE LOADING
    ====================================== */

    document.querySelectorAll("img").forEach(image => {

        image.addEventListener("error", () => {

            console.warn(
                "DO Image could not load:",
                image.src
            );

        });

    });


    /* ======================================
       11. INITIALIZATION
    ====================================== */

    console.log(
        "%c DO — DESI OFFICIALS ",
        "background:#c6ff00;color:#000;font-size:20px;font-weight:900;padding:10px;"
    );

    console.log(
        "Beyond Fashion. Welcome to the DO experience."
    );

});
