/* ==========================================
   DO — DESI OFFICIALS
   INTERACTIVE EXPERIENCE ENGINE
   STABLE VERSION 2.0
   ========================================== */


/* ==========================================
   1. LOADING EXPERIENCE — FIXED
========================================== */

const loader = document.getElementById("loader");

let loaderHidden = false;

function hideLoader() {

    if (loaderHidden) return;

    loaderHidden = true;

    if (!loader) return;

    loader.style.transition = "opacity 0.8s ease";
    loader.style.opacity = "0";
    loader.style.pointerEvents = "none";

    setTimeout(() => {

        loader.style.display = "none";

    }, 850);

}


/* Hide when page finishes loading */

window.addEventListener("load", () => {

    setTimeout(hideLoader, 500);

});


/* Emergency fallback:
   Never allow the loader to block the website indefinitely. */

setTimeout(hideLoader, 2500);


/* ==========================================
   2. MAIN INITIALIZATION
========================================== */

function initializeDO() {


    /* ======================================
       3. NAVIGATION DRAWER
    ====================================== */

    const menuOpen = document.getElementById("menuOpen");
    const menuClose = document.getElementById("menuClose");

    const drawer = document.getElementById("navigationDrawer");
    const overlay = document.getElementById("drawerOverlay");


    function openDrawer() {

        if (!drawer || !overlay) return;

        drawer.classList.add("open");
        overlay.classList.add("show");

        document.body.style.overflow = "hidden";

    }


    function closeDrawer() {

        if (drawer) {
            drawer.classList.remove("open");
        }

        if (overlay) {
            overlay.classList.remove("show");
        }

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


    document.querySelectorAll(".navigation-drawer a")
        .forEach(link => {

            link.addEventListener("click", closeDrawer);

        });


    document.addEventListener("keydown", event => {

        if (event.key === "Escape") {

            closeDrawer();

        }

    });



    /* ======================================
       4. SCROLL REVEAL ANIMATIONS
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


    if ("IntersectionObserver" in window) {

        const revealStyle = document.createElement("style");

        revealStyle.textContent = `

            .reveal-element {

                opacity: 0;
                transform: translateY(30px);

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


        const revealObserver = new IntersectionObserver(
            (entries, observer) => {

                entries.forEach(entry => {

                    if (entry.isIntersecting) {

                        entry.target.classList.add("visible");

                        observer.unobserve(entry.target);

                    }

                });

            },
            {
                threshold: 0.12
            }
        );


        revealElements.forEach(element => {

            element.classList.add("reveal-element");

            revealObserver.observe(element);

        });

    }



    /* ======================================
       5. ACTIVE NAVIGATION
    ====================================== */

    const sections = document.querySelectorAll("main section[id]");

    const navigationLinks = document.querySelectorAll(
        ".desktop-navigation a"
    );


    if ("IntersectionObserver" in window) {

        const navigationObserver = new IntersectionObserver(
            entries => {

                entries.forEach(entry => {

                    if (!entry.isIntersecting) return;

                    navigationLinks.forEach(link => {

                        link.classList.remove("active");

                        if (
                            link.getAttribute("href") ===
                            "#" + entry.target.id
                        ) {

                            link.classList.add("active");

                        }

                    });

                });

            },
            {
                threshold: 0.35
            }
        );


        sections.forEach(section => {

            navigationObserver.observe(section);

        });

    }



    /* ======================================
       6. HEADER SCROLL EFFECT
    ====================================== */

    const header = document.querySelector(".header");


    function updateHeader() {

        if (!header) return;

        if (window.scrollY > 50) {

            header.style.background = "rgba(0,0,0,0.92)";

            header.style.backdropFilter = "blur(20px)";

        } else {

            header.style.background = "rgba(0,0,0,0.55)";

            header.style.backdropFilter = "blur(20px)";

        }

    }


    window.addEventListener("scroll", updateHeader, {
        passive: true
    });

    updateHeader();



    /* ======================================
       7. PRODUCT INTERACTIONS
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
       8. BUTTON INTERACTIONS
    ====================================== */

    document.querySelectorAll(".primary-button")
        .forEach(button => {

            button.addEventListener("pointerdown", () => {

                button.style.transform = "scale(0.97)";

            });


            function resetButton() {

                button.style.transform = "";

            }


            button.addEventListener("pointerup", resetButton);

            button.addEventListener("pointerleave", resetButton);

            button.addEventListener("pointercancel", resetButton);

        });



    /* ======================================
       9. ORBIT ANIMATION
    ====================================== */

    document.querySelectorAll(".orbit")
        .forEach(orbit => {

            orbit.addEventListener("mouseenter", () => {

                orbit.style.animationPlayState = "paused";

            });


            orbit.addEventListener("mouseleave", () => {

                orbit.style.animationPlayState = "running";

            });

        });



    /* ======================================
       10. FOOTER YEAR
    ====================================== */

    const footerYear = document.querySelector(".footer-bottom");


    if (footerYear) {

        footerYear.innerHTML = `

            <span>
                © ${new Date().getFullYear()} DESI OFFICIALS.
            </span>

            <span>
                DESIGNED TO BE DISTINCT.
            </span>

        `;

    }



    /* ======================================
       11. IMAGE ERROR DETECTION
    ====================================== */

    document.querySelectorAll("img").forEach(image => {

        image.addEventListener("error", () => {

            console.error(
                "DO IMAGE ERROR:",
                image.getAttribute("src")
            );

        });

    });



    /* ======================================
       12. INITIALIZATION COMPLETE
    ====================================== */

    console.log(
        "%c DO — DESI OFFICIALS ",
        "background:#c6ff00;color:#000;font-size:20px;font-weight:900;padding:10px;"
    );

    console.log(
        "Beyond Fashion. Welcome to the DO experience."
    );

}


/* ==========================================
   13. SAFE INITIALIZATION
========================================== */

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initializeDO,
        { once: true }
    );

} else {

    initializeDO();

}


/* ==========================================
   END — DO INTERACTIVE EXPERIENCE ENGINE
========================================== */
